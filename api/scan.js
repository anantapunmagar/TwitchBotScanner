// api/scan.js
import axios from 'axios';

export default async function handler(req, res) {
  const { TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN, GROQ_API_KEY } = process.env;

  if (!TWITCH_CLIENT_ID || !TWITCH_ACCESS_TOKEN || !GROQ_API_KEY) {
    return res.status(500).json({ 
      error: "Missing environment variables. Check TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN, and GROQ_API_KEY" 
    });
  }

  const HEADERS = {
    'Client-ID': TWITCH_CLIENT_ID,
    'Authorization': `Bearer ${TWITCH_ACCESS_TOKEN}`,
  };

  try {
    console.log(`[${new Date().toISOString()}] Starting rich Twitch scan...`);

    // Fetch top live streams
    let rawStreams = [];
    let cursor = null;
    const MAX_PAGES = 10;   // ~800-1000 streams

    for (let i = 0; i < MAX_PAGES; i++) {
      const response = await axios.get('https://api.twitch.tv/helix/streams', {
        headers: HEADERS,
        params: { first: 100, after: cursor }
      });

      rawStreams = [...rawStreams, ...response.data.data];
      cursor = response.data.pagination?.cursor;

      if (!cursor) break;
      await new Promise(r => setTimeout(r, 280));
    }

    // Enrich with user data
    const enriched = [];

    for (let i = 0; i < rawStreams.length; i += 80) {
      const batch = rawStreams.slice(i, i + 80);
      const userIds = batch.map(s => s.user_id);

      const [usersRes] = await Promise.all([
        axios.get('https://api.twitch.tv/helix/users', {
          headers: HEADERS,
          params: { id: userIds }
        })
      ]);

      const usersMap = new Map(usersRes.data.data.map(u => [u.id, u]));

      for (const stream of batch) {
        const user = usersMap.get(stream.user_id) || {};

        const uptimeMinutes = Math.floor(
          (Date.now() - new Date(stream.started_at)) / 60000
        );

        enriched.push({
          username: stream.user_login,
          display_name: stream.user_name,
          title: stream.title,
          game_name: stream.game_name,
          viewer_count: stream.viewer_count,
          account_created_at: user.created_at,
          account_age_days: user.created_at 
            ? Math.floor((Date.now() - new Date(user.created_at)) / 86400000) 
            : null,
          uptime_minutes: uptimeMinutes,
          language: stream.language,
          tags: stream.tags || [],
          is_mature: stream.is_mature,
          title_length: stream.title.length,
        });
      }

      await new Promise(r => setTimeout(r, 350));
    }

    const payload = {
      scan_time: new Date().toISOString(),
      total_streams_scanned: enriched.length,
      estimated_total_viewers: enriched.reduce((sum, s) => sum + s.viewer_count, 0),
      streams: enriched
    };

    // Send to Groq AI
    const groqRes = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 2500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const aiAnalysis = groqRes.data.choices[0].message.content;

    return res.status(200).json({
      success: true,
      scan_summary: {
        total_streams: payload.total_streams_scanned,
        estimated_total_viewers: payload.estimated_total_viewers
      },
      ai_analysis: aiAnalysis
    });

  } catch (error) {
    console.error("Scan Error:", error.response?.data || error.message);
    return res.status(500).json({ 
      error: "Failed to scan streams",
      message: error.message 
    });
  }
}

// Strong System Prompt
const SYSTEM_PROMPT = `You are an expert Twitch analyst specialized in detecting view botting and artificial engagement.

Analyze the list of live streams and for each one return a bot suspicion score.

Key suspicious signals:
- High viewer count but very young account (low account_age_days)
- Extremely high viewer/follower ratio (we'll add followers later)
- Sudden high viewers with generic or clickbait titles
- Very long stream uptime with stable high viewers but weak other signals

Return ONLY valid JSON in this format:

{
  "overall_summary": "Short summary of the scan",
  "high_risk_count": number,
  "streams": [
    {
      "username": "string",
      "bot_suspicion_score": number (0-100),
      "risk_level": "Low | Medium | High | Very High",
      "reasoning": "clear short explanation",
      "key_flags": ["young account", "high viewers low age", ...]
    }
  ]
}

Be objective and strict.`;
