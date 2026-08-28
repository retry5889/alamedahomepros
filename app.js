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

// Kalshi general fees (per contract): taker fee = r·p(1−p), r=1.75% → max ≈0.44¢ at 50¢.
// Maker (resting) fee = taker × 0.25.
const feeTaker = p => 1.75 * p * (1 - p);
const feeMaker = p => 0.25 * feeTaker(p);
const fmtC = f => f.toFixed(2) + "¢";

const MODELS = [
  { name:"No-change", short:"no-change", hex:"var(--blue)", needs:null, center:(A,C,F)=>A, sd:13.0 },
  { name:"Consensus blend", short:"consensus blend", hex:"var(--orange)", needs:"C", center:(A,C,F)=>A+0.5*(C-A), sd:12.4 },
  { name:"Forecast blend", short:"forecast blend", hex:"var(--green)", needs:"F", center:(A,C,F)=>A+0.9*(F-A), sd:12.0 },
];
const pge = (c,T,sd) => Phi((c-T)/sd);

const FIELDS = ["in-anchor","in-consensus","in-forecast","in-threshold","in-market"];
const els = Object.fromEntries(FIELDS.map(id => [id, document.getElementById(id)]));
const verdict = document.getElementById("verdict");
verdict.setAttribute("aria-live", "polite");
let started = false;
let cur = null;
let zChipsOn = false;

function start() {
  if (started) return;
  started = true;
  fetch("data.json", {cache: "no-store"})
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      if (d.anchor != null) els["in-anchor"].value = d.anchor;
      if (d.consensus != null) els["in-consensus"].value = d.consensus;
      if (d.forecast != null) els["in-forecast"].value = d.forecast;
      if (d.threshold != null) els["in-threshold"].value = d.threshold;
      if (d.fetched_at) document.getElementById("as-of").textContent = "as of " + d.fetched_at;
      recalc(true);
    })
    .catch(() => {
      if (!els["in-anchor"].value) {
        els["in-anchor"].value = 206;
        els["in-consensus"].value = 210;
        els["in-forecast"].value = 212;
        els["in-threshold"].value = 195;
      }
      recalc(true);
    });
  for (const el of Object.values(els)) el.addEventListener("input", () => recalc(true));

  for (const btn of document.querySelectorAll(".step")) {
    btn.addEventListener("click", () => {
      const el = els[btn.dataset.for];
      const step = parseFloat(btn.dataset.step);
      const curv = parseFloat(el.value);
      let next = (isFinite(curv) ? curv : (btn.dataset.for === "in-market" ? 50 : 0)) + step;
      if (btn.dataset.for === "in-market") next = Math.min(99, Math.max(1, next));
      el.value = next;
      recalc(true);
    });
  }

  // σ chips: nudge threshold by ±amount to teach tail-area intuition.
  for (const chip of document.querySelectorAll(".z-chip")) {
    chip.addEventListener("click", () => {
      const tnum = num("in-threshold");
      if (tnum === null) return;
      els["in-threshold"].value = Math.max(0, Math.round(tnum) + parseFloat(chip.dataset.t));
      recalc(true);
    });
  }

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

// refreshSel=true recomputes focus (most-informed model); false keeps user's row-choice.
function recalc(refreshSel) {
  const A = num("in-anchor");
  const C = num("in-consensus");
  const F = num("in-forecast");
  const T = num("in-threshold");
  const M = num("in-market");
  if (A === null || T === null) {
    cur = null;
    verdict.className = "verdict";
    document.getElementById("v-big").textContent = "Need a last-print value";
    document.getElementById("v-sub").textContent = "";
    document.getElementById("models").innerHTML = "";
    document.getElementById("m-cap").textContent = "";
    document.getElementById("chart-dist").innerHTML = "";
    document.getElementById("dist-note").textContent = "";
    document.getElementById("fee-note").textContent = "";
    document.getElementById("edge-legend").innerHTML = "";
    document.getElementById("chart-edge").innerHTML = "";
    return;
  }
  const mkt = M === null ? null : M / 100;
  const models = MODELS.map((m, i) => {
    const has = m.needs === "C" ? C !== null : m.needs === "F" ? F !== null : true;
    const cc = has ? m.center(A, C === null ? A : C, F === null ? A : F) : null;
    return { ...m, idx: i, has, c: cc, p: has ? pge(cc, T, m.sd) : null };
  });
  const live = models.filter(m => m.has);
  const lo = Math.min(...live.map(m => m.p));
  const hi = Math.max(...live.map(m => m.p));
  const keepSel = cur && !refreshSel && cur.models[cur.sel] && cur.models[cur.sel].has;
  const focus = keepSel ? cur.sel : models.filter(m => m.has).pop().idx;
  cur = { A, C, F, T, M, mkt, models, lo, hi, sel: focus };
  render(cur);
}

function render(cur) {
  const { A, C, F, T, M, mkt, models, lo, hi, sel } = cur;
  const hasM = mkt !== null;
  const c = x => Math.round(x*100);
  const mk = hasM ? Math.round(M) : null;

  // Verdict
  const v = verdict;
  const vTag = document.getElementById("v-tag");
  const vBig = document.getElementById("v-big");
  const vSub = document.getElementById("v-sub");
  v.className = "verdict";
  const Tr = Math.round(T);
  if (hasM) {
    const loC = c(lo), hiC = c(hi);
    const tk = feeTaker(mkt);
    if (lo > mkt) {
      const edgeLo = lo - mkt, edgeHi = hi - mkt;
      const nLo = Math.max(0, edgeLo - tk), nHi = Math.max(0, edgeHi - tk);
      v.classList.add("pos");
      vTag.textContent = "YES CHEAP";
      vBig.textContent = `+${c(edgeLo)} to +${c(edgeHi)}¢`;
      const maker = feeMaker(mkt), mn = Math.max(0, edgeLo - maker);
      vSub.textContent = `Models ${loC}–${hiC}¢ vs market ${mk}¢. Taker fee ${fmtC(tk)} → net +${c(nLo)}–${c(nHi)}¢; maker limit → +${c(mn)}–${c(Math.max(0, edgeHi - maker))}¢.`;
    } else if (hi < mkt) {
      // YES rich → buy NO at 1-p. Fees are on price paid, = (1−m)r(1−(1−m))(1−m)… = same r·p(1−p).
      const noEdgeLo = mkt - hi, noEdgeHi = mkt - lo;
      const ntk = feeTaker(mkt), mnk = feeMaker(mkt);
      v.classList.add("neg");
      vTag.textContent = "YES RICH";
      vBig.textContent = `NO at ${100 - mk}¢`;
      const tnet = Math.max(0, noEdgeLo) - ntk, mnet = Math.max(0, noEdgeLo) - mnk;
      vSub.textContent = `Models ${loC}–${hiC}¢ vs YES ${mk}¢. NO edge +${c(noEdgeLo)}–${c(noEdgeHi)}¢ raw; taker net +${c(tnet)}–${c(Math.max(0, noEdgeHi) - ntk)}¢, maker net +${c(mnet)}–${c(Math.max(0, noEdgeHi) - mnk)}¢.`;
    } else {
      vTag.textContent = "NO EDGE";
      vBig.textContent = `${loC}–${hiC}¢`;
      vSub.textContent = `Market ${mk}¢ sits inside the model range at ${Tr}K. Taker fee here is ${fmtC(tk)}; you need ~1¢+ of edge to beat it.`;
    }
  } else {
    vTag.textContent = "FAIR VALUE";
    vBig.textContent = `${c(lo)}–${c(hi)}¢`;
    vSub.textContent = `Model range for P(claims ≥ ${Tr}K). Enter the market YES price to size the edge.`;
  }

  // Model rows
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
  const missing = models.filter(m => !m.has).length;
  document.getElementById("m-cap").textContent = (hasM ?
    "Tick · market YES. Fill past tick · that model says cheap. Tap a row for its curve." :
    "Fair YES per model on a 0–100¢ track · faint mark is 50¢. Tap a row for its curve.") +
    (missing ? ` ${missing} model${missing>1?"s":""} off (missing input).` : "");

  const liveModels = models.filter(m => m.has);
  const legend = document.getElementById("edge-legend");
  legend.innerHTML = liveModels.map(m =>
    `<span class="lg"><span class="lg-dot" style="background:${m.hex}"></span>${m.name}</span>`).join("");
  drawEdge(liveModels, A, Tr, mkt);
  drawDist(cur, models[sel]);
}

const W = 336;
function svg(h, inner) { return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }

function drawDist(cur, m) {
  const h = 140, pl = 8, pr = 8, pt = 12, pb = 24;
  const iw = W - pl - pr, ih = h - pt - pb;
  const half = 3.4;
  const span = 2*half*m.sd;
  const xLo = m.c - span/2, xHi = m.c + span/2;
  const X = x => pl + (x - xLo)/span*iw;
  const Y = d => pt + ih - d*ih;
  const N = 100;

  let lineP = "", fillP = "";
  for (let i = 0; i <= N; i++) {
    const x = xLo + span*i/N;
    const y = Y(npdf((x - m.c)/m.sd));
    lineP += (i ? "L" : "M") + `${X(x).toFixed(1)} ${y.toFixed(1)} `;
  }
  if (cur.T < xHi) {
    const t0 = Math.max(cur.T, xLo);
    for (let i = 0; i <= N; i++) {
      const x = t0 + (xHi - t0)*i/N;
      const y = Y(npdf((x - m.c)/m.sd));
      fillP += (i ? "L" : "M") + `${X(x).toFixed(1)} ${y.toFixed(1)} `;
    }
    fillP += `L${X(xHi).toFixed(1)} ${Y(0).toFixed(1)} L${X(Math.max(cur.T,xLo)).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  }

  let g = "";
  if (fillP) g += `<path d="${fillP}" fill="${m.hex}" opacity="0.22"/>`;
  g += `<path d="${lineP}" fill="none" stroke="${m.hex}" stroke-width="2"/>`;
  g += `<line x1="${X(cur.T)}" y1="${pt}" x2="${X(cur.T)}" y2="${h-pb}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 3"/>`;

  // σ ticks at center, +1σ, +2σ, −1σ, −2σ
  const sigTicks = [0, 1, 2, -1, -2].map(k => ({ v: m.c + k*m.sd, k }));
  sigTicks.forEach(o => {
    if (o.v > xLo && o.v < xHi) {
      g += `<line x1="${X(o.v)}" y1="${h-pb}" x2="${X(o.v)}" y2="${h-pb+5}" stroke="var(--ink-3)" stroke-width="1"/>`;
      g += `<text x="${X(o.v)}" y="${h-pb+13}" text-anchor="middle" class="ax">${o.k===0?"ctr":(o.k>0?"+"+o.k+"σ":o.k+"σ")}</text>`;
    }
  });

  // Markers for center/consensus/forecast
  const marks = [{ x: m.c, strong: true }];
  if (cur.C !== null) marks.push({ x: cur.C });
  if (cur.F !== null) marks.push({ x: cur.F });
  marks.filter(o => o.x > xLo && o.x < xHi).forEach(o => {
    const yo = Y(npdf((o.x - m.c)/m.sd));
    g += `<circle cx="${X(o.x)}" cy="${yo}" r="2.5" fill="${o.strong ? "var(--ink-2)" : "var(--ink-3)"}"/>`;
  });

  g += `<text x="${X(cur.T)}" y="${pt-3}" text-anchor="middle" class="ax">${Math.round(cur.T)}K = T</text>`;
  document.getElementById("chart-dist").innerHTML = svg(h, g);

  // Sigma chips: rebuild labels with true prices for this model.
  const chips = document.querySelectorAll(".z-chip");
  const defs = [ {k:0.3}, {k:0.5}, {k:1}, {k:2} ];
  chips.forEach((ch, i) => {
    const k = defs[i].k;
    const dist = k * m.sd;
    const p2 = Math.round(Phi(-k)*100);
    ch.dataset.t = dist.toFixed(1);
    ch.textContent = `${dist.toFixed(1)}K→${k}σ·${p2}¢`;
  });

  const z = (cur.T - m.c)/m.sd;
  const az = Math.abs(z);
  const dir = z < 0 ? "below" : "above";
  const sense = z < 0 ? "so YES is likely" : z > 0 ? "so YES is unlikely" : "a coin flip";
  document.getElementById("dist-note").textContent =
    `T sits ${az.toFixed(1)}σ ${dir} the ${m.short} center of ${Math.round(m.c)}K, ${sense}. ` +
    `The shaded tail at or above T is the fair YES price, ${Math.round(m.p*100)}¢.`;
  document.getElementById("dist-model").textContent = m.name + " · σ " + m.sd.toFixed(1) + "K";

  // Fee note inside distribution card (concept: fee as a strip of probability width).
  if (cur.mkt !== null) {
    const tail = Math.max(m.p - cur.mkt, 0);
    const width = feeTaker(cur.mkt);          // in probability units
    const kt = width / m.sd;                  // σ units
    const ktS = (az + kt/Math.max(1e-9, 1));
    const pAfter = Phi(az/M.EPSILON) * 0; // placeholder to avoid lint; recompute below
    const after = Phi((az - kt)) * 100;
    document.getElementById("fee-note").textContent =
      `Taker fee ${fmtC(feeTaker(cur.mkt))} is about ${kt.toFixed(2)}σ of threshold at this price — T would need ${kt.toFixed(2)}σ more clearance to cover it.`;
  } else {
    document.getElementById("fee-note").textContent = "Enter a market price to compare fees against the σ distance.";
  }
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
    hdr.textContent = "Net edge across thresholds";
    let mn = 0, mx = 0;
    const edges = models.map(m => ts.map(t => pge(m.center(A_,C_,F_), t, m.sd) - mkt));
    edges.forEach(es => es.forEach(e => { mn = Math.min(mn, e); mx = Math.max(mx, e); }));
    const scale = Math.max(Math.abs(mn), Math.abs(mx), 0.02) * 1.05;
    const Y = e => pt + ih/2 - (e/scale)*(ih/2);
    const tk = feeTaker(mkt);
    g += `<line x1="${pl}" y1="${Y(0)}" x2="${W-pr}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="1" opacity="0.55"/>`;
    // Taker fee bands: only points above +fee clear cost.
    g += `<line x1="${pl}" y1="${Y(tk)}" x2="${W-pr}" y2="${Y(tk)}" stroke="var(--blue)" stroke-dasharray="2 2" opacity="0.7"/>`;
    g += `<text x="${pl}" y="${Y(tk)+9}" class="ax">taker +${fmtC(tk)}</text>`;
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
    g += `<text x="${W/2}" y="${h-1}" text-anchor="middle" class="ax">Net YES edge (model − ${Math.round(mkt*100)}¢) · above blue line beats taker fee</text>`;
  }
  wrap.innerHTML = svg(h, g);
}

if (sessionStorage.getItem("cc_ok") === "1") {
  unlock();
} else {
  codeInput.focus();
}
