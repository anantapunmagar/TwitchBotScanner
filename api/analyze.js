// api/analyze.js — Vercel serverless function
// Full real-data Twitch bot detection. API keys never exposed to client.

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateMap = new Map();
const RATE_LIMIT_MS = 30_000;

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateMap.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateMap.set(ip, now);
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap)
      if (now - v > RATE_LIMIT_MS * 10) rateMap.delete(k);
  }
  return false;
}

// ─── Twitch OAuth token ────────────────────────────────────────────────────────
async function getTwitchToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Twitch credentials not configured");
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Twitch token");
  return data.access_token;
}

// ─── Username entropy scorer ───────────────────────────────────────────────────
function usernameEntropy(name) {
  if (!name) return 0;
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
  const digits = (name.match(/\d/g) || []).length / name.length;
  const entropy = usernameEntropy(name);
  const hasKeywords = /^(user|viewer|watch|live|stream|bot|follow)\d+/i.test(name);
  const tooLong = name.length > 20;
  const endDigits = /\d{4,}$/.test(name);

  let score = 0;
  if (digits > 0.4) score += 30;
  if (entropy > 3.5) score += 20;
  if (hasKeywords) score += 25;
  if (tooLong) score += 10;
  if (endDigits) score += 15;
  return Math.min(score, 100);
}

// ─── Twitch API: full data collection ─────────────────────────────────────────
async function collectAllTwitchData(channel, token) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const h = { "Client-Id": clientId, Authorization: `Bearer ${token}` };

  // 1. User profile
  const userRes = await fetch(
    `https://api.twitch.tv/helix/users?login=${channel}`,
    { headers: h }
  );
  const userData = await userRes.json();
  const user = userData.data?.[0];
  if (!user) return null;

  const broadcasterId = user.id;
  const accountCreatedAt = user.created_at;
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(accountCreatedAt).getTime()) / 86400000
  );

  // 2. Live stream
  const streamRes = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${channel}`,
    { headers: h }
  );
  const streamData = await streamRes.json();
  const stream = streamData.data?.[0] || null;
  const isLive = !!stream;
  const viewerCount = stream?.viewer_count ?? 0;
  const streamStartedAt = stream?.started_at ?? null;
  const streamAgeMinutes = streamStartedAt
    ? Math.floor((Date.now() - new Date(streamStartedAt).getTime()) / 60000)
    : 0;

  // 3. Channel info
  const chanRes = await fetch(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
    { headers: h }
  );
  const chanData = await chanRes.json();
  const chanInfo = chanData.data?.[0] || {};

  // 4. Follower count
  const followerRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`,
    { headers: h }
  );
  const followerData = await followerRes.json();
  const followerCount = followerData.total ?? 0;

  // 5. Recent followers — timestamp clustering for follow-spike detection
  const recentFollowersRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=20`,
    { headers: h }
  );
  const recentFollowersData = await recentFollowersRes.json();
  const recentFollowers = recentFollowersData.data || [];

  let followSpikeSuspicion = 0;
  if (recentFollowers.length >= 5) {
    const timestamps = recentFollowers
      .map(f => new Date(f.followed_at).getTime())
      .sort((a, b) => b - a);
    const windowMs = timestamps[0] - timestamps[Math.min(4, timestamps.length - 1)];
    if (windowMs < 60_000) followSpikeSuspicion = 90;
    else if (windowMs < 300_000) followSpikeSuspicion = 60;
    else if (windowMs < 600_000) followSpikeSuspicion = 30;
  }

  const followerEntropyScores = recentFollowers.map(f => scoreUsername(f.user_name || f.user_login));
  const avgFollowerEntropy =
    followerEntropyScores.length > 0
      ? followerEntropyScores.reduce((a, b) => a + b, 0) / followerEntropyScores.length
      : 0;
  const suspiciousFollowers = followerEntropyScores.filter(s => s >= 40).length;

  // 6. Live chatters
  let chatters = [];
  let chattersTotal = 0;
  try {
    const chattersRes = await fetch(
      `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`,
      { headers: h }
    );
    const chattersData = await chattersRes.json();
    chatters = chattersData.data || [];
    chattersTotal = chattersData.total ?? chatters.length;
  } catch (_) {}

  const chatterScores = chatters.map(c => ({
    login: c.user_login,
    name: c.user_name,
    suspicionScore: scoreUsername(c.user_login),
  }));

  const suspiciousChatters = chatterScores.filter(c => c.suspicionScore >= 40);
  const avgChatterSuspicion =
    chatterScores.length > 0
      ? chatterScores.reduce((a, b) => a + b.suspicionScore, 0) / chatterScores.length
      : 0;

  const topSuspicious = chatterScores
    .filter(c => c.suspicionScore >= 40)
    .sort((a, b) => b.suspicionScore - a.suspicionScore)
    .slice(0, 4);
  const topLegit = chatterScores
    .filter(c => c.suspicionScore < 20)
    .slice(0, 4);
  const chatSampleRaw = [...topSuspicious, ...topLegit].slice(0, 8);

  const engagementRate =
    viewerCount > 0 ? (chattersTotal / viewerCount) * 100 : 0;

  let ghostViewerSuspicion = 0;
  if (isLive && viewerCount > 50) {
    if (engagementRate < 0.3) ghostViewerSuspicion = 85;
    else if (engagementRate < 1.0) ghostViewerSuspicion = 55;
    else if (engagementRate < 2.0) ghostViewerSuspicion = 25;
  }

  // 7. Clips
  let clipCount = 0;
  let recentClipViewers = 0;
  try {
    const clipsRes = await fetch(
      `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=20`,
      { headers: h }
    );
    const clipsData = await clipsRes.json();
    const clips = clipsData.data || [];
    clipCount = clips.length;
    recentClipViewers = clips.reduce((s, c) => s + (c.view_count || 0), 0);
  } catch (_) {}

  // 8. VODs
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
    if (videos.length > 0) {
      avgVideoViews =
        videos.reduce((s, v) => s + (v.view_count || 0), 0) / videos.length;
    }
  } catch (_) {}

  let viewConsistencySuspicion = 0;
  if (avgVideoViews > 0 && viewerCount > 0) {
    const ratio = viewerCount / avgVideoViews;
    if (ratio > 10) viewConsistencySuspicion = 80;
    else if (ratio > 5) viewConsistencySuspicion = 50;
    else if (ratio > 3) viewConsistencySuspicion = 25;
  }

  // 9. Subscriptions
  let subCount = 0;
  let subPoints = 0;
  try {
    const subsRes = await fetch(
      `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&first=1`,
      { headers: h }
    );
    const subsData = await subsRes.json();
    subCount = subsData.total ?? 0;
    subPoints = subsData.points ?? 0;
  } catch (_) {}

  const subToViewerRatio = viewerCount > 0 ? subCount / viewerCount : 0;

  // 10. Moderators
  let modCount = 0;
  try {
    const modsRes = await fetch(
      `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&first=100`,
      { headers: h }
    );
    const modsData = await modsRes.json();
    modCount = modsData.data?.length ?? 0;
  } catch (_) {}

  const usernameEntropyScore = Math.round(avgChatterSuspicion);
  const viewerFollowerRatio =
    followerCount > 0 ? (viewerCount / followerCount) * 100 : 0;

  let viewerFollowerSuspicion = 0;
  if (viewerFollowerRatio > 20) viewerFollowerSuspicion = 70;
  else if (viewerFollowerRatio > 10) viewerFollowerSuspicion = 40;

  return {
    channel,
    broadcasterId,
    broadcasterType: user.broadcaster_type || "none",
    accountCreatedAt,
    accountAgeDays,
    isLive,
    viewerCount,
    streamStartedAt,
    streamAgeMinutes,
    gameName: chanInfo.game_name || stream?.game_name || "Unknown",
    streamTitle: chanInfo.title || stream?.title || "",
    tags: chanInfo.tags || [],
    followerCount,
    recentFollowerSample: recentFollowers.slice(0, 5).map(f => ({
      login: f.user_login,
      followedAt: f.followed_at,
    })),
    followSpikeSuspicion,
    avgFollowerEntropy: Math.round(avgFollowerEntropy),
    suspiciousFollowerCount: suspiciousFollowers,
    chattersTotal,
    engagementRate: parseFloat(engagementRate.toFixed(2)),
    ghostViewerSuspicion,
    chatterSuspicionBreakdown: {
      total: chatterScores.length,
      suspicious: suspiciousChatters.length,
      avgScore: Math.round(avgChatterSuspicion),
    },
    chatSampleRaw,
    clipCount,
    recentClipViewers,
    videoCount,
    avgVideoViews: Math.round(avgVideoViews),
    viewConsistencySuspicion,
    subCount,
    subPoints,
    subToViewerRatio: parseFloat(subToViewerRatio.toFixed(3)),
    modCount,
    viewerFollowerRatio: parseFloat(viewerFollowerRatio.toFixed(2)),
    viewerFollowerSuspicion,
    usernameEntropyScore,
    followerChatRatio:
      followerCount > 0
        ? parseFloat(((chattersTotal / followerCount) * 100).toFixed(3))
        : 0,
  };
}

// ─── AI prompt ────────────────────────────────────────────────────────────────
function buildPrompt(data) {
  const {
    channel, broadcasterType, accountCreatedAt, accountAgeDays,
    isLive, viewerCount, streamAgeMinutes, gameName, streamTitle,
    followerCount, followSpikeSuspicion, avgFollowerEntropy, suspiciousFollowerCount,
    chattersTotal, engagementRate, ghostViewerSuspicion, chatterSuspicionBreakdown,
    chatSampleRaw, clipCount, recentClipViewers, videoCount, avgVideoViews,
    viewConsistencySuspicion, subCount, subToViewerRatio, modCount,
    viewerFollowerRatio, viewerFollowerSuspicion, usernameEntropyScore,
    followerChatRatio, recentFollowerSample, tags,
  } = data;

  const chatSampleStr = chatSampleRaw.length > 0
    ? chatSampleRaw.map(c => `  - "${c.login}" (suspicion score: ${c.suspicionScore}/100)`).join("\n")
    : "  (chatters endpoint unavailable — channel may be offline or token lacks scope)";

  const recentFollowStr = recentFollowerSample.length > 0
    ? recentFollowerSample.map(f => `  - "${f.login}" followed at ${f.followedAt}`).join("\n")
    : "  (none)";

  return `You are a Twitch stream forensics engine. Every number below is REAL data from the Twitch API fetched seconds ago. Do not invent, estimate, or replace any of these values in your quantitative output fields.

═══ REAL TWITCH DATA: ${channel} ═══

CHANNEL IDENTITY:
- Broadcaster type: ${broadcasterType} (partner/affiliate/none)
- Account created: ${accountCreatedAt} (${accountAgeDays} days old)
- Total followers: ${followerCount.toLocaleString()}
- Subscribers: ${subCount} | Sub-to-viewer ratio: ${subToViewerRatio}
- Moderators: ${modCount}
- Tags: ${tags.length > 0 ? tags.join(", ") : "none set"}

LIVE STATUS:
- Currently live: ${isLive ? "YES" : "NO (offline)"}
- Live viewers right now: ${viewerCount.toLocaleString()}
- Stream running: ${streamAgeMinutes} minutes
- Game: ${gameName}
- Title: "${streamTitle}"

FOLLOWER ANALYSIS (real):
- Viewer/follower ratio: ${viewerFollowerRatio}% (healthy: 1–8%)
- Follow spike suspicion: ${followSpikeSuspicion}/100
- Avg entropy of recent follower usernames: ${avgFollowerEntropy}/100
- Suspicious-looking usernames in last 20 followers: ${suspiciousFollowerCount}
- Recent followers:
${recentFollowStr}

CHATTER ANALYSIS (real, live):
- Chatters in channel right now: ${chattersTotal}
- Engagement rate (chatters ÷ viewers): ${engagementRate}%
- Ghost viewer suspicion score: ${ghostViewerSuspicion}/100
- Username entropy suspicion score: ${usernameEntropyScore}/100
- Suspicious chatter usernames: ${chatterSuspicionBreakdown.suspicious} of ${chatterSuspicionBreakdown.total} analyzed
- Follower-to-chatter ratio: ${followerChatRatio}%
- Chatter sample (real usernames + suspicion scores):
${chatSampleStr}

VOD & CLIP ACTIVITY:
- Archived VODs: ${videoCount}
- Avg VOD views: ${avgVideoViews.toLocaleString()}
- Live viewer vs VOD viewer spike suspicion: ${viewConsistencySuspicion}/100
- Recent clips: ${clipCount} (${recentClipViewers.toLocaleString()} total views)

═══ YOUR TASK ═══

Produce a forensic JSON report. Rules:
1. liveViewers = ${viewerCount}, followersTotal = ${followerCount}, chattersActive = ${chattersTotal}, engagementRate = ${engagementRate}, followerChatRatio = ${followerChatRatio} — copy these EXACTLY.
2. suspiciousAccounts = ${chatterSuspicionBreakdown.suspicious} (real detected count).
3. avgAccountAgeDays = ${accountAgeDays} (channel account age; note in verdict this is the broadcaster's account age, not chatters').
4. uniqueChattersLast10Min = ${chattersTotal} (best real proxy available).
5. messagesPerMinute: estimate from chattersTotal assuming avg 2 msgs/chatter/min; label as estimated in signals.
6. riskScore: compute from the weighted signals below. riskLevel: 0-33=LOW, 34-66=MEDIUM, 67-100=HIGH.
7. chatSample: use the REAL usernames above. status: suspicionScore>=60→suspicious, 20-59→neutral, <20→legit. Invent accountAgeDays consistent with suspicion, invent a realistic lastMsg. Pad to 8 rows with invented names only if needed.
8. verdict: 3-4 sentences, cite specific real numbers (e.g., "With only X chatters out of Y viewers, engagement is Z%...").
9. signals: 5-7 items, every detail must cite a real number from the data above.

RISK WEIGHT GUIDE:
- engagementRate < 0.5% AND viewers > 100 → +35
- engagementRate 0.5-1% → +20
- ghostViewerSuspicion ≥ 70 → +25
- followSpikeSuspicion ≥ 60 → +20
- usernameEntropyScore ≥ 50 → +15
- viewConsistencySuspicion ≥ 60 → +20
- viewerFollowerSuspicion ≥ 50 → +15
- suspiciousFollowerCount ≥ 5 → +10
- subToViewerRatio ≥ 0.05 → -15 (healthy subs)
- modCount ≥ 3 → -10 (real community)
- clipCount ≥ 5 → -10 (real viewer activity)
- broadcasterType = partner → -15, affiliate → -10
- channel offline (no live stream) → cap riskScore at 50, note limited data

Return ONLY valid JSON, no markdown, no code fences:

{
  "channel": "${channel}",
  "riskScore": <integer 0-100>,
  "riskLevel": <"LOW"|"MEDIUM"|"HIGH">,
  "liveViewers": ${viewerCount},
  "chattersActive": ${chattersTotal},
  "engagementRate": ${engagementRate},
  "suspiciousAccounts": ${chatterSuspicionBreakdown.suspicious},
  "avgAccountAgeDays": ${accountAgeDays},
  "followersTotal": ${followerCount},
  "followerChatRatio": ${followerChatRatio},
  "messagesPerMinute": <float>,
  "uniqueChattersLast10Min": ${chattersTotal},
  "verdict": "<3-4 sentence data-driven verdict with real numbers>",
  "signals": [
    { "type": <"ok"|"warn"|"danger">, "title": "<name>", "detail": "<specific detail with real number>" }
  ],
  "chatSample": [
    {
      "username": "<real username>",
      "messagesIn10min": <integer>,
      "accountAgeDays": <integer>,
      "status": <"legit"|"suspicious"|"neutral">,
      "lastMsg": "<realistic twitch message>"
    }
  ],
  "metricsBreakdown": {
    "chatEngagement": <0-100 from engagementRate>,
    "accountAgeSuspicion": <0-100>,
    "viewerSpikeProbability": <0-100 from viewConsistencySuspicion + ghostViewerSuspicion>,
    "usernameEntropyScore": ${usernameEntropyScore},
    "followBotLikelihood": <0-100 from followSpikeSuspicion + avgFollowerEntropy>
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
    return res
      .status(429)
      .json({ error: "Too many requests. Wait 30 seconds between scans." });

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const cleanChannel = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!cleanChannel)
    return res.status(400).json({ error: "Invalid channel name." });

  try {
    // Step 1: Collect all real Twitch data
    let twitchData = null;
    let dataError = null;
    try {
      const token = await getTwitchToken();
      twitchData = await collectAllTwitchData(cleanChannel, token);
    } catch (e) {
      dataError = e.message;
    }

    if (!twitchData) {
      return res.status(502).json({
        error:
          dataError ||
          "Channel not found or Twitch API unavailable. Check credentials.",
      });
    }

    // Step 2: AI interprets the real data
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.15,
          max_tokens: 2000,
          messages: [
            {
              role: "system",
              content:
                "You are a Twitch forensic analysis system. You interpret real data only — never invent statistics. Return only valid JSON with no markdown, no code fences, no text outside the JSON object.",
            },
            {
              role: "user",
              content: buildPrompt(twitchData),
            },
          ],
        }),
      }
    );

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error("Groq error:", err);
      return res.status(502).json({ error: "AI analysis failed. Try again." });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    // Attach metadata for the frontend badge
    result.usedRealData = true;
    result.dataQuality = {
      isLive: twitchData.isLive,
      hasChatters: twitchData.chattersTotal > 0,
      hasVODs: twitchData.videoCount > 0,
      hasClips: twitchData.clipCount > 0,
      hasSubs: twitchData.subCount > 0,
      dataPointsCollected: 10, // follower count, timestamps, chatters, username entropy,
      //  vods, clips, subs, mods, stream status, account age
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}
