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
