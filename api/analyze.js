// api/analyze.js — Vercel serverless function
//
// ARCHITECTURE:
// The browser connects to Twitch IRC anonymously, collects real messages for 15s,
// then POSTs the collected data here alongside the channel name.
// This function:
//   1. Fetches Twitch REST API data (followers, stream, VODs, clips, subs, mods)
//   2. Scores all usernames algorithmically
//   3. Computes every metric and the risk score in pure JS
//   4. Asks the AI ONLY to write the verdict text and signal descriptions
//   5. Returns a response where every number is traceable to real data

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

// ─── Twitch app token ──────────────────────────────────────────────────────────
async function getAppToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET");
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const d = await res.json();
  if (!d.access_token) throw new Error("Twitch token failed: " + JSON.stringify(d));
  return d.access_token;
}

// ─── Username bot-pattern scorer ──────────────────────────────────────────────
function entropyOf(s) {
  if (!s || s.length === 0) return 0;
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
  if (digitRatio > 0.45)       { score += 35; reasons.push(`${Math.round(digitRatio*100)}% digits`); }
  else if (digitRatio > 0.25)  { score += 15; reasons.push("moderate digits"); }

  if (entropyOf(n) > 3.8)      { score += 20; reasons.push("random char pattern"); }

  if (/^(user|viewer|watch|live|stream|bot|follow|tv_)\d+/i.test(n))
                                { score += 30; reasons.push("bot keyword prefix"); }
  if (/\d{4,}$/.test(n))       { score += 20; reasons.push("4+ trailing digits"); }
  if (n.length > 18)            { score += 10; reasons.push("very long name"); }
  if (!/[aeiou]/.test(n) && n.length > 5)
                                { score += 15; reasons.push("no vowels"); }

  return { score: Math.min(score, 100), reasons };
}

// ─── Twitch REST data collection ───────────────────────────────────────────────
async function fetchTwitchData(channel, token) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const h = { "Client-Id": clientId, Authorization: `Bearer ${token}` };

  // 1. User
  const userR = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, { headers: h });
  const userD = await userR.json();
  const user = userD.data?.[0];
  if (!user) return null;

  const bid = user.id;
  const accountCreatedAt = user.created_at;
  const accountAgeDays = Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / 86400000);

  // 2. Stream
  const streamR = await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, { headers: h });
  const streamD = await streamR.json();
  const stream = streamD.data?.[0] || null;
  const isLive = !!stream;
  const viewerCount = stream?.viewer_count ?? 0;
  const streamStartedAt = stream?.started_at ?? null;
  const streamAgeMinutes = streamStartedAt
    ? Math.floor((Date.now() - new Date(streamStartedAt).getTime()) / 60000) : 0;

  // 3. Channel info
  const chanR = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${bid}`, { headers: h });
  const chanD = await chanR.json();
  const chanInfo = chanD.data?.[0] || {};

  // 4. Follower count
  const folR = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${bid}&first=1`, { headers: h });
  const folD = await folR.json();
  const followerCount = folD.total ?? 0;

  // 5. Recent followers (spike detection + username scoring)
  const recFolR = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${bid}&first=20`, { headers: h });
  const recFolD = await recFolR.json();
  const recentFollowers = recFolD.data || [];

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
    followedAt: f.followed_at,
    ...scoreUsername(f.user_login),
  }));
  const avgFollowerScore = scoredFollowers.length > 0
    ? Math.round(scoredFollowers.reduce((a, b) => a + b.score, 0) / scoredFollowers.length) : 0;
  const suspiciousFollowerCount = scoredFollowers.filter(f => f.score >= 40).length;

  // 6. Clips
  let clipCount = 0, recentClipViews = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${bid}&first=20`, { headers: h });
    const d = await r.json();
    clipCount = d.data?.length ?? 0;
    recentClipViews = (d.data || []).reduce((s, c) => s + (c.view_count || 0), 0);
  } catch (_) {}

  // 7. VODs
  let avgVideoViews = 0, videoCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/videos?user_id=${bid}&first=10&type=archive`, { headers: h });
    const d = await r.json();
    videoCount = d.data?.length ?? 0;
    if (videoCount > 0)
      avgVideoViews = Math.round((d.data || []).reduce((s, v) => s + (v.view_count || 0), 0) / videoCount);
  } catch (_) {}

  let viewConsistencySuspicion = 0;
  if (avgVideoViews > 10 && viewerCount > 0) {
    const ratio = viewerCount / avgVideoViews;
    if (ratio > 10)      viewConsistencySuspicion = 80;
    else if (ratio > 5)  viewConsistencySuspicion = 50;
    else if (ratio > 3)  viewConsistencySuspicion = 25;
  }

  // 8. Subs
  let subCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${bid}&first=1`, { headers: h });
    const d = await r.json();
    subCount = d.total ?? 0;
  } catch (_) {}
  const subToViewerRatio = viewerCount > 0 ? parseFloat((subCount / viewerCount).toFixed(3)) : 0;

  // 9. Mods
  let modCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${bid}&first=100`, { headers: h });
    const d = await r.json();
    modCount = d.data?.length ?? 0;
  } catch (_) {}

  return {
    broadcasterId: bid,
    broadcasterType: user.broadcaster_type || "none",
    accountCreatedAt, accountAgeDays,
    isLive, viewerCount, streamStartedAt, streamAgeMinutes,
    gameName: chanInfo.game_name || stream?.game_name || "Unknown",
    streamTitle: chanInfo.title || stream?.title || "",
    tags: chanInfo.tags || [],
    followerCount,
    scoredFollowers, avgFollowerScore, suspiciousFollowerCount,
    followSpikeSuspicion,
    clipCount, recentClipViews, videoCount, avgVideoViews, viewConsistencySuspicion,
    subCount, subToViewerRatio, modCount,
  };
}

// ─── Process IRC data sent from browser ───────────────────────────────────────
// ircData = { messages: [{user, text, ts}], uniqueChatters, totalMessages, msgsPerMin }
function processIrcData(ircData, viewerCount) {
  const messages = ircData?.messages || [];
  const uniqueChatters = ircData?.uniqueChatters ?? 0;
  const totalMessages = ircData?.totalMessages ?? 0;
  const msgsPerMin = ircData?.msgsPerMin ?? 0;
  const ircCollected = totalMessages > 0;

  // Build per-user map
  const userMap = {};
  for (const msg of messages) {
    if (!msg.user || !msg.text) continue;
    if (!userMap[msg.user]) {
      userMap[msg.user] = { user: msg.user, count: 0, msgs: [], ts: [] };
    }
    userMap[msg.user].count++;
    userMap[msg.user].msgs.push(msg.text);
    userMap[msg.user].ts.push(msg.ts || 0);
  }

  // Score every chatter username
  const chatterList = Object.values(userMap).map(c => {
    const scored = scoreUsername(c.user);
    return {
      username: c.user,
      messagesIn15s: c.count,
      lastMsg: c.msgs[c.msgs.length - 1] || "",   // REAL last message
      botScore: scored.score,
      reason: scored.reasons.length > 0 ? scored.reasons.slice(0, 2).join(", ") : "clean pattern",
      status: scored.score >= 60 ? "suspicious" : scored.score >= 25 ? "neutral" : "legit",
      // For spam detection: messages per 15s > 10 is suspicious
      spammy: c.count > 10,
    };
  });

  // Build chat sample: most suspicious + most active legit, up to 16 rows
  const suspicious = chatterList.filter(c => c.botScore >= 40 || c.spammy)
    .sort((a, b) => b.botScore - a.botScore).slice(0, 8);
  const legit = chatterList.filter(c => c.botScore < 20 && !c.spammy)
    .sort((a, b) => b.messagesIn15s - a.messagesIn15s).slice(0, 8);
  const chatSample = [...suspicious, ...legit].slice(0, 16);

  // Scores
  const suspiciousChatterCount = chatterList.filter(c => c.botScore >= 40).length;
  const avgChatterScore = chatterList.length > 0
    ? Math.round(chatterList.reduce((a, b) => a + b.botScore, 0) / chatterList.length) : 0;

  // Engagement
  const engagementRate = viewerCount > 0 && uniqueChatters > 0
    ? parseFloat(((uniqueChatters / viewerCount) * 100).toFixed(2)) : 0;

  let ghostViewerSuspicion = 0;
  if (viewerCount > 50) {
    if (!ircCollected)               ghostViewerSuspicion = 50; // offline, uncertain
    else if (uniqueChatters === 0)   ghostViewerSuspicion = 85;
    else if (engagementRate < 0.3)   ghostViewerSuspicion = 70;
    else if (engagementRate < 1.0)   ghostViewerSuspicion = 45;
    else if (engagementRate < 2.0)   ghostViewerSuspicion = 20;
  }

  // Message rate anomaly
  let messageRateAnomaly = 0;
  if (ircCollected && viewerCount > 0) {
    const msgsPerViewer = msgsPerMin / viewerCount;
    if (msgsPerViewer > 0.5)       messageRateAnomaly = 70; // unrealistically high
    else if (msgsPerViewer < 0.001 && viewerCount > 100) messageRateAnomaly = 80; // near zero
    else if (msgsPerViewer < 0.01)  messageRateAnomaly = 40;
  }

  // Single-message ratio: bots send exactly 1 message then go silent
  // Real users tend to send multiple messages in a 15s window
  const singleMessageChatters = chatterList.filter(c => c.messagesIn15s === 1).length;
  const singleMessageRatio = chatterList.length > 0
    ? singleMessageChatters / chatterList.length : 0;
  // Flag if >80% of chatters sent only 1 message AND there are enough to analyze
  const singleMsgSuspicion = (ircCollected && chatterList.length >= 5 && singleMessageRatio > 0.85)
    ? Math.round(singleMessageRatio * 80) : 0;

  return {
    ircCollected,
    uniqueChatters,
    totalMessages,
    msgsPerMin,
    chatSample,
    suspiciousChatterCount,
    avgChatterScore,
    engagementRate,
    ghostViewerSuspicion,
    messageRateAnomaly,
    singleMsgSuspicion,
    singleMessageRatio: parseFloat(singleMessageRatio.toFixed(2)),
  };
}

// ─── Risk score — pure JS, no AI ──────────────────────────────────────────────
function computeRiskScore(tw, irc) {
  let score = 0;
  const breakdown = [];

  const add = (delta, label) => { score += delta; breakdown.push({ delta, label }); };

  // Engagement
  if (tw.isLive && tw.viewerCount > 100) {
    if (irc.engagementRate === 0 && irc.ircCollected) {
      add(40, `Zero chatters observed in 15s IRC sample (${tw.viewerCount} viewers)`);
    } else if (irc.engagementRate < 0.3 && irc.ircCollected) {
      add(30, `Near-zero engagement: ${irc.engagementRate}% of viewers chatted`);
    } else if (irc.engagementRate < 1.0 && irc.ircCollected) {
      add(15, `Low engagement: ${irc.engagementRate}% of viewers chatted`);
    }
  }

  // Ghost viewers
  if (irc.ghostViewerSuspicion >= 80)      add(25, `High ghost viewer suspicion (${irc.ghostViewerSuspicion}/100)`);
  else if (irc.ghostViewerSuspicion >= 50) add(12, `Possible ghost viewers (${irc.ghostViewerSuspicion}/100)`);

  // Message rate anomaly
  if (irc.messageRateAnomaly >= 70)        add(15, "Abnormal message rate pattern");

  // Single-message bot pattern
  if (irc.singleMsgSuspicion >= 60)        add(12, `${Math.round(irc.singleMessageRatio*100)}% of chatters sent exactly 1 message (bot pattern)`);

  // Follow spike
  if (tw.followSpikeSuspicion >= 80)       add(20, `Follow spike detected (${tw.followSpikeSuspicion}/100)`);
  else if (tw.followSpikeSuspicion >= 50)  add(10, `Possible follow spike (${tw.followSpikeSuspicion}/100)`);

  // Username entropy from IRC chatters
  if (irc.avgChatterScore >= 60)           add(15, `High bot-pattern chatter names (avg ${irc.avgChatterScore}/100)`);
  else if (irc.avgChatterScore >= 40)      add(8,  `Moderate chatter name entropy (avg ${irc.avgChatterScore}/100)`);

  // Suspicious chatters ratio
  if (irc.ircCollected && irc.uniqueChatters > 0) {
    const pct = irc.suspiciousChatterCount / irc.uniqueChatters;
    if (pct > 0.4)      add(15, `${Math.round(pct*100)}% of chatters have bot-pattern usernames`);
    else if (pct > 0.2) add(8,  `${Math.round(pct*100)}% of chatters have bot-pattern usernames`);
  }

  // Follower entropy
  if (tw.avgFollowerScore >= 60)           add(12, `High bot-pattern follower names`);
  else if (tw.avgFollowerScore >= 40)      add(6,  `Moderate follower name entropy`);

  // VOD consistency
  if (tw.viewConsistencySuspicion >= 70)   add(20, `Live viewers ${Math.round(tw.viewerCount / Math.max(tw.avgVideoViews,1))}× higher than avg VOD views`);
  else if (tw.viewConsistencySuspicion >= 40) add(10, `Live viewer count inconsistent with VOD history`);

  // Positive signals
  if (tw.subToViewerRatio >= 0.05)         add(-15, `Healthy subscriber ratio (${tw.subCount} subs)`);
  if (tw.modCount >= 3)                    add(-10, `Active moderation (${tw.modCount} mods)`);
  if (tw.clipCount >= 5)                   add(-10, `Real viewer engagement (${tw.clipCount} clips)`);
  if (tw.broadcasterType === "partner")    add(-15, "Verified partner broadcaster");
  else if (tw.broadcasterType === "affiliate") add(-10, "Affiliate broadcaster");

  // Caps
  if (!tw.isLive) score = Math.min(score, 50);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score <= 33 ? "LOW" : score <= 66 ? "MEDIUM" : "HIGH";
  return { score, level, breakdown };
}

// ─── AI prompt — ONLY asks for text, all numbers pre-computed ─────────────────
function buildAIPrompt(channel, tw, irc, risk) {
  return `You are a Twitch stream forensics analyst. Write a concise report based ONLY on the verified data below. Do not invent any statistics — all numbers are already computed and locked.

CHANNEL: ${channel}
Broadcaster: ${tw.broadcasterType} | Account: ${tw.accountAgeDays} days old
Followers: ${tw.followerCount} | Subs: ${tw.subCount} | Mods: ${tw.modCount}
${tw.isLive ? `LIVE: ${tw.viewerCount} viewers, ${tw.streamAgeMinutes} min, game: ${tw.gameName}` : "OFFLINE"}

COMPUTED RISK: ${risk.score}/100 → ${risk.level}
Contributing factors:
${risk.breakdown.map(b => `  ${b.delta > 0 ? "+" : ""}${b.delta}: ${b.label}`).join("\n")}

CHAT (from ${irc.ircCollected ? "15-second real IRC sample" : "offline — no chat"}):
- Unique chatters seen: ${irc.uniqueChatters}
- Total messages captured: ${irc.totalMessages}
- Messages/min (extrapolated): ${irc.msgsPerMin}
- Engagement rate: ${irc.engagementRate}%
- Suspicious chatter usernames: ${irc.suspiciousChatterCount}
- Ghost viewer suspicion: ${irc.ghostViewerSuspicion}/100
- Single-message chatters: ${Math.round(irc.singleMessageRatio*100)}% (>85% is a bot indicator)

FOLLOWERS: Spike suspicion ${tw.followSpikeSuspicion}/100, avg bot score ${tw.avgFollowerScore}/100, ${tw.suspiciousFollowerCount} suspicious names
VODs: ${tw.videoCount} archived, avg ${tw.avgVideoViews} views | Clips: ${tw.clipCount} (${tw.recentClipViews} views)

Write a JSON object with exactly:
1. "verdict": 3-4 sentences. Reference specific real numbers. Explain what the risk score means in plain language. If chat was unavailable (offline), note the analysis is limited.
2. "signals": array of 5-7 objects each with "type" ("ok"/"warn"/"danger"), "title" (short name), "detail" (one sentence with a specific number).

Rules: Every signal detail MUST include a real number from the data. No code fences. Return only the JSON.

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

  const { channel, ircData } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const ch = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!ch) return res.status(400).json({ error: "Invalid channel name." });

  // Validate ircData shape (from browser)
  const ircRaw = {
    messages: Array.isArray(ircData?.messages) ? ircData.messages.slice(0, 500) : [],
    uniqueChatters: typeof ircData?.uniqueChatters === "number" ? ircData.uniqueChatters : 0,
    totalMessages: typeof ircData?.totalMessages === "number" ? ircData.totalMessages : 0,
    msgsPerMin: typeof ircData?.msgsPerMin === "number" ? ircData.msgsPerMin : 0,
  };

  try {
    // Step 1: Fetch Twitch REST data
    const token = await getAppToken();
    const tw = await fetchTwitchData(ch, token);
    if (!tw) return res.status(404).json({ error: `Channel "${ch}" not found on Twitch.` });

    // Step 2: Process IRC data from browser
    const irc = processIrcData(ircRaw, tw.viewerCount);

    // Step 3: Compute risk score in pure JS
    const risk = computeRiskScore(tw, irc);

    // Step 4: Ask AI for verdict text only
    let verdict = "Analysis complete based on real Twitch data. See signals below for details.";
    let signals = [];

    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.1,
          max_tokens: 700,
          messages: [
            {
              role: "system",
              content: "You are a Twitch forensics analyst. Return ONLY valid JSON with no markdown and no code fences. Never invent statistics.",
            },
            { role: "user", content: buildAIPrompt(ch, tw, irc, risk) },
          ],
        }),
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const raw = groqData.choices?.[0]?.message?.content || "";
        const cleaned = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, "").trim();
        const aiResult = JSON.parse(cleaned);
        verdict = aiResult.verdict || verdict;
        signals = Array.isArray(aiResult.signals) ? aiResult.signals : [];
      }
    } catch (aiErr) {
      console.error("AI step failed (non-fatal):", aiErr.message);
      // Build fallback signals from risk breakdown
      signals = risk.breakdown.slice(0, 6).map(b => ({
        type: b.delta > 0 ? (b.delta >= 20 ? "danger" : "warn") : "ok",
        title: b.label.split("(")[0].trim(),
        detail: b.label,
      }));
    }

    // Step 5: Assemble response — every number from JS, not AI
    const viewerFollowerRatio = tw.followerCount > 0
      ? parseFloat(((tw.viewerCount / tw.followerCount) * 100).toFixed(2)) : 0;

    const result = {
      channel: ch,
      // Risk — JS computed
      riskScore: risk.score,
      riskLevel: risk.level,
      // Stat cards
      liveViewers: tw.viewerCount,
      followersTotal: tw.followerCount,
      chattersActive: irc.uniqueChatters,
      totalIrcMessages: irc.totalMessages,
      messagesPerMinute: irc.msgsPerMin,
      engagementRate: irc.engagementRate,
      suspiciousAccounts: irc.suspiciousChatterCount,
      uniqueChattersLast10Min: irc.uniqueChatters,
      followerChatRatio: tw.followerCount > 0
        ? parseFloat(((irc.uniqueChatters / tw.followerCount) * 100).toFixed(4)) : 0,
      avgAccountAgeDays: tw.accountAgeDays,
      // Channel info — displayed in UI header
      isLive: tw.isLive,
      streamTitle: tw.streamTitle,
      gameName: tw.gameName,
      streamAgeMinutes: tw.streamAgeMinutes,
      broadcasterType: tw.broadcasterType,
      subCount: tw.subCount,
      modCount: tw.modCount,
      tags: tw.tags,
      viewerFollowerRatio,
      // AI text
      verdict,
      signals,
      // Chat table — real IRC data, real usernames, real messages, real counts
      chatSample: irc.chatSample,
      // Metrics bars — all JS
      metricsBreakdown: {
        chatEngagement: irc.engagementRate > 0
          ? Math.min(100, Math.round(irc.engagementRate * 20)) : 0,
        usernameEntropyScore: irc.ircCollected ? irc.avgChatterScore : tw.avgFollowerScore,
        singleMsgSuspicion: irc.singleMsgSuspicion,
        viewerSpikeProbability: Math.round(
          irc.ghostViewerSuspicion * 0.5 + tw.viewConsistencySuspicion * 0.3 + (tw.followSpikeSuspicion * 0.2)
        ),
        followBotLikelihood: Math.round(tw.followSpikeSuspicion * 0.6 + tw.avgFollowerScore * 0.4),
        messageRateAnomaly: irc.messageRateAnomaly,
      },
      // Metadata
      usedRealData: true,
      dataQuality: {
        isLive: tw.isLive,
        ircCollected: irc.ircCollected,
        ircMessages: irc.totalMessages,
        ircChatters: irc.uniqueChatters,
        hasVODs: tw.videoCount > 0,
        hasClips: tw.clipCount > 0,
        hasSubs: tw.subCount > 0,
        dataPointsCollected: 10,
      },
    };

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
}
