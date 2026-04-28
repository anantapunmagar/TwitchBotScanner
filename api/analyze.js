// api/analyze.js
// Vercel serverless function — runs on the server, API key is never exposed

// ─── Simple in-memory rate limiter ───────────────────────────────────────────
// Note: on Vercel each serverless instance has its own memory.
// For production scale, replace with Upstash Redis (free tier available).
const rateMap = new Map();
const RATE_LIMIT_MS = 20_000; // 1 request per 20 seconds per IP

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateMap.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateMap.set(ip, now);
  // Clean up old entries occasionally
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) {
      if (now - v > RATE_LIMIT_MS * 5) rateMap.delete(k);
    }
  }
  return false;
}

// ─── Twitch API helpers ───────────────────────────────────────────────────────
async function getTwitchToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  return data.access_token || null;
}

async function getTwitchData(channel, token) {
  if (!token) return null;
  const id = process.env.TWITCH_CLIENT_ID;
  const headers = { "Client-Id": id, Authorization: `Bearer ${token}` };

  const [streamRes, userRes] = await Promise.all([
    fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, { headers }),
    fetch(`https://api.twitch.tv/helix/users?login=${channel}`, { headers }),
  ]);

  const streamData = await streamRes.json();
  const userData = await userRes.json();

  const stream = streamData.data?.[0] || null;
  const user = userData.data?.[0] || null;

  if (!user) return null;

  // Get follower count
  const followRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
    { headers }
  );
  const followData = await followRes.json();

  return {
    isLive: !!stream,
    viewerCount: stream?.viewer_count ?? 0,
    gameName: stream?.game_name ?? "Unknown",
    streamTitle: stream?.title ?? "",
    streamStartedAt: stream?.started_at ?? null,
    followerCount: followData.total ?? 0,
    accountCreatedAt: user?.created_at ?? null,
    broadcasterType: user?.broadcaster_type ?? "",
  };
}

// ─── Build the AI prompt ──────────────────────────────────────────────────────
function buildPrompt(channel, twitchData) {
  const realDataSection = twitchData
    ? `
REAL TWITCH DATA (use these exact numbers in your analysis):
- Live right now: ${twitchData.isLive ? "YES" : "NO (offline)"}
- Current viewer count: ${twitchData.viewerCount.toLocaleString()}
- Followers: ${twitchData.followerCount.toLocaleString()}
- Current game: ${twitchData.gameName}
- Stream title: "${twitchData.streamTitle}"
- Account created: ${twitchData.accountCreatedAt ?? "unknown"}
- Broadcaster type: ${twitchData.broadcasterType || "regular"}

Use these real numbers for liveViewers and followersTotal.
For metrics that can't be fetched (chat activity, account ages, suspicious accounts),
generate realistic simulated values consistent with the real data above.
`
    : `No real Twitch API data available. Generate fully simulated but realistic data.
Base suspicion on the channel name pattern: known large streamers (xqc, pokimane, shroud, ninja, etc.) should be LOW risk.
Generic names with numbers or random strings (stream12983, live_tv_48, watch_now99) should trend HIGH risk.`;

  return `You are a Twitch view-bot forensic detection system. Analyze the channel "${channel}".

${realDataSection}

Return ONLY valid JSON — no markdown, no explanation, no code fences. Exact schema:

{
  "channel": "${channel}",
  "riskScore": <integer 0-100>,
  "riskLevel": <"LOW" | "MEDIUM" | "HIGH">,
  "liveViewers": <integer>,
  "chattersActive": <integer>,
  "engagementRate": <float, chatters/viewers * 100>,
  "suspiciousAccounts": <integer>,
  "avgAccountAgeDays": <integer>,
  "followersTotal": <integer>,
  "followerChatRatio": <float>,
  "messagesPerMinute": <float>,
  "uniqueChattersLast10Min": <integer>,
  "verdict": "<2-3 sentence human-readable forensic verdict specific to this channel>",
  "signals": [
    { "type": <"ok" | "warn" | "danger">, "title": "<short signal name>", "detail": "<specific detail>" }
  ],
  "chatSample": [
    {
      "username": "<realistic username>",
      "messagesIn10min": <integer>,
      "accountAgeDays": <integer>,
      "status": <"legit" | "suspicious" | "neutral">,
      "lastMsg": "<realistic short twitch chat message>"
    }
  ],
  "metricsBreakdown": {
    "chatEngagement": <0-100>,
    "accountAgeSuspicion": <0-100>,
    "viewerSpikeProbability": <0-100>,
    "usernameEntropyScore": <0-100>,
    "followBotLikelihood": <0-100>
  }
}

Rules:
- signals: 4-6 items, mix of types matching the risk level
- chatSample: exactly 8 rows
- For HIGH risk: include bot-like usernames (random strings, numbers), low account ages, low engagement
- For LOW risk: normal usernames, older accounts, healthy engagement
- All numbers must be internally consistent
- Return ONLY the JSON object`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS headers (needed if you ever call from a different domain)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Wait 20 seconds between scans." });
  }

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50) {
    return res.status(400).json({ error: "Invalid channel name." });
  }

  const cleanChannel = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!cleanChannel) return res.status(400).json({ error: "Invalid channel name." });

  try {
    // Step 1: Try to get real Twitch data (only works if env vars are set)
    let twitchData = null;
    try {
      const token = await getTwitchToken();
      if (token) twitchData = await getTwitchData(cleanChannel, token);
    } catch {
      // Twitch API failed — fall back to AI simulation only
    }

    // Step 2: Call Groq (free, fast)
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Best free model on Groq
        temperature: 0.7,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content: "You are a Twitch forensic analysis system. Return only valid JSON. Never include markdown, code fences, or any text outside the JSON object.",
          },
          {
            role: "user",
            content: buildPrompt(cleanChannel, twitchData),
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("Groq error:", err);
      return res.status(502).json({ error: "AI analysis failed. Try again." });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || "";

    // Parse JSON — strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    // Attach whether real Twitch data was used
    result.usedRealData = !!twitchData;

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}
// api/analyze.js — Vercel serverless function
// Real-data Twitch bot detection using only app-token compatible endpoints.
//
// WHY THE CHATTERS ENDPOINT IS NOT USED:
// /helix/chat/chatters requires a user access token (moderator:read:chatters scope).
// App (client_credentials) tokens get HTTP 401 / empty data. Instead we:
//   1. Sample real followers + score their usernames
//   2. Collect VOD, clip, subscription, and mod data
//   3. Use the IRC WebSocket to observe real chat for up to 8 seconds
//   4. Feed all real signals to AI for interpretation

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateMap = new Map();
const RATE_LIMIT_MS = 30_000;

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateMap.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateMap.set(ip, now);
  if (rateMap.size > 500)
    for (const [k, v] of rateMap)
      if (now - v > RATE_LIMIT_MS * 10) rateMap.delete(k);
  return false;
}

// ─── Twitch app token (client credentials — no user scope needed) ──────────────
async function getTwitchToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Twitch credentials not configured");
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Twitch token: " + JSON.stringify(data));
  return data.access_token;
}

// ─── Username bot-pattern scorer (0–100) ──────────────────────────────────────
function usernameEntropy(name) {
  if (!name || name.length === 0) return 0;
  const freq = {};
  for (const c of name) freq[c] = (freq[c] || 0) + 1;
  const len = name.length;
  let h = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    h -= p * Math.log2(p);
  }
  return h;
}

function scoreUsername(name) {
  if (!name) return 0;
  const n = name.toLowerCase();
  const digits = (n.match(/\d/g) || []).length / n.length;
  const entropy = usernameEntropy(n);
  const botKeyword = /^(user|viewer|watch|live|stream|bot|follow|tv_|live_)\d+/i.test(n);
  const endDigits = /\d{4,}$/.test(n);          // ends in 4+ digits
  const longRandom = n.length > 18;
  const noVowels = !/[aeiou]/.test(n) && n.length > 5; // consonant soup

  let score = 0;
  if (digits > 0.45) score += 35;
  else if (digits > 0.25) score += 15;
  if (entropy > 3.8) score += 20;
  if (botKeyword) score += 30;
  if (endDigits) score += 20;
  if (longRandom) score += 10;
  if (noVowels) score += 15;
  return Math.min(score, 100);
}

// ─── IRC chat sampler — connects anonymously, collects msgs for N ms ──────────
// Works with app tokens (PASS oauth:<any_app_token>).
// Returns { messages: [{user, text}], rawCount }
async function sampleIrcChat(channel, token, durationMs = 8000) {
  const messages = [];
  let rawCount = 0;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      resolve({ messages, rawCount });
    }, durationMs);

    let ws;
    try {
      // Node 18+ has native WebSocket; Vercel edge/Node runtime supports it
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    } catch (_) {
      clearTimeout(timeout);
      resolve({ messages, rawCount });
      return;
    }

    ws.onopen = () => {
      ws.send(`PASS oauth:${token}`);
      ws.send("NICK justinfan" + Math.floor(Math.random() * 80000 + 1000)); // anonymous
      ws.send(`JOIN #${channel}`);
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      // PING keepalive
      if (raw.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        return;
      }
      // Parse PRIVMSG
      // :username!username@username.tmi.twitch.tv PRIVMSG #channel :message
      const match = raw.match(/^:([^!]+)![^ ]+ PRIVMSG #\S+ :(.+)/);
      if (match) {
        rawCount++;
        const user = match[1];
        const text = match[2].replace(/\r?\n$/, "");
        if (messages.length < 40) messages.push({ user, text });
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      resolve({ messages, rawCount });
    };
  });
}

// ─── Main data collection ──────────────────────────────────────────────────────
async function collectAllTwitchData(channel, token) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const h = { "Client-Id": clientId, Authorization: `Bearer ${token}` };

  // ── 1. User profile ──────────────────────────────────────────────────────────
  const userRes = await fetch(
    `https://api.twitch.tv/helix/users?login=${channel}`, { headers: h }
  );
  const userData = await userRes.json();
  const user = userData.data?.[0];
  if (!user) return null;

  const broadcasterId = user.id;
  const accountCreatedAt = user.created_at;
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(accountCreatedAt).getTime()) / 86400000
  );

  // ── 2. Live stream ───────────────────────────────────────────────────────────
  const streamRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${channel}`, { headers: h }
  );
  const streamData = await streamRes.json();
  const stream = streamData.data?.[0] || null;
  const isLive = !!stream;
  const viewerCount = stream?.viewer_count ?? 0;
  const streamStartedAt = stream?.started_at ?? null;
  const streamAgeMinutes = streamStartedAt
    ? Math.floor((Date.now() - new Date(streamStartedAt).getTime()) / 60000)
    : 0;

  // ── 3. Channel info ──────────────────────────────────────────────────────────
  const chanRes = await fetch(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, { headers: h }
  );
  const chanData = await chanRes.json();
  const chanInfo = chanData.data?.[0] || {};

  // ── 4. Followers ─────────────────────────────────────────────────────────────
  const followerRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`,
    { headers: h }
  );
  const followerData = await followerRes.json();
  const followerCount = followerData.total ?? 0;

  // ── 5. Recent follower timestamps (follow-spike detection) ───────────────────
  const recentFollowersRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=20`,
    { headers: h }
  );
  const recentFollowersData = await recentFollowersRes.json();
  const recentFollowers = recentFollowersData.data || [];

  let followSpikeSuspicion = 0;
  if (recentFollowers.length >= 5) {
    const ts = recentFollowers
      .map(f => new Date(f.followed_at).getTime())
      .sort((a, b) => b - a);
    const windowMs = ts[0] - ts[Math.min(4, ts.length - 1)];
    if (windowMs < 60_000)      followSpikeSuspicion = 90;
    else if (windowMs < 300_000) followSpikeSuspicion = 60;
    else if (windowMs < 600_000) followSpikeSuspicion = 30;
  }

  // Score follower usernames
  const followerEntropyScores = recentFollowers.map(f => ({
    login: f.user_login,
    score: scoreUsername(f.user_login),
    followedAt: f.followed_at,
  }));
  const avgFollowerEntropy =
    followerEntropyScores.length > 0
      ? Math.round(followerEntropyScores.reduce((a, b) => a + b.score, 0) / followerEntropyScores.length)
      : 0;
  const suspiciousFollowerCount = followerEntropyScores.filter(f => f.score >= 40).length;

  // ── 6. IRC chat sample (runs in parallel with other fetches) ─────────────────
  // Only attempt if stream is live (no point joining offline channel)
  let ircMessages = [];
  let ircRawCount = 0;
  let ircAttempted = false;

  if (isLive) {
    ircAttempted = true;
    try {
      const irc = await sampleIrcChat(channel, token, 8000);
      ircMessages = irc.messages;
      ircRawCount = irc.rawCount;
    } catch (_) {}
  }

  // Score IRC chatter usernames
  const ircChatterMap = {};
  for (const msg of ircMessages) {
    if (!ircChatterMap[msg.user]) {
      ircChatterMap[msg.user] = { user: msg.user, msgs: 0, texts: [], score: scoreUsername(msg.user) };
    }
    ircChatterMap[msg.user].msgs++;
    if (ircChatterMap[msg.user].texts.length < 2) ircChatterMap[msg.user].texts.push(msg.text);
  }
  const ircChatters = Object.values(ircChatterMap);
  const uniqueIrcChatters = ircChatters.length;

  const suspiciousIrcChatters = ircChatters.filter(c => c.score >= 40);
  const avgIrcSuspicion =
    ircChatters.length > 0
      ? Math.round(ircChatters.reduce((a, b) => a + b.score, 0) / ircChatters.length)
      : 0;

  // Messages per minute from IRC sample (sampled over 8 seconds → × 7.5)
  const messagesPerMinute = parseFloat((ircRawCount * 7.5).toFixed(1));

  // Build chat sample: mix most suspicious + most legit, up to 8
  const chatSampleRaw = [
    ...ircChatters.filter(c => c.score >= 40).sort((a, b) => b.score - a.score).slice(0, 4),
    ...ircChatters.filter(c => c.score < 20).slice(0, 4),
  ].slice(0, 8);

  // Engagement: chatters seen in IRC vs viewer count
  // IRC sample is 8s; chattersEstimate = unique chatters * scale factor
  // (not perfect but derived from real observation, not made up)
  const chattersEstimate = isLive && viewerCount > 0
    ? Math.round(uniqueIrcChatters * Math.max(1, streamAgeMinutes / 2))
    : 0;
  const engagementRate =
    viewerCount > 0 ? parseFloat(((uniqueIrcChatters / viewerCount) * 100).toFixed(2)) : 0;

  let ghostViewerSuspicion = 0;
  if (isLive && viewerCount > 50) {
    if (engagementRate === 0)          ghostViewerSuspicion = 85;
    else if (engagementRate < 0.05)    ghostViewerSuspicion = 70;
    else if (engagementRate < 0.2)     ghostViewerSuspicion = 50;
    else if (engagementRate < 1.0)     ghostViewerSuspicion = 25;
  }

  // ── 7. Clips ──────────────────────────────────────────────────────────────────
  let clipCount = 0;
  let recentClipViews = 0;
  try {
    const clipsRes = await fetch(
      `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=20`, { headers: h }
    );
    const clipsData = await clipsRes.json();
    const clips = clipsData.data || [];
    clipCount = clips.length;
    recentClipViews = clips.reduce((s, c) => s + (c.view_count || 0), 0);
  } catch (_) {}

  // ── 8. VODs ───────────────────────────────────────────────────────────────────
  let avgVideoViews = 0;
  let videoCount = 0;
  try {
    const videosRes = await fetch(
      `https://api.twitch.tv/helix/videos?user_id=${broadcasterId}&first=10&type=archive`,
      { headers: h }
    );
    const videosData = await videosRes.json();
    const videos = videosData.data || [];
    videoCount = videos.length;
    if (videos.length > 0)
      avgVideoViews = Math.round(
        videos.reduce((s, v) => s + (v.view_count || 0), 0) / videos.length
      );
  } catch (_) {}

  let viewConsistencySuspicion = 0;
  if (avgVideoViews > 10 && viewerCount > 0) {
    const ratio = viewerCount / avgVideoViews;
    if (ratio > 10)      viewConsistencySuspicion = 80;
    else if (ratio > 5)  viewConsistencySuspicion = 50;
    else if (ratio > 3)  viewConsistencySuspicion = 25;
  }

  // ── 9. Subscriptions ──────────────────────────────────────────────────────────
  let subCount = 0;
  try {
    const subsRes = await fetch(
      `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&first=1`,
      { headers: h }
    );
    const subsData = await subsRes.json();
    subCount = subsData.total ?? 0;
  } catch (_) {}

  const subToViewerRatio = viewerCount > 0 ? parseFloat((subCount / viewerCount).toFixed(3)) : 0;

  // ── 10. Moderators ────────────────────────────────────────────────────────────
  let modCount = 0;
  try {
    const modsRes = await fetch(
      `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&first=100`,
      { headers: h }
    );
    const modsData = await modsRes.json();
    modCount = modsData.data?.length ?? 0;
  } catch (_) {}

  // ── Derived scores ─────────────────────────────────────────────────────────
  const viewerFollowerRatio = followerCount > 0
    ? parseFloat(((viewerCount / followerCount) * 100).toFixed(2)) : 0;

  let viewerFollowerSuspicion = 0;
  if (viewerFollowerRatio > 20) viewerFollowerSuspicion = 70;
  else if (viewerFollowerRatio > 10) viewerFollowerSuspicion = 40;

  const usernameEntropyScore = ircChatters.length > 0 ? avgIrcSuspicion : avgFollowerEntropy;

  return {
    channel, broadcasterId,
    broadcasterType: user.broadcaster_type || "none",
    accountCreatedAt, accountAgeDays,
    isLive, viewerCount, streamStartedAt, streamAgeMinutes,
    gameName: chanInfo.game_name || stream?.game_name || "Unknown",
    streamTitle: chanInfo.title || stream?.title || "",
    tags: chanInfo.tags || [],
    followerCount,
    recentFollowerSample: followerEntropyScores.slice(0, 6),
    followSpikeSuspicion, avgFollowerEntropy, suspiciousFollowerCount,
    // Chat — real IRC data
    ircAttempted,
    uniqueIrcChatters,
    messagesPerMinute,
    chattersEstimate,
    engagementRate,
    ghostViewerSuspicion,
    suspiciousIrcCount: suspiciousIrcChatters.length,
    avgIrcSuspicion,
    chatSampleRaw,
    // VOD / clips
    clipCount, recentClipViews, videoCount, avgVideoViews, viewConsistencySuspicion,
    // Subs / mods
    subCount, subToViewerRatio, modCount,
    // Ratios
    viewerFollowerRatio, viewerFollowerSuspicion,
    usernameEntropyScore,
    followerChatRatio: followerCount > 0
      ? parseFloat(((uniqueIrcChatters / followerCount) * 100).toFixed(4)) : 0,
  };
}

// ─── AI prompt ────────────────────────────────────────────────────────────────
function buildPrompt(d) {
  const followerSampleStr = d.recentFollowerSample.length > 0
    ? d.recentFollowerSample.map(f =>
        `  - "${f.login}" (bot score: ${f.score}/100, followed: ${f.followedAt})`
      ).join("\n")
    : "  (none retrieved)";

  const chatSampleStr = d.chatSampleRaw.length > 0
    ? d.chatSampleRaw.map(c =>
        `  - "${c.user}" | msgs in 8s: ${c.msgs} | bot score: ${c.score}/100 | sample msg: "${c.texts[0] || ""}"`
      ).join("\n")
    : d.ircAttempted
      ? "  (channel was live but no messages observed in 8-second window — severe engagement issue)"
      : "  (channel is offline — IRC not sampled)";

  return `You are a Twitch stream forensics engine. All data below was collected from the Twitch API and IRC RIGHT NOW. Every number is real. Do NOT invent or replace any quantitative field that is already known.

═══ REAL DATA: ${d.channel} ═══

CHANNEL:
- Broadcaster type: ${d.broadcasterType} (none/affiliate/partner)
- Account age: ${d.accountAgeDays} days (created ${d.accountCreatedAt})
- Followers: ${d.followerCount.toLocaleString()}
- Subscribers: ${d.subCount} | Sub/viewer ratio: ${d.subToViewerRatio}
- Moderators: ${d.modCount}
- Tags: ${d.tags.length > 0 ? d.tags.join(", ") : "none"}

LIVE STREAM:
- Currently live: ${d.isLive ? "YES" : "NO"}
- Live viewers: ${d.viewerCount.toLocaleString()}
- Stream age: ${d.streamAgeMinutes} minutes
- Game: ${d.gameName}
- Title: "${d.streamTitle}"

FOLLOWERS (real sample):
- Viewer/follower ratio: ${d.viewerFollowerRatio}% (healthy: 1–8%)
- Follow spike suspicion: ${d.followSpikeSuspicion}/100
- Avg follower username bot score: ${d.avgFollowerEntropy}/100
- Suspicious-looking names in last 20: ${d.suspiciousFollowerCount}
- Sample with bot scores:
${followerSampleStr}

CHAT — REAL IRC OBSERVATION (${d.ircAttempted ? "8-second live sample" : "offline — not sampled"}):
- Unique chatters seen in 8s: ${d.uniqueIrcChatters}
- Total messages counted in 8s: ${Math.round(d.messagesPerMinute / 7.5)}
- Extrapolated messages/min: ${d.messagesPerMinute}
- Engagement (unique chatters ÷ viewers): ${d.engagementRate}%
- Ghost viewer suspicion: ${d.ghostViewerSuspicion}/100
- Suspicious chatter usernames: ${d.suspiciousIrcCount} of ${d.uniqueIrcChatters}
- Avg chatter username bot score: ${d.avgIrcSuspicion}/100
- Chat sample (real usernames + real messages):
${chatSampleStr}

VODs & CLIPS:
- Archived VODs: ${d.videoCount} | Avg views: ${d.avgVideoViews.toLocaleString()}
- Live vs VOD viewer consistency suspicion: ${d.viewConsistencySuspicion}/100
- Recent clips: ${d.clipCount} | Total clip views: ${d.recentClipViews.toLocaleString()}

═══ INSTRUCTIONS ═══

Rules for quantitative output fields — copy these EXACTLY, do not round or change:
  liveViewers = ${d.viewerCount}
  followersTotal = ${d.followerCount}
  chattersActive = ${d.uniqueIrcChatters}
  engagementRate = ${d.engagementRate}
  messagesPerMinute = ${d.messagesPerMinute}
  suspiciousAccounts = ${d.suspiciousIrcCount}
  uniqueChattersLast10Min = ${d.uniqueIrcChatters}
  followerChatRatio = ${d.followerChatRatio}
  avgAccountAgeDays = ${d.accountAgeDays}  ← this is the broadcaster account age

For chatSample:
- Use ONLY real usernames from the IRC sample above (never invent "InventedUser" placeholders)
- If fewer than 8 real chatters, pad remaining rows with real follower usernames from the follower sample
- If still fewer than 8, pad remaining with clearly labeled "(no data)" as username with status "neutral"
- status: bot score ≥60 → "suspicious", 20–59 → "neutral", <20 → "legit"
- accountAgeDays: estimate from bot score (high score → younger account, 0 score → 500–2000d)
- messagesIn10min: scale from msgs-in-8s × 75
- lastMsg: use the real sample message if available, otherwise invent a plausible one

riskScore computation (add up matching weights, cap at 100):
${d.engagementRate === 0 && d.isLive && d.viewerCount > 100 ? "+ 40 (zero engagement, large live audience)" : ""}
${d.engagementRate > 0 && d.engagementRate < 0.5 && d.viewerCount > 100 ? "+ 30 (near-zero engagement)" : ""}
${d.ghostViewerSuspicion >= 70 ? `+ 25 (ghostViewerSuspicion = ${d.ghostViewerSuspicion})` : ""}
${d.followSpikeSuspicion >= 60 ? `+ 20 (followSpikeSuspicion = ${d.followSpikeSuspicion})` : ""}
${d.usernameEntropyScore >= 50 ? `+ 15 (usernameEntropyScore = ${d.usernameEntropyScore})` : ""}
${d.viewConsistencySuspicion >= 60 ? `+ 20 (viewConsistencySuspicion = ${d.viewConsistencySuspicion})` : ""}
${d.viewerFollowerSuspicion >= 50 ? `+ 15 (viewerFollowerSuspicion = ${d.viewerFollowerSuspicion})` : ""}
${d.suspiciousFollowerCount >= 5 ? `+ 10 (${d.suspiciousFollowerCount} suspicious follower names)` : ""}
${d.subToViewerRatio >= 0.05 ? "- 15 (healthy subscriber ratio)" : ""}
${d.modCount >= 3 ? `- 10 (${d.modCount} moderators = real community)` : ""}
${d.clipCount >= 5 ? `- 10 (${d.clipCount} clips = real engagement)` : ""}
${d.broadcasterType === "partner" ? "- 15 (partner broadcaster)" : d.broadcasterType === "affiliate" ? "- 10 (affiliate broadcaster)" : ""}
${!d.isLive ? "Cap riskScore at 50 (offline — limited signals available)" : ""}

riskLevel: 0–33 = LOW, 34–66 = MEDIUM, 67–100 = HIGH

Write a specific verdict citing real numbers. In signals, every detail must include a real number.

Return ONLY valid JSON, no markdown, no code fences:

{
  "channel": "${d.channel}",
  "riskScore": <integer>,
  "riskLevel": <"LOW"|"MEDIUM"|"HIGH">,
  "liveViewers": ${d.viewerCount},
  "chattersActive": ${d.uniqueIrcChatters},
  "engagementRate": ${d.engagementRate},
  "suspiciousAccounts": ${d.suspiciousIrcCount},
  "avgAccountAgeDays": ${d.accountAgeDays},
  "followersTotal": ${d.followerCount},
  "followerChatRatio": ${d.followerChatRatio},
  "messagesPerMinute": ${d.messagesPerMinute},
  "uniqueChattersLast10Min": ${d.uniqueIrcChatters},
  "verdict": "<3-4 sentences citing real numbers>",
  "signals": [
    {"type": <"ok"|"warn"|"danger">, "title": "<name>", "detail": "<detail with real number>"}
  ],
  "chatSample": [
    {
      "username": "<real username — never InventedUser>",
      "messagesIn10min": <integer>,
      "accountAgeDays": <integer>,
      "status": <"legit"|"suspicious"|"neutral">,
      "lastMsg": "<real or realistic message>"
    }
  ],
  "metricsBreakdown": {
    "chatEngagement": <0-100 scaled from engagementRate>,
    "accountAgeSuspicion": <0-100>,
    "viewerSpikeProbability": <0-100>,
    "usernameEntropyScore": ${d.usernameEntropyScore},
    "followBotLikelihood": <0-100>
  }
}`;
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";
  if (isRateLimited(ip))
    return res.status(429).json({ error: "Too many requests. Wait 30 seconds." });

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const cleanChannel = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!cleanChannel)
    return res.status(400).json({ error: "Invalid channel name." });

  try {
    const token = await getTwitchToken();
    const twitchData = await collectAllTwitchData(cleanChannel, token);

    if (!twitchData)
      return res.status(404).json({ error: `Channel "${cleanChannel}" not found on Twitch.` });

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "You are a Twitch forensic analysis system. You only interpret real data given to you. Never invent usernames like 'InventedUser' or 'NoRealUsernamesAvailable'. Return only valid JSON with no markdown, no code fences.",
          },
          {
            role: "user",
            content: buildPrompt(twitchData),
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("Groq error:", err);
      return res.status(502).json({ error: "AI analysis failed. Try again." });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, "").trim();
    const result = JSON.parse(cleaned);

    result.usedRealData = true;
    result.dataQuality = {
      isLive: twitchData.isLive,
      ircSampled: twitchData.ircAttempted,
      uniqueIrcChatters: twitchData.uniqueIrcChatters,
      hasVODs: twitchData.videoCount > 0,
      hasClips: twitchData.clipCount > 0,
      hasSubs: twitchData.subCount > 0,
      dataPointsCollected: 10,
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err.message, err.stack);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
}
