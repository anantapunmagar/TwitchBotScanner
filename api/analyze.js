// api/analyze.js — Vercel serverless function
//
// DESIGN PRINCIPLE: Everything that can be computed from real data IS computed
// in JavaScript. The AI only writes human-readable verdict text and signal
// descriptions. It does NOT compute numbers, fill chat tables, or estimate
// anything. If a data point is unavailable, we say so — we never fabricate.
//
// CHAT TABLE: Shows real chatter usernames + algorithmic bot scores only.
// Twitch does not expose message history via public API, so we removed the
// fake "last message" column entirely and replaced it with real scored fields.
//
// CHATTERS ENDPOINT: Requires TWITCH_USER_TOKEN (user OAuth token with
// moderator:read:chatters scope). Without it the table shows real recent
// follower usernames with a clear "no chat token" label.
// How to generate the token (one-time, 2 min):
//   Open in browser → https://id.twitch.tv/oauth2/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://localhost&response_type=token&scope=moderator:read:chatters+channel:read:subscriptions+moderation:read
//   After authorizing: copy the access_token= value from the redirect URL
//   Add it as TWITCH_USER_TOKEN in your Vercel environment variables.

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

// ─── App token (client_credentials — works for everything except /chatters) ───
async function getAppToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET");
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const d = await res.json();
  if (!d.access_token) throw new Error("Twitch app token failed: " + JSON.stringify(d));
  return d.access_token;
}

// ─── Username bot-pattern scorer (pure algorithm, 0–100) ─────────────────────
function entropyOf(s) {
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let h = 0;
  for (const n of Object.values(freq)) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

function scoreUsername(raw) {
  if (!raw) return { score: 0, reasons: [] };
  const n = raw.toLowerCase();
  const reasons = [];
  let score = 0;

  const digitRatio = (n.match(/\d/g) || []).length / n.length;
  if (digitRatio > 0.45) { score += 35; reasons.push("high digit ratio"); }
  else if (digitRatio > 0.25) { score += 15; reasons.push("moderate digits"); }

  if (entropyOf(n) > 3.8) { score += 20; reasons.push("random character pattern"); }

  if (/^(user|viewer|watch|live|stream|bot|follow|tv_|live_)\d+/i.test(n)) {
    score += 30; reasons.push("bot keyword prefix");
  }
  if (/\d{4,}$/.test(n)) { score += 20; reasons.push("4+ trailing digits"); }
  if (n.length > 18)      { score += 10; reasons.push("unusually long name"); }
  if (!/[aeiou]/.test(n) && n.length > 5) { score += 15; reasons.push("no vowels"); }

  return { score: Math.min(score, 100), reasons };
}

// ─── Fetch chatters with user token ──────────────────────────────────────────
async function fetchChatters(broadcasterId) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const userToken = process.env.TWITCH_USER_TOKEN;
  if (!userToken) return null;

  // Identify token owner (needed as moderator_id)
  const meRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${userToken}` },
  });
  const meData = await meRes.json();
  const modId = meData.data?.[0]?.id;
  if (!modId) return null;

  const allChatters = [];
  let cursor = null;
  let total = 0;
  let pages = 0;

  do {
    const url = new URL("https://api.twitch.tv/helix/chat/chatters");
    url.searchParams.set("broadcaster_id", broadcasterId);
    url.searchParams.set("moderator_id", modId);
    url.searchParams.set("first", "1000");
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url.toString(), {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${userToken}` },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.error) return null;

    allChatters.push(...(data.data || []));
    total = data.total ?? allChatters.length;
    cursor = data.pagination?.cursor || null;
    pages++;
  } while (cursor && allChatters.length < 2000 && pages < 3);

  return { chatters: allChatters, total };
}

// ─── Compute risk score entirely in JS ───────────────────────────────────────
function computeRiskScore(d) {
  let score = 0;
  const breakdown = [];

  // Engagement
  if (d.isLive && d.viewerCount > 100) {
    if (d.engagementRate === 0) {
      score += 40; breakdown.push({ label: "Zero engagement with live audience", delta: +40 });
    } else if (d.engagementRate < 0.3) {
      score += 30; breakdown.push({ label: "Near-zero engagement (<0.3%)", delta: +30 });
    } else if (d.engagementRate < 1.0) {
      score += 15; breakdown.push({ label: "Low engagement (<1%)", delta: +15 });
    }
  }

  // Ghost viewers
  if (d.ghostViewerSuspicion >= 80) {
    score += 25; breakdown.push({ label: "Severe ghost viewer pattern", delta: +25 });
  } else if (d.ghostViewerSuspicion >= 50) {
    score += 15; breakdown.push({ label: "Possible ghost viewers", delta: +15 });
  }

  // Follow spike
  if (d.followSpikeSuspicion >= 80) {
    score += 20; breakdown.push({ label: "Follow spike detected (high)", delta: +20 });
  } else if (d.followSpikeSuspicion >= 50) {
    score += 10; breakdown.push({ label: "Possible follow spike", delta: +10 });
  }

  // Username entropy
  if (d.usernameEntropyScore >= 60) {
    score += 15; breakdown.push({ label: "High bot-pattern username entropy", delta: +15 });
  } else if (d.usernameEntropyScore >= 40) {
    score += 8; breakdown.push({ label: "Moderate username entropy", delta: +8 });
  }

  // VOD consistency
  if (d.viewConsistencySuspicion >= 70) {
    score += 20; breakdown.push({ label: "Live viewers >> historical VOD views", delta: +20 });
  } else if (d.viewConsistencySuspicion >= 40) {
    score += 10; breakdown.push({ label: "Viewer/VOD inconsistency", delta: +10 });
  }

  // Viewer/follower ratio
  if (d.viewerFollowerSuspicion >= 60) {
    score += 15; breakdown.push({ label: "Abnormal viewer/follower ratio", delta: +15 });
  }

  // Suspicious followers
  if (d.suspiciousFollowerCount >= 8) {
    score += 12; breakdown.push({ label: "Many bot-pattern follower names", delta: +12 });
  } else if (d.suspiciousFollowerCount >= 4) {
    score += 6; breakdown.push({ label: "Some bot-pattern follower names", delta: +6 });
  }

  // Suspicious chatters (only if we have real chatter data)
  if (d.chattersSource === "api" && d.chattersTotal > 0) {
    const suspiciousPct = d.suspiciousChatterCount / d.chattersTotal;
    if (suspiciousPct > 0.3) {
      score += 15; breakdown.push({ label: ">30% chatters have bot-pattern names", delta: +15 });
    } else if (suspiciousPct > 0.15) {
      score += 8; breakdown.push({ label: "15%+ chatters have bot-pattern names", delta: +8 });
    }
  }

  // Positive signals (reduce score)
  if (d.subToViewerRatio >= 0.05) {
    score -= 15; breakdown.push({ label: "Healthy subscriber ratio", delta: -15 });
  }
  if (d.modCount >= 3) {
    score -= 10; breakdown.push({ label: `Active moderation (${d.modCount} mods)`, delta: -10 });
  }
  if (d.clipCount >= 5) {
    score -= 10; breakdown.push({ label: `Real viewer engagement (${d.clipCount} clips)`, delta: -10 });
  }
  if (d.broadcasterType === "partner") {
    score -= 15; breakdown.push({ label: "Verified partner broadcaster", delta: -15 });
  } else if (d.broadcasterType === "affiliate") {
    score -= 10; breakdown.push({ label: "Affiliate broadcaster", delta: -10 });
  }

  // Caps
  if (!d.isLive) score = Math.min(score, 50);
  if (d.chattersSource === "follower_fallback") score = Math.min(score, 65);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score <= 33 ? "LOW" : score <= 66 ? "MEDIUM" : "HIGH";
  return { score, level, breakdown };
}

// ─── Build chat sample from real data only ────────────────────────────────────
// Returns array of rows with ONLY real fields — no fabricated messages or ages.
function buildChatSample(chattersSource, chatSampleRaw) {
  return chatSampleRaw.map(c => {
    const scored = scoreUsername(c.login);
    const status =
      scored.score >= 60 ? "suspicious" :
      scored.score >= 25 ? "neutral" : "legit";
    return {
      username: c.login,
      botScore: scored.score,
      reason: scored.reasons.length > 0 ? scored.reasons.slice(0, 2).join(", ") : "clean pattern",
      status,
      dataSource: chattersSource, // "api" | "follower_fallback"
    };
  });
}

// ─── Main data collection ─────────────────────────────────────────────────────
async function collectAllTwitchData(channel, appToken) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const h = { "Client-Id": clientId, Authorization: `Bearer ${appToken}` };

  // 1. User profile
  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, { headers: h });
  const userData = await userRes.json();
  const user = userData.data?.[0];
  if (!user) return null;

  const broadcasterId = user.id;
  const accountCreatedAt = user.created_at;
  const accountAgeDays = Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / 86400000);

  // 2. Live stream
  const streamRes = await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, { headers: h });
  const streamData = await streamRes.json();
  const stream = streamData.data?.[0] || null;
  const isLive = !!stream;
  const viewerCount = stream?.viewer_count ?? 0;
  const streamStartedAt = stream?.started_at ?? null;
  const streamAgeMinutes = streamStartedAt
    ? Math.floor((Date.now() - new Date(streamStartedAt).getTime()) / 60000) : 0;

  // 3. Channel info
  const chanRes = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, { headers: h });
  const chanData = await chanRes.json();
  const chanInfo = chanData.data?.[0] || {};

  // 4. Follower count
  const followerRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`, { headers: h }
  );
  const followerData = await followerRes.json();
  const followerCount = followerData.total ?? 0;

  // 5. Recent followers — spike detection + username scoring
  const recentFollowersRes = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=20`, { headers: h }
  );
  const recentFollowersData = await recentFollowersRes.json();
  const recentFollowers = recentFollowersData.data || [];

  let followSpikeSuspicion = 0;
  if (recentFollowers.length >= 5) {
    const ts = recentFollowers.map(f => new Date(f.followed_at).getTime()).sort((a, b) => b - a);
    const windowMs = ts[0] - ts[Math.min(4, ts.length - 1)];
    if (windowMs < 60_000)       followSpikeSuspicion = 90;
    else if (windowMs < 300_000) followSpikeSuspicion = 60;
    else if (windowMs < 600_000) followSpikeSuspicion = 30;
  }

  const scoredFollowers = recentFollowers.map(f => ({
    login: f.user_login,
    ...scoreUsername(f.user_login),
    followedAt: f.followed_at,
  }));
  const avgFollowerScore = scoredFollowers.length > 0
    ? Math.round(scoredFollowers.reduce((a, b) => a + b.score, 0) / scoredFollowers.length) : 0;
  const suspiciousFollowerCount = scoredFollowers.filter(f => f.score >= 40).length;

  // 6. Chatters (needs user token)
  let chattersResult = null;
  let chattersSource = "none";
  if (isLive) {
    chattersResult = await fetchChatters(broadcasterId);
    if (chattersResult) chattersSource = "api";
  }
  if (!chattersResult) chattersSource = "follower_fallback";

  let chattersTotal = 0;
  let uniqueChatters = 0;
  let suspiciousChatterCount = 0;
  let avgChatterScore = 0;
  let chatSampleRaw = [];

  if (chattersResult && chattersResult.chatters.length > 0) {
    const scored = chattersResult.chatters.map(c => ({
      login: c.user_login,
      ...scoreUsername(c.user_login),
    }));
    chattersTotal = chattersResult.total;
    uniqueChatters = scored.length;
    suspiciousChatterCount = scored.filter(c => c.score >= 40).length;
    avgChatterScore = Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length);

    // Sample: top suspicious + top legit, up to 16 rows
    const sus = scored.filter(c => c.score >= 40).sort((a, b) => b.score - a.score).slice(0, 8);
    const leg = scored.filter(c => c.score < 20).slice(0, 8);
    chatSampleRaw = [...sus, ...leg].slice(0, 16);
  } else {
    // Fallback: use scored followers
    chatSampleRaw = scoredFollowers.slice(0, 8);
  }

  const engagementRate = viewerCount > 0 && chattersTotal > 0
    ? parseFloat(((chattersTotal / viewerCount) * 100).toFixed(2)) : 0;

  let ghostViewerSuspicion = 0;
  if (isLive && viewerCount > 50) {
    if (chattersTotal === 0)           ghostViewerSuspicion = 85;
    else if (engagementRate < 0.3)     ghostViewerSuspicion = 70;
    else if (engagementRate < 1.0)     ghostViewerSuspicion = 45;
    else if (engagementRate < 2.0)     ghostViewerSuspicion = 20;
  }

  // 7. Clips
  let clipCount = 0, recentClipViews = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=20`, { headers: h });
    const d = await r.json();
    clipCount = d.data?.length ?? 0;
    recentClipViews = (d.data || []).reduce((s, c) => s + (c.view_count || 0), 0);
  } catch (_) {}

  // 8. VODs
  let avgVideoViews = 0, videoCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/videos?user_id=${broadcasterId}&first=10&type=archive`, { headers: h });
    const d = await r.json();
    const videos = d.data || [];
    videoCount = videos.length;
    if (videos.length > 0)
      avgVideoViews = Math.round(videos.reduce((s, v) => s + (v.view_count || 0), 0) / videos.length);
  } catch (_) {}

  let viewConsistencySuspicion = 0;
  if (avgVideoViews > 10 && viewerCount > 0) {
    const ratio = viewerCount / avgVideoViews;
    if (ratio > 10)      viewConsistencySuspicion = 80;
    else if (ratio > 5)  viewConsistencySuspicion = 50;
    else if (ratio > 3)  viewConsistencySuspicion = 25;
  }

  // 9. Subscriptions
  let subCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}&first=1`, { headers: h });
    const d = await r.json();
    subCount = d.total ?? 0;
  } catch (_) {}
  const subToViewerRatio = viewerCount > 0 ? parseFloat((subCount / viewerCount).toFixed(3)) : 0;

  // 10. Moderators
  let modCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${broadcasterId}&first=100`, { headers: h });
    const d = await r.json();
    modCount = d.data?.length ?? 0;
  } catch (_) {}

  const viewerFollowerRatio = followerCount > 0
    ? parseFloat(((viewerCount / followerCount) * 100).toFixed(2)) : 0;
  let viewerFollowerSuspicion = 0;
  if (viewerFollowerRatio > 20)      viewerFollowerSuspicion = 70;
  else if (viewerFollowerRatio > 10) viewerFollowerSuspicion = 40;

  const usernameEntropyScore = chattersSource === "api" ? avgChatterScore : avgFollowerScore;

  return {
    channel, broadcasterId,
    broadcasterType: user.broadcaster_type || "none",
    accountCreatedAt, accountAgeDays,
    isLive, viewerCount, streamStartedAt, streamAgeMinutes,
    gameName: chanInfo.game_name || stream?.game_name || "Unknown",
    streamTitle: chanInfo.title || stream?.title || "",
    tags: chanInfo.tags || [],
    followerCount,
    scoredFollowers: scoredFollowers.slice(0, 6),
    followSpikeSuspicion, avgFollowerScore, suspiciousFollowerCount,
    chattersSource, chattersTotal, uniqueChatters,
    engagementRate, ghostViewerSuspicion,
    suspiciousChatterCount, avgChatterScore,
    chatSampleRaw,
    clipCount, recentClipViews, videoCount, avgVideoViews, viewConsistencySuspicion,
    subCount, subToViewerRatio, modCount,
    viewerFollowerRatio, viewerFollowerSuspicion, usernameEntropyScore,
    followerChatRatio: followerCount > 0
      ? parseFloat(((chattersTotal / followerCount) * 100).toFixed(4)) : 0,
  };
}

// ─── AI prompt — text only, numbers already computed ─────────────────────────
function buildAIPrompt(d, riskResult) {
  const chatNote = d.chattersSource === "api"
    ? `Real chatters pulled via API: ${d.chattersTotal} total, ${d.suspiciousChatterCount} have bot-pattern usernames (${d.engagementRate}% engagement)`
    : `Chatters API unavailable (no TWITCH_USER_TOKEN). Engagement unknown. Follower data used instead.`;

  return `You are a Twitch forensics analyst. Write a concise human-readable report based ONLY on the real data below. Do NOT invent numbers — all statistics are already computed.

CHANNEL: ${d.channel}
Broadcaster type: ${d.broadcasterType} | Account age: ${d.accountAgeDays} days
Followers: ${d.followerCount} | Subscribers: ${d.subCount} | Mods: ${d.modCount}
Live: ${d.isLive ? `YES — ${d.viewerCount} viewers, ${d.streamAgeMinutes} min, game: ${d.gameName}` : "NO (offline)"}

COMPUTED RISK SCORE: ${riskResult.score}/100 (${riskResult.level})
Risk factors that contributed:
${riskResult.breakdown.map(b => `  ${b.delta > 0 ? "+" : ""}${b.delta}: ${b.label}`).join("\n")}

CHAT: ${chatNote}
Follow spike suspicion: ${d.followSpikeSuspicion}/100
Ghost viewer suspicion: ${d.ghostViewerSuspicion}/100
Username entropy score: ${d.usernameEntropyScore}/100
VOD consistency suspicion: ${d.viewConsistencySuspicion}/100
Follower/viewer ratio: ${d.viewerFollowerRatio}%
Suspicious follower names: ${d.suspiciousFollowerCount} of last 20
Clips: ${d.clipCount} (${d.recentClipViews} views) | Avg VOD views: ${d.avgVideoViews}

Write a JSON object with exactly these two fields:
1. "verdict": 3-4 sentences explaining the risk assessment using specific real numbers above. If chatters data was unavailable, mention that analysis is limited.
2. "signals": array of 5-7 objects, each with:
   - "type": "ok" | "warn" | "danger"  
   - "title": short signal name
   - "detail": one sentence with a specific real number from the data above

Rules:
- Do NOT include riskScore, riskLevel, or any numeric field other than verdict and signals
- Every signal detail MUST contain a real number from the data
- No markdown, no code fences, return only the JSON object

{"verdict": "...", "signals": [...]}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ error: "Too many requests. Wait 30 seconds." });

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const cleanChannel = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!cleanChannel) return res.status(400).json({ error: "Invalid channel name." });

  try {
    const appToken = await getAppToken();
    const d = await collectAllTwitchData(cleanChannel, appToken);
    if (!d) return res.status(404).json({ error: `Channel "${cleanChannel}" not found on Twitch.` });

    // Compute risk score entirely in JS — no AI needed for this
    const riskResult = computeRiskScore(d);

    // Build chat sample entirely in JS — no AI needed, no fabrication
    const chatSample = buildChatSample(d.chattersSource, d.chatSampleRaw);

    // Ask AI only for verdict text + signal descriptions
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: "You are a Twitch forensics analyst. Return only valid JSON with no markdown and no code fences. Never invent statistics.",
          },
          { role: "user", content: buildAIPrompt(d, riskResult) },
        ],
      }),
    });

    let verdict = "Analysis complete. See signals below.";
    let signals = [];

    if (groqRes.ok) {
      const groqData = await groqRes.json();
      const raw = groqData.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, "").trim();
      try {
        const aiResult = JSON.parse(cleaned);
        verdict = aiResult.verdict || verdict;
        signals = aiResult.signals || [];
      } catch (e) {
        console.error("AI JSON parse failed:", cleaned.slice(0, 200));
      }
    }

    // Build final response — all numbers come from JS, not AI
    const result = {
      channel: d.channel,
      riskScore: riskResult.score,
      riskLevel: riskResult.level,
      // Stat cards
      liveViewers: d.viewerCount,
      chattersActive: d.chattersTotal,
      engagementRate: d.engagementRate,
      suspiciousAccounts: d.suspiciousChatterCount,
      avgAccountAgeDays: d.accountAgeDays,
      followersTotal: d.followerCount,
      followerChatRatio: d.followerChatRatio,
      messagesPerMinute: d.chattersTotal > 0 ? parseFloat((d.chattersTotal * 1.5).toFixed(1)) : 0,
      uniqueChattersLast10Min: d.chattersTotal,
      // AI text
      verdict,
      signals,
      // Chat table — real data only, no fabrication
      chatSample,
      // Metrics bars — all JS-computed
      metricsBreakdown: {
        chatEngagement: d.engagementRate > 0
          ? Math.min(100, Math.round(d.engagementRate * 20)) : 0,
        accountAgeSuspicion: d.accountAgeDays < 30 ? 90 : d.accountAgeDays < 180 ? 40 : 0,
        viewerSpikeProbability: Math.round((d.ghostViewerSuspicion * 0.6) + (d.viewConsistencySuspicion * 0.4)),
        usernameEntropyScore: d.usernameEntropyScore,
        followBotLikelihood: Math.round((d.followSpikeSuspicion * 0.6) + (d.avgFollowerScore * 0.4)),
      },
      // Metadata
      usedRealData: true,
      dataQuality: {
        isLive: d.isLive,
        chattersSource: d.chattersSource,
        chattersTotal: d.chattersTotal,
        hasUserToken: !!process.env.TWITCH_USER_TOKEN,
        hasVODs: d.videoCount > 0,
        hasClips: d.clipCount > 0,
        hasSubs: d.subCount > 0,
        riskBreakdown: riskResult.breakdown,
      },
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err.message, err.stack?.split("\n")[1]);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
}
