// @ts-nocheck
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
    --orange:#ff8c42;--odim:#ff8c4233;
    --text:#c8d8e8;--dim:#3a5a6a;--dim2:#4a6a7a;
    --mono:'Share Tech Mono',monospace;
    --display:'Orbitron',monospace;
    --body:'Rajdhani',sans-serif;
  }
  body{background:var(--bg);color:var(--text);font-family:var(--body);min-height:100vh;overflow-x:hidden}
  .scanline{position:fixed;inset:0;pointer-events:none;z-index:1000;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,231,.012) 2px,rgba(0,255,231,.012) 4px)}

  .app{max-width:1180px;margin:0 auto;padding:32px 18px 80px;position:relative;z-index:1}

  /* HEADER */
  .hdr{text-align:center;margin-bottom:44px;animation:fadeD .7s ease}
  .hdr-badge{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;color:var(--dim2);border:1px solid var(--border2);padding:5px 16px;letter-spacing:3px;margin-bottom:20px}
  .hdr-badge-dot{width:7px;height:7px;border-radius:50%;border:1px solid var(--dim2);flex-shrink:0}
  .hdr-title{font-family:var(--display);font-weight:900;text-transform:uppercase;line-height:1.0;letter-spacing:6px}
  .hdr-line1{display:block;font-size:clamp(36px,7vw,72px);color:#fff}
  .hdr-line2{display:block;font-size:clamp(36px,7vw,72px)}
  .hdr-line2 em{color:var(--green);font-style:normal}
  .hdr-line2 span{color:#fff}
  .hdr p{margin-top:14px;color:var(--dim2);font-size:13px;letter-spacing:1.5px;font-family:var(--mono);font-weight:300}

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
  .real-chatters-badge{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:9px;color:var(--blue);border:1px solid var(--bdim);padding:2px 8px;margin-top:4px;letter-spacing:2px}

  /* RISK BADGE */
  .risk{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:120px;padding:14px 20px;border:1px solid;font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:2px}
  .risk .rs{font-size:42px;line-height:1}
  .risk .rl{font-size:9px;letter-spacing:3px;margin-top:3px}
  .risk .rp{font-size:9px;color:var(--dim2);margin-top:2px;font-family:var(--mono);letter-spacing:1px}
  .risk.low{border-color:var(--green);color:var(--green)}
  .risk.medium{border-color:var(--yellow);color:var(--yellow)}
  .risk.high{border-color:var(--red);color:var(--red);animation:glowRed 2s ease-in-out infinite}

  /* GRIDS */
  .g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:14px}
  .g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:14px;margin-bottom:14px}
  .g4{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:14px}
  .g5{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:14px;margin-bottom:14px}

  /* PANEL */
  .pnl{background:var(--panel);border:1px solid var(--border);padding:18px;position:relative;animation:fadeU .45s ease both}
  .pnl::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--gdim),transparent)}
  .pnl-t{font-family:var(--mono);font-size:9px;color:var(--green);letter-spacing:3px;text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .pnl-t::after{content:'';flex:1;height:1px;background:var(--border)}
  .pnl-t .real-tag{font-size:8px;color:var(--blue);border:1px solid var(--bdim);padding:1px 5px;letter-spacing:1px;margin-left:4px}

  /* METRIC CARDS */
  .mc{background:var(--panel);border:1px solid var(--border);padding:18px;position:relative;animation:fadeU .45s ease both}
  .mc::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
  .mc.g::before{background:var(--green)}.mc.y::before{background:var(--yellow)}.mc.r::before{background:var(--red)}.mc.b::before{background:var(--blue)}.mc.p::before{background:var(--purple)}.mc.o::before{background:var(--orange)}
  .ml{font-family:var(--mono);font-size:9px;color:var(--dim2);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}
  .mv{font-family:var(--display);font-size:26px;font-weight:700;line-height:1;margin-bottom:3px}
  .mv.g{color:var(--green)}.mv.y{color:var(--yellow)}.mv.r{color:var(--red)}.mv.b{color:var(--blue)}.mv.p{color:var(--purple)}.mv.o{color:var(--orange)}
  .ms{font-size:11px;color:var(--dim2);font-family:var(--mono)}
  .mc .real-tag{position:absolute;top:6px;right:8px;font-family:var(--mono);font-size:8px;color:var(--blue);border:1px solid var(--bdim);padding:1px 4px;letter-spacing:1px}

  /* BAR */
  .bar{margin-bottom:12px}
  .bar-i{display:flex;justify-content:space-between;margin-bottom:5px;font-family:var(--mono);font-size:10px;color:var(--dim2)}
  .bar-i span:last-child{color:var(--text)}
  .bar-t{height:5px;background:var(--border);position:relative;overflow:hidden}
  .bar-f{height:100%;position:absolute;left:0;top:0;transition:width 1.3s cubic-bezier(.4,0,.2,1)}
  .bar-f.g{background:var(--green);box-shadow:0 0 6px var(--gdim)}
  .bar-f.y{background:var(--yellow)}.bar-f.r{background:var(--red);box-shadow:0 0 6px var(--rdim)}.bar-f.b{background:var(--blue)}.bar-f.o{background:var(--orange)}

  /* SIGNALS */
  .sigs{display:flex;flex-direction:column;gap:8px}
  .sig{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);background:var(--panel2);font-size:12px;line-height:1.4}
  .sig.ok{border-left:2px solid var(--green)}.sig.warn{border-left:2px solid var(--yellow)}.sig.danger{border-left:2px solid var(--red)}
  .sig-ic{font-size:13px;flex-shrink:0;margin-top:1px}
  .sig strong{font-weight:600;color:#fff;display:block;margin-bottom:1px;font-size:12px}
  .sig span{color:var(--dim2);font-size:11px}

  /* PRE-COMPUTED FLAGS */
  .flag{display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border:1px solid var(--border);background:var(--panel2);font-size:11px;line-height:1.5;font-family:var(--mono)}
  .flag.HIGH{border-left:2px solid var(--red)}.flag.MEDIUM{border-left:2px solid var(--yellow)}.flag.OK{border-left:2px solid var(--green)}
  .flag-sev{font-size:8px;padding:2px 5px;letter-spacing:1px;flex-shrink:0;margin-top:2px}
  .flag-sev.HIGH{background:var(--rdim);color:var(--red);border:1px solid var(--rdim)}
  .flag-sev.MEDIUM{background:var(--ydim);color:var(--yellow);border:1px solid var(--ydim)}
  .flag-sev.OK{background:var(--gdim);color:var(--green);border:1px solid var(--gdim)}
  .flag-msg{color:var(--text)}
  .flag-val{color:var(--dim2);font-size:10px}

  /* AGE DISTRIBUTION */
  .age-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-family:var(--mono);font-size:10px}
  .age-bar-lbl{color:var(--dim2);width:80px;flex-shrink:0;text-align:right}
  .age-bar-track{flex:1;height:14px;background:var(--border);position:relative;overflow:hidden}
  .age-bar-fill{height:100%;position:absolute;left:0;top:0;transition:width 1s ease}
  .age-bar-val{color:var(--text);width:40px;flex-shrink:0}

  /* TIMELINE CHART */
  .chart{width:100%;height:120px;position:relative}
  .chart svg{width:100%;height:100%}
  .chart-lbl{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--dim);margin-top:4px}

  /* REAL DATA PANEL */
  .rd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px}
  .rd-item{padding:10px 12px;border:1px solid var(--border);background:var(--panel2)}
  .rd-lbl{font-family:var(--mono);font-size:9px;color:var(--dim2);letter-spacing:2px;margin-bottom:4px;text-transform:uppercase}
  .rd-val{font-family:var(--mono);font-size:13px;color:var(--text)}
  .rd-val.g{color:var(--green)}.rd-val.y{color:var(--yellow)}.rd-val.r{color:var(--red)}.rd-val.b{color:var(--blue)}.rd-val.o{color:var(--orange)}

  /* TABLE */
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

  /* DIVIDER */
  .section-div{height:1px;background:linear-gradient(90deg,var(--gdim),transparent);margin:14px 0}

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
  "Sampling live chat population...",
  "Fetching real chatter account ages...",
  "Running username entropy analysis...",
  "Analyzing VOD & clip performance...",
  "Computing engagement anomalies...",
  "Running deterministic bot flags...",
  "Deep AI forensic synthesis...",
  "Generating forensic report...",
];

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function fmtExact(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function colorClass(v, lo, hi) {
  return v <= lo ? "g" : v <= hi ? "y" : "r";
}
function colorClassInv(v, lo, hi) {
  return v >= hi ? "g" : v >= lo ? "y" : "r";
}

function Bar({ label, value, color, note = "" }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(value), 120); return () => clearTimeout(t); }, [value]);
  return (
    <div className="bar">
      <div className="bar-i"><span>{label}{note && <span style={{ color: "var(--dim)", fontSize: 9, marginLeft: 6 }}>{note}</span>}</span><span>{value}%</span></div>
      <div className="bar-t"><div className={`bar-f ${color}`} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

function AgeBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 150); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="age-bar-row">
      <div className="age-bar-lbl">{label}</div>
      <div className="age-bar-track">
        <div className="age-bar-fill" style={{ width: `${w}%`, background: color }} />
      </div>
      <div className="age-bar-val">{count} <span style={{ color: "var(--dim2)", fontSize: 9 }}>({pct}%)</span></div>
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

function PreFlag({ f }) {
  return (
    <div className={`flag ${f.severity}`}>
      <span className={`flag-sev ${f.severity}`}>{f.severity}</span>
      <div>
        <div className="flag-msg">{f.msg}</div>
        {f.value && <div className="flag-val">measured: {f.value}</div>}
      </div>
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
        <span>60m ago</span><span>30m ago</span><span>Now</span>
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
    timer.current = setInterval(() => {
      i++;
      setStep(i);
      if (i >= STEPS.length - 1) clearInterval(timer.current);
    }, 520);
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
  const ageStats = rd?.accountAgeStats;
  const flags = rd?.preComputedFlags || [];

  return (
    <>
      <style>{style}</style>
      <div className="scanline" />
      <div className="app">

        {/* HEADER */}
        <div className="hdr">
          <div className="hdr-badge">
            <span className="hdr-badge-dot" />
            FORENSIC ANALYSIS TOOL v4.0
          </div>
          <div className="hdr-title">
            <span className="hdr-line1">TWITCH</span>
            <span className="hdr-line2"><em>BOT</em><span>SCANNER</span></span>
          </div>
          <p>View-bot detection · Real chatter analysis · Deep AI forensics</p>
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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {result.usedRealData
                    ? <div className="live-badge"><span className="live-dot" />LIVE TWITCH DATA</div>
                    : <div className="sim-badge">◈ AI SIMULATION</div>
                  }
                  {result.hasRealChatters && (
                    <div className="real-chatters-badge">⬡ REAL CHATTER ANALYSIS</div>
                  )}
                  {rd?.broadcasterType === "partner" && (
                    <span className="pill pg">✓ TWITCH PARTNER</span>
                  )}
                  {rd?.broadcasterType === "affiliate" && (
                    <span className="pill py">✓ TWITCH AFFILIATE</span>
                  )}
                </div>
                {result.preComputedRisk && (
                  <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim2)" }}>
                    ALGORITHMIC PRE-SCORE: <span style={{ color: result.preComputedRisk === "HIGH" ? "var(--red)" : result.preComputedRisk === "MEDIUM" ? "var(--yellow)" : "var(--green)" }}>{result.preComputedScore}/100 ({result.preComputedRisk})</span>
                    <span style={{ color: "var(--dim)", marginLeft: 8 }}>· AI FINAL: {result.riskScore}/100 ({result.riskLevel})</span>
                  </div>
                )}
              </div>
              <div className={`risk ${rl}`}>
                <span className="rs">{result.riskScore}</span>
                <span className="rl">{result.riskLevel} RISK</span>
                <span className="rp">/100</span>
              </div>
            </div>

            {/* LIVE CHANNEL INFO */}
            {rd && (
              <div className="pnl" style={{ marginBottom: 14 }}>
                <div className="pnl-t">Live Channel Info <span className="real-tag">REAL API DATA</span></div>
                <div className="rd-grid">
                  <div className="rd-item">
                    <div className="rd-lbl">Status</div>
                    <div className={`rd-val ${rd.isLive ? "g" : "r"}`}>{rd.isLive ? "🔴 LIVE" : "OFFLINE"}</div>
                  </div>
                  <div className="rd-item">
                    <div className="rd-lbl">Live Viewers</div>
                    <div className="rd-val b">{fmtExact(result.liveViewers)}</div>
                  </div>
                  <div className="rd-item">
                    <div className="rd-lbl">Followers</div>
                    <div className="rd-val">{fmt(result.followersTotal)}</div>
                  </div>
                  {rd.realChatterCount > 0 && (
                    <div className="rd-item">
                      <div className="rd-lbl">Real Chatters</div>
                      <div className="rd-val b">{fmtExact(rd.realChatterCount)}</div>
                    </div>
                  )}
                  {rd.chatterViewerRatio != null && (
                    <div className="rd-item">
                      <div className="rd-lbl">Chat/Viewer Ratio</div>
                      <div className={`rd-val ${rd.chatterViewerRatio < 0.5 ? "r" : rd.chatterViewerRatio < 2 ? "y" : "g"}`}>
                        {rd.chatterViewerRatio.toFixed(2)}%
                      </div>
                    </div>
                  )}
                  {result.viewerFollowerRatio != null && (
                    <div className="rd-item">
                      <div className="rd-lbl">Viewer/Follower</div>
                      <div className={`rd-val ${result.viewerFollowerRatio > 20 ? "r" : result.viewerFollowerRatio > 10 ? "y" : "g"}`}>
                        {result.viewerFollowerRatio.toFixed(2)}%
                      </div>
                    </div>
                  )}
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
                      <div className="rd-lbl">Channel Age</div>
                      <div className={`rd-val ${colorClassInv(rd.accountAgeDays, 180, 365)}`}>
                        {rd.accountAgeDays >= 365 ? (rd.accountAgeDays / 365).toFixed(1) + "y" : rd.accountAgeDays + "d"}
                      </div>
                    </div>
                  )}
                  {rd.streamUptimeMinutes != null && rd.isLive && (
                    <div className="rd-item">
                      <div className="rd-lbl">Stream Uptime</div>
                      <div className="rd-val">
                        {rd.streamUptimeMinutes >= 60
                          ? `${Math.floor(rd.streamUptimeMinutes / 60)}h ${rd.streamUptimeMinutes % 60}m`
                          : `${rd.streamUptimeMinutes}m`}
                      </div>
                    </div>
                  )}
                  {rd.subCount > 0 && (
                    <div className="rd-item">
                      <div className="rd-lbl">Subscribers</div>
                      <div className="rd-val g">{fmt(rd.subCount)}</div>
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
                      <div className="rd-lbl">All-Time Views</div>
                      <div className="rd-val">{fmt(rd.totalVideoViews)}</div>
                    </div>
                  )}
                  {rd.avgVodToLiveRatio != null && rd.isLive && (
                    <div className="rd-item">
                      <div className="rd-lbl">VOD/Live Ratio</div>
                      <div className={`rd-val ${rd.avgVodToLiveRatio < 0.05 ? "r" : rd.avgVodToLiveRatio < 0.15 ? "y" : "g"}`}>
                        {(rd.avgVodToLiveRatio * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                  {rd.avgEntropy != null && (
                    <div className="rd-item">
                      <div className="rd-lbl">Username Entropy</div>
                      <div className={`rd-val ${rd.avgEntropy > 50 ? "r" : rd.avgEntropy > 25 ? "y" : "g"}`}>
                        {rd.avgEntropy}/100
                      </div>
                    </div>
                  )}
                </div>
                {rd.streamTitle && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--panel2)", border: "1px solid var(--border)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim2)" }}>
                    <span style={{ color: "var(--dim)", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>Title · </span>
                    {rd.streamTitle}
                  </div>
                )}
                {rd.tags?.length > 0 && (
                  <div style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 10, color: "var(--dim2)" }}>
                    {rd.tags.map((t, i) => (
                      <span key={i} style={{ marginRight: 8, padding: "2px 6px", border: "1px solid var(--border)", fontSize: 9 }}>{t}</span>
                    ))}
                  </div>
                )}
                {rd.chatSettings && (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, fontFamily: "var(--mono)", fontSize: 9, color: "var(--dim2)" }}>
                    <span style={{ color: "var(--dim)", letterSpacing: 2 }}>CHAT SETTINGS:</span>
                    {rd.chatSettings.followerMode && <span style={{ color: "var(--yellow)" }}>FOLLOWER-ONLY ({rd.chatSettings.followerModeDuration}min)</span>}
                    {rd.chatSettings.slowMode && <span style={{ color: "var(--yellow)" }}>SLOW-MODE ({rd.chatSettings.slowModeWaitTime}s)</span>}
                    {rd.chatSettings.subscriberMode && <span style={{ color: "var(--green)" }}>SUB-ONLY</span>}
                    {rd.chatSettings.emoteMode && <span style={{ color: "var(--blue)" }}>EMOTE-ONLY</span>}
                    {rd.chatSettings.uniqueChatMode && <span style={{ color: "var(--purple)" }}>UNIQUE-CHAT</span>}
                    {!rd.chatSettings.followerMode && !rd.chatSettings.slowMode && !rd.chatSettings.subscriberMode && (
                      <span>OPEN CHAT</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* METRIC CARDS ROW 1 */}
            <div className="g4">
              <div className="mc b">
                {rd && <span className="real-tag">REAL</span>}
                <div className="ml">Live Viewers</div>
                <div className="mv b">{fmt(result.liveViewers)}</div>
                <div className="ms">{fmtExact(result.liveViewers)} exact</div>
              </div>
              <div className={`mc ${result.engagementRate > 10 ? "g" : result.engagementRate > 2 ? "y" : "r"}`}>
                {rd?.realChatterCount > 0 && <span className="real-tag">REAL</span>}
                <div className="ml">Chat Engagement</div>
                <div className={`mv ${result.engagementRate > 10 ? "g" : result.engagementRate > 2 ? "y" : "r"}`}>
                  {result.engagementRate?.toFixed(2)}%
                </div>
                <div className="ms">{fmtExact(result.chattersActive)} chatters</div>
              </div>
              <div className={`mc ${colorClassInv(result.avgAccountAgeDays, 60, 180)}`}>
                {ageStats && <span className="real-tag">REAL</span>}
                <div className="ml">Avg Acct Age</div>
                <div className={`mv ${colorClassInv(result.avgAccountAgeDays, 60, 180)}`}>{result.avgAccountAgeDays}d</div>
                <div className="ms">{ageStats ? `${ageStats.sampleSize} real accounts` : "estimated"}</div>
              </div>
              <div className={`mc ${colorClass(result.suspiciousAccounts, 3, 15)}`}>
                <div className="ml">Suspicious Accts</div>
                <div className={`mv ${colorClass(result.suspiciousAccounts, 3, 15)}`}>{result.suspiciousAccounts}</div>
                <div className="ms">{rd?.highEntropyCount != null ? `${rd.highEntropyCount} high-entropy` : "detected in chat"}</div>
              </div>
              <div className={`mc ${colorClass(result.viewerFollowerRatio ?? 5, 5, 15)}`}>
                {rd && <span className="real-tag">REAL</span>}
                <div className="ml">Viewer/Follower</div>
                <div className={`mv ${colorClass(result.viewerFollowerRatio ?? 5, 5, 15)}`}>
                  {result.viewerFollowerRatio?.toFixed(2)}%
                </div>
                <div className="ms">normal: 1–5%</div>
              </div>
              <div className={`mc ${colorClass(result.botInjectionEvents ?? 0, 0, 2)}`}>
                <div className="ml">Bot Injections</div>
                <div className={`mv ${colorClass(result.botInjectionEvents ?? 0, 0, 2)}`}>{result.botInjectionEvents ?? 0}</div>
                <div className="ms">spike events</div>
              </div>
              <div className="mc g">
                {rd?.realChatterCount > 0 && <span className="real-tag">REAL</span>}
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

            {/* VOD STATS */}
            {rd?.vodViewStats && (
              <div className="pnl" style={{ marginBottom: 14 }}>
                <div className="pnl-t">VOD Performance Analysis <span className="real-tag">REAL DATA</span></div>
                <div className="g4">
                  <div className="rd-item">
                    <div className="rd-lbl">Avg VOD Views</div>
                    <div className={`rd-val ${rd.vodViewStats.avg < result.liveViewers * 0.05 && result.liveViewers > 300 ? "r" : rd.vodViewStats.avg < result.liveViewers * 0.15 ? "y" : "g"}`}>
                      {fmt(rd.vodViewStats.avg)}
                    </div>
                  </div>
                  <div className="rd-item">
                    <div className="rd-lbl">Max VOD Views</div>
                    <div className="rd-val">{fmt(rd.vodViewStats.max)}</div>
                  </div>
                  <div className="rd-item">
                    <div className="rd-lbl">Min VOD Views</div>
                    <div className="rd-val">{fmt(rd.vodViewStats.min)}</div>
                  </div>
                  <div className="rd-item">
                    <div className="rd-lbl">View Consistency</div>
                    <div className={`rd-val ${rd.vodViewStats.coefficientOfVariation > 150 ? "r" : rd.vodViewStats.coefficientOfVariation > 80 ? "y" : "g"}`}>
                      CV: {rd.vodViewStats.coefficientOfVariation}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEWER TIMELINE + DETECTION METRICS */}
            <div className="g2">
              <div className="pnl">
                <div className="pnl-t">Viewer Timeline (60 min)</div>
                <TimelineChart data={result.viewerTimeline} riskLevel={result.riskLevel} />
              </div>
              <div className="pnl">
                <div className="pnl-t">Detection Metrics</div>
                {mb && (<>
                  <Bar label="Chat Engagement" value={mb.chatEngagement}
                    color={mb.chatEngagement > 40 ? "g" : mb.chatEngagement > 15 ? "b" : "r"}
                    note={rd?.realChatterCount > 0 ? "real" : ""} />
                  <Bar label="Account Age Suspicion" value={mb.accountAgeSuspicion}
                    color={mb.accountAgeSuspicion < 30 ? "g" : mb.accountAgeSuspicion < 60 ? "y" : "r"}
                    note={ageStats ? "real" : ""} />
                  <Bar label="Username Entropy" value={mb.usernameEntropyScore}
                    color={mb.usernameEntropyScore < 30 ? "g" : mb.usernameEntropyScore < 60 ? "y" : "r"}
                    note={rd?.avgEntropy != null ? "real" : ""} />
                  <Bar label="Viewer Spike Risk" value={mb.viewerSpikeProbability}
                    color={mb.viewerSpikeProbability < 30 ? "g" : mb.viewerSpikeProbability < 60 ? "y" : "r"} />
                  <Bar label="Follow-bot Likelihood" value={mb.followBotLikelihood}
                    color={mb.followBotLikelihood < 30 ? "g" : mb.followBotLikelihood < 60 ? "y" : "r"} />
                  <Bar label="Viewer/Follower Anomaly" value={mb.viewerFollowerAnomaly}
                    color={mb.viewerFollowerAnomaly < 30 ? "g" : mb.viewerFollowerAnomaly < 60 ? "y" : "r"}
                    note={rd ? "real" : ""} />
                </>)}
              </div>
            </div>

            {/* REAL CHATTER ACCOUNT AGE BREAKDOWN */}
            {ageStats && ageStats.sampleSize >= 3 && (
              <div className="pnl" style={{ marginBottom: 14 }}>
                <div className="pnl-t">Chatter Account Age Distribution <span className="real-tag">REAL DATA — {ageStats.sampleSize} ACCOUNTS</span></div>
                <div className="g2">
                  <div>
                    <AgeBar label="< 7 days" count={ageStats.under7Days} total={ageStats.sampleSize} color="var(--red)" />
                    <AgeBar label="< 30 days" count={ageStats.under30Days} total={ageStats.sampleSize} color="var(--orange)" />
                    <AgeBar label="< 90 days" count={ageStats.under90Days} total={ageStats.sampleSize} color="var(--yellow)" />
                    <AgeBar label="> 1 year" count={ageStats.over365Days} total={ageStats.sampleSize} color="var(--green)" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { l: "Avg Age", v: ageStats.avg + "d", c: colorClassInv(ageStats.avg, 90, 365) },
                      { l: "Median Age", v: ageStats.median + "d", c: colorClassInv(ageStats.median, 60, 180) },
                      { l: "Youngest", v: ageStats.min + "d", c: ageStats.min < 7 ? "r" : ageStats.min < 30 ? "y" : "g" },
                      { l: "Oldest", v: ageStats.max + "d", c: "g" },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="rd-item">
                        <div className="rd-lbl">{l}</div>
                        <div className={`rd-val ${c}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PRE-COMPUTED FLAGS + AI SIGNALS */}
            <div className="g2">
              {flags.length > 0 && (
                <div className="pnl">
                  <div className="pnl-t">Algorithmic Detection Flags <span className="real-tag">REAL METRICS</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {flags.map((f, i) => <PreFlag key={i} f={f} />)}
                  </div>
                </div>
              )}
              <div className="pnl">
                <div className="pnl-t">AI Anomaly Signals</div>
                <div className="sigs">{result.signals?.map((s, i) => <Signal key={i} s={s} />)}</div>
              </div>
            </div>

            {/* CHAT SAMPLE + VODS */}
            <div className="g2">
              <div className="pnl">
                <div className="pnl-t">
                  Chat Sample Analysis
                  {result.hasRealChatters && <span className="real-tag">REAL ACCOUNTS</span>}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>USERNAME</th><th>AGE</th><th>ENTROPY</th><th>MSGS</th><th>NEW?</th><th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.chatSample?.map((u, i) => (
                        <tr key={i}>
                          <td className={u.status === "suspicious" ? "sus" : u.status === "legit" ? "leg" : "neu"}>{u.username}</td>
                          <td>{u.accountAgeDays < 30 ? <span className="sus">{u.accountAgeDays}d</span> : `${u.accountAgeDays}d`}</td>
                          <td style={{ fontFamily: "var(--mono)", fontSize: 10 }}>
                            {u.entropyScore != null
                              ? <span style={{ color: u.entropyScore > 50 ? "var(--red)" : u.entropyScore > 25 ? "var(--yellow)" : "var(--green)" }}>{u.entropyScore}</span>
                              : "—"}
                          </td>
                          <td>{u.messagesIn10min}</td>
                          <td>{u.joinedRecently ? <span className="sus">YES</span> : <span style={{ color: "var(--dim2)" }}>no</span>}</td>
                          <td><span className={`pill ${u.status === "suspicious" ? "pr" : u.status === "legit" ? "pg" : "py"}`}>{u.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {rd?.recentVods?.length > 0 ? (
                <div className="pnl">
                  <div className="pnl-t">Recent VOD History <span className="real-tag">REAL DATA</span></div>
                  {rd.recentVods.slice(0, 8).map((v, i) => (
                    <div className="vod-row" key={i}>
                      <div className="vod-title">{v.title || "Untitled stream"}</div>
                      <div className="vod-views" style={{ color: rd.isLive && v.views < result.liveViewers * 0.05 ? "var(--red)" : "var(--text)" }}>
                        {fmt(v.views)} views
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pnl">
                  <div className="pnl-t">Top Clips <span className="real-tag">REAL DATA</span></div>
                  {rd?.topClips?.length > 0 ? rd.topClips.map((c, i) => (
                    <div className="vod-row" key={i}>
                      <div className="vod-title">{c.title || "Clip"}</div>
                      <div className="vod-views">{fmt(c.views)} views</div>
                    </div>
                  )) : <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim2)" }}>No clip data available</div>}
                </div>
              )}
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
          <div className="how-s">// DETECTION METHODOLOGY v4.0</div>
          <div className="how-g">
            {[
              { n: "01", t: "Real Chatter Fetching", x: "We pull the actual live chatter list from Twitch's official API — not simulated. Each chatter's account creation date is fetched in batch, giving us a real age distribution." },
              { n: "02", t: "Account Age Analysis", x: "Bot farms create accounts in bulk. Clusters of accounts younger than 7 days strongly suggest coordinated bot deployment. We measure the real percentage across all sampled chatters." },
              { n: "03", t: "Username Entropy Scoring", x: "Each username gets an entropy score based on digit ratio, trailing numbers, vowel presence, and pattern matching. Bots score >50/100. We report the average and percentage of high-entropy names." },
              { n: "04", t: "VOD vs Live Consistency", x: "Real channels have VOD views that are 30–80% of their live viewer count. When average VOD views are <5% of live viewers, this is a strong indicator of inflated live counts." },
              { n: "05", t: "Chatter/Viewer Ratio", x: "Organic live streams see at least 1–3% of viewers chatting. Ghost bots don't chat. A chatter/viewer ratio below 0.5% with over 100 viewers is one of the strongest bot signals possible." },
              { n: "06", t: "Two-Layer Analysis", x: "A deterministic algorithm first scores the channel using hard mathematical thresholds. Then Groq's 70B AI synthesizes all evidence holistically, cross-checking both layers for the final verdict." },
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
          <strong>⚠ DISCLAIMER:</strong> This tool uses real Twitch Helix API data combined with Groq AI analysis.
          The Get Chatters endpoint requires the channel owner to be the moderator — if chatter data is unavailable, analysis falls back to AI simulation.
          Results are for educational/research purposes only. Do not use to make accusations against creators without additional evidence.
        </div>
      </div>
    </>
  );
}
