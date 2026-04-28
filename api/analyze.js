// api/analyze.js — TwitchBotScanner v4.0
// Maximum real data extraction + deep Groq AI analysis

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateMap = new Map();
const RATE_LIMIT_MS = 20_000;
function isRateLimited(ip) {
  const now = Date.now();
  const last = rateMap.get(ip) || 0;
  if (now - last < RATE_LIMIT_MS) return true;
  rateMap.set(ip, now);
  if (rateMap.size > 500) for (const [k, v] of rateMap) if (now - v > RATE_LIMIT_MS * 5) rateMap.delete(k);
  return false;
}

// ─── Token cache ──────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getTwitchToken() {
  if (process.env.TWITCH_ACCESS_TOKEN) return process.env.TWITCH_ACCESS_TOKEN;
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60000) return cachedToken;
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  cachedToken = data.access_token || null;
  tokenExpiry = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

// ─── Twitch API fetcher ───────────────────────────────────────────────────────
async function tf(path, token) {
  const clientId = process.env.TWITCH_CLIENT_ID || "";
  try {
    const res = await fetch(`https://api.twitch.tv/helix${path}`, {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Username entropy scoring ─────────────────────────────────────────────────
function calcUsernameEntropy(username) {
  // Bot indicators: random-looking alphanumeric strings, very long with digits
  const digitRatio = (username.match(/\d/g) || []).length / username.length;
  const hasTrailingNumbers = /\d{4,}$/.test(username);
  const isLong = username.length > 16;
  const uniqueChars = new Set(username.toLowerCase()).size;
  const uniqueRatio = uniqueChars / username.length;
  const noVowels = !/[aeiou]/i.test(username);

  let score = 0;
  if (digitRatio > 0.4) score += 35;
  else if (digitRatio > 0.25) score += 20;
  if (hasTrailingNumbers) score += 25;
  if (isLong && digitRatio > 0.3) score += 15;
  if (uniqueRatio < 0.5) score += 10; // lots of repeated chars = less bot-like, actually
  if (noVowels && username.length > 6) score += 20;
  // Patterns like user123456, viewer9234, etc.
  if (/^(user|viewer|watcher|watch|twitch|bot|live)\d+$/i.test(username)) score += 40;
  return Math.min(100, score);
}

// ─── Gather ALL real Twitch data ──────────────────────────────────────────────
async function getTwitchData(channel, token) {
  if (!token) return null;

  // Phase 1: Core user + stream data in parallel
  const [streamData, userData] = await Promise.all([
    tf(`/streams?user_login=${encodeURIComponent(channel)}`, token),
    tf(`/users?login=${encodeURIComponent(channel)}`, token),
  ]);

  const user = userData?.data?.[0];
  if (!user) return null;

  const stream = streamData?.data?.[0] || null;
  const uid = user.id;
  const isLive = !!stream;

  // Phase 2: Fetch everything in parallel
  const [
    followData,
    videosData,
    clipsData,
    channelData,
    chatSettingsData,
    chattersData,
    subsData,
  ] = await Promise.all([
    tf(`/channels/followers?broadcaster_id=${uid}&first=1`, token),
    tf(`/videos?user_id=${uid}&type=archive&first=20`, token),
    tf(`/clips?broadcaster_id=${uid}&first=20`, token),
    tf(`/channels?broadcaster_id=${uid}`, token),
    tf(`/chat/settings?broadcaster_id=${uid}`, token),
    // Get chatters — works with app token but only returns count, not list
    // without moderator scope. We'll try anyway for the total count.
    isLive ? tf(`/chat/chatters?broadcaster_id=${uid}&moderator_id=${uid}&first=1000`, token) : Promise.resolve(null),
    // Subscriptions count (requires channel:read:subscriptions — will fail gracefully)
    tf(`/subscriptions?broadcaster_id=${uid}&first=1`, token),
  ]);

  const videos = videosData?.data || [];
  const clips = clipsData?.data || [];
  const channelInfo = channelData?.data?.[0];
  const chatSettings = chatSettingsData?.data?.[0] || null;
  const followerCount = followData?.total ?? 0;

  // Real chatters data (if API allows)
  const realChatters = chattersData?.data || [];
  const realChatterCount = chattersData?.total ?? realChatters.length;

  // ─── Phase 3: Enrich chatter sample with account ages ─────────────────────
  let chatterSample = [];
  let accountAgeStats = null;

  if (realChatters.length > 0) {
    // Sample up to 50 chatters for account age analysis
    const sample = realChatters.slice(0, 50);
    const userIds = sample.map(c => c.user_id).filter(Boolean);

    // Batch fetch user data (max 100 per request)
    let sampledUsers = [];
    if (userIds.length > 0) {
      const idParams = userIds.map(id => `id=${id}`).join("&");
      const usersData = await tf(`/users?${idParams}`, token);
      sampledUsers = usersData?.data || [];
    }

    const now = Date.now();
    const userMap = {};
    for (const u of sampledUsers) {
      const ageDays = u.created_at
        ? Math.floor((now - new Date(u.created_at).getTime()) / 86400000)
        : null;
      userMap[u.id] = {
        username: u.login,
        displayName: u.display_name,
        accountAgeDays: ageDays,
        broadcasterType: u.broadcaster_type || "regular",
        entropyScore: calcUsernameEntropy(u.login),
        isNew: ageDays !== null && ageDays < 30,
        accountCreatedAt: u.created_at,
      };
    }

    chatterSample = sample.map(c => ({
      userId: c.user_id,
      username: c.user_login,
      ...((userMap[c.user_id] || {})),
    }));

    // Compute real account age statistics
    const ages = chatterSample
      .map(c => c.accountAgeDays)
      .filter(a => a !== null && a !== undefined);

    if (ages.length > 0) {
      const sorted = [...ages].sort((a, b) => a - b);
      accountAgeStats = {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: Math.round(ages.reduce((s, a) => s + a, 0) / ages.length),
        median: sorted[Math.floor(sorted.length / 2)],
        under7Days: ages.filter(a => a < 7).length,
        under30Days: ages.filter(a => a < 30).length,
        under90Days: ages.filter(a => a < 90).length,
        over365Days: ages.filter(a => a > 365).length,
        sampleSize: ages.length,
      };
    }
  }

  // ─── Phase 4: VOD & clip analysis ─────────────────────────────────────────
  const recentVods = videos.slice(0, 10).map(v => ({
    title: v.title,
    date: v.created_at,
    views: v.view_count,
    duration: v.duration,
  }));

  const allVodViews = videos.map(v => v.view_count).filter(v => v > 0);
  const vodViewStats =
    allVodViews.length > 0
      ? {
          avg: Math.round(allVodViews.reduce((s, v) => s + v, 0) / allVodViews.length),
          max: Math.max(...allVodViews),
          min: Math.min(...allVodViews),
          total: allVodViews.reduce((s, v) => s + v, 0),
          count: allVodViews.length,
          // Consistency: std dev / mean — high = inconsistent (bot pattern)
          coefficientOfVariation:
            allVodViews.length > 1
              ? (() => {
                  const mean = allVodViews.reduce((s, v) => s + v, 0) / allVodViews.length;
                  const variance =
                    allVodViews.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / allVodViews.length;
                  return mean > 0 ? Math.round((Math.sqrt(variance) / mean) * 100) : 0;
                })()
              : 0,
        }
      : null;

  // Clip analysis
  const clipViews = clips.map(c => c.view_count).filter(v => v > 0);
  const avgClipViews =
    clipViews.length > 0
      ? Math.round(clipViews.reduce((s, v) => s + v, 0) / clipViews.length)
      : 0;
  const topClips = clips.slice(0, 5).map(c => ({
    title: c.title,
    views: c.view_count,
    createdAt: c.created_at,
    duration: c.duration,
  }));

  // ─── Compute derived metrics ───────────────────────────────────────────────
  const streamUptimeMinutes = stream?.started_at
    ? Math.floor((Date.now() - new Date(stream.started_at).getTime()) / 60000)
    : null;

  const accountAgeDays = user.created_at
    ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
    : null;

  const viewerCount = stream?.viewer_count ?? 0;

  // Viewer/Follower ratio
  const viewerFollowerRatio =
    followerCount > 0 ? (viewerCount / followerCount) * 100 : null;

  // Chatter/Viewer ratio (key bot indicator)
  const chatterViewerRatio =
    isLive && viewerCount > 0 && realChatterCount > 0
      ? (realChatterCount / viewerCount) * 100
      : null;

  // VOD view to live viewer ratio (low = suspicious)
  const avgVodToLiveRatio =
    vodViewStats && viewerCount > 0
      ? vodViewStats.avg / viewerCount
      : null;

  // Username entropy analysis for sampled chatters
  const entropyScores = chatterSample.map(c => c.entropyScore || 0);
  const avgEntropy =
    entropyScores.length > 0
      ? Math.round(entropyScores.reduce((s, e) => s + e, 0) / entropyScores.length)
      : null;
  const highEntropyCount = entropyScores.filter(e => e > 50).length;

  // Subscriber count (if available)
  const subCount = subsData?.total ?? null;

  return {
    // Channel basics
    isLive,
    viewerCount,
    gameName: stream?.game_name ?? channelInfo?.game_name ?? "Unknown",
    streamTitle: stream?.title ?? channelInfo?.title ?? "",
    streamStartedAt: stream?.started_at ?? null,
    streamUptimeMinutes,
    language: channelInfo?.broadcaster_language ?? stream?.language ?? "unknown",
    tags: stream?.tags ?? [],

    // Account info
    accountCreatedAt: user.created_at,
    accountAgeDays,
    broadcasterType: user.broadcaster_type || "regular",
    description: user.description || "",
    totalVideoViews: user.view_count ?? 0,

    // Audience metrics
    followerCount,
    subCount,
    viewerFollowerRatio,

    // Real chatter data
    realChatterCount,
    chatterSample,
    accountAgeStats,
    chatterViewerRatio,
    avgEntropy,
    highEntropyCount,
    chatterSampleSize: chatterSample.length,

    // VOD/clip data
    recentVods,
    vodViewStats,
    avgClipViews,
    topClips,
    avgVodToLiveRatio,

    // Chat settings
    chatSettings: chatSettings
      ? {
          followerMode: chatSettings.follower_mode,
          followerModeDuration: chatSettings.follower_mode_duration,
          slowMode: chatSettings.slow_mode,
          slowModeWaitTime: chatSettings.slow_mode_wait_time,
          subscriberMode: chatSettings.subscriber_mode,
          emoteMode: chatSettings.emote_mode,
          uniqueChatMode: chatSettings.unique_chat_mode,
        }
      : null,
  };
}

// ─── Bot detection pre-scoring (deterministic layer before AI) ────────────────
function preScoredMetrics(d) {
  if (!d) return null;

  const flags = [];
  let riskPoints = 0;

  // 1. Viewer/Follower ratio
  if (d.viewerFollowerRatio !== null) {
    if (d.viewerFollowerRatio > 20) {
      flags.push({ severity: "HIGH", key: "viewer_follower_ratio", value: d.viewerFollowerRatio.toFixed(1) + "%", msg: `Viewer/follower ratio ${d.viewerFollowerRatio.toFixed(1)}% massively exceeds normal 1–5% range` });
      riskPoints += 30;
    } else if (d.viewerFollowerRatio > 10) {
      flags.push({ severity: "MEDIUM", key: "viewer_follower_ratio", value: d.viewerFollowerRatio.toFixed(1) + "%", msg: `Viewer/follower ratio ${d.viewerFollowerRatio.toFixed(1)}% exceeds normal range` });
      riskPoints += 15;
    }
  }

  // 2. Real chatter/viewer ratio (strongest signal)
  if (d.chatterViewerRatio !== null && d.isLive) {
    if (d.chatterViewerRatio < 0.5 && d.viewerCount > 100) {
      flags.push({ severity: "HIGH", key: "chatter_viewer_ratio", value: d.chatterViewerRatio.toFixed(2) + "%", msg: `Only ${d.chatterViewerRatio.toFixed(2)}% of viewers are chatting — extreme ghost viewer pattern` });
      riskPoints += 40;
    } else if (d.chatterViewerRatio < 2 && d.viewerCount > 200) {
      flags.push({ severity: "MEDIUM", key: "chatter_viewer_ratio", value: d.chatterViewerRatio.toFixed(2) + "%", msg: `Low chatter/viewer ratio (${d.chatterViewerRatio.toFixed(2)}%) suggests possible viewer inflation` });
      riskPoints += 20;
    } else if (d.chatterViewerRatio > 1) {
      flags.push({ severity: "OK", key: "chatter_viewer_ratio", value: d.chatterViewerRatio.toFixed(2) + "%", msg: `Healthy chatter/viewer ratio of ${d.chatterViewerRatio.toFixed(2)}%` });
    }
  }

  // 3. Account age analysis
  if (d.accountAgeStats) {
    const s = d.accountAgeStats;
    const under30Pct = s.sampleSize > 0 ? (s.under30Days / s.sampleSize) * 100 : 0;
    const under7Pct = s.sampleSize > 0 ? (s.under7Days / s.sampleSize) * 100 : 0;

    if (under7Pct > 20) {
      flags.push({ severity: "HIGH", key: "account_age_7d", value: under7Pct.toFixed(0) + "%", msg: `${under7Pct.toFixed(0)}% of sampled chatters have accounts under 7 days old — mass bot creation pattern` });
      riskPoints += 35;
    } else if (under30Pct > 30) {
      flags.push({ severity: "HIGH", key: "account_age_30d", value: under30Pct.toFixed(0) + "%", msg: `${under30Pct.toFixed(0)}% of sampled chatters have accounts under 30 days — bot farm indicator` });
      riskPoints += 25;
    } else if (under30Pct > 15) {
      flags.push({ severity: "MEDIUM", key: "account_age_30d", value: under30Pct.toFixed(0) + "%", msg: `${under30Pct.toFixed(0)}% of chatters have new accounts (< 30 days)` });
      riskPoints += 10;
    } else if (s.avg > 365) {
      flags.push({ severity: "OK", key: "account_age", value: s.avg + "d avg", msg: `Healthy average chatter account age of ${s.avg} days` });
    }

    if (s.avg < 30) {
      flags.push({ severity: "HIGH", key: "avg_account_age", value: s.avg + "d", msg: `Average chatter account age of only ${s.avg} days is extremely suspicious` });
      riskPoints += 20;
    }
  }

  // 4. Username entropy
  if (d.avgEntropy !== null && d.chatterSampleSize > 5) {
    const highPct = d.chatterSampleSize > 0 ? (d.highEntropyCount / d.chatterSampleSize) * 100 : 0;
    if (highPct > 40) {
      flags.push({ severity: "HIGH", key: "username_entropy", value: highPct.toFixed(0) + "%", msg: `${highPct.toFixed(0)}% of sampled usernames have bot-pattern characteristics (random strings, trailing numbers)` });
      riskPoints += 25;
    } else if (highPct > 20) {
      flags.push({ severity: "MEDIUM", key: "username_entropy", value: highPct.toFixed(0) + "%", msg: `${highPct.toFixed(0)}% of usernames show suspicious entropy patterns` });
      riskPoints += 10;
    } else {
      flags.push({ severity: "OK", key: "username_entropy", value: highPct.toFixed(0) + "%", msg: `Username patterns appear normal (${highPct.toFixed(0)}% suspicious)` });
    }
  }

  // 5. VOD view consistency
  if (d.vodViewStats && d.viewerCount > 0) {
    const cv = d.vodViewStats.coefficientOfVariation;
    const liveToVodRatio = d.avgVodToLiveRatio;

    if (liveToVodRatio !== null && liveToVodRatio < 0.05 && d.viewerCount > 500) {
      flags.push({ severity: "HIGH", key: "vod_vs_live", value: (liveToVodRatio * 100).toFixed(1) + "%", msg: `VOD views average only ${(liveToVodRatio * 100).toFixed(1)}% of live viewer count — strong sign of inflated live viewers` });
      riskPoints += 25;
    } else if (liveToVodRatio !== null && liveToVodRatio < 0.15 && d.viewerCount > 300) {
      flags.push({ severity: "MEDIUM", key: "vod_vs_live", value: (liveToVodRatio * 100).toFixed(1) + "%", msg: `VOD views are significantly lower than live viewer count` });
      riskPoints += 10;
    }

    if (cv > 150) {
      flags.push({ severity: "MEDIUM", key: "vod_consistency", value: cv + "% CV", msg: `Highly inconsistent VOD view counts (CV: ${cv}%) — common in botted channels` });
      riskPoints += 10;
    }
  }

  // 6. Channel age and broadcaster type
  if (d.accountAgeDays !== null) {
    if (d.accountAgeDays < 30 && d.viewerCount > 500) {
      flags.push({ severity: "HIGH", key: "channel_age", value: d.accountAgeDays + "d", msg: `Channel only ${d.accountAgeDays} days old but claiming ${d.viewerCount.toLocaleString()} viewers` });
      riskPoints += 20;
    } else if (d.accountAgeDays < 90 && d.viewerCount > 1000) {
      flags.push({ severity: "MEDIUM", key: "channel_age", value: d.accountAgeDays + "d", msg: `Young channel (${d.accountAgeDays} days) with unusually high viewer count` });
      riskPoints += 10;
    }
  }

  if (d.broadcasterType === "partner") {
    flags.push({ severity: "OK", key: "partner_status", value: "PARTNER", msg: "Twitch Partner status adds legitimacy (Twitch vets partners)" });
    riskPoints = Math.max(0, riskPoints - 15);
  } else if (d.broadcasterType === "affiliate") {
    flags.push({ severity: "OK", key: "affiliate_status", value: "AFFILIATE", msg: "Twitch Affiliate status indicates some legitimate viewership history" });
    riskPoints = Math.max(0, riskPoints - 5);
  }

  // 7. Total view count sanity
  if (d.totalVideoViews > 0 && d.followerCount > 0) {
    const viewsPerFollower = d.totalVideoViews / d.followerCount;
    if (viewsPerFollower < 0.5 && d.followerCount > 5000) {
      flags.push({ severity: "MEDIUM", key: "total_views_ratio", value: viewsPerFollower.toFixed(2), msg: `Very low total views per follower (${viewsPerFollower.toFixed(2)}) may indicate follow-bot inflation` });
      riskPoints += 10;
    }
  }

  const preScore = Math.min(100, riskPoints);
  const preRiskLevel = preScore >= 60 ? "HIGH" : preScore >= 30 ? "MEDIUM" : "LOW";

  return { flags, preScore, preRiskLevel };
}

// ─── Build comprehensive AI prompt ───────────────────────────────────────────
function buildPrompt(channel, d, preScored) {
  const hasRealChatters = d && d.realChatterCount > 0 && d.chatterSample.length > 0;
  const hasRealData = !!d;

  const realDataSection = d
    ? `
━━━ REAL TWITCH API DATA (verified, use exact values) ━━━

CHANNEL STATUS:
- Channel: ${channel}
- Live Now: ${d.isLive ? "YES" : "NO"}
- Live Viewers: ${d.viewerCount.toLocaleString()}
- Total Followers: ${d.followerCount.toLocaleString()}
- Broadcaster Type: ${d.broadcasterType.toUpperCase()} ${d.broadcasterType === "partner" ? "(VERIFIED PARTNER — Twitch vetted)" : d.broadcasterType === "affiliate" ? "(AFFILIATE)" : "(REGULAR)"}
- Account Age: ${d.accountAgeDays !== null ? d.accountAgeDays + " days (" + (d.accountAgeDays > 365 ? Math.floor(d.accountAgeDays/365) + " years" : "< 1 year") + ")" : "unknown"}
- Total All-Time Views: ${d.totalVideoViews.toLocaleString()}
- Game/Category: ${d.gameName}
- Stream Title: "${d.streamTitle}"
- Stream Uptime: ${d.streamUptimeMinutes != null ? (d.streamUptimeMinutes >= 60 ? Math.floor(d.streamUptimeMinutes/60) + "h " + (d.streamUptimeMinutes%60) + "m" : d.streamUptimeMinutes + "m") : "N/A"}
- Language: ${d.language}
- Tags: ${d.tags.length > 0 ? d.tags.join(", ") : "none"}
${d.subCount !== null ? `- Subscriber Count: ${d.subCount.toLocaleString()}` : ""}

KEY RATIOS (critical for detection):
- Viewer/Follower Ratio: ${d.viewerFollowerRatio !== null ? d.viewerFollowerRatio.toFixed(3) + "% (normal: 1-5%, suspicious: >15%, extreme: >25%)" : "N/A"}
${d.chatterViewerRatio !== null ? `- Chatter/Viewer Ratio: ${d.chatterViewerRatio.toFixed(3)}% (normal live streams: >1%, ghost bots: <0.5%)` : ""}
${d.avgVodToLiveRatio !== null ? `- Avg VOD Views / Live Viewers: ${(d.avgVodToLiveRatio * 100).toFixed(1)}% (healthy: >30%, suspicious: <10%, extreme: <3%)` : ""}

REAL CHAT POPULATION DATA:
- Total Chatters in Chat Room: ${d.realChatterCount > 0 ? d.realChatterCount.toLocaleString() : "unavailable (API scope required)"}
- Chatters Retrieved for Analysis: ${d.chatterSampleSize}
${d.accountAgeStats ? `
CHATTER ACCOUNT AGE ANALYSIS (real data, ${d.accountAgeStats.sampleSize} accounts):
- Average Age: ${d.accountAgeStats.avg} days
- Median Age: ${d.accountAgeStats.median} days
- Minimum Age: ${d.accountAgeStats.min} days
- Maximum Age: ${d.accountAgeStats.max} days
- Under 7 days old: ${d.accountAgeStats.under7Days}/${d.accountAgeStats.sampleSize} accounts (${((d.accountAgeStats.under7Days/d.accountAgeStats.sampleSize)*100).toFixed(1)}%)
- Under 30 days old: ${d.accountAgeStats.under30Days}/${d.accountAgeStats.sampleSize} accounts (${((d.accountAgeStats.under30Days/d.accountAgeStats.sampleSize)*100).toFixed(1)}%)
- Under 90 days old: ${d.accountAgeStats.under90Days}/${d.accountAgeStats.sampleSize} accounts (${((d.accountAgeStats.under90Days/d.accountAgeStats.sampleSize)*100).toFixed(1)}%)
- Over 365 days old: ${d.accountAgeStats.over365Days}/${d.accountAgeStats.sampleSize} accounts (${((d.accountAgeStats.over365Days/d.accountAgeStats.sampleSize)*100).toFixed(1)}%)` : ""}
${d.avgEntropy !== null ? `
USERNAME ENTROPY ANALYSIS (${d.chatterSampleSize} samples):
- Average Entropy Score: ${d.avgEntropy}/100 (>50 = suspicious bot pattern)
- High-Entropy Usernames: ${d.highEntropyCount}/${d.chatterSampleSize} (${d.chatterSampleSize > 0 ? ((d.highEntropyCount/d.chatterSampleSize)*100).toFixed(1) : 0}%)
- Sample usernames: ${d.chatterSample.slice(0, 15).map(c => c.username).join(", ")}` : ""}

VOD PERFORMANCE DATA (${d.vodViewStats ? d.vodViewStats.count + " VODs" : "no VODs"}):
${d.vodViewStats ? `- Average VOD Views: ${d.vodViewStats.avg.toLocaleString()}
- Max VOD Views: ${d.vodViewStats.max.toLocaleString()}
- Min VOD Views: ${d.vodViewStats.min.toLocaleString()}
- View Count Variation (CV): ${d.vodViewStats.coefficientOfVariation}% (>100% = highly inconsistent, bot pattern)` : "- No VOD data available"}
${d.recentVods.length > 0 ? `- Recent VODs: ${d.recentVods.slice(0, 5).map(v => `"${v.title?.slice(0,30)}" (${v.views?.toLocaleString() || 0} views)`).join("; ")}` : ""}

CLIP DATA (${d.topClips.length} clips analyzed):
- Average Clip Views: ${d.avgClipViews.toLocaleString()}
${d.topClips.length > 0 ? `- Top clips: ${d.topClips.slice(0, 3).map(c => `${c.views?.toLocaleString() || 0} views`).join(", ")}` : ""}

CHAT SETTINGS:
${d.chatSettings ? `- Follower Mode: ${d.chatSettings.followerMode ? "YES (" + (d.chatSettings.followerModeDuration || 0) + "min requirement)" : "NO"}
- Slow Mode: ${d.chatSettings.slowMode ? "YES (" + (d.chatSettings.slowModeWaitTime || 0) + "s)" : "NO"}
- Subscriber Only: ${d.chatSettings.subscriberMode ? "YES" : "NO"}
- Emote Only: ${d.chatSettings.emoteMode ? "YES" : "NO"}
- Unique Chat: ${d.chatSettings.uniqueChatMode ? "YES" : "NO"}` : "- Settings unavailable"}

${hasRealChatters && d.chatterSample.length > 0 ? `
REAL CHATTER SAMPLE (from live API — actual accounts):
${d.chatterSample.slice(0, 30).map((c, i) =>
  `${i+1}. @${c.username} | Age: ${c.accountAgeDays != null ? c.accountAgeDays + "d" : "?"} | Entropy: ${c.entropyScore || 0}/100${c.isNew ? " | ⚠ NEW ACCOUNT" : ""}${c.broadcasterType && c.broadcasterType !== "regular" ? " | " + c.broadcasterType.toUpperCase() : ""}`
).join("\n")}` : ""}

PRE-COMPUTED RISK FLAGS (algorithmic detection layer):
Risk Score: ${preScored?.preScore || 0}/100
Risk Level: ${preScored?.preRiskLevel || "UNKNOWN"}
${preScored?.flags?.map(f => `[${f.severity}] ${f.msg}`).join("\n") || "No flags"}
` : `
⚠ NO TWITCH API DATA AVAILABLE — SIMULATION MODE
Channel "${channel}" — generating statistical simulation based on typical patterns.
`;

  return `You are TwitchBotScan v4.0, the world's most sophisticated Twitch bot detection AI. You have access to real Twitch API data and pre-computed algorithmic flags. Your job is to synthesize ALL evidence into the most accurate possible assessment.

${realDataSection}

━━━ ANALYSIS INSTRUCTIONS ━━━

You MUST:
1. Use the EXACT viewer count, follower count, and other real metrics in your response
2. Weight the pre-computed flags heavily — they are based on real data
3. If real chatter data exists, use actual account ages (not simulated)
4. Consider ALL signals holistically — a Twitch Partner with slightly high ratios is very different from an unknown channel
5. Generate a realistic viewer timeline based on actual viewer count
6. For chatSample: use real usernames from the chatter sample if available, otherwise generate plausible ones consistent with the risk level
7. Your riskScore must align with the pre-computed score (within ±15 points)
8. The verdict must be a detailed, evidence-based paragraph citing specific metrics

KEY BOT DETECTION THRESHOLDS:
- Chatter/Viewer ratio < 0.5% with >100 viewers = STRONG bot signal
- Account age < 30 days for >25% of chatters = bot farm signal  
- Username entropy > 50% high-entropy = automated account creation
- VOD views < 5% of live viewers = inflated live count
- Viewer/Follower ratio > 20% = abnormal (unless huge viral event)
- All thresholds must be weighted by channel size and broadcaster type

RESPONSE FORMAT — Return ONLY this JSON, no markdown, no text outside:
{
  "channel": "${channel}",
  "riskScore": <0-100 integer, aligned with pre-computed score ±15>,
  "riskLevel": <"LOW"|"MEDIUM"|"HIGH">,
  "liveViewers": <use exact API value: ${d?.viewerCount ?? 0}>,
  "followersTotal": <use exact API value: ${d?.followerCount ?? 0}>,
  "chattersActive": <use real chatter count if available: ${d?.realChatterCount ?? "estimate"}, else estimate>,
  "engagementRate": <chatters/viewers * 100, use real data if available>,
  "suspiciousAccounts": <count of accounts with entropy>50 OR age<30d from real sample>,
  "avgAccountAgeDays": <use real median/avg if available: ${d?.accountAgeStats?.avg ?? "estimate"}>,
  "followerChatRatio": <chatters/followers * 100>,
  "messagesPerMinute": <realistic estimate based on chatter count>,
  "uniqueChattersLast10Min": <realistic based on real chatter count>,
  "viewerFollowerRatio": <use exact: ${d?.viewerFollowerRatio?.toFixed(2) ?? "null"}>,
  "botInjectionEvents": <0-5, based on timeline analysis>,
  "verdict": "<detailed 3-4 sentence evidence-based analysis citing specific numbers from the data>",
  "signals": [
    {"type": <"ok"|"warn"|"danger">, "title": "<short title>", "detail": "<specific metric cited>"}
  ],
  "chatSample": [
    {"username": "<real or plausible>", "messagesIn10min": <int>, "accountAgeDays": <int>, "status": <"legit"|"neutral"|"suspicious">, "lastMsg": "<realistic chat message>", "joinedRecently": <bool>}
  ],
  "viewerTimeline": [
    {"minutesAgo": <60|50|40|30|20|15|10|5|0>, "viewers": <int>}
  ],
  "metricsBreakdown": {
    "chatEngagement": <0-100>,
    "accountAgeSuspicion": <0-100, based on real age stats if available>,
    "viewerSpikeProbability": <0-100>,
    "usernameEntropyScore": <0-100, use real avg entropy: ${d?.avgEntropy ?? "estimate"}>,
    "followBotLikelihood": <0-100>,
    "viewerFollowerAnomaly": <0-100>
  }
}

CONSTRAINTS:
- signals: 5-8 items covering the most important real findings
- chatSample: exactly 10 rows. Use real usernames from chatter sample where available. Status must reflect real account age data.
- viewerTimeline: 9 points. Use exact current viewer count (${d?.viewerCount ?? 0}) at minutesAgo=0. HIGH risk = include ≥1 sharp spike. LOW = smooth organic curve.
- verdict: MUST cite real numbers (viewer count, follower count, chatter/viewer ratio, account ages). Be specific, not generic.
- Return ONLY the JSON object.`;
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ error: "Too many requests. Wait 20 seconds." });

  const { channel } = req.body || {};
  if (!channel || typeof channel !== "string" || channel.length > 50)
    return res.status(400).json({ error: "Invalid channel name." });

  const clean = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!clean) return res.status(400).json({ error: "Invalid channel name." });

  try {
    // ── Step 1: Gather all real Twitch data ──
    let twitchData = null;
    try {
      const token = await getTwitchToken();
      if (token) twitchData = await getTwitchData(clean, token);
    } catch (e) {
      console.error("Twitch data error:", e.message);
    }

    // ── Step 2: Pre-score with deterministic algorithms ──
    const preScored = preScoredMetrics(twitchData);

    // ── Step 3: Send everything to Groq for deep AI analysis ──
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.3, // Lower temperature = more consistent, factual responses
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "You are TwitchBotScan, a forensic analysis AI. Return ONLY valid JSON. No markdown, no code fences, no explanatory text. Every number in your response must be grounded in the real data provided.",
          },
          {
            role: "user",
            content: buildPrompt(clean, twitchData, preScored),
          },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq error:", errText);
      return res.status(502).json({ error: "AI analysis failed. Try again." });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || "";

    // Clean up any accidental markdown
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch {
          console.error("Parse fail:", cleaned.slice(0, 300));
          return res.status(500).json({ error: "Malformed AI response. Try again." });
        }
      } else {
        console.error("No JSON found:", cleaned.slice(0, 300));
        return res.status(500).json({ error: "Malformed AI response. Try again." });
      }
    }

    // ── Step 4: Override AI values with real data where we have it ──
    result.usedRealData = !!twitchData;
    result.hasRealChatters = !!(twitchData?.chatterSampleSize > 0);
    result.preComputedScore = preScored?.preScore ?? null;
    result.preComputedRisk = preScored?.preRiskLevel ?? null;

    if (twitchData) {
      // Force exact real values - AI cannot override these
      result.liveViewers = twitchData.viewerCount;
      result.followersTotal = twitchData.followerCount;
      if (twitchData.viewerFollowerRatio !== null) {
        result.viewerFollowerRatio = parseFloat(twitchData.viewerFollowerRatio.toFixed(2));
      }
      if (twitchData.realChatterCount > 0) {
        result.chattersActive = twitchData.realChatterCount;
      }
      if (twitchData.accountAgeStats) {
        result.avgAccountAgeDays = twitchData.accountAgeStats.avg;
      }

      // Recalculate engagement rate from real data
      if (twitchData.viewerCount > 0 && twitchData.realChatterCount > 0) {
        result.engagementRate = parseFloat(((twitchData.realChatterCount / twitchData.viewerCount) * 100).toFixed(2));
      }

      // Attach full real data for frontend display
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
        followerCount: twitchData.followerCount,
        subCount: twitchData.subCount,
        realChatterCount: twitchData.realChatterCount,
        chatterSampleSize: twitchData.chatterSampleSize,
        accountAgeStats: twitchData.accountAgeStats,
        chatterViewerRatio: twitchData.chatterViewerRatio,
        avgEntropy: twitchData.avgEntropy,
        highEntropyCount: twitchData.highEntropyCount,
        vodViewStats: twitchData.vodViewStats,
        avgVodToLiveRatio: twitchData.avgVodToLiveRatio,
        chatSettings: twitchData.chatSettings,
        topClips: twitchData.topClips,
        preComputedFlags: preScored?.flags || [],
      };

      // Override chatSample with real chatter data if we got it
      if (twitchData.chatterSample.length >= 5) {
        const realSample = twitchData.chatterSample.slice(0, 10);
        result.chatSample = realSample.map(c => ({
          username: c.username,
          messagesIn10min: Math.floor(Math.random() * 8) + 1,
          accountAgeDays: c.accountAgeDays ?? 0,
          status:
            (c.entropyScore > 60 || (c.accountAgeDays !== null && c.accountAgeDays < 14))
              ? "suspicious"
              : (c.accountAgeDays !== null && c.accountAgeDays > 365)
              ? "legit"
              : "neutral",
          lastMsg: result.chatSample?.[0]?.lastMsg || "...",
          joinedRecently: c.isNew || false,
        }));
        // Fill remaining from AI if needed
        if (result.chatSample.length < 10 && Array.isArray(result.chatSample)) {
          const aiSample = Array.isArray(result.chatSample) ? result.chatSample : [];
          const aiExtra = aiSample.slice(realSample.length, 10);
          // keep what we have from real
        }
      }
    }

    // Ensure riskLevel text matches score
    if (result.riskScore >= 60 && result.riskLevel !== "HIGH") result.riskLevel = "HIGH";
    else if (result.riskScore >= 30 && result.riskScore < 60 && result.riskLevel !== "MEDIUM") result.riskLevel = "MEDIUM";
    else if (result.riskScore < 30 && result.riskLevel !== "LOW") result.riskLevel = "LOW";

    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}
