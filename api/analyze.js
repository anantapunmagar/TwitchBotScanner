// api/analyze.js
// Twitch Bot Scanner - Robust version with graceful degradation

import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const RATE_LIMIT_MS = 20_000; // 1 request per 20s per IP
const rateMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const last = rateMap.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateMap.set(ip, now);

  // Cleanup old entries
  if (rateMap.size > 600) {
    for (const [k, v] of rateMap) {
      if (now - v > RATE_LIMIT_MS * 10) rateMap.delete(k);
    }
  }
  return false;
}

async function getAppAccessToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET");
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchTwitch(url, token) {
  const res = await fetch(url, {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twitch API ${res.status}: ${text}`);
  }
  return res.json();
}

function calculateEntropy(str) {
  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function analyzeUsernames(chatters) {
  if (!chatters || chatters.length === 0) {
    return { score: 0, flagged: [], patterns: [], total: 0 };
  }

  const botPatterns = [
    /^[a-z]+\d{6,}$/i,
    /^[a-z]{2,4}_\w+\d+$/i,
    /^user\d+$/i,
    /^[a-z]\d{7,}$/i,
    /^\d+[a-z]+\d+$/i,
    /^[a-z]{8,12}\d{4,}$/i,
    /^(bot|viewer|twitch|live|stream)\d+/i,
  ];

  const flagged = [];
  const patternCounts = {};

  chatters.forEach((chatter) => {
    const login = (chatter.user_login || chatter.login || chatter).toLowerCase();
    let suspicious = false;

    botPatterns.forEach((pattern, idx) => {
      if (pattern.test(login)) {
        suspicious = true;
        patternCounts[idx] = (patternCounts[idx] || 0) + 1;
      }
    });

    // High entropy = random-looking name
    if (login.length >= 10 && calculateEntropy(login) > 3.7) {
      suspicious = true;
      patternCounts.high_entropy = (patternCounts.high_entropy || 0) + 1;
    }

    if (suspicious) flagged.push(login);
  });

  const score = Math.min(100, Math.round((flagged.length / chatters.length) * 120)); // slightly aggressive

  const patterns = [];
  if (patternCounts[0]) patterns.push(`${patternCounts[0]} name+long_digits`);
  if (patternCounts.high_entropy) patterns.push(`${patternCounts.high_entropy]} high-entropy names`);
  if (patternCounts[6]) patterns.push(`${patternCounts[6]} bot/viewer prefixes`);

  return {
    score,
    flagged: flagged.slice(0, 30),
    patterns,
    total: chatters.length,
  };
}

function buildPrompt(realData) {
  return `You are an expert Twitch stream authenticity analyst.

Use ONLY the REAL data provided below. Never hallucinate numbers or usernames.

${JSON.stringify(realData, null, 2)}

Return ONLY valid JSON matching this schema exactly:

{
  "riskScore": <integer 0-100>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "summary": "<2-4 sentence professional forensic summary>",
  "signals": [
    { "type": "safe"|"warn"|"danger", "label": "<short title>", "detail": "<specific explanation with real numbers>" }
  ],
  "metricsBreakdown": {
    "viewerFollowerRatio": "<assessment>",
    "usernameRisk": "<assessment>",
    "followerGrowthRisk": "<assessment>",
    "chatEngagementRisk": "<assessment>",
    "accountAgeRisk": "<assessment>"
  },
  "recommendations": ["<actionable item>", ...],
  "confidence": "high" | "medium" | "low"
}

Scoring guidelines (apply strictly):
- Suspicious usernames > 40% → strong risk increase
- Viewer/follower ratio < 0.5% while live → high risk
- New account (<60 days) + high viewers → high risk
- Follower spike or clustering → high risk
- Good custom emotes + reasonable engagement → risk reduction

Return ONLY the JSON object.`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Rate limited. Wait 20 seconds between scans." });
  }

  const { channelName } = req.body || {};
  if (!channelName || typeof channelName !== "string" || channelName.length > 50) {
    return res.status(400).json({ error: "Invalid channel name" });
  }

  const cleanChannel = channelName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

  try {
    const token = await getAppAccessToken();

    // 1. Get user
    const userData = await fetchTwitch(
      `https://api.twitch.tv/helix/users?login=${cleanChannel}`,
      token
    );
    const user = userData.data?.[0];
    if (!user) return res.status(404).json({ error: "Channel not found" });

    const broadcasterId = user.id;
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // 2. Stream info
    let isLive = false;
    let viewerCount = 0;
    let gameName = "Offline";
    let streamTitle = "";

    try {
      const streamRes = await fetchTwitch(
        `https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`,
        token
      );
      const stream = streamRes.data?.[0];
      if (stream) {
        isLive = true;
        viewerCount = stream.viewer_count || 0;
        gameName = stream.game_name || "Unknown";
        streamTitle = stream.title || "";
      }
    } catch (e) {
      console.warn("Stream fetch failed:", e.message);
    }

    // 3. Followers count (public)
    let followerCount = 0;
    let followerGrowth = { last24h: 0, clusterScore: 0, spikeSuspicious: false };

    try {
      const followersRes = await fetchTwitch(
        `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=1`,
        token
      );
      followerCount = followersRes.total || 0;
    } catch (e) {
      console.warn("Followers count failed:", e.message);
    }

    // 4. Chatters (requires moderator:read:chatters scope — will usually fail with app token)
    let chattersData = { score: 0, flagged: [], patterns: [], total: -1 };
    let rawChattersCount = -1;

    try {
      const chattersRes = await fetchTwitch(
        `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=100`,
        token
      );
      rawChattersCount = chattersRes.total || chattersRes.data?.length || 0;
      chattersData = analyzeUsernames(chattersRes.data || []);
      chattersData.total = rawChattersCount;
    } catch (e) {
      console.warn(`Chatters fetch failed (normal without moderator scope): ${e.message}`);
    }

    // 5. Channel info + emotes
    let emoteCount = 0;
    let clipCount = 0;
    try {
      const [channelRes, emotesRes, clipsRes] = await Promise.allSettled([
        fetchTwitch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, token),
        fetchTwitch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`, token),
        fetchTwitch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=10`, token),
      ]);

      emoteCount = emotesRes.status === "fulfilled" ? (emotesRes.value.data?.length || 0) : 0;
      clipCount = clipsRes.status === "fulfilled" ? (clipsRes.value.data?.length || 0) : 0;
    } catch (e) {
      console.warn("Additional data fetch failed:", e.message);
    }

    // Derived metrics
    const viewerFollowerRatio = followerCount > 0 ? ((viewerCount / followerCount) * 100).toFixed(2) : "N/A";
    const chatterRatio = rawChattersCount > 0 && viewerCount > 0
      ? ((rawChattersCount / viewerCount) * 100).toFixed(1)
      : "N/A";

    const realData = {
      channel: {
        login: user.login,
        displayName: user.display_name,
        broadcasterType: user.broadcaster_type || "none",
        accountAgeDays,
        createdAt: user.created_at,
      },
      stream: { isLive, viewerCount, gameName, streamTitle },
      followers: { total: followerCount, ...followerGrowth },
      chatters: {
        total: rawChattersCount,
        suspiciousScore: chattersData.score,
        flaggedUsernames: chattersData.flagged,
        patterns: chattersData.patterns,
        chatterToViewerRatio: chatterRatio,
      },
      engagement: {
        customEmotes: emoteCount,
        recentClips: clipCount,
        viewerFollowerRatioPct: viewerFollowerRatio,
      },
    };

    // AI Analysis
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.15,
      max_tokens: 1500,
      messages: [
        { role: "system", content: "You are a precise Twitch forensic analyst. Use only the provided real data. Return valid JSON only." },
        { role: "user", content: buildPrompt(realData) },
      ],
    });

    let aiAnalysis;
    try {
      const rawContent = completion.choices[0]?.message?.content || "{}";
      const cleaned = rawContent.replace(/```json|```/g, "").trim();
      aiAnalysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("AI JSON parse failed:", parseErr);
      aiAnalysis = {
        riskScore: 45,
        riskLevel: "MEDIUM",
        summary: "Partial data collected. AI parsing encountered an issue.",
        signals: [],
        metricsBreakdown: {},
        recommendations: ["Re-scan or add moderator permissions for better accuracy"],
        confidence: "medium",
      };
    }

    return res.status(200).json({
      success: true,
      channel: realData.channel,
      stream: realData.stream,
      followers: realData.followers,
      chatters: realData.chatters,
      engagement: realData.engagement,
      analysis: aiAnalysis,
      dataQuality: {
        chattersAvailable: rawChattersCount !== -1,
        fullModeration: chattersData.score > 0 && rawChattersCount > 10,
      },
      note: chattersData.total === -1 
        ? "Chatters list requires moderator:read:chatters scope (user OAuth token)" 
        : "Real chat data used",
    });

  } catch (error) {
    console.error("Handler error for channel", cleanChannel, ":", error.message);
    return res.status(500).json({
      error: "Analysis failed. Please try again in a few seconds.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
