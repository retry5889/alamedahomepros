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
async function tryCode() {
  const h = await sha256(codeInput.value.trim().toUpperCase());
  if (h === CODE_HASH) {
    sessionStorage.setItem("cc_ok", "1");
    gate.hidden = true;
    app.hidden = false;
    start();
  } else {
    gateErr.hidden = false;
    codeInput.value = "";
    codeInput.focus();
  }
}
codeBtn.addEventListener("click", tryCode);
codeInput.addEventListener("keydown", e => { if (e.key === "Enter") tryCode(); });
codeInput.addEventListener("input", () => { gateErr.hidden = true; });

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

const MODELS = [
  { name:"No-change", hex:"#2f6df6", center:(A,C,F)=>A, sd:13.0 },
  { name:"Consensus blend", hex:"#e8862e", center:(A,C,F)=>A+0.5*(C-A), sd:12.4 },
  { name:"Forecast blend", hex:"#1f9d55", center:(A,C,F)=>A+0.9*(F-A), sd:12.0 },
];
const pge = (c,T,sd) => Phi((c-T)/sd);

// ---- State ----
const FIELDS = ["in-anchor","in-consensus","in-forecast","in-threshold","in-market"];
const els = Object.fromEntries(FIELDS.map(id => [id, document.getElementById(id)]));
let started = false;

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
      const el = document.getElementById("as-of");
      if (d.fetched_at) el.textContent = "values as of " + d.fetched_at;
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
  const t = document.getElementById("edge-toggle");
  t.addEventListener("click", () => {
    const w = document.getElementById("chart-edge-wrap");
    w.hidden = !w.hidden;
    t.textContent = w.hidden ? "Show edge by threshold" : "Hide edge by threshold";
  });
}

function num(id, dflt) {
  const v = parseFloat(els[id].value);
  return isFinite(v) ? v : dflt;
}

function recalc() {
  const A = num("in-anchor", NaN);
  const C = num("in-consensus", A);
  const F = num("in-forecast", A);
  const T = num("in-threshold", NaN);
  const M = num("in-market", NaN);
  if (!isFinite(A) || !isFinite(T)) return;
  const models = MODELS.map(m => ({...m, c: m.center(A,C,F), p: pge(m.center(A,C,F), T, m.sd)}));
  const best = Math.max(...models.map(m=>m.p));
  const worst = Math.min(...models.map(m=>m.p));
  const hasM = isFinite(M);
  const c = x => Math.round(x*100);

  // Verdict
  const v = document.getElementById("verdict");
  v.className = "verdict";
  if (hasM) {
    const lo = c(worst), hi = c(best), mk = Math.round(M);
    if (lo > mk) { v.textContent = `Market ${mk}¢ is ${lo-mk} to ${hi-mk}¢ cheap on YES.`; v.classList.add("pos"); }
    else if (hi < mk) { v.textContent = `Market ${mk}¢ is ${mk-hi} to ${mk-lo}¢ rich on YES.`; v.classList.add("neg"); }
    else { v.textContent = `Market ${mk}¢ sits inside the model range ${lo}–${hi}¢. No edge.`; }
  } else {
    v.textContent = `Fair prices at ${Math.round(T)}K: ${c(models[0].p)}, ${c(models[1].p)}, ${c(models[2].p)}¢.`;
  }

  // Prices list
  document.getElementById("prices").innerHTML = models.map(m => {
    let edgeHtml = "<span>—</span>";
    if (hasM) {
      const e = Math.round(m.p*100 - M);
      edgeHtml = `<span class="${e>0?"pos":e<0?"neg":""}">${e>0?"+":""}${e}¢</span>`;
    }
    return `<div class="p-row">
      <span class="p-dot" style="background:${m.hex}"></span>
      <span class="p-name">${m.name}</span>
      <span class="p-price">${c(m.p)}<small>¢</small></span>
      <span class="p-edge">${edgeHtml}</span>
    </div>`;
  }).join("");

  drawLadder(models, T, hasM ? M/100 : null, Math.round(T));
  drawEdge(models, A, Math.round(T), hasM ? M/100 : null);
}

// ---- Charts ----
const W = 360;
function svg(h, inner) { return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }

function drawLadder(models, T, mkt, Tr) {
  const h = 150, padL = 4, padR = 62, barH = 30, gap = 14;
  const bw = W - padL - padR;
  let g = "";
  models.forEach((m, i) => {
    const y = 8 + i*(barH+gap);
    const w = Math.max(3, m.p*bw);
    g += `<rect x="${padL}" y="${y}" width="${bw}" height="${barH}" rx="5" fill="#f2f2f2"/>`;
    g += `<rect x="${padL}" y="${y}" width="${w}" height="${barH}" rx="5" fill="${m.hex}"/>`;
    g += `<text x="${padL+10}" y="${y+20}" font-size="12" fill="#fff" font-weight="600">${m.name}</text>`;
    g += `<text x="${padL+bw+8}" y="${y+21}" font-size="15" font-weight="600" fill="${m.hex}">${Math.round(m.p*100)}¢</text>`;
  });
  if (mkt !== null) {
    const x = padL + mkt*bw;
    const y0 = 2, y1 = 8 + 3*(barH+gap) - gap + 6;
    g += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#111" stroke-width="2" stroke-dasharray="5 4"/>`;
    g += `<text x="${Math.min(x+5, W-58)}" y="${y1+13}" font-size="11" fill="#111" font-weight="600">market ${Math.round(mkt*100)}¢</text>`;
  }
  g += `<text x="${W/2}" y="${h-2}" text-anchor="middle" class="ax">P(claims ≥ ${Tr}K)</text>`;
  document.getElementById("chart-ladder").innerHTML = svg(h, g);
}

function drawEdge(models, A, Tr, mkt) {
  const wrap = document.getElementById("chart-edge");
  if (mkt === null) {
    wrap.innerHTML = svg(60, `<text x="${W/2}" y="34" text-anchor="middle" class="ax" font-size="12">enter a market price to see the edge curve</text>`);
    return;
  }
  const h = 190, pl = 6, pr = 10, pt = 16, pb = 26;
  const iw = W - pl - pr, ih = h - pt - pb;
  const lo = Tr - 12, hi = Tr + 12;
  const X = t => pl + (t-lo)/(hi-lo)*iw;
  let mn = 0, mx = 0;
  const ts = []; for (let t = lo; t <= hi; t += 1) ts.push(t);
  const A_ = num("in-anchor", 0), C_ = num("in-consensus", A_), F_ = num("in-forecast", A_);
  const edges = MODELS.map(m => ts.map(t => pge(m.center(A_,C_,F_), t, m.sd) - mkt));
  edges.forEach(es => es.forEach(e => { mn = Math.min(mn, e); mx = Math.max(mx, e); }));
  const scale = Math.max(Math.abs(mn), Math.abs(mx), 0.02) * 1.2;
  const Y = e => pt + ih/2 - (e/scale)*(ih/2);
  let g = `<line x1="${pl}" y1="${Y(0)}" x2="${W-pr}" y2="${Y(0)}" stroke="#111" stroke-width="1" opacity="0.55"/>`;
  for (let t = lo; t <= hi; t += 4) {
    g += `<line x1="${X(t)}" y1="${pt}" x2="${X(t)}" y2="${h-pb}" stroke="#eee"/>`;
    g += `<text x="${X(t)}" y="${h-pb+14}" text-anchor="middle" class="ax">${t}K</text>`;
  }
  MODELS.forEach((m, i) => {
    const pts = ts.map((t, j) => `${X(t).toFixed(1)},${Y(edges[i][j]).toFixed(1)}`).join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${m.hex}" stroke-width="2"/>`;
  });
  g += `<line x1="${X(Tr)}" y1="${pt}" x2="${X(Tr)}" y2="${h-pb}" stroke="#888" stroke-dasharray="3 3"/>`;
  g += `<text x="${W-pr}" y="${pt-3}" text-anchor="end" class="ax">+${Math.round(scale*100)}¢</text>`;
  g += `<text x="${W-pr}" y="${h-pb+13}" text-anchor="end" class="ax">−${Math.round(scale*100)}¢</text>`;
  document.getElementById("chart-edge").innerHTML = svg(h, g);
}

if (sessionStorage.getItem("cc_ok") === "1") { gate.hidden = true; app.hidden = false; start(); }
else { codeInput.focus(); }
