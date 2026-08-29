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
  localStorage.setItem("cc_ok", "1");
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
  localStorage.removeItem("cc_ok");
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

// Fees in price-fraction units (1 = $1 = 100¢). Taker = 1.75% · p(1−p), max 0.44¢ at 50¢.
const feeTaker = p => 0.0175 * p * (1 - p);
const feeMaker = p => 0.25 * feeTaker(p);
const fmtC = f => (f * 100).toFixed(2) + "¢";

const MODELS = [
  { name:"No-change", short:"no-change", hex:"var(--m1)", dash:"", needs:null, center:(A,C,F)=>A, sd:13.0 },
  { name:"Consensus blend", short:"consensus blend", hex:"var(--m2)", dash:"7 4", needs:"C", center:(A,C,F)=>A+0.5*(C-A), sd:12.4 },
  { name:"Forecast blend", short:"forecast blend", hex:"var(--m3)", dash:"2 4", needs:"F", center:(A,C,F)=>A+0.9*(F-A), sd:12.0 },
];
const pge = (c,T,sd) => Phi((c-T)/sd);

// Inverse normal CDF (rational approximation, accurate to ~1e-5).
function invNormCdf(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161790, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  const q = p - 0.5, r = q*q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}



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
  const rng = (a, b) => c(a) === c(b) ? `${c(a)}\u00a2` : `${c(a)}\u2013${c(b)}\u00a2`;
  const rngP = (a, b) => c(a) === c(b) ? `+${c(a)}\u00a2` : `+${c(a)} to +${c(b)}\u00a2`;
  const nLive = models.filter(mm => mm.has).length;
  if (hasM) {
    const tk = feeTaker(mkt), maker = feeMaker(mkt);
    if (lo > mkt) {
      const edgeLo = lo - mkt, edgeHi = hi - mkt;
      v.classList.add("pos");
      vTag.textContent = "YES CHEAP";
      vBig.textContent = rngP(edgeLo, edgeHi);
      vSub.textContent = `Model ${rng(lo, hi)} vs YES ${mk}\u00a2. Net ${rngP(Math.max(0, edgeLo - tk), Math.max(0, edgeHi - tk))} taker, ${rngP(Math.max(0, edgeLo - maker), Math.max(0, edgeHi - maker))} limit.`;
    } else if (hi < mkt) {
      const noEdgeLo = mkt - hi, noEdgeHi = mkt - lo;
      v.classList.add("neg");
      vTag.textContent = "YES RICH";
      vBig.textContent = `NO at ${100 - mk}\u00a2`;
      vSub.textContent = `Model ${rng(lo, hi)} vs YES ${mk}\u00a2. NO edge ${rng(noEdgeLo, noEdgeHi)} raw; net ${rng(noEdgeLo - tk, noEdgeHi - tk)} taker, ${rng(noEdgeLo - maker, noEdgeHi - maker)} limit.`;
    } else {
      vTag.textContent = "NO EDGE";
      vBig.textContent = rng(lo, hi);
      vSub.textContent = `Market ${mk}\u00a2 sits inside the model range at ${Tr}K. Taker fee ${fmtC(tk)}.`;
    }
  } else {
    vTag.textContent = "FAIR VALUE";
    vBig.textContent = rng(lo, hi);
    vSub.textContent = (nLive > 1 ? "Model range" : "Model fair value") + ` for P(claims \u2265 ${Tr}K). Enter market YES price to see edge.`;
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
    (missing ? ` ${missing} model${missing > 1 ? "s" : ""} idle.` : "");

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
  const pl = 10, pr = 10;
  const pt = 28, curveH = 118;
  const axisY = pt + curveH;
  const tickLblY = axisY + 15;
  const waffleTop = tickLblY + 13;
  const ROWS = 10, COLS = 10, CELLS = 100, cellGap = 2, cellH = 9;
  const iw = W - pl - pr;
  const cellW = (iw - (COLS - 1) * cellGap) / COLS;
  const waffleH = ROWS * cellH + (ROWS - 1) * cellGap;
  const capY = waffleTop + waffleH + 16;
  const h = capY + 6;

  const half = 3.4;
  const span = 2 * half * m.sd;
  const xLo = m.c - span / 2, xHi = m.c + span / 2;
  const X = x => pl + (x - xLo) / span * iw;
  const Y = d => pt + curveH - d * curveH;
  const N = 100;

  let lineP = "", fillP = "";
  for (let i = 0; i <= N; i++) {
    const x = xLo + span * i / N;
    const y = Y(npdf((x - m.c) / m.sd));
    lineP += (i ? "L" : "M") + `${X(x).toFixed(1)} ${y.toFixed(1)} `;
  }
  const inT = cur.T >= xLo && cur.T <= xHi;
  if (cur.T < xHi) {
    const t0 = Math.max(cur.T, xLo);
    for (let i = 0; i <= N; i++) {
      const x = t0 + (xHi - t0) * i / N;
      const y = Y(npdf((x - m.c) / m.sd));
      fillP += (i ? "L" : "M") + `${X(x).toFixed(1)} ${y.toFixed(1)} `;
    }
    fillP += `L${X(xHi).toFixed(1)} ${Y(0).toFixed(1)} L${X(t0).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  }

  let g = "";
  g += `<line x1="${pl}" y1="${axisY}" x2="${W - pr}" y2="${axisY}" stroke="var(--line-2)" stroke-width="1"/>`;
  if (fillP) g += `<path d="${fillP}" fill="${m.hex}" opacity="0.22"/>`;
  g += `<path d="${lineP}" fill="none" stroke="${m.hex}" stroke-width="2"/>`;

  [2, 1, 0, -1, -2].map(k => ({ v: m.c + k * m.sd, k })).forEach(o => {
    if (o.v > xLo && o.v < xHi) {
      g += `<line x1="${X(o.v)}" y1="${axisY - 4}" x2="${X(o.v)}" y2="${axisY + 4}" stroke="var(--ink-3)" stroke-width="1"/>`;
      const lbl = o.k === 0 ? `ctr\u00b7${Math.round(m.c)}K` : (o.k > 0 ? "+" + o.k + "\u03c3" : o.k + "\u03c3");
      g += `<text x="${X(o.v)}" y="${tickLblY}" text-anchor="middle" class="ax">${lbl}</text>`;
    }
  });

  // Waffle: cell cI is the (cI+0.5)/100 quantile; filled when quantile >= T.
  for (let cI = 0; cI < CELLS; cI++) {
    const col = cI % COLS, row = Math.floor(cI / COLS);
    const q = m.c + m.sd * invNormCdf((cI + 0.5) / CELLS);
    const over = q >= cur.T;
    const cx = (pl + col * (cellW + cellGap)).toFixed(1);
    const cy = waffleTop + row * (cellH + cellGap);
    g += over
      ? `<rect x="${cx}" y="${cy}" width="${cellW.toFixed(1)}" height="${cellH}" fill="${m.hex}" rx="1"/>`
      : `<rect x="${cx}" y="${cy}" width="${cellW.toFixed(1)}" height="${cellH}" fill="var(--track)" stroke="var(--line-2)" stroke-width="1" rx="1"/>`;
  }
  const pct = Math.round(m.p * 100);
  g += `<text x="${pl}" y="${capY}" class="ax" font-size="11" fill="var(--ink-2)">${pct} of 100 outcomes clear ${Math.round(cur.T)}K \u2192 fair YES ${pct}\u00a2</text>`;

  // Threshold line (draggable)
  if (inT) {
    g += `<line x1="${X(cur.T)}" y1="${pt - 4}" x2="${X(cur.T)}" y2="${axisY}" stroke="var(--amber)" stroke-width="2" stroke-dasharray="4 3"/>`;
    g += `<circle cx="${X(cur.T)}" cy="${pt - 4}" r="4.5" fill="var(--amber)"/>`;
    const tx = Math.max(pl + 16, Math.min(W - pr - 16, X(cur.T)));
    g += `<text x="${tx}" y="${pt - 13}" text-anchor="middle" class="ax" font-weight="700" fill="var(--amber)">${Math.round(cur.T)}K</text>`;
  }

  document.getElementById("chart-dist").innerHTML = svg(h, g);

  // sigma chips
  const chipsEl = document.getElementById("z-chips");
  const defs = [{k:0.3}, {k:0.5}, {k:1}, {k:2}];
  chipsEl.innerHTML = defs.map(d => {
    const p2 = Math.round(Phi(-d.k)*100);
    return `<button class="z-chip" data-k="${d.k}">${d.k}\u03c3 ${p2}\u00a2</button>`;
  }).join("");

  document.getElementById("dist-model").textContent = m.name + " \u00b7 \u03c3 " + m.sd.toFixed(1) + "K";
}

// Edge card: cumulative rungs model-market -> less limit -> less taker.
function drawEV(cur, m) {
  const wrap = document.getElementById("chart-ev");
  if (cur.mkt === null || !m.has) {
    wrap.innerHTML = `<div class="ev-empty">enter market YES \u00a2 above</div>`;
    return;
  }
  const p = m.p, mkt = cur.mkt;
  const tk = feeTaker(mkt), mkf = feeMaker(mkt);
  const edge = p - mkt;
  const rungs = [
    { lbl: "model \u2212 market", net: edge },
    { lbl: "less limit fee",  net: edge - mkf },
    { lbl: "less taker fee",  net: edge - tk },
  ];
  const pl = 10, pr = 10, valW = 58, pt = 8, rowH = 42, barH = 12;
  const iw = W - pl - pr - valW;
  const ext = Math.max(...rungs.map(r => Math.abs(r.net)), 0.02) * 1.15;
  const X = v => pl + ((v + ext) / (2 * ext)) * iw;
  const capY = pt + 3 * rowH + 12;
  const h = capY + 6;
  let g = "";
  g += `<line x1="${X(0).toFixed(1)}" y1="${pt + 10}" x2="${X(0).toFixed(1)}" y2="${pt + 3 * rowH - 8}" stroke="var(--ink-3)" stroke-width="1"/>`;
  rungs.forEach((r, i) => {
    const y0 = pt + i * rowH;
    const col = r.net >= 0 ? "var(--up)" : "var(--dn)";
    const x0 = X(Math.min(0, r.net)), x1 = X(Math.max(0, r.net));
    g += `<text x="${pl}" y="${y0 + 10}" class="ax">${r.lbl}</text>`;
    g += `<rect x="${x0.toFixed(1)}" y="${y0 + 16}" width="${Math.max(1.5, x1 - x0).toFixed(1)}" height="${barH}" fill="${col}" opacity="0.9"/>`;
    g += `<text x="${W - pr}" y="${y0 + 26}" text-anchor="end" class="ax" font-weight="700" font-size="12" fill="${col}">${r.net >= 0 ? "+" : ""}${(r.net * 100).toFixed(1)}\u00a2</text>`;
  });
  g += `<text x="${pl}" y="${capY}" class="ax">bars right of the line = profit after fees</text>`;
  wrap.innerHTML = svg(h, g);
}

function drawEdge(models, A, Tr, mkt) {
  const wrap = document.getElementById("chart-edge");
  const hdr = document.getElementById("edge-hdr");
  const h = 200, pl = 10, pr = 10, pt = 18, pb = 36;
  const iw = W - pl - pr, ih = h - pt - pb;
  const lo = Tr - 12, hi = Tr + 12;
  const X = t => pl + (t - lo) / (hi - lo) * iw;
  const anch = t => t <= lo ? "start" : t >= hi ? "end" : "middle";
  const axLblY = h - pb + 15, capY = h - 5;
  const ts = []; for (let t = lo; t <= hi; t += 1) ts.push(t);
  const A_ = num("in-anchor") ?? 0, C_ = num("in-consensus") ?? A_, F_ = num("in-forecast") ?? A_;

  let g = "";
  for (let t = lo; t <= hi; t += 4) {
    g += `<line x1="${X(t)}" y1="${pt}" x2="${X(t)}" y2="${h - pb}" stroke="var(--line)"/>`;
    g += `<text x="${X(t)}" y="${axLblY}" text-anchor="${anch(t)}" class="ax">${t}K</text>`;
  }
  if (mkt === null) {
    hdr.textContent = "Fair price across thresholds";
    const Y = p => pt + (1 - p) * ih;
    g += `<line x1="${pl}" y1="${Y(0.5)}" x2="${W - pr}" y2="${Y(0.5)}" stroke="var(--ink-3)" stroke-dasharray="2 2" opacity="0.6"/>`;
    g += `<text x="${W - pr}" y="${Y(0.5) - 4}" text-anchor="end" class="ax">50\u00a2</text>`;
    models.forEach(m => {
      const pts = ts.map(t => `${X(t).toFixed(1)},${Y(pge(m.center(A_, C_, F_), t, m.sd)).toFixed(1)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${m.hex}" stroke-width="2"${m.dash ? ` stroke-dasharray="${m.dash}"` : ""}/>`;
    });
    g += `<line x1="${X(Tr)}" y1="${pt}" x2="${X(Tr)}" y2="${h - pb}" stroke="var(--amber)" stroke-dasharray="3 3"/>`;
    g += `<text x="${pl}" y="${capY}" class="ax">fair YES vs threshold \u00b7 amber = current T</text>`;
  } else {
    hdr.textContent = "Net edge across thresholds";
    let mn = 0, mx = 0;
    const edges = models.map(m => ts.map(t => pge(m.center(A_, C_, F_), t, m.sd) - mkt));
    edges.forEach(es => es.forEach(e => { mn = Math.min(mn, e); mx = Math.max(mx, e); }));
    const scale = Math.max(Math.abs(mn), Math.abs(mx), 0.02) * 1.05;
    const Y = e => pt + ih / 2 - (e / scale) * (ih / 2);
    const tk = feeTaker(mkt), mkf = feeMaker(mkt);
    g += `<line x1="${pl}" y1="${Y(0)}" x2="${W - pr}" y2="${Y(0)}" stroke="var(--ink)" stroke-width="1" opacity="0.55"/>`;
    g += `<line x1="${pl}" y1="${Y(tk)}" x2="${W - pr}" y2="${Y(tk)}" stroke="var(--ink-3)" stroke-dasharray="1 3" opacity="0.9"/>`;
    g += `<text x="${W - pr}" y="${Y(tk) - 3}" text-anchor="end" class="ax">taker</text>`;
    g += `<line x1="${pl}" y1="${Y(mkf)}" x2="${W - pr}" y2="${Y(mkf)}" stroke="var(--ink-3)" stroke-dasharray="5 3" opacity="0.9"/>`;
    g += `<text x="${pl}" y="${Y(mkf) + 11}" class="ax">limit</text>`;
    models.forEach((m, i) => {
      const pts = ts.map((t, j) => `${X(t).toFixed(1)},${Y(edges[i][j]).toFixed(1)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${m.hex}" stroke-width="2"${m.dash ? ` stroke-dasharray="${m.dash}"` : ""}/>`;
    });
    g += `<line x1="${X(Tr)}" y1="${pt}" x2="${X(Tr)}" y2="${h - pb}" stroke="var(--amber)" stroke-dasharray="3 3"/>`;
    g += `<text x="${W - pr}" y="${pt - 6}" text-anchor="end" class="ax">+${Math.round(scale * 100)}\u00a2</text>`;
    g += `<text x="${pl}" y="${capY}" class="ax">net YES edge \u00b7 above fee lines beats fees</text>`;
  }
  wrap.innerHTML = svg(h, g);
}

if (localStorage.getItem("cc_ok") === "1") {
  unlock();
} else {
  codeInput.focus();
}
