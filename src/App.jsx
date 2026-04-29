import { useState, useEffect, useRef, useCallback } from "react";

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #060a0f;
    --panel: #0a1018;
    --border: #1a2a3a;
    --border-glow: #00ffe722;
    --accent: #00ffe7;
    --accent-dim: #00ffe755;
    --danger: #ff3b6b;
    --danger-dim: #ff3b6b44;
    --warn: #ffe040;
    --warn-dim: #ffe04044;
    --blue: #3b82f6;
    --text: #c8d8e8;
    --text-dim: #4a6a7a;
    --font-mono: 'Share Tech Mono', monospace;
    --font-display: 'Orbitron', monospace;
    --font-body: 'Rajdhani', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; overflow-x: hidden; }

  .scanline {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 1000;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,231,0.013) 2px, rgba(0,255,231,0.013) 4px);
  }

  .app { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; position: relative; z-index: 1; }

  .header { text-align: center; margin-bottom: 48px; animation: fadeDown 0.7s ease; }
  .header-badge { display: inline-block; font-family: var(--font-mono); font-size: 11px; color: var(--accent); border: 1px solid var(--accent-dim); padding: 4px 12px; letter-spacing: 3px; margin-bottom: 16px; }
  .header h1 { font-family: var(--font-display); font-size: clamp(26px,5vw,48px); font-weight: 900; color: #fff; letter-spacing: 4px; text-transform: uppercase; line-height: 1.1; }
  .header h1 span { color: var(--accent); }
  .header p { margin-top: 12px; color: var(--text-dim); font-size: 15px; letter-spacing: 1px; font-weight: 300; }

  .real-data-badge { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px; color: var(--accent); border: 1px solid var(--accent-dim); padding: 3px 10px; letter-spacing: 2px; margin-top: 8px; }
  .real-data-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s infinite; }

  .search-wrap { display: flex; gap: 0; margin-bottom: 40px; border: 1px solid var(--border); background: var(--panel); position: relative; animation: fadeUp 0.7s ease 0.1s both; }
  .search-wrap::before { content: ''; position: absolute; inset: -1px; background: linear-gradient(90deg, var(--accent-dim), transparent, transparent); pointer-events: none; }
  .search-icon { padding: 0 16px; color: var(--accent); font-family: var(--font-mono); font-size: 14px; display: flex; align-items: center; border-right: 1px solid var(--border); }
  .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--accent); font-family: var(--font-mono); font-size: 16px; padding: 18px 20px; letter-spacing: 1px; }
  .search-input::placeholder { color: var(--text-dim); }
  .search-btn { background: var(--accent); color: var(--bg); border: none; cursor: pointer; font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 2px; padding: 0 28px; text-transform: uppercase; transition: all 0.2s; }
  .search-btn:hover { background: #fff; }
  .search-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .search-btn.scanning { background: var(--warn); animation: pulse 1s infinite; }

  .scanning-overlay { border: 1px solid var(--border); background: var(--panel); padding: 48px; text-align: center; margin-bottom: 32px; position: relative; overflow: hidden; }
  .scanning-overlay::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); animation: scan 2s linear infinite; top: 0; }
  .scan-label { font-family: var(--font-display); font-size: 13px; color: var(--accent); letter-spacing: 4px; margin-bottom: 12px; }
  .scan-channel { font-family: var(--font-mono); font-size: 22px; color: #fff; margin-bottom: 24px; }
  .scan-steps { display: flex; flex-direction: column; gap: 8px; max-width: 420px; margin: 0 auto 24px; text-align: left; }
  .scan-step { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 10px; transition: color 0.3s; }
  .scan-step.active { color: var(--accent); }
  .step-dot { width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--text-dim); flex-shrink: 0; transition: all 0.3s; }
  .scan-step.active .step-dot { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1s infinite; }
  .scan-step.done .step-dot { background: var(--text-dim); border-color: var(--text-dim); }

  .irc-live { margin-top: 8px; border: 1px solid var(--accent-dim); background: #060f0e; padding: 12px 16px; max-width: 420px; margin-left: auto; margin-right: auto; }
  .irc-live-label { font-family: var(--font-mono); font-size: 9px; color: var(--accent); letter-spacing: 3px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .irc-live-label .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: pulse 1s infinite; }
  .irc-msgs { display: flex; flex-direction: column; gap: 3px; max-height: 100px; overflow: hidden; }
  .irc-msg { font-family: var(--font-mono); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: fadeUp 0.2s ease; }
  .irc-msg .irc-user { color: var(--accent); }
  .irc-msg .irc-text { color: var(--text-dim); }
  .irc-counter { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); margin-top: 6px; }

  .result-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); animation: fadeUp 0.5s ease; }
  .result-channel { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 2px; }
  .result-channel span { font-size: 13px; font-family: var(--font-mono); color: var(--text-dim); display: block; margin-top: 2px; font-weight: 400; letter-spacing: 1px; }

  .risk-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 120px; padding: 12px 20px; border: 1px solid; font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
  .risk-badge .risk-score { font-size: 40px; line-height: 1; }
  .risk-badge .risk-label { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
  .risk-low { border-color: var(--accent); color: var(--accent); }
  .risk-medium { border-color: var(--warn); color: var(--warn); }
  .risk-high { border-color: var(--danger); color: var(--danger); animation: glowRed 2s ease-in-out infinite; }

  .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 16px; }

  .panel { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; animation: fadeUp 0.5s ease both; }
  .panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, var(--accent-dim), transparent); }
  .panel-title { font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .panel-title::after { content: ''; flex: 1; height: 1px; background: var(--border); min-width: 20px; }

  .metric-card { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; animation: fadeUp 0.5s ease both; }
  .metric-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
  .metric-card.green::before { background: var(--accent); }
  .metric-card.yellow::before { background: var(--warn); }
  .metric-card.red::before { background: var(--danger); }
  .metric-card.blue::before { background: var(--blue); }
  .metric-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  .metric-value { font-family: var(--font-display); font-size: 32px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
  .metric-value.green { color: var(--accent); }
  .metric-value.yellow { color: var(--warn); }
  .metric-value.red { color: var(--danger); }
  .metric-value.blue { color: var(--blue); }
  .metric-sub { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); }

  .bar-wrap { margin-bottom: 14px; }
  .bar-info { display: flex; justify-content: space-between; margin-bottom: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); }
  .bar-info span:last-child { color: var(--text); }
  .bar-track { height: 6px; background: var(--border); position: relative; overflow: hidden; }
  .bar-fill { height: 100%; position: absolute; left: 0; top: 0; transition: width 1.2s cubic-bezier(0.4,0,0.2,1); }
  .bar-fill.green { background: var(--accent); box-shadow: 0 0 8px var(--accent-dim); }
  .bar-fill.yellow { background: var(--warn); }
  .bar-fill.red { background: var(--danger); box-shadow: 0 0 8px var(--danger-dim); }
  .bar-fill.blue { background: var(--blue); }

  .signals { display: flex; flex-direction: column; gap: 10px; }
  .signal { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--border); background: #0d1520; font-size: 13px; font-family: var(--font-body); font-weight: 300; line-height: 1.4; }
  .signal-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
  .signal-text strong { font-weight: 600; color: #fff; display: block; margin-bottom: 2px; font-size: 13px; }
  .signal-text span { color: var(--text-dim); font-size: 12px; }
  .signal.flag-warn { border-left: 2px solid var(--warn); }
  .signal.flag-danger { border-left: 2px solid var(--danger); }
  .signal.flag-ok { border-left: 2px solid var(--accent); }

  .chat-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 12px; }
  .chat-table th { color: var(--text-dim); letter-spacing: 2px; font-size: 10px; text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 400; }
  .chat-table td { padding: 8px 12px; border-bottom: 1px solid #0d1520; color: var(--text); vertical-align: middle; }
  .chat-table tr:hover td { background: #0d1520; }
  .col-suspicious { color: var(--danger) !important; }
  .col-legit { color: var(--accent) !important; }
  .col-neutral { color: var(--warn) !important; }

  .pill { display: inline-block; padding: 2px 8px; font-size: 10px; letter-spacing: 1px; }
  .pill-red { background: var(--danger-dim); color: var(--danger); border: 1px solid var(--danger-dim); }
  .pill-green { background: rgba(0,255,231,0.1); color: var(--accent); border: 1px solid var(--accent-dim); }
  .pill-yellow { background: var(--warn-dim); color: var(--warn); border: 1px solid var(--warn-dim); }

  .verdict { border: 1px solid; padding: 24px; margin-bottom: 16px; position: relative; animation: fadeUp 0.5s ease; }
  .verdict.low { border-color: var(--accent); }
  .verdict.medium { border-color: var(--warn); }
  .verdict.high { border-color: var(--danger); animation: fadeUp 0.5s ease, glowRed 2s ease-in-out infinite; }
  .verdict-title { font-family: var(--font-display); font-size: 11px; letter-spacing: 3px; margin-bottom: 8px; }
  .verdict.low .verdict-title { color: var(--accent); }
  .verdict.medium .verdict-title { color: var(--warn); }
  .verdict.high .verdict-title { color: var(--danger); }
  .verdict-text { font-family: var(--font-body); font-size: 14px; color: var(--text); line-height: 1.6; font-weight: 300; }

  .how-section { margin-top: 56px; padding-top: 40px; border-top: 1px solid var(--border); }
  .how-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 4px; color: #fff; margin-bottom: 8px; text-transform: uppercase; }
  .how-subtitle { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); letter-spacing: 2px; margin-bottom: 32px; }
  .how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .how-card { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; }
  .how-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, var(--accent-dim), transparent); }
  .how-num { font-family: var(--font-display); font-size: 36px; font-weight: 900; color: var(--border); line-height: 1; margin-bottom: 12px; }
  .how-card-title { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 2px; color: var(--accent); text-transform: uppercase; margin-bottom: 8px; }
  .how-card-text { font-size: 13px; color: var(--text-dim); line-height: 1.6; font-weight: 300; }

  .disclaimer { margin-top: 40px; padding: 16px; border: 1px solid var(--border); font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); line-height: 1.6; letter-spacing: 0.5px; }
  .disclaimer strong { color: var(--warn); }

  .error-box { border: 1px solid var(--danger); color: var(--danger); background: var(--danger-dim); font-family: var(--font-mono); font-size: 13px; padding: 16px 20px; margin-bottom: 16px; }

  @keyframes fadeDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes scan { from { top:-2px; } to { top:100%; } }
  @keyframes glowRed { 0%,100% { box-shadow:0 0 0 0 transparent; } 50% { box-shadow:0 0 20px 2px rgba(255,59,107,0.15); } }
  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
  .cursor::after { content:'_'; animation:blink 1s step-end infinite; color:var(--accent); }
`;

const IRC_COLLECT_MS = 15000; // collect chat for 15 seconds

const SCAN_STEPS = [
  { label: "Resolving channel identity & account age...", phase: "api" },
  { label: "Fetching live stream & viewer count...", phase: "api" },
  { label: "Connecting to Twitch IRC — collecting live chat...", phase: "irc" },
  { label: "Sampling real chat messages...", phase: "irc" },
  { label: "Pulling followers & timestamp clustering...", phase: "api" },
  { label: "Running username entropy analysis...", phase: "irc" },
  { label: "Fetching VODs, clips & subscription data...", phase: "api" },
  { label: "Computing engagement & ghost-viewer ratios...", phase: "score" },
  { label: "Sending verified data to forensic AI engine...", phase: "ai" },
  { label: "Compiling report...", phase: "done" },
];

// ── IRC anonymous chat collector ──────────────────────────────────────────────
// Connects anonymously (no token needed), collects messages for IRC_COLLECT_MS ms.
// Returns { messages, uniqueChatters, totalMessages, msgsPerMin }
function collectIrcChat(channel, durationMs, onMessage) {
  return new Promise((resolve) => {
    const messages = [];       // { user, text, ts }
    const chatterSet = new Set();
    let ws = null;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { ws?.close(); } catch (_) {}
      const uniqueChatters = chatterSet.size;
      const totalMessages = messages.length;
      const msgsPerMin = parseFloat(((totalMessages / durationMs) * 60000).toFixed(1));
      resolve({ messages, uniqueChatters, totalMessages, msgsPerMin });
    };

    const timer = setTimeout(finish, durationMs);

    try {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    } catch (_) {
      clearTimeout(timer);
      resolve({ messages: [], uniqueChatters: 0, totalMessages: 0, msgsPerMin: 0 });
      return;
    }

    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE"); // anonymous read — standard anonymous pass for justinfan nicks
      ws.send(`NICK justinfan${Math.floor(Math.random() * 80000 + 10000)}`);
      ws.send(`JOIN #${channel}`);
    };

    ws.onmessage = (evt) => {
      const raw = typeof evt.data === "string" ? evt.data : "";

      // PING keepalive
      if (raw.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); return; }

      // Parse PRIVMSG — format: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :text
      const match = raw.match(/^(?:@[^ ]+ )?:([^!]+)![^ ]+ PRIVMSG #\S+ :(.+)/m);
      if (match) {
        const user = match[1].trim();
        const text = match[2].replace(/\r?\n?$/, "").trim();
        if (!user || !text) return;
        const isNew = !chatterSet.has(user);
        chatterSet.add(user);
        const msg = { user, text, ts: Date.now() };
        messages.push(msg);
        onMessage?.(msg, chatterSet.size, isNew); // live callback for UI updates
      }
    };

    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onclose = () => { clearTimeout(timer); finish(); };
  });
}

function BarRow({ label, value, color }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 100);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="bar-wrap">
      <div className="bar-info">
        <span>{label}</span>
        <span>{typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}%</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function RiskBadge({ score, level }) {
  const cls = level === "LOW" ? "risk-low" : level === "MEDIUM" ? "risk-medium" : "risk-high";
  return (
    <div className={`risk-badge ${cls}`}>
      <span className="risk-score">{score}</span>
      <span className="risk-label">{level} RISK</span>
    </div>
  );
}

function Signal({ sig }) {
  const icon = sig.type === "ok" ? "✓" : sig.type === "warn" ? "⚠" : "✗";
  const cls = sig.type === "ok" ? "flag-ok" : sig.type === "warn" ? "flag-warn" : "flag-danger";
  return (
    <div className={`signal ${cls}`}>
      <span className="signal-icon">{icon}</span>
      <div className="signal-text">
        <strong>{sig.title}</strong>
        <span>{sig.detail}</span>
      </div>
    </div>
  );
}

function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

export default function App() {
  const [channel, setChannel] = useState("");
  const [scanning, setScanning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Live IRC feed for scan animation
  const [liveMessages, setLiveMessages] = useState([]);
  const [ircStats, setIrcStats] = useState({ count: 0, chatters: 0 });
  const ircRef = useRef(null);

  const handleScan = useCallback(async () => {
    if (!channel.trim() || scanning) return;
    const ch = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!ch) return;

    setScanning(true);
    setResult(null);
    setError(null);
    setStepIndex(0);
    setLiveMessages([]);
    setIrcStats({ count: 0, chatters: 0 });

    // Step through animation while IRC + API run in parallel
    let step = 0;
    const stepInterval = setInterval(() => {
      step = Math.min(step + 1, SCAN_STEPS.length - 2); // hold at second-to-last
      setStepIndex(step);
    }, IRC_COLLECT_MS / (SCAN_STEPS.length - 2));

    try {
      // ── Phase 1: IRC collection (browser → runs for 15s) ───────────────────
      const ircPromise = collectIrcChat(ch, IRC_COLLECT_MS, (msg, totalChatters, isNew) => {
        setLiveMessages(prev => [...prev.slice(-5), msg]); // keep last 6 in UI
        setIrcStats(prev => ({
          count: prev.count + 1,
          chatters: totalChatters,
        }));
      });

      // ── Phase 2: collect IRC data ──────────────────────────────────────────
      const ircData = await ircPromise;

      // Update chatters count after IRC finishes
      setIrcStats({ count: ircData.totalMessages, chatters: ircData.uniqueChatters });

      // ── Phase 3: send everything to API ────────────────────────────────────
      clearInterval(stepInterval);
      setStepIndex(SCAN_STEPS.length - 2);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch, ircData }),
      });

      if (res.status === 429) throw new Error("Too many requests. Wait 30 seconds.");
      if (res.status === 400) throw new Error("Invalid channel name.");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Analysis failed. Please try again.");
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setStepIndex(SCAN_STEPS.length);
      await new Promise(r => setTimeout(r, 400));
      setResult(data);
    } catch (e) {
      setError(e.message || "Analysis failed.");
    } finally {
      clearInterval(stepInterval);
      setScanning(false);
    }
  }, [channel, scanning]);

  const verdictLevel = result?.riskLevel?.toLowerCase() || "low";
  const engColor = (v) => v > 5 ? "green" : v > 1 ? "yellow" : "red";
  const suspColor = (v) => v === 0 ? "green" : v < 10 ? "yellow" : "red";

  return (
    <>
      <style>{style}</style>
      <div className="scanline" />
      <div className="app">

        <div className="header">
          <div className="header-badge">⬡ FORENSIC ANALYSIS TOOL v3.0</div>
          <h1>TWITCH<br /><span>BOT</span>SCAN</h1>
          <p>Real-time view-bot detection &amp; stream authenticity analyzer</p>
        </div>

        <div className="search-wrap">
          <div className="search-icon">twitch.tv/</div>
          <input
            className="search-input cursor"
            value={channel}
            onChange={e => setChannel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleScan()}
            placeholder="channel_name"
            spellCheck={false}
            maxLength={50}
            disabled={scanning}
          />
          <button
            className={`search-btn${scanning ? " scanning" : ""}`}
            onClick={handleScan}
            disabled={scanning || !channel.trim()}
          >
            {scanning ? "SCANNING" : "ANALYZE"}
          </button>
        </div>

        {scanning && (
          <div className="scanning-overlay">
            <div className="scan-label">▶ INITIATING DEEP SCAN</div>
            <div className="scan-channel">twitch.tv/{channel}</div>
            <div className="scan-steps">
              {SCAN_STEPS.map((s, i) => (
                <div key={i} className={`scan-step${i === stepIndex ? " active" : i < stepIndex ? " done" : ""}`}>
                  <div className="step-dot" />
                  {s.label}
                </div>
              ))}
            </div>

            {/* Live IRC feed shown during scan */}
            <div className="irc-live">
              <div className="irc-live-label">
                <span className="dot" />
                LIVE IRC FEED — REAL CHAT MESSAGES
              </div>
              <div className="irc-msgs">
                {liveMessages.length === 0 ? (
                  <div className="irc-msg" style={{ color: "var(--text-dim)" }}>
                    {channel ? "Connecting to chat..." : "Waiting..."}
                  </div>
                ) : (
                  liveMessages.slice(-6).map((m, i) => (
                    <div key={i} className="irc-msg">
                      <span className="irc-user">{m.user}: </span>
                      <span className="irc-text">{m.text}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="irc-counter">
                {ircStats.count} messages · {ircStats.chatters} unique chatters captured
              </div>
            </div>
          </div>
        )}

        {error && <div className="error-box">✗ {error}</div>}

        {result && !scanning && (() => {
          const mb = result.metricsBreakdown || {};
          const dq = result.dataQuality || {};
          return (
            <>
              <div className="result-header">
                <div>
                  <div className="result-channel">
                    twitch.tv/{result.channel}
                    <span>SCAN COMPLETE · {new Date().toLocaleTimeString()} · {dq.dataPointsCollected || 10} DATA SOURCES</span>
                  </div>
                  <div className="real-data-badge">
                    <span className="dot" />
                    {[
                      "LIVE TWITCH API",
                      dq.isLive && "STREAM",
                      dq.ircCollected && `IRC·${dq.ircMessages}msgs·${dq.ircChatters}users`,
                      dq.hasVODs && "VODS",
                      dq.hasClips && "CLIPS",
                      dq.hasSubs && "SUBS",
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <RiskBadge score={result.riskScore} level={result.riskLevel} />
              </div>

              {/* ── Live channel info strip ── */}
              <div className="panel" style={{ marginBottom: 16, padding: "14px 20px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", alignItems: "center" }}>
                  {/* Live / Offline badge */}
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 2,
                    color: result.isLive ? "var(--accent)" : "var(--text-dim)",
                    border: "1px solid", borderColor: result.isLive ? "var(--accent-dim)" : "var(--border)",
                    padding: "2px 8px",
                  }}>
                    {result.isLive ? "● LIVE" : "○ OFFLINE"}
                  </span>
                  {/* Game */}
                  {result.gameName && result.gameName !== "Unknown" && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-dim)" }}>game: </span>{result.gameName}
                    </span>
                  )}
                  {/* Stream uptime */}
                  {result.isLive && result.streamAgeMinutes > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-dim)" }}>uptime: </span>
                      {result.streamAgeMinutes >= 60
                        ? `${Math.floor(result.streamAgeMinutes / 60)}h ${result.streamAgeMinutes % 60}m`
                        : `${result.streamAgeMinutes}m`}
                    </span>
                  )}
                  {/* Broadcaster type */}
                  {result.broadcasterType && result.broadcasterType !== "none" && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11,
                      color: result.broadcasterType === "partner" ? "var(--accent)" : "var(--warn)",
                      border: "1px solid", borderColor: result.broadcasterType === "partner" ? "var(--accent-dim)" : "var(--warn-dim)",
                      padding: "2px 8px", letterSpacing: 1,
                    }}>
                      {result.broadcasterType.toUpperCase()}
                    </span>
                  )}
                  {/* Subs */}
                  {result.subCount > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-dim)" }}>subs: </span>{fmt(result.subCount)}
                    </span>
                  )}
                  {/* Mods */}
                  {result.modCount > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)" }}>
                      <span style={{ color: "var(--text-dim)" }}>mods: </span>{result.modCount}
                    </span>
                  )}
                  {/* Tags */}
                  {result.tags?.length > 0 && result.tags.slice(0, 4).map((tag, i) => (
                    <span key={i} style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 1,
                      color: "var(--text-dim)", border: "1px solid var(--border)",
                      padding: "1px 7px",
                    }}>{tag}</span>
                  ))}
                </div>
                {/* Stream title */}
                {result.streamTitle && (
                  <div style={{ marginTop: 10, fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text)", fontWeight: 300, lineHeight: 1.4, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", letterSpacing: 2, marginRight: 8 }}>TITLE</span>
                    {result.streamTitle}
                  </div>
                )}
              </div>

              <div className="grid-3">
                <div className="metric-card blue">
                  <div className="metric-label">Live Viewers</div>
                  <div className="metric-value blue">{fmt(result.liveViewers)}</div>
                  <div className="metric-sub">{fmt(result.followersTotal)} followers</div>
                </div>
                <div className={`metric-card ${engColor(result.engagementRate)}`}>
                  <div className="metric-label">Chat Engagement</div>
                  <div className={`metric-value ${engColor(result.engagementRate)}`}>
                    {result.engagementRate?.toFixed(1)}%
                  </div>
                  <div className="metric-sub">{result.chattersActive} chatters seen in IRC</div>
                </div>
                <div className="metric-card blue">
                  <div className="metric-label">Messages / Min</div>
                  <div className="metric-value blue">{result.messagesPerMinute?.toFixed(1)}</div>
                  <div className="metric-sub">{result.totalIrcMessages} msgs captured in {(IRC_COLLECT_MS/1000)}s</div>
                </div>
                <div className={`metric-card ${suspColor(result.suspiciousAccounts)}`}>
                  <div className="metric-label">Suspicious Accounts</div>
                  <div className={`metric-value ${suspColor(result.suspiciousAccounts)}`}>
                    {result.suspiciousAccounts}
                  </div>
                  <div className="metric-sub">bot-pattern usernames</div>
                </div>
                <div className="metric-card green">
                  <div className="metric-label">Unique Chatters</div>
                  <div className="metric-value green">{result.uniqueChattersLast10Min}</div>
                  <div className="metric-sub">{result.followerChatRatio?.toFixed(3)}% of followers chatted</div>
                </div>
                <div className={`metric-card ${mb.viewerSpikeProbability < 30 ? "green" : mb.viewerSpikeProbability < 60 ? "yellow" : "red"}`}>
                  <div className="metric-label">Spike Probability</div>
                  <div className={`metric-value ${mb.viewerSpikeProbability < 30 ? "green" : mb.viewerSpikeProbability < 60 ? "yellow" : "red"}`}>
                    {mb.viewerSpikeProbability}%
                  </div>
                  <div className="metric-sub">viewer inflation risk</div>
                </div>
              </div>

              <div className="grid-2">
                <div className="panel">
                  <div className="panel-title">Detection Metrics</div>
                  <BarRow label="Chat Engagement" value={mb.chatEngagement}
                    color={mb.chatEngagement > 40 ? "green" : mb.chatEngagement > 15 ? "blue" : "red"} />
                  <BarRow label="Username Entropy" value={mb.usernameEntropyScore}
                    color={mb.usernameEntropyScore < 30 ? "green" : mb.usernameEntropyScore < 60 ? "yellow" : "red"} />
                  <BarRow label="Viewer Spike Risk" value={mb.viewerSpikeProbability}
                    color={mb.viewerSpikeProbability < 30 ? "green" : mb.viewerSpikeProbability < 60 ? "yellow" : "red"} />
                  <BarRow label="Follow-bot Likelihood" value={mb.followBotLikelihood}
                    color={mb.followBotLikelihood < 30 ? "green" : mb.followBotLikelihood < 60 ? "yellow" : "red"} />
                  <BarRow label="Message Rate Anomaly" value={mb.messageRateAnomaly}
                    color={mb.messageRateAnomaly < 30 ? "green" : mb.messageRateAnomaly < 60 ? "yellow" : "red"} />
                  <BarRow label="Single-Msg Bot Pattern" value={mb.singleMsgSuspicion ?? 0}
                    color={(mb.singleMsgSuspicion ?? 0) < 30 ? "green" : (mb.singleMsgSuspicion ?? 0) < 60 ? "yellow" : "red"} />
                </div>
                <div className="panel">
                  <div className="panel-title">Anomaly Signals</div>
                  <div className="signals">
                    {result.signals?.map((s, i) => <Signal key={i} sig={s} />)}
                  </div>
                </div>
              </div>

              {/* Chat table — real IRC data */}
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-title">
                  Live Chat Analysis
                  <span style={{ fontSize: 10, color: dq.ircCollected ? "var(--accent)" : "var(--warn)", fontWeight: 400 }}>
                    {dq.ircCollected
                      ? `● ${dq.ircMessages} REAL MESSAGES · ${dq.ircChatters} USERS · ${IRC_COLLECT_MS/1000}s WINDOW`
                      : "⚠ CHANNEL OFFLINE — NO CHAT DATA"}
                  </span>
                </div>
                {result.chatSample?.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="chat-table">
                      <thead>
                        <tr>
                          <th>USERNAME</th>
                          <th>MSGS IN 15s</th>
                          <th>BOT SCORE</th>
                          <th>LAST MESSAGE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.chatSample.map((u, i) => (
                          <tr key={i}>
                            <td className={`col-${u.status}`}>{u.username}</td>
                            <td>{u.messagesIn15s}</td>
                            <td>
                              <span style={{ color: u.botScore >= 60 ? "var(--danger)" : u.botScore >= 25 ? "var(--warn)" : "var(--accent)" }}>
                                {u.botScore}/100
                              </span>
                            </td>
                            <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)", fontStyle: "italic" }}>
                              {u.lastMsg || "—"}
                            </td>
                            <td>
                              <span className={`pill ${u.status === "suspicious" ? "pill-red" : u.status === "legit" ? "pill-green" : "pill-yellow"}`}>
                                {u.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "12px 0" }}>
                    No chat messages were captured. Channel may be offline or chat is very slow.
                  </div>
                )}
              </div>

              <div className={`verdict ${verdictLevel}`}>
                <div className="verdict-title">
                  {result.riskLevel === "LOW" ? "✓ VERDICT: CHANNEL APPEARS LEGITIMATE"
                    : result.riskLevel === "MEDIUM" ? "⚠ VERDICT: SUSPICIOUS ACTIVITY DETECTED"
                    : "✗ VERDICT: HIGH PROBABILITY OF VIEW-BOTTING"}
                </div>
                <div className="verdict-text">{result.verdict}</div>
              </div>
            </>
          );
        })()}

        <div className="how-section">
          <div className="how-title">How It Works</div>
          <div className="how-subtitle">// DETECTION METHODOLOGY</div>
          <div className="how-grid">
            {[
              { n: "01", title: "Live IRC Collection", text: "The browser connects directly to Twitch IRC anonymously and collects real chat messages for 15 seconds. Every username and message is genuine — zero fabrication." },
              { n: "02", title: "Viewer/Chatter Ratio", text: "Legitimate streams see 1–5% of viewers chatting. Near-zero engagement with thousands of viewers is the primary indicator of ghost viewers — bots that inflate counts without interaction." },
              { n: "03", title: "Username Entropy", text: "Bots are assigned randomized names with high character entropy — like 'user48293kl'. Real users pick memorable names. Entropy scoring reveals bot-farm clusters algorithmically." },
              { n: "04", title: "Message Pattern Analysis", text: "Message rate, repetition, and chatter-to-viewer ratios are computed from the real 15-second IRC sample and extrapolated per-minute. Bots either spam or send zero messages." },
              { n: "05", title: "Follow Spike Detection", text: "Organic growth is gradual. The timestamps of your last 20 followers are analyzed — 5 follows in under 60 seconds is a near-certain sign of a follow-bot deployment." },
              { n: "06", title: "VOD Consistency", text: "If a channel's live viewer count is 10× higher than their average VOD views, that inconsistency is a strong indicator the live count is artificially inflated." },
            ].map(c => (
              <div className="how-card" key={c.n}>
                <div className="how-num">{c.n}</div>
                <div className="how-card-title">{c.title}</div>
                <div className="how-card-text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="disclaimer">
          <strong>⚠ DATA TRANSPARENCY:</strong> Chat messages, usernames, and message counts come directly from Twitch IRC — collected live in your browser, zero fabrication. Risk scores and all metrics are computed algorithmically. The <strong>verdict text</strong> is written by an AI model given only the real computed numbers. Channel analysis requires an active stream for chat data; offline channels show follower/VOD analysis only.
        </div>

      </div>
    </>
  );
}
import { useState, useEffect, useRef, useCallback } from "react";

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #060a0f;
    --panel: #0a1018;
    --border: #1a2a3a;
    --border-glow: #00ffe722;
    --accent: #00ffe7;
    --accent-dim: #00ffe755;
    --danger: #ff3b6b;
    --danger-dim: #ff3b6b44;
    --warn: #ffe040;
    --warn-dim: #ffe04044;
    --blue: #3b82f6;
    --text: #c8d8e8;
    --text-dim: #4a6a7a;
    --font-mono: 'Share Tech Mono', monospace;
    --font-display: 'Orbitron', monospace;
    --font-body: 'Rajdhani', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; overflow-x: hidden; }

  .scanline {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 1000;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,231,0.013) 2px, rgba(0,255,231,0.013) 4px);
  }

  .app { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; position: relative; z-index: 1; }

  .header { text-align: center; margin-bottom: 48px; animation: fadeDown 0.7s ease; }
  .header-badge { display: inline-block; font-family: var(--font-mono); font-size: 11px; color: var(--accent); border: 1px solid var(--accent-dim); padding: 4px 12px; letter-spacing: 3px; margin-bottom: 16px; }
  .header h1 { font-family: var(--font-display); font-size: clamp(26px,5vw,48px); font-weight: 900; color: #fff; letter-spacing: 4px; text-transform: uppercase; line-height: 1.1; }
  .header h1 span { color: var(--accent); }
  .header p { margin-top: 12px; color: var(--text-dim); font-size: 15px; letter-spacing: 1px; font-weight: 300; }

  .real-data-badge { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px; color: var(--accent); border: 1px solid var(--accent-dim); padding: 3px 10px; letter-spacing: 2px; margin-top: 8px; }
  .real-data-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s infinite; }

  .search-wrap { display: flex; gap: 0; margin-bottom: 40px; border: 1px solid var(--border); background: var(--panel); position: relative; animation: fadeUp 0.7s ease 0.1s both; }
  .search-wrap::before { content: ''; position: absolute; inset: -1px; background: linear-gradient(90deg, var(--accent-dim), transparent, transparent); pointer-events: none; }
  .search-icon { padding: 0 16px; color: var(--accent); font-family: var(--font-mono); font-size: 14px; display: flex; align-items: center; border-right: 1px solid var(--border); }
  .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--accent); font-family: var(--font-mono); font-size: 16px; padding: 18px 20px; letter-spacing: 1px; }
  .search-input::placeholder { color: var(--text-dim); }
  .search-btn { background: var(--accent); color: var(--bg); border: none; cursor: pointer; font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 2px; padding: 0 28px; text-transform: uppercase; transition: all 0.2s; }
  .search-btn:hover { background: #fff; }
  .search-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .search-btn.scanning { background: var(--warn); animation: pulse 1s infinite; }

  .scanning-overlay { border: 1px solid var(--border); background: var(--panel); padding: 48px; text-align: center; margin-bottom: 32px; position: relative; overflow: hidden; }
  .scanning-overlay::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); animation: scan 2s linear infinite; top: 0; }
  .scan-label { font-family: var(--font-display); font-size: 13px; color: var(--accent); letter-spacing: 4px; margin-bottom: 12px; }
  .scan-channel { font-family: var(--font-mono); font-size: 22px; color: #fff; margin-bottom: 24px; }
  .scan-steps { display: flex; flex-direction: column; gap: 8px; max-width: 420px; margin: 0 auto 24px; text-align: left; }
  .scan-step { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 10px; transition: color 0.3s; }
  .scan-step.active { color: var(--accent); }
  .step-dot { width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--text-dim); flex-shrink: 0; transition: all 0.3s; }
  .scan-step.active .step-dot { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 1s infinite; }
  .scan-step.done .step-dot { background: var(--text-dim); border-color: var(--text-dim); }

  .irc-live { margin-top: 8px; border: 1px solid var(--accent-dim); background: #060f0e; padding: 12px 16px; max-width: 420px; margin-left: auto; margin-right: auto; }
  .irc-live-label { font-family: var(--font-mono); font-size: 9px; color: var(--accent); letter-spacing: 3px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
  .irc-live-label .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: pulse 1s infinite; }
  .irc-msgs { display: flex; flex-direction: column; gap: 3px; max-height: 100px; overflow: hidden; }
  .irc-msg { font-family: var(--font-mono); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: fadeUp 0.2s ease; }
  .irc-msg .irc-user { color: var(--accent); }
  .irc-msg .irc-text { color: var(--text-dim); }
  .irc-counter { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); margin-top: 6px; }

  .result-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); animation: fadeUp 0.5s ease; }
  .result-channel { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 2px; }
  .result-channel span { font-size: 13px; font-family: var(--font-mono); color: var(--text-dim); display: block; margin-top: 2px; font-weight: 400; letter-spacing: 1px; }

  .risk-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 120px; padding: 12px 20px; border: 1px solid; font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
  .risk-badge .risk-score { font-size: 40px; line-height: 1; }
  .risk-badge .risk-label { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
  .risk-low { border-color: var(--accent); color: var(--accent); }
  .risk-medium { border-color: var(--warn); color: var(--warn); }
  .risk-high { border-color: var(--danger); color: var(--danger); animation: glowRed 2s ease-in-out infinite; }

  .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 16px; }

  .panel { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; animation: fadeUp 0.5s ease both; }
  .panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, var(--accent-dim), transparent); }
  .panel-title { font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .panel-title::after { content: ''; flex: 1; height: 1px; background: var(--border); min-width: 20px; }

  .metric-card { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; animation: fadeUp 0.5s ease both; }
  .metric-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
  .metric-card.green::before { background: var(--accent); }
  .metric-card.yellow::before { background: var(--warn); }
  .metric-card.red::before { background: var(--danger); }
  .metric-card.blue::before { background: var(--blue); }
  .metric-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  .metric-value { font-family: var(--font-display); font-size: 32px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
  .metric-value.green { color: var(--accent); }
  .metric-value.yellow { color: var(--warn); }
  .metric-value.red { color: var(--danger); }
  .metric-value.blue { color: var(--blue); }
  .metric-sub { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); }

  .bar-wrap { margin-bottom: 14px; }
  .bar-info { display: flex; justify-content: space-between; margin-bottom: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); }
  .bar-info span:last-child { color: var(--text); }
  .bar-track { height: 6px; background: var(--border); position: relative; overflow: hidden; }
  .bar-fill { height: 100%; position: absolute; left: 0; top: 0; transition: width 1.2s cubic-bezier(0.4,0,0.2,1); }
  .bar-fill.green { background: var(--accent); box-shadow: 0 0 8px var(--accent-dim); }
  .bar-fill.yellow { background: var(--warn); }
  .bar-fill.red { background: var(--danger); box-shadow: 0 0 8px var(--danger-dim); }
  .bar-fill.blue { background: var(--blue); }

  .signals { display: flex; flex-direction: column; gap: 10px; }
  .signal { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--border); background: #0d1520; font-size: 13px; font-family: var(--font-body); font-weight: 300; line-height: 1.4; }
  .signal-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
  .signal-text strong { font-weight: 600; color: #fff; display: block; margin-bottom: 2px; font-size: 13px; }
  .signal-text span { color: var(--text-dim); font-size: 12px; }
  .signal.flag-warn { border-left: 2px solid var(--warn); }
  .signal.flag-danger { border-left: 2px solid var(--danger); }
  .signal.flag-ok { border-left: 2px solid var(--accent); }

  .chat-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 12px; }
  .chat-table th { color: var(--text-dim); letter-spacing: 2px; font-size: 10px; text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 400; }
  .chat-table td { padding: 8px 12px; border-bottom: 1px solid #0d1520; color: var(--text); vertical-align: middle; }
  .chat-table tr:hover td { background: #0d1520; }
  .col-suspicious { color: var(--danger) !important; }
  .col-legit { color: var(--accent) !important; }
  .col-neutral { color: var(--warn) !important; }

  .pill { display: inline-block; padding: 2px 8px; font-size: 10px; letter-spacing: 1px; }
  .pill-red { background: var(--danger-dim); color: var(--danger); border: 1px solid var(--danger-dim); }
  .pill-green { background: rgba(0,255,231,0.1); color: var(--accent); border: 1px solid var(--accent-dim); }
  .pill-yellow { background: var(--warn-dim); color: var(--warn); border: 1px solid var(--warn-dim); }

  .verdict { border: 1px solid; padding: 24px; margin-bottom: 16px; position: relative; animation: fadeUp 0.5s ease; }
  .verdict.low { border-color: var(--accent); }
  .verdict.medium { border-color: var(--warn); }
  .verdict.high { border-color: var(--danger); animation: fadeUp 0.5s ease, glowRed 2s ease-in-out infinite; }
  .verdict-title { font-family: var(--font-display); font-size: 11px; letter-spacing: 3px; margin-bottom: 8px; }
  .verdict.low .verdict-title { color: var(--accent); }
  .verdict.medium .verdict-title { color: var(--warn); }
  .verdict.high .verdict-title { color: var(--danger); }
  .verdict-text { font-family: var(--font-body); font-size: 14px; color: var(--text); line-height: 1.6; font-weight: 300; }

  .how-section { margin-top: 56px; padding-top: 40px; border-top: 1px solid var(--border); }
  .how-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 4px; color: #fff; margin-bottom: 8px; text-transform: uppercase; }
  .how-subtitle { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); letter-spacing: 2px; margin-bottom: 32px; }
  .how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .how-card { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; }
  .how-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, var(--accent-dim), transparent); }
  .how-num { font-family: var(--font-display); font-size: 36px; font-weight: 900; color: var(--border); line-height: 1; margin-bottom: 12px; }
  .how-card-title { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 2px; color: var(--accent); text-transform: uppercase; margin-bottom: 8px; }
  .how-card-text { font-size: 13px; color: var(--text-dim); line-height: 1.6; font-weight: 300; }

  .disclaimer { margin-top: 40px; padding: 16px; border: 1px solid var(--border); font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); line-height: 1.6; letter-spacing: 0.5px; }
  .disclaimer strong { color: var(--warn); }

  .error-box { border: 1px solid var(--danger); color: var(--danger); background: var(--danger-dim); font-family: var(--font-mono); font-size: 13px; padding: 16px 20px; margin-bottom: 16px; }

  @keyframes fadeDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes scan { from { top:-2px; } to { top:100%; } }
  @keyframes glowRed { 0%,100% { box-shadow:0 0 0 0 transparent; } 50% { box-shadow:0 0 20px 2px rgba(255,59,107,0.15); } }
  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
  .cursor::after { content:'_'; animation:blink 1s step-end infinite; color:var(--accent); }
`;

const IRC_COLLECT_MS = 15000; // collect chat for 15 seconds

const SCAN_STEPS = [
  { label: "Resolving channel identity & account age...", phase: "api" },
  { label: "Fetching live stream & viewer count...", phase: "api" },
  { label: "Connecting to Twitch IRC — collecting live chat...", phase: "irc" },
  { label: "Sampling real chat messages...", phase: "irc" },
  { label: "Pulling followers & timestamp clustering...", phase: "api" },
  { label: "Running username entropy analysis...", phase: "irc" },
  { label: "Fetching VODs, clips & subscription data...", phase: "api" },
  { label: "Computing engagement & ghost-viewer ratios...", phase: "score" },
  { label: "Sending verified data to forensic AI engine...", phase: "ai" },
  { label: "Compiling report...", phase: "done" },
];

// ── IRC anonymous chat collector ──────────────────────────────────────────────
// Connects anonymously (no token needed), collects messages for IRC_COLLECT_MS ms.
// Returns { messages, uniqueChatters, totalMessages, msgsPerMin }
function collectIrcChat(channel, durationMs, onMessage) {
  return new Promise((resolve) => {
    const messages = [];       // { user, text, ts }
    const chatterSet = new Set();
    let ws = null;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { ws?.close(); } catch (_) {}
      const uniqueChatters = chatterSet.size;
      const totalMessages = messages.length;
      const msgsPerMin = parseFloat(((totalMessages / durationMs) * 60000).toFixed(1));
      resolve({ messages, uniqueChatters, totalMessages, msgsPerMin });
    };

    const timer = setTimeout(finish, durationMs);

    try {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    } catch (_) {
      clearTimeout(timer);
      resolve({ messages: [], uniqueChatters: 0, totalMessages: 0, msgsPerMin: 0 });
      return;
    }

    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE"); // anonymous read — standard anonymous pass for justinfan nicks
      ws.send(`NICK justinfan${Math.floor(Math.random() * 80000 + 10000)}`);
      ws.send(`JOIN #${channel}`);
    };

    ws.onmessage = (evt) => {
      const raw = typeof evt.data === "string" ? evt.data : "";

      // PING keepalive
      if (raw.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); return; }

      // Parse PRIVMSG — format: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :text
      const match = raw.match(/^(?:@[^ ]+ )?:([^!]+)![^ ]+ PRIVMSG #\S+ :(.+)/m);
      if (match) {
        const user = match[1].trim();
        const text = match[2].replace(/\r?\n?$/, "").trim();
        if (!user || !text) return;
        const isNew = !chatterSet.has(user);
        chatterSet.add(user);
        const msg = { user, text, ts: Date.now() };
        messages.push(msg);
        onMessage?.(msg, chatterSet.size, isNew); // live callback for UI updates
      }
    };

    ws.onerror = () => { clearTimeout(timer); finish(); };
    ws.onclose = () => { clearTimeout(timer); finish(); };
  });
}

function BarRow({ label, value, color }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 100);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="bar-wrap">
      <div className="bar-info">
        <span>{label}</span>
        <span>{typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}%</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function RiskBadge({ score, level }) {
  const cls = level === "LOW" ? "risk-low" : level === "MEDIUM" ? "risk-medium" : "risk-high";
  return (
    <div className={`risk-badge ${cls}`}>
      <span className="risk-score">{score}</span>
      <span className="risk-label">{level} RISK</span>
    </div>
  );
}

function Signal({ sig }) {
  const icon = sig.type === "ok" ? "✓" : sig.type === "warn" ? "⚠" : "✗";
  const cls = sig.type === "ok" ? "flag-ok" : sig.type === "warn" ? "flag-warn" : "flag-danger";
  return (
    <div className={`signal ${cls}`}>
      <span className="signal-icon">{icon}</span>
      <div className="signal-text">
        <strong>{sig.title}</strong>
        <span>{sig.detail}</span>
      </div>
    </div>
  );
}

function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

export default function App() {
  const [channel, setChannel] = useState("");
  const [scanning, setScanning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Live IRC feed for scan animation
  const [liveMessages, setLiveMessages] = useState([]);
  const [ircStats, setIrcStats] = useState({ count: 0, chatters: 0 });
  const ircRef = useRef(null);

  const handleScan = useCallback(async () => {
    if (!channel.trim() || scanning) return;
    const ch = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!ch) return;

    setScanning(true);
    setResult(null);
    setError(null);
    setStepIndex(0);
    setLiveMessages([]);
    setIrcStats({ count: 0, chatters: 0 });

    // Step through animation while IRC + API run in parallel
    let step = 0;
    const stepInterval = setInterval(() => {
      step = Math.min(step + 1, SCAN_STEPS.length - 2); // hold at second-to-last
      setStepIndex(step);
    }, IRC_COLLECT_MS / (SCAN_STEPS.length - 2));

    try {
      // ── Phase 1: IRC collection (browser → runs for 15s) ───────────────────
      const ircPromise = collectIrcChat(ch, IRC_COLLECT_MS, (msg, totalChatters, isNew) => {
        setLiveMessages(prev => [...prev.slice(-5), msg]); // keep last 6 in UI
        setIrcStats(prev => ({
          count: prev.count + 1,
          chatters: totalChatters,
        }));
      });

      // ── Phase 2: collect IRC data ──────────────────────────────────────────
      const ircData = await ircPromise;

      // Update chatters count after IRC finishes
      setIrcStats({ count: ircData.totalMessages, chatters: ircData.uniqueChatters });

      // ── Phase 3: send everything to API ────────────────────────────────────
      clearInterval(stepInterval);
      setStepIndex(SCAN_STEPS.length - 2);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch, ircData }),
      });

      if (res.status === 429) throw new Error("Too many requests. Wait 30 seconds.");
      if (res.status === 400) throw new Error("Invalid channel name.");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Analysis failed. Please try again.");
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setStepIndex(SCAN_STEPS.length);
      await new Promise(r => setTimeout(r, 400));
      setResult(data);
    } catch (e) {
      setError(e.message || "Analysis failed.");
    } finally {
      clearInterval(stepInterval);
      setScanning(false);
    }
  }, [channel, scanning]);

  const verdictLevel = result?.riskLevel?.toLowerCase() || "low";
  const engColor = (v) => v > 5 ? "green" : v > 1 ? "yellow" : "red";
  const suspColor = (v) => v === 0 ? "green" : v < 10 ? "yellow" : "red";

  return (
    <>
      <style>{style}</style>
      <div className="scanline" />
      <div className="app">

        <div className="header">
          <div className="header-badge">⬡ FORENSIC ANALYSIS TOOL v3.0</div>
          <h1>TWITCH<br /><span>BOT</span>SCAN</h1>
          <p>Real-time view-bot detection &amp; stream authenticity analyzer</p>
        </div>

        <div className="search-wrap">
          <div className="search-icon">twitch.tv/</div>
          <input
            className="search-input cursor"
            value={channel}
            onChange={e => setChannel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleScan()}
            placeholder="channel_name"
            spellCheck={false}
            maxLength={50}
            disabled={scanning}
          />
          <button
            className={`search-btn${scanning ? " scanning" : ""}`}
            onClick={handleScan}
            disabled={scanning || !channel.trim()}
          >
            {scanning ? "SCANNING" : "ANALYZE"}
          </button>
        </div>

        {scanning && (
          <div className="scanning-overlay">
            <div className="scan-label">▶ INITIATING DEEP SCAN</div>
            <div className="scan-channel">twitch.tv/{channel}</div>
            <div className="scan-steps">
              {SCAN_STEPS.map((s, i) => (
                <div key={i} className={`scan-step${i === stepIndex ? " active" : i < stepIndex ? " done" : ""}`}>
                  <div className="step-dot" />
                  {s.label}
                </div>
              ))}
            </div>

            {/* Live IRC feed shown during scan */}
            <div className="irc-live">
              <div className="irc-live-label">
                <span className="dot" />
                LIVE IRC FEED — REAL CHAT MESSAGES
              </div>
              <div className="irc-msgs">
                {liveMessages.length === 0 ? (
                  <div className="irc-msg" style={{ color: "var(--text-dim)" }}>
                    {channel ? "Connecting to chat..." : "Waiting..."}
                  </div>
                ) : (
                  liveMessages.slice(-6).map((m, i) => (
                    <div key={i} className="irc-msg">
                      <span className="irc-user">{m.user}: </span>
                      <span className="irc-text">{m.text}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="irc-counter">
                {ircStats.count} messages · {ircStats.chatters} unique chatters captured
              </div>
            </div>
          </div>
        )}

        {error && <div className="error-box">✗ {error}</div>}

        {result && !scanning && (() => {
          const mb = result.metricsBreakdown || {};
          const dq = result.dataQuality || {};
          return (
            <>
              <div className="result-header">
                <div>
                  <div className="result-channel">
                    twitch.tv/{result.channel}
                    <span>SCAN COMPLETE · {new Date().toLocaleTimeString()} · {dq.dataPointsCollected || 10} DATA SOURCES</span>
                  </div>
                  <div className="real-data-badge">
                    <span className="dot" />
                    {[
                      "LIVE TWITCH API",
                      dq.isLive && "STREAM",
                      dq.ircCollected && `IRC·${dq.ircMessages}msgs·${dq.ircChatters}users`,
                      dq.hasVODs && "VODS",
                      dq.hasClips && "CLIPS",
                      dq.hasSubs && "SUBS",
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <RiskBadge score={result.riskScore} level={result.riskLevel} />
              </div>

              <div className="grid-3">
                <div className="metric-card blue">
                  <div className="metric-label">Live Viewers</div>
                  <div className="metric-value blue">{fmt(result.liveViewers)}</div>
                  <div className="metric-sub">{fmt(result.followersTotal)} followers</div>
                </div>
                <div className={`metric-card ${engColor(result.engagementRate)}`}>
                  <div className="metric-label">Chat Engagement</div>
                  <div className={`metric-value ${engColor(result.engagementRate)}`}>
                    {result.engagementRate?.toFixed(1)}%
                  </div>
                  <div className="metric-sub">{result.chattersActive} chatters seen in IRC</div>
                </div>
                <div className="metric-card blue">
                  <div className="metric-label">Messages / Min</div>
                  <div className="metric-value blue">{result.messagesPerMinute?.toFixed(1)}</div>
                  <div className="metric-sub">{result.totalIrcMessages} msgs captured in {(IRC_COLLECT_MS/1000)}s</div>
                </div>
                <div className={`metric-card ${suspColor(result.suspiciousAccounts)}`}>
                  <div className="metric-label">Suspicious Accounts</div>
                  <div className={`metric-value ${suspColor(result.suspiciousAccounts)}`}>
                    {result.suspiciousAccounts}
                  </div>
                  <div className="metric-sub">bot-pattern usernames</div>
                </div>
                <div className="metric-card green">
                  <div className="metric-label">Unique Chatters</div>
                  <div className="metric-value green">{result.uniqueChattersLast10Min}</div>
                  <div className="metric-sub">{result.followerChatRatio?.toFixed(3)}% of followers chatted</div>
                </div>
                <div className={`metric-card ${mb.viewerSpikeProbability < 30 ? "green" : mb.viewerSpikeProbability < 60 ? "yellow" : "red"}`}>
                  <div className="metric-label">Spike Probability</div>
                  <div className={`metric-value ${mb.viewerSpikeProbability < 30 ? "green" : mb.viewerSpikeProbability < 60 ? "yellow" : "red"}`}>
                    {mb.viewerSpikeProbability}%
                  </div>
                  <div className="metric-sub">viewer inflation risk</div>
                </div>
              </div>

              <div className="grid-2">
                <div className="panel">
                  <div className="panel-title">Detection Metrics</div>
                  <BarRow label="Chat Engagement" value={mb.chatEngagement}
                    color={mb.chatEngagement > 40 ? "green" : mb.chatEngagement > 15 ? "blue" : "red"} />
                  <BarRow label="Username Entropy" value={mb.usernameEntropyScore}
                    color={mb.usernameEntropyScore < 30 ? "green" : mb.usernameEntropyScore < 60 ? "yellow" : "red"} />
                  <BarRow label="Viewer Spike Risk" value={mb.viewerSpikeProbability}
                    color={mb.viewerSpikeProbability < 30 ? "green" : mb.viewerSpikeProbability < 60 ? "yellow" : "red"} />
                  <BarRow label="Follow-bot Likelihood" value={mb.followBotLikelihood}
                    color={mb.followBotLikelihood < 30 ? "green" : mb.followBotLikelihood < 60 ? "yellow" : "red"} />
                  <BarRow label="Message Rate Anomaly" value={mb.messageRateAnomaly}
                    color={mb.messageRateAnomaly < 30 ? "green" : mb.messageRateAnomaly < 60 ? "yellow" : "red"} />
                  <BarRow label="Single-Msg Bot Pattern" value={mb.singleMsgSuspicion ?? 0}
                    color={(mb.singleMsgSuspicion ?? 0) < 30 ? "green" : (mb.singleMsgSuspicion ?? 0) < 60 ? "yellow" : "red"} />
                </div>
                <div className="panel">
                  <div className="panel-title">Anomaly Signals</div>
                  <div className="signals">
                    {result.signals?.map((s, i) => <Signal key={i} sig={s} />)}
                  </div>
                </div>
              </div>

              {/* Chat table — real IRC data */}
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-title">
                  Live Chat Analysis
                  <span style={{ fontSize: 10, color: dq.ircCollected ? "var(--accent)" : "var(--warn)", fontWeight: 400 }}>
                    {dq.ircCollected
                      ? `● ${dq.ircMessages} REAL MESSAGES · ${dq.ircChatters} USERS · ${IRC_COLLECT_MS/1000}s WINDOW`
                      : "⚠ CHANNEL OFFLINE — NO CHAT DATA"}
                  </span>
                </div>
                {result.chatSample?.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table className="chat-table">
                      <thead>
                        <tr>
                          <th>USERNAME</th>
                          <th>MSGS IN 15s</th>
                          <th>BOT SCORE</th>
                          <th>LAST MESSAGE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.chatSample.map((u, i) => (
                          <tr key={i}>
                            <td className={`col-${u.status}`}>{u.username}</td>
                            <td>{u.messagesIn15s}</td>
                            <td>
                              <span style={{ color: u.botScore >= 60 ? "var(--danger)" : u.botScore >= 25 ? "var(--warn)" : "var(--accent)" }}>
                                {u.botScore}/100
                              </span>
                            </td>
                            <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)", fontStyle: "italic" }}>
                              {u.lastMsg || "—"}
                            </td>
                            <td>
                              <span className={`pill ${u.status === "suspicious" ? "pill-red" : u.status === "legit" ? "pill-green" : "pill-yellow"}`}>
                                {u.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "12px 0" }}>
                    No chat messages were captured. Channel may be offline or chat is very slow.
                  </div>
                )}
              </div>

              <div className={`verdict ${verdictLevel}`}>
                <div className="verdict-title">
                  {result.riskLevel === "LOW" ? "✓ VERDICT: CHANNEL APPEARS LEGITIMATE"
                    : result.riskLevel === "MEDIUM" ? "⚠ VERDICT: SUSPICIOUS ACTIVITY DETECTED"
                    : "✗ VERDICT: HIGH PROBABILITY OF VIEW-BOTTING"}
                </div>
                <div className="verdict-text">{result.verdict}</div>
              </div>
            </>
          );
        })()}

        <div className="how-section">
          <div className="how-title">How It Works</div>
          <div className="how-subtitle">// DETECTION METHODOLOGY</div>
          <div className="how-grid">
            {[
              { n: "01", title: "Live IRC Collection", text: "The browser connects directly to Twitch IRC anonymously and collects real chat messages for 15 seconds. Every username and message is genuine — zero fabrication." },
              { n: "02", title: "Viewer/Chatter Ratio", text: "Legitimate streams see 1–5% of viewers chatting. Near-zero engagement with thousands of viewers is the primary indicator of ghost viewers — bots that inflate counts without interaction." },
              { n: "03", title: "Username Entropy", text: "Bots are assigned randomized names with high character entropy — like 'user48293kl'. Real users pick memorable names. Entropy scoring reveals bot-farm clusters algorithmically." },
              { n: "04", title: "Message Pattern Analysis", text: "Message rate, repetition, and chatter-to-viewer ratios are computed from the real 15-second IRC sample and extrapolated per-minute. Bots either spam or send zero messages." },
              { n: "05", title: "Follow Spike Detection", text: "Organic growth is gradual. The timestamps of your last 20 followers are analyzed — 5 follows in under 60 seconds is a near-certain sign of a follow-bot deployment." },
              { n: "06", title: "VOD Consistency", text: "If a channel's live viewer count is 10× higher than their average VOD views, that inconsistency is a strong indicator the live count is artificially inflated." },
            ].map(c => (
              <div className="how-card" key={c.n}>
                <div className="how-num">{c.n}</div>
                <div className="how-card-title">{c.title}</div>
                <div className="how-card-text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="disclaimer">
          <strong>⚠ DATA TRANSPARENCY:</strong> Chat messages, usernames, and message counts come directly from Twitch IRC — collected live in your browser, zero fabrication. Risk scores and all metrics are computed algorithmically. The <strong>verdict text</strong> is written by an AI model given only the real computed numbers. Channel analysis requires an active stream for chat data; offline channels show follower/VOD analysis only.
        </div>

      </div>
    </>
  );
}
