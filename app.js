// Claims Card. No dependencies.
"use strict";

// ---- Gate (soft check, not security) ----
const CODE_HASH = "d87003971f1273e184b35cd1ffdc32f0ce2ac8e15698209ce77b5f57923e592a";
async function sha256(s) {
  if (!window.crypto || !crypto.subtle) return s === "7HQ7" ? CODE_HASH : "x";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const gate = document.getElementById("gate");
const app = document.getElementById("app");
const codeInput = document.getElementById("code-input");
const codeBtn = document.getElementById("code-submit");
const gateErr = document.getElementById("gate-error");
const lockBtn = document.getElementById("btn-lock");

function toTop() {
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
}

function unlock() {
  sessionStorage.setItem("cc_ok", "1");
  codeInput.blur();               // dismiss the iOS keyboard first
  gate.hidden = true;
  app.hidden = false;
  start();
  toTop();
  // iOS restores/adjusts scroll while the keyboard animates away; reset again
  // after the viewport settles.
  if (window.requestAnimationFrame) requestAnimationFrame(toTop);
  setTimeout(toTop, 120);
  setTimeout(toTop, 400);
}

function lock() {
  sessionStorage.removeItem("cc_ok");
  app.hidden = true;
  gate.hidden = false;
  codeInput.value = "";
  gateErr.hidden = true;
  toTop();
  codeInput.focus();
}

async function tryCode() {
  const h = await sha256(codeInput.value.trim().toUpperCase());
  if (h === CODE_HASH) {
    unlock();
  } else {
    gateErr.hidden = false;
    codeInput.value = "";
    codeInput.focus();
  }
}
codeBtn.addEventListener("click", tryCode);
codeInput.addEventListener("keydown", e => { if (e.key === "Enter") tryCode(); });
codeInput.addEventListener("input", () => { gateErr.hidden = true; });
if (lockBtn) lockBtn.addEventListener("click", lock);

// ---- Math ----
function erf(x0) {
  const s = x0 < 0 ? -1 : 1;
  const x = Math.abs(x0);
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const t = 1/(1+p*x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return s*y;
}
const Phi = z => 0.5*(1+erf(z/Math.SQRT2));
const npdf = x => Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);

// Kalshi taker fee on YES bought at price p (0..1): about 7% x p x (1-p).
// Above price 0.8 the published fee scale makes it (1-p)*25%, i.e. min((1-T))/4 capped at 25c.
const feeYes = p => p >= 1/8 ? Math.min(0.25, (1-p)/4) : 0;
const fmtFee = f => "≈" + f.toFixed(1) + "¢";

const MODELS = [
  { name:"No-change", short:"no-change", hex:"var(--blue)", needs:"None", center:(A,C,F)=>A, sd:13.0 },
  { name:"Consensus blend", short:"consensus blend", hex:"var(--orange)", needs:"C", center:(A,C,F)=>A+0.5*(C-A), sd:12.4 },
  { name:"Forecast blend", short:"forecast blend", hex:"var(--green)", needs:"F", center:(A,C,F)=>A+0.9*(F-A), sd:12.0 },
];
const pge = (c,T,sd) => Phi((c-T)/sd);

// ---- State ----
const FIELDS = ["in-anchor","in-consensus","in-forecast","in-threshold","in-market"];
const els = Object.fromEntries(FIELDS.map(id => [id, document.getElementById(id)]));
const verdict = document.getElementById("verdict");
verdict.setAttribute("aria-live", "polite");
let started = false;
let cur = null;   // last rendered state, for row taps

function start() {
  if (started) return;
  started = true;
  // Prefill from data.json (written weekly by GitHub Action), fall back to constants.
  fetch("data.json", {cache: "no-store"})
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      if (d.anchor != null) els["in-anchor"].value = d.anchor;
      if (d.consensus != null) els["in-consensus"].value = d.consensus;
      if (d.forecast != null) els["in-forecast"].value = d.forecast;
      if (d.threshold != null) els["in-threshold"].value = d.threshold;
      if (d.fetched_at) document.getElementById("as-of").textContent = "as of " + d.fetched_at;
      recalc();
    })
    .catch(() => {
      if (!els["in-anchor"].value) {
        els["in-anchor"].value = 206;
        els["in-consensus"].value = 210;
        els["in-forecast"].value = 212;
        els["in-threshold"].value = 195;
      }
      recalc();
    });
  for (const el of Object.values(els)) el.addEventListener("input", recalc);

  // Steppers: tap targets for threshold (5K) and market price (1 cent).
  for (const btn of document.querySelectorAll(".step")) {
    btn.addEventListener("click", () => {
      const el = els[btn.dataset.for];
      const step = parseFloat(btn.dataset.step);
      const curv = parseFloat(el.value);
      let next = (isFinite(curv) ? curv : (btn.dataset.for === "in-market" ? 50 : 0)) + step;
      if (btn.dataset.for === "in-market") next = Math.min(99, Math.max(1, next));
      el.value = next;
      recalc();
    });
  }

  // Tap a model row to focus its curve in the distribution strip.
  document.getElementById("models").addEventListener("click", e => {
    const row = e.target.closest(".m-row");
    if (!row || row.classList.contains("na") || !cur) return;
    cur.sel = +row.dataset.idx;
    render(cur);
  });
}

function num(id) {
  const v = parseFloat(els[id].value);
  return isFinite(v) ? v : null;
}

function recalc() {
  const A = num("in-anchor");
  const C = num("in-consensus");
  const F = num("in-forecast");
  const T = num("in-threshold");
  const M = num("in-market");
  if (A === null || T === null) {
    cur = null;
    verdict.className = "verdict";
    document.getElementById("v-big").textContent = "Need a last-print value";
    document.getElementById("models").innerHTML = "";
    document.getElementById("m-cap").textContent = "";
    document.getElementById("chart-dist").innerHTML = "";
    document.getElementById("dist-note").textContent = "";
    document.getElementById("edge-legend").innerHTML = "";
    document.getElementById("chart-edge").innerHTML = "";
    document.getElementById("edge-hdr").textContent = "Fair price across thresholds";
    return;
  }
  const mkt = M === null ? null : M / 100;
  const models = MODELS.map((m, i) => {
    const has = !(C === null && m.needs === "C") && !(F === null && m.needs === "F");
    const cc = has ? m.center(A, C === null ? A : C, F === null ? A : F) : null;
    return { ...m, idx: i, has, c: cc, p: has ? pge(cc, T, m.sd) : null };
  });
  const live = models.filter(m => m.has);
  const lo = Math.min(...live.map(m => m.p));
  const hi = Math.max(...live.map(m => m.p));
  // Default focus: most-informed available model.
  const focus = models.filter(m => m.has).pop();
  cur = { A, C, F, T, M, mkt, models, lo, hi, sel: focus.idx };
  render(cur);
}

function render(cur) {
  const { A, C, F, T, M, mkt, models, lo, hi, sel } = cur;
  const hasM = mkt !== null;
  const c = x => Math.round(x*100);
  const mk = hasM ? Math.round(M) : null;
  const edge = (e, fee) => {
    const n = Math.max(0, e - fee);
    return n === 0 ? "(fees eat it)" : `+${n}`;
  };

  // Verdict: raw gap in the headline, net-of-fee in the sub-line, NO-side framing
  // when YES is rich.
  const v = verdict;
  const vTag = document.getElementById("v-tag");
  const vBig = document.getElementById("v-big");
  const vSub = document.getElementById("v-sub");
  v.className = "verdict";
  const Tr = Math.round(T);
  if (hasM) {
    const loC = c(lo), hiC = c(hi);
    const noPrice = 100 - mk;
    if (lo > mkt) {
      const edgeLo = loC - mk, edgeHi = hiC - mk;
      const fee = feeYes(Math.min(mkt, 0.99)) * 100;
      const nLo = Math.max(0, edgeLo - fee), nHi = Math.max(0, edgeHi - fee);
      v.classList.add("pos");
      vTag.textContent = "YES CHEAP";
      vBig.textContent = `+${edgeLo} to +${edgeHi}¢`;
      vSub.textContent = `Models · ${loC}–${hiC}¢ · market ${mk}¢. ` +
        (nLo === 0 ? `Fee ${fmtFee(fee)} wipes this edge.` : `Net of ${fmtFee(fee)} fee · +${nLo}–${nHi}¢.`);
    } else if (hi < mkt) {
      const fee = feeYes(mkt) * 100;
      v.classList.add("neg");
      vTag.textContent = "YES RICH";
      vBig.textContent = `NO at ${noPrice}¢`;
      vSub.textContent = `Models · ${loC}–${hiC}¢ · YES ${mk}¢. Net of ${fmtFee(fee)} fee · NO edge ${edge(mk - hiC, fee)} by model.`;
    } else {
      vTag.textContent = "NO EDGE";
      vBig.textContent = `${loC}–${hiC}¢`;
      vSub.textContent = `Market ${mk}¢ sits inside the model range at ${Tr}K. Fees need ~2¢+ to clear.`;
    }
  } else {
    vTag.textContent = "FAIR VALUE";
    vBig.textContent = `${c(lo)}–${c(hi)}¢`;
    vSub.textContent = `Model range for P(claims ≥ ${Tr}K). Enter the market YES price to size the edge.`;
  }

  // Model rows: name, price, edge, inline bar with market tick + 50c midpoint.
  const missing = models.filter(m => !m.has);
  document.getElementById("models").innerHTML = models.map(m => {
    const rowCls = "m-row" + (m.has ? (m.idx === sel ? " sel" : "") : " na");
    const price = m.has ? `${c(m.p)}<small>¢</small>` : "—";
    let edgeHtml = "<span>—</span>";
    if (m.has && hasM) {
      const e = c(m.p) - mk;
      edgeHtml = `<span class="${e>0?"pos":e<0?"neg":""}">${e>0?"+":""}${e}¢</span>`;
    }
    const barHtml = m.has ?
      `<div class="m-bar">
         ${hasM ? `<div class="m-tick" style="left:${Math.round(mkt*100)}%"></div>` : ""}
         ${!hasM ? '<div class="m-mid"></div>' : ""}
         <div class="m-fill" style="width:${Math.round(m.p*100)}%"></div>
       </div>` : "";
    const hint = m.has ? "" :
      `<div class="m-hint">add ${m.needs==="C"?"consensus":"forecast"} to activate</div>`;
    return `<div class="${rowCls}" data-idx="${m.idx}" style="--M:${m.hex}">
      <div class="m-top">
        <span class="m-dot"></span>
        <span class="m-name">${m.name}</span>
        <span class="m-price">${price}</span>
        <span class="m-edge">${edgeHtml}</span>
      </div>
      ${barHtml}${hint}
    </div>`;
  }).join("");
  const cap = hasM ?
    "Tick · market YES. Fill past tick · that model says cheap. Tap a row for its curve." :
    "Fair YES per model on a 0–100¢ track · faint mark is 50¢. Tap a row for its curve.";
  document.getElementById("m-cap").textContent = cap +
    (missing.length ? ` ${missing.length} model${missing.length>1?"s":""} off (missing input).` : "");

  // Threshold chart: fair curves (no market) or edge curves (market given).
  const liveModels = models.filter(m => m.has);
  const legend = document.getElementById("edge-legend");
  legend.innerHTML = liveModels.map(m =>
    `<span class="lg"><span class="lg-dot" style="background:${m.hex}"></span>${m.name}</span>`).join("");
  drawEdge(liveModels, A, Tr, mkt);

  // Distribution strip for the focused model.
  drawDist(cur, models[sel]);
}

// ---- Charts ----
const W = 336;
function svg(h, inner) { return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }

function drawDist(cur, m) {
  const h = 132, pl = 8, pr = 8, pt = 12, pb = 22;
  const iw = W - pl - pr, ih = h - pt - pb;
  const half = 3.4;                        // window = center ± 3.4 sd
  const span = 2*half*m.sd;
  const xLo = m.c - span/2, xHi = m.c + span/2;
  const X = x => pl + (x - xLo)/span*iw;
  const Y = d => pt + ih - d*ih;           // d = normalized pdf, 0..1
  const N = 100;

  let lineP = "";
  let fillP = "";
  const t0 = Math.max(cur.T, xLo);
  for (let i = 0; i <= N; i++) {
    const x = xLo + span*i/N;
    const y = Y(npdf((x - m.c)/m.sd));
    lineP += (i ? "L" : "M") + `${X(x).toFixed(1)} ${y.toFixed(1)} `;
  }
  if (t0 < xHi) {
    for (let i = 0; i <= N; i++) {
      const x = t0 + (xHi - t0)*i/N;
      const y = Y(npdf((x - m.c)/m.sd));
      fillP += (i ? "L" : "M") + `${X(x).toFixed(1)} ${y.toFixed(1)} `;
    }
    fillP += `L${X(xHi).toFixed(1)} ${Y(0).toFixed(1)} L${X(t0).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  }

  let g = "";
  if (fillP) g += `<path d="${fillP}" fill="${m.hex}" opacity="0.25"/>`;
  g += `<path d="${lineP}" fill="none" stroke="${m.hex}" stroke-width="2"/>`;
  g += `<line x1="${X(cur.T)}" y1="${pt}" x2="${X(cur.T)}" y2="${h-pb}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  // Markers: center, plus consensus/forecast if in window.
  const marks = [ { x: m.c, lbl: "center", strong: true } ];
  if (cur.C !== null) marks.push({ x: cur.C, lbl: "cons" });
  if (cur.F !== null) marks.push({ x: cur.F, lbl: "fcst" });
  const pts = marks.filter(o => o.x > xLo + span*0.03 && o.x < xHi - span*0.03);
  pts.forEach(o => {
    const yo = Y(npdf((o.x - m.c)/m.sd));
    g += `<circle cx="${X(o.x)}" cy="${yo}" r="2.5" fill="${o.strong ? "var(--ink-2)" : "var(--ink-3)"}"/>`;
    if (o.strong) g += `<text x="${X(o.x)}" y="${h-pb+12}" text-anchor="middle" class="ax">${Math.round(o.x)}K center</text>`;
  });
  g += `<text x="${X(cur.T)}" y="${pt-3}" text-anchor="middle" class="ax">${Math.round(cur.T)}K = T</text>`;
  document.getElementById("chart-dist").innerHTML = svg(h, g);

  // Plain-language sigma commentary.
  const z = (cur.T - m.c)/m.sd;
  const az = Math.abs(z);
  const dir = z < 0 ? "below" : "above";
  const sense = z < 0 ? "so YES is likely" : z > 0 ? "so YES is unlikely" : "so this is a coin flip";
  document.getElementById("dist-note").textContent =
    `T sits ${az.toFixed(1)}σ ${dir} the ${m.short} center of ${Math.round(m.c)}K, ${sense}. ` +
    `The shaded tail at or above T is the fair YES price, ${Math.round(m.p*100)}¢.`;
  document.getElementById("dist-model").textContent = m.name + " · σ " + m.sd.toFixed(1) + "K";
}

function drawEdge(models, A, Tr, mkt) {
  const wrap = document.getElementById("chart-edge");
  const hdr = document.getElementById("edge-hdr");
  const h = 150, pl = 4, pr = 8, pt = 14, pb = 22;
  const iw = W - pl - pr, ih = h - pt - pb;
  const lo = Tr - 12, hi = Tr + 12;
  const X = t => pl + (t-lo)/(hi-lo)*iw;
  const ts = []; for (let t = lo; t <= hi; t += 1) ts.push(t);
  const A_ = num("in-anchor") ?? 0, C_ = num("in-consensus") ?? A_, F_ = num("in-forecast") ?? A_;

  let g = "";
  if (mkt === null) {
    hdr.textContent = "Fair price across thresholds";
    const Y = p => pt + (1 - p)*ih;
    for (let t = lo; t <= hi; t += 4) {
      g += `<line x1="${X(t)}" y1="${pt}" x2="${X(t)}" y2="${h-pb}" stroke="var(--line)"/>`;
      g += `<text x="${X(t)}" y="${h-pb+12}" text-anchor="middle" class="ax">${t}K</text>`;
    }
    g += `<line x1="${pl}" y1="${Y(0.5)}" x2="${W-pr}" y2="${Y(0.5)}" stroke="var(--ink-3)" stroke-dasharray="2 2" opacity="0.6"/>`;
    g += `<text x="${pl+2}" y="${Y(0.5)-3}" class="ax">50¢</text>`;
    models.forEach(m => {
      const pts = ts.map(t => `${X(t).toFixed(1)},${Y(pge(m.center(A_,C_,F_), t, m.sd)).toFixed(1)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${m.hex}" stroke-width="2"/>`;
    });
    g += `<line x1="${X(Tr)}" y1="${pt}" x2="${X(Tr)}" y2="${h-pb}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`;
    g += `<text x="${W/2}" y="${h-1}" text-anchor="middle" class="ax">Fair YES price as the threshold moves · enter market ¢ for net edge</text>`;
  } else {
    hdr.textContent = "Edge across thresholds";
    let mn = 0, mx = 0;
    const edges = models.map(m => ts.map(t => pge(m.center(A_,C_,F_), t, m.sd) - mkt));
    edges.forEach(es => es.forEach(e => { mn = Math.min(mn, e); mx = Math.max(mx, e); }));
    const scale = Math.max(Math.abs(mn), Math.abs(mx), 0.02) * 1.2;
    const Y = e => pt + ih/2 - (e/scale)*(ih/2);
    g += `<line x1="${pl}" y1="${Y(0)}" x2="${W-pr}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="1" opacity="0.55"/>`;
    for (let t = lo; t <= hi; t += 4) {
      g += `<line x1="${X(t)}" y1="${pt}" x2="${X(t)}" y2="${h-pb}" stroke="var(--line)"/>`;
      g += `<text x="${X(t)}" y="${h-pb+12}" text-anchor="middle" class="ax">${t}K</text>`;
    }
    models.forEach((m, i) => {
      const pts = ts.map((t, j) => `${X(t).toFixed(1)},${Y(edges[i][j]).toFixed(1)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${m.hex}" stroke-width="2"/>`;
    });
    g += `<line x1="${X(Tr)}" y1="${pt}" x2="${X(Tr)}" y2="${h-pb}" stroke="var(--ink-3)" stroke-dasharray="3 3"/>`;
    g += `<text x="${W-pr}" y="${pt-2}" text-anchor="end" class="ax">+${Math.round(scale*100)}¢</text>`;
    g += `<text x="${W/2}" y="${h-1}" text-anchor="middle" class="ax">Net YES edge (model − ${Math.round(mkt*100)}¢) · right of zero means YES cheap</text>`;
  }
  wrap.innerHTML = svg(h, g);
}

if (sessionStorage.getItem("cc_ok") === "1") {
  unlock();
} else {
  codeInput.focus();
}
