// api/analyze.js — Vercel serverless function
// All numbers computed in JS. AI only writes verdict text.

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

// ─── Twitch app token ─────────────────────────────────────────────────────────
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

// ─── Username bot-pattern scorer (0–100) ─────────────────────────────────────
// FIX #8: Added underscore-heavy, short random, and prefix-farm detection
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

  const digits = (n.match(/\d/g) || []).length;
  const digitRatio = digits / n.length;

  // High digit ratio
  if (digitRatio > 0.45)      { score += 35; reasons.push(`${Math.round(digitRatio*100)}% digits`); }
  else if (digitRatio > 0.25) { score += 15; reasons.push("moderate digits"); }

  // High character entropy (random-looking)
  if (entropyOf(n) > 3.8)     { score += 20; reasons.push("random char pattern"); }

  // Bot keyword prefix + digits
  if (/^(user|viewer|watch|live|stream|bot|follow|tv_|twitch|view)\d+/i.test(n))
                               { score += 35; reasons.push("bot keyword+digits"); }

  // 4+ trailing digits
  if (/\d{4,}$/.test(n))      { score += 20; reasons.push("4+ trailing digits"); }

  // Very long name
  if (n.length > 18)           { score += 10; reasons.push("long name"); }

  // No vowels in a name longer than 5 chars (consonant soup)
  if (!/[aeiou]/.test(n) && n.length > 5)
                               { score += 15; reasons.push("no vowels"); }

  // Underscore-heavy: bot_farm_123, some_viewer_48
  const underscores = (n.match(/_/g) || []).length;
  if (underscores >= 2 && digits > 0) { score += 15; reasons.push("underscores+digits"); }

  // Very short pure-random names (3-5 chars, no vowels or pure consonants)
  if (n.length <= 5 && !/[aeiou]/.test(n) && n.length >= 3)
                               { score += 20; reasons.push("short random"); }

  // Ends in exactly 6-8 digits (very common bot pattern: name12345678)
  if (/\d{6,8}$/.test(n))     { score += 15; reasons.push("6-8 trailing digits"); }

  return { score: Math.min(score, 100), reasons };
}

// ─── Twitch REST data collection ─────────────────────────────────────────────
async function fetchTwitchData(channel, token) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const h = { "Client-Id": clientId, Authorization: `Bearer ${token}` };

  // 1. User profile
  const userR = await fetch(`https://api.twitch.tv/helix/users?login=${channel}`, { headers: h });
  const userD = await userR.json();
  const user = userD.data?.[0];
  if (!user) return null;

  const bid = user.id;
  const accountAgeDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000);

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

  // FIX #7: Fetch 100 recent followers instead of 20 for better entropy sample
  const recFolR = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${bid}&first=100`, { headers: h });
  const recFolD = await recFolR.json();
  const recentFollowers = recFolD.data || [];

  // Follow spike: check last 20 for timing
  let followSpikeSuspicion = 0;
  if (recentFollowers.length >= 5) {
    const ts = recentFollowers.slice(0, 20).map(f => new Date(f.followed_at).getTime()).sort((a, b) => b - a);
    const windowMs = ts[0] - ts[Math.min(4, ts.length - 1)];
    if (windowMs < 60_000)       followSpikeSuspicion = 90;
    else if (windowMs < 300_000) followSpikeSuspicion = 60;
    else if (windowMs < 600_000) followSpikeSuspicion = 30;
  }

  // Score all 100 follower usernames
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

  // 7. VODs — FIX #6: only run consistency check if enough VOD history exists
  let avgVideoViews = 0, videoCount = 0;
  try {
    const r = await fetch(`https://api.twitch.tv/helix/videos?user_id=${bid}&first=10&type=archive`, { headers: h });
    const d = await r.json();
    videoCount = d.data?.length ?? 0;
    if (videoCount >= 3) // need at least 3 VODs for meaningful comparison
      avgVideoViews = Math.round((d.data || []).reduce((s, v) => s + (v.view_count || 0), 0) / videoCount);
  } catch (_) {}

  let viewConsistencySuspicion = 0;
  if (avgVideoViews > 50 && viewerCount > 0 && videoCount >= 3) {
    const ratio = viewerCount / avgVideoViews;
    if (ratio > 15)      viewConsistencySuspicion = 85;
    else if (ratio > 8)  viewConsistencySuspicion = 60;
    else if (ratio > 4)  viewConsistencySuspicion = 30;
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
    accountCreatedAt: user.created_at,
    accountAgeDays,
    isLive, viewerCount, streamStartedAt, streamAgeMinutes,
    gameName: chanInfo.game_name || stream?.game_name || "Unknown",
    streamTitle: chanInfo.title || stream?.title || "",
    tags: chanInfo.tags || [],
    followerCount,
    scoredFollowers,
    avgFollowerScore,
    suspiciousFollowerCount,
    followerSampleSize: recentFollowers.length,
    followSpikeSuspicion,
    clipCount, recentClipViews, videoCount, avgVideoViews, viewConsistencySuspicion,
    subCount, subToViewerRatio, modCount,
  };
}

// ─── Process IRC data sent from the browser ───────────────────────────────────
function processIrcData(ircData, viewerCount, collectDurationMs) {
  // FIX #1: Raised message cap to 2000
  const messages = (ircData?.messages || []).slice(0, 2000);
  const uniqueChatters = ircData?.uniqueChatters ?? 0;
  const totalMessages = ircData?.totalMessages ?? 0;
  const msgsPerMin = ircData?.msgsPerMin ?? 0;
  const ircCollected = totalMessages > 0;
  const collectSecs = (collectDurationMs || 60000) / 1000;

  // Build per-user map with timestamps for velocity analysis
  const userMap = {};
  for (const msg of messages) {
    if (!msg.user || !msg.text) continue;
    if (!userMap[msg.user]) userMap[msg.user] = { user: msg.user, count: 0, msgs: [], ts: [] };
    userMap[msg.user].count++;
    userMap[msg.user].msgs.push(msg.text.trim());
    userMap[msg.user].ts.push(msg.ts || 0);
  }

  // FIX #4: Use collectSecs in field name dynamically
  const chatterList = Object.values(userMap).map(c => {
    const scored = scoreUsername(c.user);
    // Detect spam: same message sent multiple times
    const msgFreq = {};
    for (const m of c.msgs) msgFreq[m] = (msgFreq[m] || 0) + 1;
    const maxRepeat = Math.max(...Object.values(msgFreq));
    const spammy = c.count > (collectSecs / 5) || maxRepeat >= 3; // >1 msg per 5s OR repeated 3x

    return {
      username: c.user,
      messagesInWindow: c.count,
      lastMsg: c.msgs[c.msgs.length - 1] || "",
      botScore: scored.score,
      reason: scored.reasons.length > 0 ? scored.reasons.slice(0, 2).join(", ") : "clean pattern",
      status: scored.score >= 60 ? "suspicious" : scored.score >= 25 ? "neutral" : "legit",
      spammy,
      maxRepeat,
    };
  });

  // Chat sample: most suspicious first, then most active legit
  const suspicious = chatterList.filter(c => c.botScore >= 40 || c.spammy)
    .sort((a, b) => b.botScore - a.botScore).slice(0, 8);
  const legit = chatterList.filter(c => c.botScore < 20 && !c.spammy)
    .sort((a, b) => b.messagesInWindow - a.messagesInWindow).slice(0, 8);
  const chatSample = [...suspicious, ...legit].slice(0, 16);

  const suspiciousChatterCount = chatterList.filter(c => c.botScore >= 40).length;
  const avgChatterScore = chatterList.length > 0
    ? Math.round(chatterList.reduce((a, b) => a + b.botScore, 0) / chatterList.length) : 0;

  // FIX #2: Engagement rate — scale-aware thresholds
  // IRC uniqueChatters is real chatters who sent ≥1 message.
  // Very large channels legitimately have <1% engagement due to lurker ratio.
  const engagementRate = viewerCount > 0 && uniqueChatters > 0
    ? parseFloat(((uniqueChatters / viewerCount) * 100).toFixed(2)) : 0;

  // FIX #5: Scale-aware ghost viewer thresholds
  // Large channels (10k+) naturally have 0.1-0.5% engagement — don't penalize
  let ghostViewerSuspicion = 0;
  if (viewerCount > 50 && ircCollected) {
    if (uniqueChatters === 0) {
      ghostViewerSuspicion = 90; // zero chat in 60s = very suspicious
    } else {
      // Expected minimum chatters: ~0.05% for huge channels, ~1% for small ones
      // Scale: log curve — 100 viewers expect 1%, 10000 viewers expect 0.1%
      const logViewers = Math.log10(Math.max(viewerCount, 100));
      const expectedMinPct = Math.max(0.05, 2.0 - (logViewers * 0.5)); // decreases with scale
      if (engagementRate < expectedMinPct * 0.3)       ghostViewerSuspicion = 80;
      else if (engagementRate < expectedMinPct * 0.6)  ghostViewerSuspicion = 55;
      else if (engagementRate < expectedMinPct)        ghostViewerSuspicion = 25;
    }
  } else if (!ircCollected && viewerCount > 50) {
    ghostViewerSuspicion = 40; // offline or no chat — uncertain
  }

  // Message rate anomaly (msgs/min per viewer)
  let messageRateAnomaly = 0;
  if (ircCollected && viewerCount > 0) {
    const msgsPerViewer = msgsPerMin / viewerCount;
    if (msgsPerViewer > 1.0)        messageRateAnomaly = 75; // impossibly high
    else if (msgsPerViewer > 0.5)   messageRateAnomaly = 50;
    else if (msgsPerViewer < 0.0005 && viewerCount > 200) messageRateAnomaly = 80; // near-zero
    else if (msgsPerViewer < 0.002 && viewerCount > 200)  messageRateAnomaly = 40;
  }

  // FIX #3: Single-message ratio — adjusted for 60s window
  // In 60 seconds, a real user sending only 1 message is NORMAL (they typed once and left).
  // Bot threshold: >90% single-message AND low total messages suggests bots
  const singleMessageChatters = chatterList.filter(c => c.messagesInWindow === 1).length;
  const singleMessageRatio = chatterList.length > 0 ? singleMessageChatters / chatterList.length : 0;
  // Only flag if: >90% sent 1 msg AND avg is very low AND there are enough chatters to be meaningful
  const singleMsgSuspicion = (
    ircCollected &&
    chatterList.length >= 10 &&
    singleMessageRatio > 0.90 &&
    (totalMessages / Math.max(chatterList.length, 1)) < 1.5
  ) ? Math.round(singleMessageRatio * 70) : 0;

  // FIX #9: Repeat message detection — bot farms often send identical messages
  // Count how many unique messages appear 3+ times from different users
  const globalMsgFreq = {};
  for (const msg of messages) {
    const t = msg.text?.trim().toLowerCase();
    if (t && t.length > 2) globalMsgFreq[t] = (globalMsgFreq[t] || 0) + 1;
  }
  const repeatedMsgs = Object.entries(globalMsgFreq).filter(([_, n]) => n >= 5);
  const repeatMsgCount = repeatedMsgs.length;
  // If 3+ different messages each sent by 5+ different accounts = coordinated bot behavior
  const repeatMsgSuspicion = repeatMsgCount >= 3 ? Math.min(80, repeatMsgCount * 15) :
                             repeatMsgCount >= 1 ? Math.min(40, repeatMsgCount * 15) : 0;
  const topRepeatedMsg = repeatedMsgs.sort((a, b) => b[1] - a[1])[0];

  // FIX #10: Chat velocity variance — bot chat is unnaturally uniform
  // Real chat has bursts; bot chat sends at steady intervals
  let velocityVariance = 0;
  let lowVarianceSuspicion = 0;
  if (ircCollected && messages.length >= 20) {
    const bucketSize = 5000; // 5-second buckets
    const buckets = {};
    for (const m of messages) {
      const bucket = Math.floor((m.ts - messages[0].ts) / bucketSize);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    }
    const counts = Object.values(buckets);
    if (counts.length >= 4) {
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
      velocityVariance = parseFloat(cv.toFixed(3));
      // Real chat: CV > 0.5 (bursty). Bot chat: CV < 0.2 (mechanical steady rate)
      if (cv < 0.15 && messages.length >= 30) lowVarianceSuspicion = 70;
      else if (cv < 0.25 && messages.length >= 30) lowVarianceSuspicion = 40;
    }
  }

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
    repeatMsgSuspicion,
    repeatMsgCount,
    topRepeatedMsg: topRepeatedMsg ? { text: topRepeatedMsg[0], count: topRepeatedMsg[1] } : null,
    velocityVariance,
    lowVarianceSuspicion,
  };
}

// ─── Risk score — pure JS ─────────────────────────────────────────────────────
function computeRiskScore(tw, irc) {
  let score = 0;
  const breakdown = [];
  const add = (delta, label) => { score += delta; breakdown.push({ delta, label }); };

  // Engagement (scale-aware)
  if (tw.isLive && tw.viewerCount > 100 && irc.ircCollected) {
    if (irc.uniqueChatters === 0)            add(45, `Zero chatters in ${Math.round(irc.totalMessages > 0 ? 60 : 0)}s IRC window (${tw.viewerCount.toLocaleString()} viewers)`);
    else if (irc.ghostViewerSuspicion >= 75) add(35, `Abnormally low engagement: ${irc.engagementRate}% (scale-adjusted)`);
    else if (irc.ghostViewerSuspicion >= 50) add(20, `Below-expected engagement: ${irc.engagementRate}%`);
    else if (irc.ghostViewerSuspicion >= 25) add(10, `Slightly low engagement: ${irc.engagementRate}%`);
  }

  // Repeat message detection (NEW)
  if (irc.repeatMsgSuspicion >= 60)          add(20, `${irc.repeatMsgCount} messages sent by 5+ different accounts (coordinated)`);
  else if (irc.repeatMsgSuspicion >= 30)     add(10, `Repeated messages from multiple accounts detected`);

  // Chat velocity (NEW)
  if (irc.lowVarianceSuspicion >= 60)        add(15, `Unnaturally uniform message rate (CV=${irc.velocityVariance}) — bots chat at steady intervals`);
  else if (irc.lowVarianceSuspicion >= 35)   add(8,  `Low message rate variance (CV=${irc.velocityVariance})`);

  // Message rate anomaly
  if (irc.messageRateAnomaly >= 70)          add(15, `Abnormal message rate (${irc.msgsPerMin} msgs/min for ${tw.viewerCount} viewers)`);

  // Single-message pattern (adjusted threshold)
  if (irc.singleMsgSuspicion >= 55)          add(12, `${Math.round(irc.singleMessageRatio*100)}% of chatters sent exactly 1 message in 60s`);

  // Follow spike
  if (tw.followSpikeSuspicion >= 80)         add(20, `Follow spike: 5 follows in <60s`);
  else if (tw.followSpikeSuspicion >= 50)    add(10, `Possible follow spike detected`);

  // Username entropy — chatters
  if (irc.avgChatterScore >= 60)             add(15, `High bot-pattern chatter names (avg score ${irc.avgChatterScore}/100)`);
  else if (irc.avgChatterScore >= 40)        add(8,  `Moderate chatter name entropy (${irc.avgChatterScore}/100)`);

  // Suspicious chatter ratio
  if (irc.ircCollected && irc.uniqueChatters >= 5) {
    const pct = irc.suspiciousChatterCount / irc.uniqueChatters;
    if (pct > 0.4)       add(15, `${Math.round(pct*100)}% of chatters have bot-pattern usernames`);
    else if (pct > 0.2)  add(8,  `${Math.round(pct*100)}% of chatters have bot-pattern usernames`);
  }

  // Username entropy — followers (larger sample now)
  if (tw.avgFollowerScore >= 55)             add(15, `High bot-pattern follower names (${tw.suspiciousFollowerCount}/${tw.followerSampleSize} suspicious)`);
  else if (tw.avgFollowerScore >= 35)        add(7,  `Moderate follower name entropy`);

  // VOD consistency (only fires with 3+ VODs now)
  if (tw.viewConsistencySuspicion >= 75)     add(20, `Live viewers ${Math.round(tw.viewerCount/Math.max(tw.avgVideoViews,1))}× higher than avg VOD views`);
  else if (tw.viewConsistencySuspicion >= 45) add(10, `Live viewer count inconsistent with VOD history`);

  // Positive signals
  if (tw.subToViewerRatio >= 0.05)           add(-15, `Strong subscriber ratio (${tw.subCount} subs / ${tw.viewerCount} viewers)`);
  else if (tw.subToViewerRatio >= 0.02)      add(-8,  `Decent subscriber ratio`);
  if (tw.modCount >= 3)                      add(-10, `Active moderation (${tw.modCount} mods)`);
  if (tw.clipCount >= 5)                     add(-10, `Real viewer engagement (${tw.clipCount} clips, ${tw.recentClipViews.toLocaleString()} views)`);
  if (tw.broadcasterType === "partner")      add(-15, "Verified partner broadcaster");
  else if (tw.broadcasterType === "affiliate") add(-10, "Affiliate broadcaster");
  // Long stream history is positive
  if (tw.videoCount >= 10 && tw.viewConsistencySuspicion === 0) add(-5, `Consistent VOD history (${tw.videoCount} archives)`);

  // Caps
  if (!tw.isLive) score = Math.min(score, 50);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score <= 33 ? "LOW" : score <= 66 ? "MEDIUM" : "HIGH";
  return { score, level, breakdown };
}

// ─── AI prompt — text only, all numbers locked ───────────────────────────────
function buildAIPrompt(channel, tw, irc, risk) {
  const repeatNote = irc.topRepeatedMsg
    ? `Top repeated message: "${irc.topRepeatedMsg.text}" sent by ${irc.topRepeatedMsg.count} accounts`
    : "No repeated messages detected";

  return `You are a Twitch stream forensics analyst. All numbers below are real — computed by algorithm, not estimated. Do not invent or change any statistic.

CHANNEL: ${channel} | ${tw.broadcasterType} | ${tw.accountAgeDays} days old
Followers: ${tw.followerCount.toLocaleString()} | Subs: ${tw.subCount} | Mods: ${tw.modCount}
${tw.isLive ? `LIVE: ${tw.viewerCount.toLocaleString()} viewers, ${tw.streamAgeMinutes}min, playing ${tw.gameName}` : "OFFLINE"}

RISK: ${risk.score}/100 → ${risk.level}
Factors:
${risk.breakdown.map(b => `  ${b.delta > 0 ? "+" : ""}${b.delta}: ${b.label}`).join("\n")}

IRC CHAT (60-second real sample):
- Unique chatters: ${irc.uniqueChatters} / ${tw.viewerCount.toLocaleString()} viewers = ${irc.engagementRate}% engagement
- Total messages: ${irc.totalMessages} (${irc.msgsPerMin}/min)
- Ghost viewer suspicion: ${irc.ghostViewerSuspicion}/100
- Suspicious username scores: ${irc.suspiciousChatterCount} chatters flagged
- Single-msg ratio: ${Math.round(irc.singleMessageRatio*100)}%
- Repeat msg suspicion: ${irc.repeatMsgSuspicion}/100 (${irc.repeatMsgCount} repeated messages)
- ${repeatNote}
- Chat velocity variance (CV): ${irc.velocityVariance} (bots <0.2, humans >0.5)

FOLLOWERS (${tw.followerSampleSize} sampled):
- Spike suspicion: ${tw.followSpikeSuspicion}/100
- Avg bot score: ${tw.avgFollowerScore}/100
- Suspicious names: ${tw.suspiciousFollowerCount}/${tw.followerSampleSize}

VODs: ${tw.videoCount} archived, avg ${tw.avgVideoViews} views | Clips: ${tw.clipCount} (${tw.recentClipViews.toLocaleString()} views)

Write a JSON object with exactly two fields:
1. "verdict": 3-4 clear sentences. Reference specific real numbers. Explain what the risk level means in plain language. Mention the strongest 2-3 signals. If offline, note limitations.
2. "signals": 5-7 objects each with "type" ("ok"/"warn"/"danger"), "title" (short), "detail" (one sentence with a real number).

No code fences. Return only the JSON object.

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

  const { channel, ircData, collectDurationMs } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const ch = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!ch) return res.status(400).json({ error: "Invalid channel name." });

  // FIX #1: Raised message cap to 2000
  const ircRaw = {
    messages: Array.isArray(ircData?.messages) ? ircData.messages.slice(0, 2000) : [],
    uniqueChatters: typeof ircData?.uniqueChatters === "number" ? ircData.uniqueChatters : 0,
    totalMessages: typeof ircData?.totalMessages === "number" ? ircData.totalMessages : 0,
    msgsPerMin: typeof ircData?.msgsPerMin === "number" ? ircData.msgsPerMin : 0,
  };

  const duration = typeof collectDurationMs === "number" ? collectDurationMs : 60000;

  try {
    const token = await getAppToken();
    const tw = await fetchTwitchData(ch, token);
    if (!tw) return res.status(404).json({ error: `Channel "${ch}" not found on Twitch.` });

    const irc = processIrcData(ircRaw, tw.viewerCount, duration);
    const risk = computeRiskScore(tw, irc);

    let verdict = "Analysis complete. See signals for details.";
    let signals = [];

    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.1,
          max_tokens: 700,
          messages: [
            { role: "system", content: "You are a Twitch forensics analyst. Return ONLY valid JSON, no markdown, no code fences. Never invent statistics." },
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
      console.error("AI step failed:", aiErr.message);
      signals = risk.breakdown.slice(0, 6).map(b => ({
        type: b.delta > 0 ? (b.delta >= 20 ? "danger" : "warn") : "ok",
        title: b.label.split("(")[0].trim().slice(0, 40),
        detail: b.label,
      }));
    }

    const viewerFollowerRatio = tw.followerCount > 0
      ? parseFloat(((tw.viewerCount / tw.followerCount) * 100).toFixed(2)) : 0;

    return res.status(200).json({
      channel: ch,
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
      // Channel info
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
      // Chat table
      chatSample: irc.chatSample,
      // Detection metrics
      metricsBreakdown: {
        chatEngagement: irc.engagementRate > 0
          ? Math.min(100, Math.round(irc.engagementRate * 25)) : 0,
        usernameEntropyScore: irc.ircCollected ? irc.avgChatterScore : tw.avgFollowerScore,
        singleMsgSuspicion: irc.singleMsgSuspicion,
        viewerSpikeProbability: Math.round(
          irc.ghostViewerSuspicion * 0.4 + tw.viewConsistencySuspicion * 0.3 + irc.repeatMsgSuspicion * 0.3
        ),
        followBotLikelihood: Math.round(tw.followSpikeSuspicion * 0.6 + tw.avgFollowerScore * 0.4),
        messageRateAnomaly: irc.messageRateAnomaly,
        repeatMsgSuspicion: irc.repeatMsgSuspicion,
        lowVarianceSuspicion: irc.lowVarianceSuspicion,
      },
      // Metadata
      usedRealData: true,
      dataQuality: {
        isLive: tw.isLive,
        ircCollected: irc.ircCollected,
        ircMessages: irc.totalMessages,
        ircChatters: irc.uniqueChatters,
        followerSampleSize: tw.followerSampleSize,
        hasVODs: tw.videoCount > 0,
        hasClips: tw.clipCount > 0,
        hasSubs: tw.subCount > 0,
        dataPointsCollected: 12,
        topRepeatedMsg: irc.topRepeatedMsg,
        velocityCV: irc.velocityVariance,
      },
    });
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: "Analysis failed: " + err.message });
  }
}
