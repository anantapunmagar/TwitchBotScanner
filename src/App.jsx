import { useState, useEffect, useRef } from "react";

const style = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#060a0f;--panel:#0a1018;--panel2:#0d1520;
    --border:#1a2a3a;--border2:#243444;
    --green:#00ffe7;--gdim:#00ffe733;--gbright:#00ffe7cc;
    --red:#ff3b6b;--rdim:#ff3b6b33;
    --yellow:#ffe040;--ydim:#ffe04033;
    --blue:#3b82f6;--bdim:#3b82f633;
    --purple:#a855f7;--pdim:#a855f733;
    --text:#c8d8e8;--dim:#3a5a6a;--dim2:#4a6a7a;
    --mono:'Share Tech Mono',monospace;
    --display:'Orbitron',monospace;
    --body:'Rajdhani',sans-serif;
  }
  body{background:var(--bg);color:var(--text);font-family:var(--body);min-height:100vh;overflow-x:hidden}
  .scanline{position:fixed;inset:0;pointer-events:none;z-index:1000;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,231,.012) 2px,rgba(0,255,231,.012) 4px)}

  .app{max-width:1140px;margin:0 auto;padding:32px 18px 80px;position:relative;z-index:1}

  /* HEADER */
  .hdr{text-align:center;margin-bottom:44px;animation:fadeD .7s ease}
  .hdr-badge{display:inline-block;font-family:var(--mono);font-size:10px;color:var(--green);border:1px solid var(--gdim);padding:4px 14px;letter-spacing:3px;margin-bottom:16px}
  .hdr h1{font-family:var(--display);font-size:clamp(28px,5.5vw,52px);font-weight:900;color:#fff;letter-spacing:5px;text-transform:uppercase;line-height:1.05}
  .hdr h1 em{color:var(--green);font-style:normal}
  .hdr p{margin-top:10px;color:var(--dim2);font-size:14px;letter-spacing:1px;font-weight:300}

  /* SEARCH */
  .srch{display:flex;margin-bottom:36px;border:1px solid var(--border);background:var(--panel);position:relative;animation:fadeU .6s ease .1s both}
  .srch::before{content:'';position:absolute;inset:-1px;background:linear-gradient(90deg,var(--gdim),transparent 60%);pointer-events:none}
  .srch-pfx{padding:0 16px;color:var(--green);font-family:var(--mono);font-size:13px;display:flex;align-items:center;border-right:1px solid var(--border);white-space:nowrap}
  .srch-inp{flex:1;background:transparent;border:none;outline:none;color:var(--green);font-family:var(--mono);font-size:16px;padding:18px 16px;letter-spacing:1px;min-width:0}
  .srch-inp::placeholder{color:var(--dim)}
  .srch-btn{background:var(--green);color:var(--bg);border:none;cursor:pointer;font-family:var(--display);font-size:10px;font-weight:700;letter-spacing:2px;padding:0 24px;text-transform:uppercase;transition:background .2s;flex-shrink:0}
  .srch-btn:hover{background:#fff}
  .srch-btn:disabled{opacity:.35;cursor:not-allowed}
  .srch-btn.busy{background:var(--yellow);animation:pulse 1s infinite}

  /* SCANNING */
  .scan-box{border:1px solid var(--border);background:var(--panel);padding:44px;text-align:center;margin-bottom:28px;position:relative;overflow:hidden}
  .scan-box::after{content:'';position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--green),transparent);animation:scanLine 2s linear infinite;top:0}
  .scan-lbl{font-family:var(--display);font-size:12px;color:var(--green);letter-spacing:4px;margin-bottom:10px}
  .scan-ch{font-family:var(--mono);font-size:20px;color:#fff;margin-bottom:22px}
  .scan-steps{display:flex;flex-direction:column;gap:7px;max-width:340px;margin:0 auto;text-align:left}
  .scan-step{font-family:var(--mono);font-size:11px;color:var(--dim2);display:flex;align-items:center;gap:10px;transition:color .3s}
  .scan-step.on{color:var(--green)}
  .sdot{width:7px;height:7px;border-radius:50%;border:1px solid var(--dim2);flex-shrink:0;transition:all .3s}
  .scan-step.on .sdot{background:var(--green);border-color:var(--green);box-shadow:0 0 8px var(--green);animation:pulse 1s infinite}
  .scan-step.done .sdot{background:var(--dim2);border-color:var(--dim2)}

  /* RESULT HEADER */
  .res-hdr{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid var(--border);animation:fadeU .4s ease}
  .res-ch{font-family:var(--display);font-size:19px;font-weight:700;color:#fff;letter-spacing:2px}
  .res-ch small{font-size:11px;font-family:var(--mono);color:var(--dim2);display:block;margin-top:3px;font-weight:400;letter-spacing:1px}
  .live-badge{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:9px;color:var(--green);border:1px solid var(--gdim);padding:2px 8px;margin-top:5px;letter-spacing:2px}
  .live-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:pulse 1.5s infinite}
  .sim-badge{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:9px;color:var(--dim2);border:1px solid var(--border);padding:2px 8px;margin-top:5px;letter-spacing:2px}

  /* RISK BADGE */
  .risk{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:110px;padding:12px 18px;border:1px solid;font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:2px}
  .risk .rs{font-size:38px;line-height:1}
  .risk .rl{font-size:9px;letter-spacing:3px;margin-top:3px}
  .risk.low{border-color:var(--green);color:var(--green)}
  .risk.medium{border-color:var(--yellow);color:var(--yellow)}
  .risk.high{border-color:var(--red);color:var(--red);animation:glowRed 2s ease-in-out infinite}

  /* GRIDS */
  .g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:14px}
  .g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;margin-bottom:14px}
  .g4{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:14px}

  /* PANEL */
  .pnl{background:var(--panel);border:1px solid var(--border);padding:18px;position:relative;animation:fadeU .45s ease both}
  .pnl::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--gdim),transparent)}
  .pnl-t{font-family:var(--mono);font-size:9px;color:var(--green);letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .pnl-t::after{content:'';flex:1;height:1px;background:var(--border)}

  /* METRIC CARDS */
  .mc{background:var(--panel);border:1px solid var(--border);padding:18px;position:relative;animation:fadeU .45s ease both}
  .mc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
  .mc.g::before{background:var(--green)}.mc.y::before{background:var(--yellow)}.mc.r::before{background:var(--red)}.mc.b::before{background:var(--blue)}.mc.p::before{background:var(--purple)}
  .ml{font-family:var(--mono);font-size:9px;color:var(--dim2);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
  .mv{font-family:var(--display);font-size:28px;font-weight:700;line-height:1;margin-bottom:3px}
  .mv.g{color:var(--green)}.mv.y{color:var(--yellow)}.mv.r{color:var(--red)}.mv.b{color:var(--blue)}.mv.p{color:var(--purple)}
  .ms{font-size:11px;color:var(--dim2);font-family:var(--mono)}

  /* BAR */
  .bar{margin-bottom:12px}
  .bar-i{display:flex;justify-content:space-between;margin-bottom:5px;font-family:var(--mono);font-size:10px;color:var(--dim2)}
  .bar-i span:last-child{color:var(--text)}
  .bar-t{height:5px;background:var(--border);position:relative;overflow:hidden}
  .bar-f{height:100%;position:absolute;left:0;top:0;transition:width 1.3s cubic-bezier(.4,0,.2,1)}
  .bar-f.g{background:var(--green);box-shadow:0 0 6px var(--gdim)}
  .bar-f.y{background:var(--yellow)}.bar-f.r{background:var(--red);box-shadow:0 0 6px var(--rdim)}.bar-f.b{background:var(--blue)}

  /* SIGNALS */
  .sigs{display:flex;flex-direction:column;gap:8px}
  .sig{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);background:var(--panel2);font-size:12px;line-height:1.4}
  .sig.ok{border-left:2px solid var(--green)}.sig.warn{border-left:2px solid var(--yellow)}.sig.danger{border-left:2px solid var(--red)}
  .sig-ic{font-size:13px;flex-shrink:0;margin-top:1px}
  .sig strong{font-weight:600;color:#fff;display:block;margin-bottom:1px;font-size:12px}
  .sig span{color:var(--dim2);font-size:11px}

  /* TIMELINE CHART */
  .chart{width:100%;height:120px;position:relative}
  .chart svg{width:100%;height:100%}
  .chart-lbl{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--dim);margin-top:4px}

  /* REAL DATA PANEL */
  .rd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
  .rd-item{padding:10px 12px;border:1px solid var(--border);background:var(--panel2)}
  .rd-lbl{font-family:var(--mono);font-size:9px;color:var(--dim2);letter-spacing:2px;margin-bottom:4px;text-transform:uppercase}
  .rd-val{font-family:var(--mono);font-size:13px;color:var(--text)}
  .rd-val.g{color:var(--green)}.rd-val.y{color:var(--yellow)}.rd-val.r{color:var(--red)}

  /* CHAT TABLE */
  .tbl{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px}
  .tbl th{color:var(--dim2);letter-spacing:2px;font-size:9px;text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);font-weight:400}
  .tbl td{padding:7px 10px;border-bottom:1px solid #0a1018;color:var(--text);vertical-align:middle}
  .tbl tr:hover td{background:var(--panel2)}
  .sus{color:var(--red)!important}.leg{color:var(--green)!important}.neu{color:var(--yellow)!important}
  .pill{display:inline-block;padding:1px 7px;font-size:9px;letter-spacing:1px}
  .pr{background:var(--rdim);color:var(--red);border:1px solid var(--rdim)}
  .pg{background:var(--gdim);color:var(--green);border:1px solid var(--gdim)}
  .py{background:var(--ydim);color:var(--yellow);border:1px solid var(--ydim)}

  /* VODS */
  .vod-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11px}
  .vod-row:last-child{border-bottom:none}
  .vod-title{color:var(--dim2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:12px}
  .vod-views{color:var(--text);flex-shrink:0}

  /* VERDICT */
  .verdict{border:1px solid;padding:22px;margin-bottom:14px;animation:fadeU .4s ease}
  .verdict.low{border-color:var(--green)}.verdict.medium{border-color:var(--yellow)}.verdict.high{border-color:var(--red);animation:fadeU .4s ease,glowRed 2s ease-in-out infinite}
  .vt{font-family:var(--display);font-size:10px;letter-spacing:3px;margin-bottom:7px}
  .verdict.low .vt{color:var(--green)}.verdict.medium .vt{color:var(--yellow)}.verdict.high .vt{color:var(--red)}
  .vb{font-size:14px;color:var(--text);line-height:1.65;font-weight:300}

  /* HOW IT WORKS */
  .how{margin-top:52px;padding-top:36px;border-top:1px solid var(--border)}
  .how-t{font-family:var(--display);font-size:16px;font-weight:700;letter-spacing:4px;color:#fff;margin-bottom:6px;text-transform:uppercase}
  .how-s{font-family:var(--mono);font-size:10px;color:var(--dim2);letter-spacing:2px;margin-bottom:28px}
  .how-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
  .how-c{background:var(--panel);border:1px solid var(--border);padding:18px;position:relative}
  .how-c::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--gdim),transparent)}
  .how-n{font-family:var(--display);font-size:32px;font-weight:900;color:var(--border);line-height:1;margin-bottom:10px}
  .how-ct{font-family:var(--display);font-size:10px;font-weight:700;letter-spacing:2px;color:var(--green);text-transform:uppercase;margin-bottom:6px}
  .how-cx{font-size:12px;color:var(--dim2);line-height:1.6;font-weight:300}

  .disc{margin-top:36px;padding:14px;border:1px solid var(--border);font-family:var(--mono);font-size:10px;color:var(--dim2);line-height:1.6;letter-spacing:.4px}
  .disc strong{color:var(--yellow)}
  .err{border:1px solid var(--red);color:var(--red);font-family:var(--mono);font-size:12px;padding:14px 18px;margin-bottom:14px}

  @keyframes fadeD{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeU{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
  @keyframes scanLine{from{top:-2px}to{top:100%}}
  @keyframes glowRed{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 18px 2px rgba(255,59,107,.18)}}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
  .cur::after{content:'_';animation:blink 1s step-end infinite;color:var(--green)}
`;

const STEPS = [
  "Resolving channel identity...",
  "Fetching live stream metadata...",
  "Pulling follower database...",
  "Sampling chat activity...",
  "Analyzing username entropy...",
  "Cross-referencing account ages...",
  "Computing engagement ratios...",
  "Running anomaly detection...",
  "Generating forensic report...",
];

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function colorClass(v, lo, hi) {
  return v <= lo ? "g" : v <= hi ? "y" : "r";
}
function colorClassInv(v, lo, hi) {
  return v >= hi ? "g" : v >= lo ? "y" : "r";
}

function Bar({ label, value, color }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 120); return () => clearTimeout(t); }, [value]);
  return (
    <div className="bar">
      <div className="bar-i"><span>{label}</span><span>{value}%</span></div>
      <div className="bar-t"><div className={`bar-f ${color}`} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

function Signal({ s }) {
  const ic = s.type === "ok" ? "✓" : s.type === "warn" ? "⚠" : "✗";
  return (
    <div className={`sig ${s.type}`}>
      <span className="sig-ic">{ic}</span>
      <div><strong>{s.title}</strong><span>{s.detail}</span></div>
    </div>
  );
}

function TimelineChart({ data, riskLevel }) {
  if (!data || data.length < 2) return null;
  const sorted = [...data].sort((a, b) => b.minutesAgo - a.minutesAgo);
  const maxV = Math.max(...sorted.map(d => d.viewers), 1);
  const minV = Math.min(...sorted.map(d => d.viewers));
  const pad = 8;
  const W = 600, H = 100;
  const pts = sorted.map((d, i) => {
    const x = pad + (i / (sorted.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (d.viewers - minV) / (maxV - minV || 1)) * (H - pad * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const fill = pts.join(" ") + ` ${W - pad},${H} ${pad},${H}`;
  const stroke = riskLevel === "HIGH" ? "#ff3b6b" : riskLevel === "MEDIUM" ? "#ffe040" : "#00ffe7";
  const fillColor = riskLevel === "HIGH" ? "rgba(255,59,107,0.08)" : riskLevel === "MEDIUM" ? "rgba(255,224,64,0.06)" : "rgba(0,255,231,0.06)";

  return (
    <div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <polygon points={fill} fill={fillColor} />
          <polyline points={polyline} fill="none" stroke={stroke} strokeWidth="1.5" />
          {sorted.map((d, i) => {
            const [x, y] = pts[i].split(",").map(Number);
            return <circle key={i} cx={x} cy={y} r="2.5" fill={stroke} />;
          })}
        </svg>
      </div>
      <div className="chart-lbl">
        <span>60m ago</span>
        <span>30m ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}

export default function App() {
  const [ch, setCh] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  async function scan() {
    if (!ch.trim() || busy) return;
    setBusy(true); setResult(null); setError(null); setStep(0);
    let i = 0;
    timer.current = setInterval(() => { i++; setStep(i); if (i >= STEPS.length - 1) clearInterval(timer.current); }, 480);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: ch.trim() }),
      });
      const data = await res.json();
      clearInterval(timer.current);
      if (!res.ok || data.error) throw new Error(data.error || "Analysis failed");
      setStep(STEPS.length);
      await new Promise(r => setTimeout(r, 350));
      setResult(data);
    } catch (e) {
      clearInterval(timer.current);
      setError(e.message || "Analysis failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const rl = result?.riskLevel?.toLowerCase() || "low";
  const rd = result?.realData;
  const mb = result?.metricsBreakdown;

  return (
    <>
      <style>{style}</style>
      <div className="scanline" />
      <div className="app">

        {/* HEADER */}
        <div className="hdr">
          <div className="hdr-badge">⬡ FORENSIC ANALYSIS SYSTEM v3.0</div>
          <h1>TWITCH<em>BOT</em>SCAN</h1>
          <p>View-bot detection · Chat authenticity · Stream forensics</p>
        </div>

        {/* SEARCH */}
        <div className="srch">
          <div className="srch-pfx">twitch.tv/</div>
          <input className="srch-inp cur" value={ch} onChange={e => setCh(e.target.value)}
            onKeyDown={e => e.key === "Enter" && scan()} placeholder="channel_name" spellCheck={false} maxLength={50} />
          <button className={`srch-btn${busy ? " busy" : ""}`} onClick={scan} disabled={busy || !ch.trim()}>
            {busy ? "SCANNING" : "ANALYZE"}
          </button>
        </div>

        {/* SCANNING */}
        {busy && (
          <div className="scan-box">
            <div className="scan-lbl">▶ INITIATING FORENSIC SCAN</div>
            <div className="scan-ch">twitch.tv/{ch}</div>
            <div className="scan-steps">
              {STEPS.map((s, i) => (
                <div key={i} className={`scan-step${i === step ? " on" : i < step ? " done" : ""}`}>
                  <div className="sdot" />{s}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="err">✗ {error}</div>}

        {result && !busy && (
          <>
            {/* RESULT HEADER */}
            <div className="res-hdr">
              <div>
                <div className="res-ch">
                  twitch.tv/{result.channel}
                  <small>SCAN COMPLETE · {new Date().toLocaleTimeString()}</small>
                </div>
                {result.usedRealData
                  ? <div className="live-badge"><span className="live-dot" />LIVE TWITCH DATA</div>
                  : <div className="sim-badge">◈ AI SIMULATION</div>
                }
                {rd?.broadcasterType === "partner" && (
                  <div style={{ marginTop: 4 }}>
                    <span className="pill pg">✓ TWITCH PARTNER</span>
                  </div>
                )}
                {rd?.broadcasterType === "affiliate" && (
                  <div style={{ marginTop: 4 }}>
                    <span className="pill py">✓ TWITCH AFFILIATE</span>
                  </div>
                )}
              </div>
              <div className={`risk ${rl}`}>
                <span className="rs">{result.riskScore}</span>
                <span className="rl">{result.riskLevel} RISK</span>
              </div>
            </div>

            {/* REAL DATA INFO ROW */}
            {rd && (
              <div className="pnl" style={{ marginBottom: 14 }}>
                <div className="pnl-t">Live Channel Info</div>
                <div className="rd-grid">
                  <div className="rd-item">
                    <div className="rd-lbl">Status</div>
                    <div className={`rd-val ${rd.isLive ? "g" : "r"}`}>{rd.isLive ? "🔴 LIVE" : "OFFLINE"}</div>
                  </div>
                  {rd.gameName && (
                    <div className="rd-item">
                      <div className="rd-lbl">Category</div>
                      <div className="rd-val">{rd.gameName}</div>
                    </div>
                  )}
                  {rd.language && (
                    <div className="rd-item">
                      <div className="rd-lbl">Language</div>
                      <div className="rd-val">{rd.language.toUpperCase()}</div>
                    </div>
                  )}
                  {rd.accountAgeDays != null && (
                    <div className="rd-item">
                      <div className="rd-lbl">Account Age</div>
                      <div className={`rd-val ${colorClassInv(rd.accountAgeDays, 180, 365)}`}>{rd.accountAgeDays} days</div>
                    </div>
                  )}
                  {rd.streamUptimeMinutes != null && rd.isLive && (
                    <div className="rd-item">
                      <div className="rd-lbl">Stream Uptime</div>
                      <div className="rd-val">{rd.streamUptimeMinutes >= 60 ? `${Math.floor(rd.streamUptimeMinutes / 60)}h ${rd.streamUptimeMinutes % 60}m` : `${rd.streamUptimeMinutes}m`}</div>
                    </div>
                  )}
                  {rd.avgClipViews > 0 && (
                    <div className="rd-item">
                      <div className="rd-lbl">Avg Clip Views</div>
                      <div className="rd-val">{fmt(rd.avgClipViews)}</div>
                    </div>
                  )}
                  {rd.totalVideoViews > 0 && (
                    <div className="rd-item">
                      <div className="rd-lbl">Total Views</div>
                      <div className="rd-val">{fmt(rd.totalVideoViews)}</div>
                    </div>
                  )}
                  {rd.tags?.length > 0 && (
                    <div className="rd-item" style={{ gridColumn: "span 2" }}>
                      <div className="rd-lbl">Tags</div>
                      <div className="rd-val" style={{ fontSize: 11, color: "var(--dim2)" }}>{rd.tags.join(" · ")}</div>
                    </div>
                  )}
                </div>
                {rd.streamTitle && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--panel2)", border: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim2)" }}>
                    <span style={{ color: "var(--dim)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Title · </span>
                    {rd.streamTitle}
                  </div>
                )}
              </div>
            )}

            {/* METRIC CARDS */}
            <div className="g4">
              <div className={`mc b`}>
                <div className="ml">Live Viewers</div>
                <div className="mv b">{fmt(result.liveViewers)}</div>
                <div className="ms">{fmt(result.followersTotal)} followers</div>
              </div>
              <div className={`mc ${colorClassInv(result.engagementRate, 3, 10)}`}>
                <div className="ml">Chat Engagement</div>
                <div className={`mv ${colorClassInv(result.engagementRate, 3, 10)}`}>{result.engagementRate?.toFixed(1)}%</div>
                <div className="ms">{result.chattersActive} chatters</div>
              </div>
              <div className={`mc ${colorClassInv(result.avgAccountAgeDays, 60, 180)}`}>
                <div className="ml">Avg Account Age</div>
                <div className={`mv ${colorClassInv(result.avgAccountAgeDays, 60, 180)}`}>{result.avgAccountAgeDays}d</div>
                <div className="ms">{result.messagesPerMinute?.toFixed(1)} msg/min</div>
              </div>
              <div className={`mc ${colorClass(result.suspiciousAccounts, 5, 20)}`}>
                <div className="ml">Suspicious Accts</div>
                <div className={`mv ${colorClass(result.suspiciousAccounts, 5, 20)}`}>{result.suspiciousAccounts}</div>
                <div className="ms">detected in chat</div>
              </div>
              <div className={`mc ${colorClass(result.viewerFollowerRatio ?? 5, 5, 15)}`}>
                <div className="ml">Viewer/Follower</div>
                <div className={`mv ${colorClass(result.viewerFollowerRatio ?? 5, 5, 15)}`}>{result.viewerFollowerRatio?.toFixed(1)}%</div>
                <div className="ms">normal: 1–5%</div>
              </div>
              <div className={`mc ${colorClass(result.botInjectionEvents ?? 0, 0, 2)}`}>
                <div className="ml">Bot Injections</div>
                <div className={`mv ${colorClass(result.botInjectionEvents ?? 0, 0, 2)}`}>{result.botInjectionEvents ?? 0}</div>
                <div className="ms">spike events</div>
              </div>
              <div className="mc g">
                <div className="ml">Unique Chatters</div>
                <div className="mv g">{result.uniqueChattersLast10Min}</div>
                <div className="ms">last 10 min</div>
              </div>
              <div className={`mc ${colorClass(mb?.viewerSpikeProbability ?? 0, 30, 60)}`}>
                <div className="ml">Spike Risk</div>
                <div className={`mv ${colorClass(mb?.viewerSpikeProbability ?? 0, 30, 60)}`}>{mb?.viewerSpikeProbability}%</div>
                <div className="ms">inflation probability</div>
              </div>
            </div>

            {/* VIEWER TIMELINE + BREAKDOWN */}
            <div className="g2">
              <div className="pnl">
                <div className="pnl-t">Viewer Timeline (60 min)</div>
                <TimelineChart data={result.viewerTimeline} riskLevel={result.riskLevel} />
              </div>
              <div className="pnl">
                <div className="pnl-t">Detection Metrics</div>
                {mb && (<>
                  <Bar label="Chat Engagement" value={mb.chatEngagement} color={mb.chatEngagement > 40 ? "g" : mb.chatEngagement > 15 ? "b" : "r"} />
                  <Bar label="Account Age Suspicion" value={mb.accountAgeSuspicion} color={mb.accountAgeSuspicion < 30 ? "g" : mb.accountAgeSuspicion < 60 ? "y" : "r"} />
                  <Bar label="Username Entropy" value={mb.usernameEntropyScore} color={mb.usernameEntropyScore < 30 ? "g" : mb.usernameEntropyScore < 60 ? "y" : "r"} />
                  <Bar label="Viewer Spike Risk" value={mb.viewerSpikeProbability} color={mb.viewerSpikeProbability < 30 ? "g" : mb.viewerSpikeProbability < 60 ? "y" : "r"} />
                  <Bar label="Follow-bot Likelihood" value={mb.followBotLikelihood} color={mb.followBotLikelihood < 30 ? "g" : mb.followBotLikelihood < 60 ? "y" : "r"} />
                  <Bar label="Viewer/Follower Anomaly" value={mb.viewerFollowerAnomaly} color={mb.viewerFollowerAnomaly < 30 ? "g" : mb.viewerFollowerAnomaly < 60 ? "y" : "r"} />
                </>)}
              </div>
            </div>

            {/* SIGNALS + VODS */}
            <div className="g2">
              <div className="pnl">
                <div className="pnl-t">Anomaly Signals</div>
                <div className="sigs">{result.signals?.map((s, i) => <Signal key={i} s={s} />)}</div>
              </div>
              {rd?.recentVods?.length > 0 && (
                <div className="pnl">
                  <div className="pnl-t">Recent VOD History</div>
                  {rd.recentVods.map((v, i) => (
                    <div className="vod-row" key={i}>
                      <div className="vod-title">{v.title || "Untitled stream"}</div>
                      <div className="vod-views">{fmt(v.views)} views</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CHAT SAMPLE */}
            <div className="pnl" style={{ marginBottom: 14 }}>
              <div className="pnl-t">Chat Sample Analysis (last 10 min)</div>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>USERNAME</th><th>MSGS/10M</th><th>ACCT AGE</th><th>NEW JOIN</th><th>LAST MESSAGE</th><th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.chatSample?.map((u, i) => (
                      <tr key={i}>
                        <td className={u.status === "suspicious" ? "sus" : u.status === "legit" ? "leg" : "neu"}>{u.username}</td>
                        <td>{u.messagesIn10min}</td>
                        <td>{u.accountAgeDays < 30 ? <span className="sus">{u.accountAgeDays}d</span> : `${u.accountAgeDays}d`}</td>
                        <td>{u.joinedRecently ? <span className="sus">YES</span> : <span style={{ color: "var(--dim2)" }}>no</span>}</td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dim2)" }}>{u.lastMsg}</td>
                        <td><span className={`pill ${u.status === "suspicious" ? "pr" : u.status === "legit" ? "pg" : "py"}`}>{u.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* VERDICT */}
            <div className={`verdict ${rl}`}>
              <div className="vt">
                {result.riskLevel === "LOW" ? "✓ VERDICT: CHANNEL APPEARS LEGITIMATE" :
                  result.riskLevel === "MEDIUM" ? "⚠ VERDICT: SUSPICIOUS ACTIVITY DETECTED" :
                    "✗ VERDICT: HIGH PROBABILITY OF VIEW-BOTTING"}
              </div>
              <div className="vb">{result.verdict}</div>
            </div>
          </>
        )}

        {/* HOW IT WORKS */}
        <div className="how">
          <div className="how-t">How It Works</div>
          <div className="how-s">// DETECTION METHODOLOGY</div>
          <div className="how-g">
            {[
              { n: "01", t: "Viewer/Chatter Ratio", x: "Legitimate streams see 1–5% of viewers chatting. Near-zero engagement with thousands of viewers is the primary indicator of ghost bot viewers." },
              { n: "02", t: "Account Age Analysis", x: "Bot farms create accounts in bulk. Clusters of accounts younger than 30 days strongly suggest coordinated bot deployment." },
              { n: "03", t: "Username Entropy", x: "Bots get randomized names with high character entropy — strings like 'user48293kl'. Real users pick memorable names. Entropy scoring flags clusters." },
              { n: "04", t: "Viewer Timeline Spikes", x: "Organic growth is gradual. 500+ viewers appearing in under a minute is statistically improbable — a signature of a bot injection event." },
              { n: "05", t: "Viewer/Follower Ratio", x: "Healthy channels show 1–5% of followers watching live. Ratios above 15% suggest viewer inflation. Below 0.1% may indicate follower bots." },
              { n: "06", t: "VOD View Consistency", x: "Botted channels often have wildly inconsistent VOD views — huge live counts but near-zero replay views, exposing the artificial inflation." },
            ].map(c => (
              <div className="how-c" key={c.n}>
                <div className="how-n">{c.n}</div>
                <div className="how-ct">{c.t}</div>
                <div className="how-cx">{c.x}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="disc">
          <strong>⚠ DISCLAIMER:</strong> This tool uses AI-generated simulation grounded by real Twitch API data where available.
          Chat activity analysis is simulated — real chat scraping requires IRC access beyond standard API scope.
          Results are for educational purposes. Do not use to make accusations against creators.
        </div>
      </div>
    </>
  );
}
