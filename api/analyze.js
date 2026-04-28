// api/analyze.js — TwitchBotScanner backend
// Supports TWITCH_ACCESS_TOKEN directly OR auto-generates from Client ID + Secret

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateMap = new Map();
const RATE_LIMIT_MS = 20_000;

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateMap.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateMap.set(ip, now);
  if (rateMap.size > 500)
    for (const [k, v] of rateMap)
      if (now - v > RATE_LIMIT_MS * 5) rateMap.delete(k);
  return false;
}

// ─── Twitch auth ──────────────────────────────────────────────────────────────
async function getTwitchToken() {
  if (process.env.TWITCH_ACCESS_TOKEN) return process.env.TWITCH_ACCESS_TOKEN;
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

// ─── Twitch fetcher ───────────────────────────────────────────────────────────
async function tf(path, token) {
  const clientId = process.env.TWITCH_CLIENT_ID || "";
  const res = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ─── Gather Twitch data ───────────────────────────────────────────────────────
async function getTwitchData(channel, token) {
  if (!token) return null;
  const [streamData, userData] = await Promise.all([
    tf(`/streams?user_login=${channel}`, token),
    tf(`/users?login=${channel}`, token),
  ]);
  const user = userData?.data?.[0];
  if (!user) return null;
  const stream = streamData?.data?.[0] || null;
  const uid = user.id;

  const [followData, videosData, clipsData, channelData] = await Promise.all([
    tf(`/channels/followers?broadcaster_id=${uid}&first=1`, token),
    tf(`/videos?user_id=${uid}&type=archive&first=10`, token),
    tf(`/clips?broadcaster_id=${uid}&first=5`, token),
    tf(`/channels?broadcaster_id=${uid}`, token),
  ]);

  const videos = videosData?.data || [];
  const clips = clipsData?.data || [];
  const channelInfo = channelData?.data?.[0];

  const recentVods = videos.slice(0, 5).map(v => ({
    title: v.title,
    date: v.created_at,
    views: v.view_count,
    duration: v.duration,
  }));

  const streamUptimeMinutes = stream?.started_at
    ? Math.floor((Date.now() - new Date(stream.started_at).getTime()) / 60000)
    : null;

  const avgClipViews =
    clips.length > 0
      ? Math.round(clips.reduce((s, c) => s + c.view_count, 0) / clips.length)
      : 0;

  const accountAgeDays = user.created_at
    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
    : null;

  return {
    isLive: !!stream,
    viewerCount: stream?.viewer_count ?? 0,
    gameName: stream?.game_name ?? channelInfo?.game_name ?? "Unknown",
    streamTitle: stream?.title ?? channelInfo?.title ?? "",
    streamStartedAt: stream?.started_at ?? null,
    streamUptimeMinutes,
    followerCount: followData?.total ?? 0,
    accountCreatedAt: user.created_at,
    accountAgeDays,
    broadcasterType: user.broadcaster_type || "regular",
    description: user.description || "",
    totalVideoViews: user.view_count ?? 0,
    recentVods,
    avgClipViews,
    language: channelInfo?.broadcaster_language ?? stream?.language ?? "unknown",
    tags: stream?.tags ?? [],
  };
}

// ─── Build Groq prompt ────────────────────────────────────────────────────────
function buildPrompt(channel, d) {
  const realSection = d
    ? `
REAL TWITCH DATA — use these exact values:
- Live: ${d.isLive ? "YES" : "NO"}
- Viewers: ${d.viewerCount}
- Followers: ${d.followerCount}
- Total all-time views: ${d.totalVideoViews}
- Game: ${d.gameName}
- Title: "${d.streamTitle}"
- Uptime: ${d.streamUptimeMinutes != null ? d.streamUptimeMinutes + " minutes" : "N/A"}
- Account age: ${d.accountAgeDays != null ? d.accountAgeDays + " days" : "unknown"}
- Broadcaster type: ${d.broadcasterType}
- Language: ${d.language}
- Tags: ${d.tags.join(", ") || "none"}
- Avg clip views: ${d.avgClipViews}
- Recent VOD views: ${d.recentVods.map(v => v.views).join(", ") || "no vods"}
${d.followerCount > 0 && d.viewerCount > 0 ? `- Viewer/follower ratio: ${((d.viewerCount / d.followerCount) * 100).toFixed(2)}% (normal: 1-5%, suspicious: >15%)` : ""}
${d.recentVods.length > 1 ? `- VOD view range: ${Math.min(...d.recentVods.map(v => v.views))} - ${Math.max(...d.recentVods.map(v => v.views))}` : ""}
${d.broadcasterType === "partner" ? "- Twitch Partner (reduces suspicion)" : ""}
${d.isLive && d.streamUptimeMinutes < 10 ? "- Stream just started (bot spike window)" : ""}

Set liveViewers=${d.viewerCount} and followersTotal=${d.followerCount} exactly.
Simulate chat metrics consistent with these real numbers.
`
    : `No Twitch API. Simulate all data. Known big streamers = LOW risk. Random-looking names with numbers = HIGH risk.`;

  return `You are a Twitch forensic bot-detection AI. Analyze "${channel}".

${realSection}

Return ONLY a valid JSON object, no markdown, no extra text:

{
  "channel": "${channel}",
  "riskScore": <0-100>,
  "riskLevel": <"LOW"|"MEDIUM"|"HIGH">,
  "liveViewers": <int>,
  "chattersActive": <int>,
  "engagementRate": <float>,
  "suspiciousAccounts": <int>,
  "avgAccountAgeDays": <int>,
  "followersTotal": <int>,
  "followerChatRatio": <float>,
  "messagesPerMinute": <float>,
  "uniqueChattersLast10Min": <int>,
  "viewerFollowerRatio": <float>,
  "botInjectionEvents": <int>,
  "verdict": "<3 sentence forensic verdict specific to this channel>",
  "signals": [
    { "type": <"ok"|"warn"|"danger">, "title": "<name>", "detail": "<specific finding>" }
  ],
  "chatSample": [
    { "username": "<name>", "messagesIn10min": <int>, "accountAgeDays": <int>, "status": <"legit"|"suspicious"|"neutral">, "lastMsg": "<msg>", "joinedRecently": <bool> }
  ],
  "viewerTimeline": [
    { "minutesAgo": <int>, "viewers": <int> }
  ],
  "metricsBreakdown": {
    "chatEngagement": <0-100>,
    "accountAgeSuspicion": <0-100>,
    "viewerSpikeProbability": <0-100>,
    "usernameEntropyScore": <0-100>,
    "followBotLikelihood": <0-100>,
    "viewerFollowerAnomaly": <0-100>
  }
}

- signals: 5-7 items
- chatSample: exactly 10 rows. HIGH risk = bot-like usernames, low ages. LOW risk = normal usernames, old accounts.
- viewerTimeline: 9 points at minutesAgo 60,50,40,30,20,15,10,5,0. HIGH risk = include one sharp spike. LOW = smooth curve.
- Return ONLY the JSON object.`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ error: "Too many requests. Wait 20 seconds." });

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const clean = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!clean) return res.status(400).json({ error: "Invalid channel name." });

  try {
    let twitchData = null;
    try {
      const token = await getTwitchToken();
      if (token) twitchData = await getTwitchData(clean, token);
    } catch (e) {
      console.error("Twitch error:", e.message);
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.65,
        max_tokens: 1500,
        messages: [
          { role: "system", content: "You are a Twitch forensic analysis system. Return only valid JSON. No markdown, no code fences, no text outside the JSON." },
          { role: "user", content: buildPrompt(clean, twitchData) },
        ],
      }),
    });

    if (!groqRes.ok) {
      console.error("Groq error:", await groqRes.text());
      return res.status(502).json({ error: "AI analysis failed. Try again." });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error("Parse fail:", raw.slice(0, 200));
      return res.status(500).json({ error: "Malformed AI response. Try again." });
    }

    result.usedRealData = !!twitchData;
    if (twitchData) {
      result.realData = {
        isLive: twitchData.isLive,
        gameName: twitchData.gameName,
        streamTitle: twitchData.streamTitle,
        streamUptimeMinutes: twitchData.streamUptimeMinutes,
        accountAgeDays: twitchData.accountAgeDays,
        broadcasterType: twitchData.broadcasterType,
        language: twitchData.language,
        tags: twitchData.tags,
        recentVods: twitchData.recentVods,
        avgClipViews: twitchData.avgClipViews,
        totalVideoViews: twitchData.totalVideoViews,
        description: twitchData.description,
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}
