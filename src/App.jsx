import { useState, useEffect, useRef } from "react";

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #060a0f;
    --panel: #0a1018;
    --border: #1a2a3a;
    --border-glow: #00ffe722;
    --green: #00ffe7;
    --green-dim: #00ffe755;
    --red: #ff3b6b;
    --red-dim: #ff3b6b44;
    --yellow: #ffe040;
    --yellow-dim: #ffe04044;
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
  .header-badge {
    display: inline-block; font-family: var(--font-mono); font-size: 11px; color: var(--green);
    border: 1px solid var(--green-dim); padding: 4px 12px; letter-spacing: 3px; margin-bottom: 16px;
  }
  .header h1 { font-family: var(--font-display); font-size: clamp(26px,5vw,48px); font-weight: 900; color: #fff; letter-spacing: 4px; text-transform: uppercase; line-height: 1.1; }
  .header h1 span { color: var(--green); }
  .header p { margin-top: 12px; color: var(--text-dim); font-size: 15px; letter-spacing: 1px; font-weight: 300; }

  .real-data-badge {
    display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px;
    color: var(--green); border: 1px solid var(--green-dim); padding: 3px 10px; letter-spacing: 2px; margin-top: 8px;
  }
  .real-data-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 1.5s infinite; }

  .search-wrap {
    display: flex; gap: 0; margin-bottom: 40px; border: 1px solid var(--border); background: var(--panel);
    position: relative; animation: fadeUp 0.7s ease 0.1s both;
  }
  .search-wrap::before {
    content: ''; position: absolute; inset: -1px;
    background: linear-gradient(90deg, var(--green-dim), transparent, transparent); pointer-events: none;
  }
  .search-icon { padding: 0 16px; color: var(--green); font-family: var(--font-mono); font-size: 14px; display: flex; align-items: center; border-right: 1px solid var(--border); }
  .search-input { flex: 1; background: transparent; border: none; outline: none; color: var(--green); font-family: var(--font-mono); font-size: 16px; padding: 18px 20px; letter-spacing: 1px; }
  .search-input::placeholder { color: var(--text-dim); }
  .search-btn { background: var(--green); color: var(--bg); border: none; cursor: pointer; font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 2px; padding: 0 28px; text-transform: uppercase; transition: all 0.2s; }
  .search-btn:hover { background: #fff; }
  .search-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .search-btn.scanning { background: var(--yellow); animation: pulse 1s infinite; }

  .scanning-overlay { border: 1px solid var(--border); background: var(--panel); padding: 48px; text-align: center; margin-bottom: 32px; position: relative; overflow: hidden; }
  .scanning-overlay::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--green), transparent); animation: scan 2s linear infinite; top: 0; }
  .scan-label { font-family: var(--font-display); font-size: 13px; color: var(--green); letter-spacing: 4px; margin-bottom: 12px; }
  .scan-channel { font-family: var(--font-mono); font-size: 22px; color: #fff; margin-bottom: 24px; }
  .scan-steps { display: flex; flex-direction: column; gap: 8px; max-width: 360px; margin: 0 auto; text-align: left; }
  .scan-step { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); display: flex; align-items: center; gap: 10px; transition: color 0.3s; }
  .scan-step.active { color: var(--green); }
  .step-dot { width: 8px; height: 8px; border-radius: 50%; border: 1px solid var(--text-dim); flex-shrink: 0; transition: all 0.3s; }
  .scan-step.active .step-dot { background: var(--green); border-color: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 1s infinite; }
  .scan-step.done .step-dot { background: var(--text-dim); border-color: var(--text-dim); }

  .result-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); animation: fadeUp 0.5s ease; }
  .result-channel { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 2px; }
  .result-channel span { font-size: 13px; font-family: var(--font-mono); color: var(--text-dim); display: block; margin-top: 2px; font-weight: 400; letter-spacing: 1px; }

  .risk-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 120px; padding: 12px 20px; border: 1px solid; font-family: var(--font-display); font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
  .risk-badge .risk-score { font-size: 40px; line-height: 1; }
  .risk-badge .risk-label { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
  .risk-low { border-color: var(--green); color: var(--green); }
  .risk-medium { border-color: var(--yellow); color: var(--yellow); }
  .risk-high { border-color: var(--red); color: var(--red); animation: glowRed 2s ease-in-out infinite; }

  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 16px; }
  .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; }

  .panel { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; animation: fadeUp 0.5s ease both; }
  .panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, var(--green-dim), transparent); }
  .panel-title { font-family: var(--font-mono); font-size: 10px; color: var(--green); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .panel-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .metric-card { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; animation: fadeUp 0.5s ease both; }
  .metric-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
  .metric-card.green::before { background: var(--green); }
  .metric-card.yellow::before { background: var(--yellow); }
  .metric-card.red::before { background: var(--red); }
  .metric-card.blue::before { background: var(--blue); }

  .metric-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  .metric-value { font-family: var(--font-display); font-size: 32px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
  .metric-value.green { color: var(--green); }
  .metric-value.yellow { color: var(--yellow); }
  .metric-value.red { color: var(--red); }
  .metric-value.blue { color: var(--blue); }
  .metric-sub { font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); }

  .bar-wrap { margin-bottom: 14px; }
  .bar-info { display: flex; justify-content: space-between; margin-bottom: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); }
  .bar-info span:last-child { color: var(--text); }
  .bar-track { height: 6px; background: var(--border); position: relative; overflow: hidden; }
  .bar-fill { height: 100%; position: absolute; left: 0; top: 0; transition: width 1.2s cubic-bezier(0.4,0,0.2,1); }
  .bar-fill.green { background: var(--green); box-shadow: 0 0 8px var(--green-dim); }
  .bar-fill.yellow { background: var(--yellow); }
  .bar-fill.red { background: var(--red); box-shadow: 0 0 8px var(--red-dim); }
  .bar-fill.blue { background: var(--blue); }

  .signals { display: flex; flex-direction: column; gap: 10px; }
  .signal { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border: 1px solid var(--border); background: #0d1520; font-size: 13px; font-family: var(--font-body); font-weight: 300; line-height: 1.4; }
  .signal-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
  .signal-text strong { font-weight: 600; color: #fff; display: block; margin-bottom: 2px; font-size: 13px; }
  .signal-text span { color: var(--text-dim); font-size: 12px; }
  .signal.flag-warn { border-left: 2px solid var(--yellow); }
  .signal.flag-danger { border-left: 2px solid var(--red); }
  .signal.flag-ok { border-left: 2px solid var(--green); }

  .chat-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 12px; }
  .chat-table th { color: var(--text-dim); letter-spacing: 2px; font-size: 10px; text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-weight: 400; }
  .chat-table td { padding: 8px 12px; border-bottom: 1px solid #0d1520; color: var(--text); vertical-align: middle; }
  .chat-table tr:hover td { background: #0d1520; }
  .suspicious { color: var(--red) !important; }
  .legit { color: var(--green) !important; }
  .neutral { color: var(--yellow) !important; }

  .pill { display: inline-block; padding: 2px 8px; font-size: 10px; letter-spacing: 1px; }
  .pill-red { background: var(--red-dim); color: var(--red); border: 1px solid var(--red-dim); }
  .pill-green { background: rgba(0,255,231,0.1); color: var(--green); border: 1px solid var(--green-dim); }
  .pill-yellow { background: var(--yellow-dim); color: var(--yellow); border: 1px solid var(--yellow-dim); }

  .verdict { border: 1px solid; padding: 24px; margin-bottom: 16px; position: relative; animation: fadeUp 0.5s ease; }
  .verdict.low { border-color: var(--green); }
  .verdict.medium { border-color: var(--yellow); }
  .verdict.high { border-color: var(--red); animation: fadeUp 0.5s ease, glowRed 2s ease-in-out infinite; }
  .verdict-title { font-family: var(--font-display); font-size: 11px; letter-spacing: 3px; margin-bottom: 8px; }
  .verdict.low .verdict-title { color: var(--green); }
  .verdict.medium .verdict-title { color: var(--yellow); }
  .verdict.high .verdict-title { color: var(--red); }
  .verdict-text { font-family: var(--font-body); font-size: 14px; color: var(--text); line-height: 1.6; font-weight: 300; }

  .how-section { margin-top: 56px; padding-top: 40px; border-top: 1px solid var(--border); }
  .how-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 4px; color: #fff; margin-bottom: 8px; text-transform: uppercase; }
  .how-subtitle { font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); letter-spacing: 2px; margin-bottom: 32px; }
  .how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .how-card { background: var(--panel); border: 1px solid var(--border); padding: 20px; position: relative; }
  .how-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, var(--green-dim), transparent); }
  .how-num { font-family: var(--font-display); font-size: 36px; font-weight: 900; color: var(--border); line-height: 1; margin-bottom: 12px; }
  .how-card-title { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 2px; color: var(--green); text-transform: uppercase; margin-bottom: 8px; }
  .how-card-text { font-size: 13px; color: var(--text-dim); line-height: 1.6; font-weight: 300; }

  .disclaimer { margin-top: 40px; padding: 16px; border: 1px solid var(--border); font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); line-height: 1.6; letter-spacing: 0.5px; }
  .disclaimer strong { color: var(--yellow); }

  .error-box { border: 1px solid var(--red); color: var(--red); background: var(--red-dim); font-family: var(--font-mono); font-size: 13px; padding: 16px 20px; margin-bottom: 16px; }

  @keyframes fadeDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes scan { from { top:-2px; } to { top:100%; } }
  @keyframes glowRed { 0%,100% { box-shadow:0 0 0 0 transparent; } 50% { box-shadow:0 0 20px 2px rgba(255,59,107,0.15); } }
  @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
  .cursor::after { content:'_'; animation:blink 1s step-end infinite; color:var(--green); }
`;

const SCAN_STEPS = [
  "Resolving channel identity...",
  "Fetching live viewer metadata...",
  "Sampling chat activity stream...",
  "Analyzing username entropy patterns...",
  "Cross-referencing account age database...",
  "Computing engagement ratios...",
  "Running anomaly detection algorithms...",
  "Generating bot probability matrix...",
  "Compiling forensic report...",
];

async function analyzeChannel(channel) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });

  if (res.status === 429) throw new Error("Too many requests. Wait 20 seconds.");
  if (res.status === 400) throw new Error("Invalid channel name.");
  if (!res.ok) throw new Error("Analysis failed. Please try again.");

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
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
  const stepRef = useRef(null);

  async function handleScan() {
    if (!channel.trim() || scanning) return;
    setScanning(true);
    setResult(null);
    setError(null);
    setStepIndex(0);

    let i = 0;
    stepRef.current = setInterval(() => {
      i++;
      setStepIndex(i);
      if (i >= SCAN_STEPS.length - 1) clearInterval(stepRef.current);
    }, 450);

    try {
      const data = await analyzeChannel(channel.trim());
      clearInterval(stepRef.current);
      setStepIndex(SCAN_STEPS.length);
      await new Promise(r => setTimeout(r, 400));
      setResult(data);
    } catch (e) {
      clearInterval(stepRef.current);
      setError(e.message || "Analysis failed.");
    } finally {
      setScanning(false);
    }
  }

  const verdictLevel = result?.riskLevel?.toLowerCase() || "low";

  const engColor = (v) => v > 10 ? "green" : v > 3 ? "yellow" : "red";
  const ageColor = (v) => v > 180 ? "green" : v > 60 ? "yellow" : "red";
  const suspColor = (v) => v < 5 ? "green" : v < 20 ? "yellow" : "red";

  return (
    <>
      <style>{style}</style>
      <div className="scanline" />
      <div className="app">

        <div className="header">
          <div className="header-badge">⬡ FORENSIC ANALYSIS TOOL v2.4</div>
          <h1>TWITCH<br /><span>BOT</span>SCAN</h1>
          <p>View-bot detection &amp; stream authenticity analyzer</p>
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
            <div className="scan-label">▶ INITIATING SCAN</div>
            <div className="scan-channel">twitch.tv/{channel}</div>
            <div className="scan-steps">
              {SCAN_STEPS.map((s, i) => (
                <div key={i} className={`scan-step${i === stepIndex ? " active" : i < stepIndex ? " done" : ""}`}>
                  <div className="step-dot" />
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="error-box">✗ {error}</div>}

        {result && !scanning && (
          <>
            <div className="result-header">
              <div>
                <div className="result-channel">
                  twitch.tv/{result.channel}
                  <span>
                    SCAN COMPLETE · {new Date().toLocaleTimeString()}
                    {result.usedRealData && " · LIVE TWITCH DATA"}
                  </span>
                </div>
                {result.usedRealData && (
                  <div className="real-data-badge">
                    <span className="dot" />
                    LIVE TWITCH API DATA
                  </div>
                )}
              </div>
              <RiskBadge score={result.riskScore} level={result.riskLevel} />
            </div>

            <div className="grid-3">
              <div className={`metric-card blue`}>
                <div className="metric-label">Live Viewers</div>
                <div className="metric-value blue">{fmt(result.liveViewers)}</div>
                <div className="metric-sub">{fmt(result.followersTotal)} followers</div>
              </div>
              <div className={`metric-card ${engColor(result.engagementRate)}`}>
                <div className="metric-label">Chat Engagement</div>
                <div className={`metric-value ${engColor(result.engagementRate)}`}>
                  {result.engagementRate?.toFixed(1)}%
                </div>
                <div className="metric-sub">{result.chattersActive} active chatters</div>
              </div>
              <div className={`metric-card ${ageColor(result.avgAccountAgeDays)}`}>
                <div className="metric-label">Avg Account Age</div>
                <div className={`metric-value ${ageColor(result.avgAccountAgeDays)}`}>
                  {result.avgAccountAgeDays}d
                </div>
                <div className="metric-sub">{result.messagesPerMinute?.toFixed(1)} msg/min</div>
              </div>
              <div className={`metric-card ${suspColor(result.suspiciousAccounts)}`}>
                <div className="metric-label">Suspicious Accounts</div>
                <div className={`metric-value ${suspColor(result.suspiciousAccounts)}`}>
                  {result.suspiciousAccounts}
                </div>
                <div className="metric-sub">detected in chat</div>
              </div>
              <div className="metric-card green">
                <div className="metric-label">Unique Chatters / 10m</div>
                <div className="metric-value green">{result.uniqueChattersLast10Min}</div>
                <div className="metric-sub">{result.followerChatRatio?.toFixed(2)}% follower-chat ratio</div>
              </div>
              <div className={`metric-card ${result.metricsBreakdown?.viewerSpikeProbability < 30 ? "green" : result.metricsBreakdown?.viewerSpikeProbability < 60 ? "yellow" : "red"}`}>
                <div className="metric-label">Spike Probability</div>
                <div className={`metric-value ${result.metricsBreakdown?.viewerSpikeProbability < 30 ? "green" : result.metricsBreakdown?.viewerSpikeProbability < 60 ? "yellow" : "red"}`}>
                  {result.metricsBreakdown?.viewerSpikeProbability}%
                </div>
                <div className="metric-sub">viewer inflation risk</div>
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-title">Detection Metrics</div>
                {result.metricsBreakdown && (<>
                  <BarRow label="Chat Engagement" value={result.metricsBreakdown.chatEngagement}
                    color={result.metricsBreakdown.chatEngagement > 40 ? "green" : result.metricsBreakdown.chatEngagement > 15 ? "blue" : "red"} />
                  <BarRow label="Account Age Suspicion" value={result.metricsBreakdown.accountAgeSuspicion}
                    color={result.metricsBreakdown.accountAgeSuspicion < 30 ? "green" : result.metricsBreakdown.accountAgeSuspicion < 60 ? "yellow" : "red"} />
                  <BarRow label="Username Entropy" value={result.metricsBreakdown.usernameEntropyScore}
                    color={result.metricsBreakdown.usernameEntropyScore < 30 ? "green" : result.metricsBreakdown.usernameEntropyScore < 60 ? "yellow" : "red"} />
                  <BarRow label="Viewer Spike Risk" value={result.metricsBreakdown.viewerSpikeProbability}
                    color={result.metricsBreakdown.viewerSpikeProbability < 30 ? "green" : result.metricsBreakdown.viewerSpikeProbability < 60 ? "yellow" : "red"} />
                  <BarRow label="Follow-bot Likelihood" value={result.metricsBreakdown.followBotLikelihood}
                    color={result.metricsBreakdown.followBotLikelihood < 30 ? "green" : result.metricsBreakdown.followBotLikelihood < 60 ? "yellow" : "red"} />
                </>)}
              </div>
              <div className="panel">
                <div className="panel-title">Anomaly Signals</div>
                <div className="signals">
                  {result.signals?.map((s, i) => <Signal key={i} sig={s} />)}
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title">Chat Sample Analysis (last 10 min)</div>
              <div style={{ overflowX: "auto" }}>
                <table className="chat-table">
                  <thead>
                    <tr>
                      <th>USERNAME</th>
                      <th>MSGS / 10M</th>
                      <th>ACCT AGE</th>
                      <th>LAST MESSAGE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.chatSample?.map((u, i) => (
                      <tr key={i}>
                        <td className={u.status === "suspicious" ? "suspicious" : u.status === "legit" ? "legit" : "neutral"}>{u.username}</td>
                        <td>{u.messagesIn10min}</td>
                        <td>{u.accountAgeDays < 30 ? <span className="suspicious">{u.accountAgeDays}d</span> : `${u.accountAgeDays}d`}</td>
                        <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)" }}>{u.lastMsg}</td>
                        <td><span className={`pill ${u.status === "suspicious" ? "pill-red" : u.status === "legit" ? "pill-green" : "pill-yellow"}`}>{u.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`verdict ${verdictLevel}`}>
              <div className="verdict-title">
                {result.riskLevel === "LOW" ? "✓ VERDICT: CHANNEL APPEARS LEGITIMATE" :
                  result.riskLevel === "MEDIUM" ? "⚠ VERDICT: SUSPICIOUS ACTIVITY DETECTED" :
                    "✗ VERDICT: HIGH PROBABILITY OF VIEW-BOTTING"}
              </div>
              <div className="verdict-text">{result.verdict}</div>
            </div>
          </>
        )}

        <div className="how-section">
          <div className="how-title">How It Works</div>
          <div className="how-subtitle">// DETECTION METHODOLOGY</div>
          <div className="how-grid">
            {[
              { n: "01", title: "Viewer/Chatter Ratio", text: "Legitimate streams see 1–5% of viewers chatting. Near-zero engagement with thousands of viewers is the primary indicator of ghost viewers — bots that inflate counts without interaction." },
              { n: "02", title: "Account Age Analysis", text: "Bot farms create accounts in bulk. Clusters of accounts younger than 30 days strongly suggest coordinated bot deployment. Fresh accounts are cheap and disposable." },
              { n: "03", title: "Username Entropy", text: "Bots are assigned randomized names with high character entropy — strings like 'user48293kl'. Real users pick memorable names. Entropy scoring reveals bot clusters." },
              { n: "04", title: "Message Pattern Analysis", text: "View bots rarely chat, but chat bots do. Bots repeat identical messages at inhuman timing intervals. NLP pattern matching detects templated output." },
              { n: "05", title: "Viewer Spike Detection", text: "Organic growth is gradual. 500+ viewers appearing in under a minute is statistically improbable without a raid — a signature of a bot injection event." },
              { n: "06", title: "Follower Correlation", text: "Botted channels often have inflated followers too. Legitimate streamers show proportional relationship between followers, average viewers, and peak concurrent counts." },
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
          <strong>⚠ DISCLAIMER:</strong> This tool uses AI-generated simulation to model view-bot detection patterns for educational purposes.
          Results are generated by an AI model. Even when real Twitch API data is used for viewer/follower counts,
          chat analysis remains simulated. Do not use results to make accusations against creators.
        </div>

      </div>
    </>
  );
}
