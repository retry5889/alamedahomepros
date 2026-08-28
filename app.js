// Claims Card. No dependencies.
"use strict";

// ---- Gate ----
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
  codeInput.blur();
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
  if (h === CODE_HASH) { unlock(); } else { gateErr.hidden = false; codeInput.value = ""; codeInput.focus(); }
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

  document.getElementById("models").addEventListener("click", e => {
    const row = e.target.closest(".m-row");
    if (!row || row.classList.contains("na") || !cur) return;
    cur.sel = +row.dataset.idx;
    render(cur);
  });

  // σ chips: tap to set threshold to center + k·σ.
  document.getElementById("z-chips").addEventListener("click", e => {
    const chip = e.target.closest(".z-chip");
    if (!chip || !cur) return;
    const m = cur.models[cur.sel];
    if (!m || !m.has) return;
    els["in-threshold"].value = Math.max(0, Math.round(m.c + parseFloat(chip.dataset.k) * m.sd));
    recalc(true);
  });

  // Drag on distribution chart moves the threshold.
  const distWrap = document.getElementById("chart-dist");
  let dragging = false;
  function distToT(clientX) {
    if (!cur) return null;
    const m = cur.models[cur.sel];
    if (!m || !m.has) return null;
    const svgEl = distWrap.querySelector("svg");
    if (!svgEl) return null;
    const rect = svgEl.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const half = 3.4;
    const span = 2 * half * m.sd;
    const xLo = m.c - span / 2;
    return xLo + frac * span;
  }
  function onDrag(e) {
    if (!dragging) return;
    e.preventDefault();
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const t = distToT(x);
    if (t !== null) {
      els["in-threshold"].value = Math.max(0, Math.round(t));
      recalc(true);
    }
  }
  distWrap.addEventListener("pointerdown", e => { dragging = true; onDrag(e); });
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", () => { dragging = false; });
  distWrap.addEventListener("touchstart", e => { dragging = true; onDrag(e); }, {passive:false});
  window.addEventListener("touchmove", onDrag, {passive:false});
  window.addEventListener("touchend", () => { dragging = false; });
}

function num(id) {
  const v = parseFloat(els[id].value);
  return isFinite(v) ? v : null;
}

function recalc(refreshSel) {
  const A = num("in-anchor");
  const C = num("in-consensus");
  const F = num("in-forecast");
  const T = num("in-threshold");
  const M = num("in-market");
  if (A === null || T === null) {
    cur = null;
    verdict.className = "verdict";
    document.getElementById("v-tag").textContent = "";
    document.getElementById("v-big").textContent = "Need a last-print value";
    document.getElementById("v-sub").textContent = "";
    document.getElementById("models").innerHTML = "";
    document.getElementById("m-cap").textContent = "";
    document.getElementById("chart-dist").innerHTML = "";
    document.getElementById("z-chips").innerHTML = "";
    document.getElementById("chart-ev").innerHTML = "";
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
      const maker = feeMaker(mkt);
      vSub.textContent = `Models ${loC}–${hiC}¢ vs YES ${mk}¢. Taker net +${c(nLo)}–${c(nHi)}¢; limit order +${c(Math.max(0, edgeLo - maker))}–${c(Math.max(0, edgeHi - maker))}¢.`;
    } else if (hi < mkt) {
      const noEdgeLo = mkt - hi, noEdgeHi = mkt - lo;
      const ntk = feeTaker(mkt), mnk = feeMaker(mkt);
      v.classList.add("neg");
      vTag.textContent = "YES RICH";
      vBig.textContent = `NO at ${100 - mk}¢`;
      vSub.textContent = `Models ${loC}–${hiC}¢ vs YES ${mk}¢. NO edge +${c(noEdgeLo)}–${c(noEdgeHi)}¢ raw; taker net +${c(noEdgeLo - ntk)}–${c(noEdgeHi - ntk)}¢, limit +${c(noEdgeLo - mnk)}–${c(noEdgeHi - mnk)}¢.`;
    } else {
      vTag.textContent = "NO EDGE";
      vBig.textContent = `${loC}–${hiC}¢`;
      vSub.textContent = `Market ${mk}¢ inside model range at ${Tr}K. Taker fee ${fmtC(tk)}.`;
    }
  } else {
    vTag.textContent = "FAIR VALUE";
    vBig.textContent = `${c(lo)}–${c(hi)}¢`;
    vSub.textContent = `Model range for P(claims ≥ ${Tr}K). Enter market YES price for edge.`;
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
    "Tick = market. Fill past tick = cheap. Tap row for curve." :
    "Fair YES per model, 0–100¢. Faint mark = 50¢. Tap row for curve.") +
    (missing ? ` ${missing} off.` : "");

  const liveModels = models.filter(m => m.has);
  const legend = document.getElementById("edge-legend");
  legend.innerHTML = liveModels.map(m =>
    `<span class="lg"><span class="lg-dot" style="background:${m.hex}"></span>${m.name}</span>`).join("");
  drawEdge(liveModels, A, Tr, mkt);
  drawDist(cur, models[sel]);
  drawEV(cur, models[sel]);
}

const W = 336;
function svg(h, inner) { return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }

// Seeded PRNG for dot field
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawDist(cur, m) {
  const h = 160, pl = 8, pr = 8, pt = 12, pb = 28;
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

  // Dot field: rejection-sampled dots under the curve, colored by side of T.
  const rng = mulberry32(42);
  const nDots = 120;
  for (let i = 0; i < nDots; i++) {
    const x = xLo + rng() * span;
    const d = npdf((x - m.c) / m.sd);
    const y = rng() * d;
    const over = x >= cur.T;
    g += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y/d).toFixed(1)}" r="1.6" fill="${over ? m.hex : "var(--ink-3)"}" opacity="${over ? 0.8 : 0.3}"/>`;
  }

  // Threshold line (draggable)
  g += `<line x1="${X(cur.T)}" y1="${pt}" x2="${X(cur.T)}" y2="${h-pb}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 3"/>`;
  g += `<circle cx="${X(cur.T)}" cy="${pt}" r="5" fill="var(--ink)" opacity="0.7"/>`;

  // σ ticks
  [0, 1, 2, -1, -2].map(k => ({ v: m.c + k*m.sd, k })).forEach(o => {
    if (o.v > xLo && o.v < xHi) {
      g += `<line x1="${X(o.v)}" y1="${h-pb}" x2="${X(o.v)}" y2="${h-pb+5}" stroke="var(--ink-3)" stroke-width="1"/>`;
      g += `<text x="${X(o.v)}" y="${h-pb+13}" text-anchor="middle" class="ax">${o.k===0?"ctr":(o.k>0?"+"+o.k+"σ":o.k+"σ")}</text>`;
    }
  });

  // Markers
  const marks = [{ x: m.c, strong: true }];
  if (cur.C !== null) marks.push({ x: cur.C });
  if (cur.F !== null) marks.push({ x: cur.F });
  marks.filter(o => o.x > xLo && o.x < xHi).forEach(o => {
    const yo = Y(npdf((o.x - m.c)/m.sd));
    g += `<circle cx="${X(o.x)}" cy="${yo}" r="2.5" fill="${o.strong ? "var(--ink-2)" : "var(--ink-3)"}"/>`;
  });

  g += `<text x="${X(cur.T)}" y="${pt-4}" text-anchor="middle" class="ax">${Math.round(cur.T)}K</text>`;
  g += `<text x="${X(m.c)}" y="${h-pb+24}" text-anchor="middle" class="ax">${Math.round(m.c)}K</text>`;
  document.getElementById("chart-dist").innerHTML = svg(h, g);

  // σ chips
  const chipsEl = document.getElementById("z-chips");
  const defs = [{k:0.3}, {k:0.5}, {k:1}, {k:2}];
  chipsEl.innerHTML = defs.map(d => {
    const dist = d.k * m.sd;
    const p2 = Math.round(Phi(-d.k)*100);
    return `<button class="z-chip" data-k="${d.k}">${dist.toFixed(1)}K·${d.k}σ·${p2}¢</button>`;
  }).join("");

  document.getElementById("dist-model").textContent = m.name + " · σ " + m.sd.toFixed(1) + "K";
}

// Edge waterfall: model price bar decomposed into market + fee + net edge.
function drawEV(cur, m) {
  const wrap = document.getElementById("chart-ev");
  if (cur.mkt === null || !m.has) {
    wrap.innerHTML = `<div class="ev-empty">Enter market YES ¢</div>`;
    return;
  }
  const p = m.p;               // model fair price
  const mkt = cur.mkt;         // market price
  const tk = feeTaker(mkt);
  const mkf = feeMaker(mkt);
  const edge = p - mkt;        // raw edge (positive = model says cheap)
  const netT = edge - tk;
  const netM = edge - mkf;

  const h = 100, pl = 8, pr = 8, pt = 20, pb = 8;
  const iw = W - pl - pr;
  const barH = 14;
  const y1 = pt, y2 = pt + barH + 18;

  // Scale: 0 to max(p, mkt) + a bit
  const scale = Math.max(p, mkt, 0.01) * 1.15;
  const X = v => pl + (v / scale) * iw;

  let g = "";

  // Row 1: raw edge bar
  g += `<text x="${pl}" y="${y1-4}" class="ax">raw</text>`;
  g += `<rect x="${X(0)}" y="${y1}" width="${X(mkt)-X(0)}" height="${barH}" rx="3" fill="var(--chart-track)"/>`;
  if (edge > 0) {
    g += `<rect x="${X(mkt)}" y="${y1}" width="${X(p)-X(mkt)}" height="${barH}" rx="3" fill="var(--pos)" opacity="0.8"/>`;
  } else {
    g += `<rect x="${X(p)}" y="${y1}" width="${X(mkt)-X(p)}" height="${barH}" rx="3" fill="var(--neg)" opacity="0.8"/>`;
  }
  g += `<text x="${X(Math.max(p,mkt))+4}" y="${y1+11}" class="ax">${edge>0?"+":""}${Math.round(edge*100)}¢</text>`;

  // Row 2: after taker fee
  g += `<text x="${pl}" y="${y2-4}" class="ax">taker</text>`;
  g += `<rect x="${X(0)}" y="${y2}" width="${X(mkt)-X(0)}" height="${barH}" rx="3" fill="var(--chart-track)"/>`;
  if (edge > 0) {
    // fee eats into the green
    const feeEnd = Math.min(p, mkt + tk);
    const netEnd = mkt + edge - tk;
    if (tk > 0) g += `<rect x="${X(mkt)}" y="${y2}" width="${X(feeEnd)-X(mkt)}" height="${barH}" rx="3" fill="var(--neg)" opacity="0.5"/>`;
    if (netT > 0) g += `<rect x="${X(feeEnd)}" y="${y2}" width="${X(netEnd)-X(feeEnd)}" height="${barH}" rx="3" fill="var(--pos)" opacity="0.8"/>`;
  } else {
    g += `<rect x="${X(p)}" y="${y2}" width="${X(mkt)-X(p)}" height="${barH}" rx="3" fill="var(--neg)" opacity="0.8"/>`;
  }
  g += `<text x="${X(Math.max(p,mkt))+4}" y="${y2+11}" class="ax">${netT>0?"+":""}${Math.round(netT*100)}¢</text>`;

  // Row 3: after limit fee
  const y3 = y2 + barH + 18;
  g += `<text x="${pl}" y="${y3-4}" class="ax">limit</text>`;
  g += `<rect x="${X(0)}" y="${y3}" width="${X(mkt)-X(0)}" height="${barH}" rx="3" fill="var(--chart-track)"/>`;
  if (edge > 0) {
    const feeEndM = Math.min(p, mkt + mkf);
    const netEndM = mkt + edge - mkf;
    if (mkf > 0) g += `<rect x="${X(mkt)}" y="${y3}" width="${X(feeEndM)-X(mkt)}" height="${barH}" rx="3" fill="var(--neg)" opacity="0.5"/>`;
    if (netM > 0) g += `<rect x="${X(feeEndM)}" y="${y3}" width="${X(netEndM)-X(feeEndM)}" height="${barH}" rx="3" fill="var(--pos)" opacity="0.8"/>`;
  } else {
    g += `<rect x="${X(p)}" y="${y3}" width="${X(mkt)-X(p)}" height="${barH}" rx="3" fill="var(--neg)" opacity="0.8"/>`;
  }
  g += `<text x="${X(Math.max(p,mkt))+4}" y="${y3+11}" class="ax">${netM>0?"+":""}${Math.round(netM*100)}¢</text>`;

  wrap.innerHTML = svg(y3 + barH + pb, g);
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
    g += `<text x="${W/2}" y="${h-1}" text-anchor="middle" class="ax">Fair YES price as threshold moves</text>`;
  } else {
    hdr.textContent = "Net edge across thresholds";
    let mn = 0, mx = 0;
    const edges = models.map(m => ts.map(t => pge(m.center(A_,C_,F_), t, m.sd) - mkt));
    edges.forEach(es => es.forEach(e => { mn = Math.min(mn, e); mx = Math.max(mx, e); }));
    const scale = Math.max(Math.abs(mn), Math.abs(mx), 0.02) * 1.05;
    const Y = e => pt + ih/2 - (e/scale)*(ih/2);
    const tk = feeTaker(mkt);
    const mkf = feeMaker(mkt);
    g += `<line x1="${pl}" y1="${Y(0)}" x2="${W-pr}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="1" opacity="0.55"/>`;
    g += `<line x1="${pl}" y1="${Y(tk)}" x2="${W-pr}" y2="${Y(tk)}" stroke="var(--blue)" stroke-dasharray="2 2" opacity="0.7"/>`;
    g += `<text x="${pl}" y="${Y(tk)+9}" class="ax">taker</text>`;
    g += `<line x1="${pl}" y1="${Y(mkf)}" x2="${W-pr}" y2="${Y(mkf)}" stroke="var(--green)" stroke-dasharray="2 2" opacity="0.7"/>`;
    g += `<text x="${pl}" y="${Y(mkf)+9}" class="ax">limit</text>`;
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
    g += `<text x="${W/2}" y="${h-1}" text-anchor="middle" class="ax">Net YES edge · above dashed lines beats fees</text>`;
  }
  wrap.innerHTML = svg(h, g);
}

if (sessionStorage.getItem("cc_ok") === "1") {
  unlock();
} else {
  codeInput.focus();
}
