import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function fetchWithAuth(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitch API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function getTwitchToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  return data.access_token;
}

function analyzeUsernames(chatters) {
  if (!chatters || chatters.length === 0) return { score: 0, flagged: [], patterns: [] };

  const botPatterns = [
    /^[a-z]+\d{6,}$/i,           // name followed by 6+ digits
    /^[a-z]{2,4}_[a-z]{2,4}_\d+$/i, // word_word_numbers
    /^user\d+$/i,                 // user12345
    /^[a-z]\d{7,}$/i,             // single letter + many digits
    /^\d+[a-z]+\d+$/i,            // numbers-letters-numbers
    /^[a-z]{8,12}\d{4,}$/i,       // random chars + numbers
    /^(bot|viewer|follower|twitch)\d+/i, // bot/viewer prefix
    /^[a-z]{1,3}\d{5,}$/i,        // very short name + digits
  ];

  const flagged = [];
  const patternCounts = {};

  chatters.forEach((chatter) => {
    const login = chatter.user_login || chatter;
    let isSuspicious = false;

    botPatterns.forEach((pattern, idx) => {
      if (pattern.test(login)) {
        isSuspicious = true;
        patternCounts[idx] = (patternCounts[idx] || 0) + 1;
      }
    });

    // Entropy check — random-looking names
    const entropy = calculateEntropy(login);
    if (entropy > 3.8 && login.length > 10) {
      isSuspicious = true;
      patternCounts["high_entropy"] = (patternCounts["high_entropy"] || 0) + 1;
    }

    if (isSuspicious) flagged.push(login);
  });

  const score = Math.min(100, Math.round((flagged.length / chatters.length) * 100));

  const patterns = [];
  if (patternCounts[0]) patterns.push(`${patternCounts[0]} usernames match name+digits pattern`);
  if (patternCounts["high_entropy"]) patterns.push(`${patternCounts["high_entropy"]} high-entropy random-looking usernames`);
  if (patternCounts[6]) patterns.push(`${patternCounts[6]} usernames with bot/viewer prefix`);

  return { score, flagged: flagged.slice(0, 50), patterns, total: chatters.length };
}

function calculateEntropy(str) {
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const len = str.length;
  return Object.values(freq).reduce((h, count) => {
    const p = count / len;
    return h - p * Math.log2(p);
  }, 0);
}

function analyzeFollowerGrowth(followers) {
  if (!followers || followers.length === 0) return { spikeSuspicious: false, recentFollowRate: 0, clusterScore: 0 };

  const now = Date.now();
  const last24h = followers.filter(f => (now - new Date(f.followed_at).getTime()) < 86400000);
  const last1h = followers.filter(f => (now - new Date(f.followed_at).getTime()) < 3600000);

  // Check for clustering — bot farms follow in bursts
  const timestamps = followers.map(f => new Date(f.followed_at).getTime()).sort();
  let maxCluster = 0;
  let clusterCount = 0;

  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] - timestamps[i - 1] < 2000) { // within 2 seconds
      clusterCount++;
      maxCluster = Math.max(maxCluster, clusterCount);
    } else {
      clusterCount = 0;
    }
  }

  const clusterScore = Math.min(100, maxCluster * 5);
  const spikeSuspicious = last24h.length > 500 || last1h.length > 100 || clusterScore > 40;

  return {
    spikeSuspicious,
    last24hFollows: last24h.length,
    last1hFollows: last1h.length,
    clusterScore,
    recentFollowRate: last24h.length,
  };
}

function buildPrompt(realData) {
  return `You are a professional Twitch fraud analyst. Analyze ONLY the real data provided below. Do NOT invent or hallucinate any numbers. If a field is -1 or null, mark it as unavailable.

REAL DATA FROM TWITCH API:
${JSON.stringify(realData, null, 2)}

Based ONLY on this real data, provide a bot/fraud analysis in this exact JSON format:

{
  "riskScore": <0-100 integer based purely on the signals above>,
  "riskLevel": "<low|medium|high|critical>",
  "summary": "<2-3 sentence executive summary of findings>",
  "signals": [
    {
      "type": "<danger|warn|info|safe>",
      "label": "<signal name>",
      "detail": "<specific detail referencing real numbers from the data>"
    }
  ],
  "metricsBreakdown": {
    "viewerToFollowerRatio": "<ratio and what it indicates>",
    "usernameEntropyRisk": "<assessment based on real username analysis>",
    "followerGrowthRisk": "<assessment based on real follower data>",
    "accountAgeRisk": "<assessment based on real account age>",
    "chatEngagementRisk": "<assessment based on real chatter count vs viewers>"
  },
  "recommendations": [
    "<specific actionable recommendation based on findings>"
  ],
  "confidence": "<low|medium|high — based on how much real data was available>"
}

SCORING GUIDE (use these weights):
- Username entropy score > 40%: +30 to riskScore
- Follower cluster score > 40: +25 to riskScore  
- Viewer/follower ratio < 0.5%: +20 to riskScore
- Account created < 30 days ago: +15 to riskScore
- Chatters < 10% of viewers: +20 to riskScore
- Sudden follower spike (>500 in 24h): +25 to riskScore
- All signals clean: riskScore should be < 20

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { channelName } = req.body;
  if (!channelName) return res.status(400).json({ error: "Channel name required" });

  try {
    // Step 1: Get OAuth token
    const token = await getTwitchToken();
    const headers = {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    };

    // Step 2: Get user info
    const userData = await fetchWithAuth(
      `https://api.twitch.tv/helix/users?login=${channelName}`,
      headers
    );

    if (!userData.data || userData.data.length === 0) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const user = userData.data[0];
    const broadcasterId = user.id;
    const accountCreatedAt = user.created_at;
    const accountAgeDays = Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / 86400000);

    // Step 3: Get stream info
    let streamData = null;
    let isLive = false;
    let viewerCount = 0;
    let gameName = "N/A";
    let streamTitle = "N/A";

    try {
      const streamRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`,
        headers
      );
      if (streamRes.data && streamRes.data.length > 0) {
        streamData = streamRes.data[0];
        isLive = true;
        viewerCount = streamData.viewer_count;
        gameName = streamData.game_name;
        streamTitle = streamData.title;
      }
    } catch (e) {
      console.log("Stream fetch failed:", e.message);
    }

    // Step 4: Get follower count + recent followers
    let followerCount = 0;
    let recentFollowers = [];
    let followerGrowthAnalysis = { spikeSuspicious: false, last24hFollows: 0, clusterScore: 0 };

    try {
      const followerRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&first=100`,
        headers
      );
      followerCount = followerRes.total || 0;
      recentFollowers = followerRes.data || [];
      followerGrowthAnalysis = analyzeFollowerGrowth(recentFollowers);
    } catch (e) {
      console.log("Followers fetch failed:", e.message);
    }

    // Step 5: Get real chatters list
    let chattersData = { total: -1, flagged: [], score: 0, patterns: [] };
    let rawChattersCount = -1;

    try {
      const chattersRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}&first=1000`,
        headers
      );
      rawChattersCount = chattersRes.total || chattersRes.data?.length || 0;
      chattersData = analyzeUsernames(chattersRes.data || []);
      chattersData.total = rawChattersCount;
    } catch (e) {
      console.log("Chatters fetch failed (requires mod scope):", e.message);
    }

    // Step 6: Get channel info (description, language, etc.)
    let channelInfo = {};
    try {
      const channelRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
        headers
      );
      channelInfo = channelRes.data?.[0] || {};
    } catch (e) {
      console.log("Channel info fetch failed:", e.message);
    }

    // Step 7: Get recent clips (engagement signal)
    let clipCount = 0;
    try {
      const clipsRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}&first=20`,
        headers
      );
      clipCount = clipsRes.data?.length || 0;
    } catch (e) {
      console.log("Clips fetch failed:", e.message);
    }

    // Step 8: Get channel emotes (legitimacy signal)
    let emoteCount = 0;
    try {
      const emotesRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`,
        headers
      );
      emoteCount = emotesRes.data?.length || 0;
    } catch (e) {
      console.log("Emotes fetch failed:", e.message);
    }

    // Step 9: Get subscriptions count (if affiliate/partner)
    let subCount = -1;
    try {
      const subsRes = await fetchWithAuth(
        `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${broadcasterId}`,
        headers
      );
      subCount = subsRes.total || -1;
    } catch (e) {
      // Requires broadcaster scope — expected to fail
    }

    // Step 10: Compute derived metrics
    const viewerToFollowerRatio = followerCount > 0 ? ((viewerCount / followerCount) * 100).toFixed(2) : 0;
    const chatterToViewerRatio = viewerCount > 0 && rawChattersCount > 0
      ? ((rawChattersCount / viewerCount) * 100).toFixed(2)
      : -1;

    // Build real data object for AI
    const realData = {
      channel: {
        login: user.login,
        displayName: user.display_name,
        broadcasterType: user.broadcaster_type || "none",
        accountCreatedAt,
        accountAgeDays,
        description: user.description || "",
        profileImageUrl: user.profile_image_url,
        viewCount: user.view_count,
        language: channelInfo.broadcaster_language || "unknown",
        tags: channelInfo.tags || [],
      },
      stream: {
        isLive,
        viewerCount,
        gameName,
        streamTitle,
        startedAt: streamData?.started_at || null,
      },
      followers: {
        total: followerCount,
        recentSample: recentFollowers.length,
        last24hFollows: followerGrowthAnalysis.last24hFollows,
        last1hFollows: followerGrowthAnalysis.last1hFollows || 0,
        clusterScore: followerGrowthAnalysis.clusterScore,
        spikeSuspicious: followerGrowthAnalysis.spikeSuspicious,
      },
      chatters: {
        totalActive: rawChattersCount,
        analyzedCount: chattersData.total,
        suspiciousUsernameScore: chattersData.score,
        flaggedUsernames: chattersData.flagged.slice(0, 20),
        suspiciousPatterns: chattersData.patterns,
        chatterToViewerRatioPct: chatterToViewerRatio,
      },
      engagement: {
        viewerToFollowerRatioPct: viewerToFollowerRatio,
        recentClipCount: clipCount,
        customEmoteCount: emoteCount,
        subscriberCount: subCount,
      },
      computedRiskSignals: {
        lowViewerFollowerRatio: parseFloat(viewerToFollowerRatio) < 0.5 && isLive,
        highUsernameEntropy: chattersData.score > 40,
        followerSpike: followerGrowthAnalysis.spikeSuspicious,
        newAccount: accountAgeDays < 30,
        lowChatterEngagement: chatterToViewerRatio !== -1 && parseFloat(chatterToViewerRatio) < 10,
        hasCustomEmotes: emoteCount > 0,
        isAffiliate: user.broadcaster_type === "affiliate",
        isPartner: user.broadcaster_type === "partner",
      },
    };

    // Step 11: AI Analysis with real data only
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a professional Twitch fraud detection analyst. You only analyze real data. You never hallucinate metrics. Return only valid JSON.",
        },
        {
          role: "user",
          content: buildPrompt(realData),
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    let aiAnalysis;
    try {
      const raw = completion.choices[0].message.content.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      aiAnalysis = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (e) {
      aiAnalysis = {
        riskScore: 50,
        riskLevel: "medium",
        summary: "AI analysis parsing failed. Raw data collected successfully.",
        signals: [],
        metricsBreakdown: {},
        recommendations: ["Re-run analysis"],
        confidence: "low",
      };
    }

    // Step 12: Return combined real data + AI analysis
    return res.status(200).json({
      success: true,
      channel: realData.channel,
      stream: realData.stream,
      followers: realData.followers,
      chatters: realData.chatters,
      engagement: realData.engagement,
      computedRiskSignals: realData.computedRiskSignals,
      analysis: aiAnalysis,
      dataQuality: {
        chattersAvailable: rawChattersCount !== -1,
        followersAvailable: followerCount > 0,
        streamDataAvailable: isLive,
        subsAvailable: subCount !== -1,
      },
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return res.status(500).json({ error: error.message || "Analysis failed" });
  }
}
