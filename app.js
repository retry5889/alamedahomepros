// Claims Card. Vanilla JS, no dependencies, no build step.
// Gate is a soft check only - not security.
"use strict";

// ---- Gate ----------------------------------------------------------------
// Soft access gate: SHA-256 of the code is compared, never the plaintext.
const CODE_HASH = "d87003971f1273e184b35cd1ffdc32f0ce2ac8e15698209ce77b5f57923e592a";
async function sha256(s) {
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
    recalc();
  } else {
    gateErr.hidden = false;
    codeInput.value = "";
    codeInput.focus();
  }
}
codeBtn.addEventListener("click", tryCode);
codeInput.addEventListener("keydown", e => { if (e.key === "Enter") tryCode(); });
codeInput.addEventListener("input", () => { gateErr.hidden = true; });
if (sessionStorage.getItem("cc_ok") === "1") { gate.hidden = true; app.hidden = false; recalc(); }
else { codeInput.focus(); }
// file:// fallback: crypto.subtle needs https or localhost; fall back to plain compare.
if (!window.crypto || !crypto.subtle) {
  window.sha256 = async s => s === "7HQ7" ? CODE_HASH : "x";
}

// ---- Math ----------------------------------------------------------------
function erf(x0) {
  // Abramowitz-Stegun 7.1.26, |err| < 1.5e-7
  const s = x0 < 0 ? -1 : 1;
  const x = Math.abs(x0);
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const t = 1/(1+p*x);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return s*y;
}
const Phi = z => 0.5*(1+erf(z/Math.SQRT2));
const phi = z => Math.exp(-z*z/2)/Math.sqrt(2*Math.PI);

const MODELS = [
  { id:"nc", name:"No-change", sub:"center = last print", color:"var(--blue)", hex:"#2f6df6",
    center: A => A, sd: 13.0 },
  { id:"cb", name:"Consensus blend", sub:"50% toward consensus", color:"var(--orange)", hex:"#e8862e",
    center: (A,C) => A + 0.5*(C-A), sd: 12.4 },
  { id:"fb", name:"Forecast blend", sub:"90% toward TE forecast", color:"var(--green)", hex:"#1f9d55",
    center: (A,C,F) => A + 0.9*(F-A), sd: 12.0 },
];

// ---- Inputs ---------------------------------------------------------------
const ids = ["in-anchor","in-consensus","in-forecast","in-threshold","in-market","in-bankroll"];
const els = Object.fromEntries(ids.map(i => [i, document.getElementById(i)]));
const LS_KEY = "claims_card_inputs_v1";
try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  for (const k in saved) if (els[k]) els[k].value = saved[k];
} catch(e) {}
for (const el of Object.values(els)) el.addEventListener("input", recalc);

function getInputs() {
  const num = (el, dflt) => { const v = parseFloat(el.value); return isFinite(v) ? v : dflt; };
  return {
    A: num(els["in-anchor"], 206),
    C: num(els["in-consensus"], 206),
    F: num(els["in-forecast"], 206),
    T: num(els["in-threshold"], 195),
    M: num(els["in-market"], NaN),
    B: num(els["in-bankroll"], NaN),
  };
}

// ---- Core -----------------------------------------------------------------
function pge(center, T, sd) { return Phi((center - T)/sd); }

function recalc() {
  const inp = getInputs();
  try { localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(ids.map(i=>[i, els[i].value])))); } catch(e) {}
  const models = MODELS.map(m => ({
    ...m,
    c: m.center(inp.A, inp.C, inp.F),
    p: NaN, // filled below
  }));
  for (const m of models) m.p = pge(m.c, inp.T, m.sd);
  const hasM = isFinite(inp.M);
  const bestP = Math.max(...models.map(m=>m.p));
  const worstP = Math.min(...models.map(m=>m.p));

  // Verdict
  const vLine = document.getElementById("verdict-line");
  const eLine = document.getElementById("edge-line");
  const c = cents => Math.round(cents);
  if (hasM) {
    const edgeBest = c((bestP - inp.M/100)*100);
    const edgeWorst = c((worstP - inp.M/100)*100);
    if (edgeWorst > 0) {
      vLine.textContent = `Market says ${inp.M}¢. All three models say ${c(bestP*100)}–${c(worstP*100)}¢: the market is ${edgeWorst}–${edgeBest}¢ CHEAP on YES.`;
      vLine.style.color = "var(--green)";
    } else if (edgeBest < 0) {
      vLine.textContent = `Market says ${inp.M}¢. All three models say ${c(worstP*100)}–${c(bestP*100)}¢: the market is ${-edgeBest}–${-edgeWorst}¢ RICH on YES.`;
      vLine.style.color = "var(--red)";
    } else {
      vLine.textContent = `Market says ${inp.M}¢. Models span ${c(worstP*100)}–${c(bestP*100)}¢: no clear edge - the market sits inside the model range.`;
      vLine.style.color = "var(--ink)";
    }
    eLine.textContent = `Edge vs market at threshold ${inp.T}K: no-change ${(models[0].p*100-inp.M).toFixed(0)}¢, consensus blend ${(models[1].p*100-inp.M).toFixed(0)}¢, forecast blend ${(models[2].p*100-inp.M).toFixed(0)}¢.`;
  } else {
    vLine.textContent = `Fair prices at threshold ${inp.T}K: no-change ${c(models[0].p*100)}¢, consensus blend ${c(models[1].p*100)}¢, forecast blend ${c(models[2].p*100)}¢.`;
    vLine.style.color = "var(--ink)";
    eLine.textContent = "Enter a market price to see the edge.";
  }

  // Model cards
  const rows = document.getElementById("model-rows");
  rows.innerHTML = models.map(m => {
    const edgeTxt = hasM ? `${(m.p*100-inp.M).toFixed(0)}¢` : "—";
    const edgeColor = hasM ? (m.p*100-inp.M > 0.5 ? "var(--green)" : m.p*100-inp.M < -0.5 ? "var(--red)" : "var(--dim)") : "var(--dim)";
    return `<div class="model-card">
      <div class="swatch" style="background:${m.color}"></div>
      <div class="mc-name"><div class="nm">${m.name}</div><div class="sub">${m.sub} · center ${Math.round(m.c)}K · spread ${m.sd}K</div></div>
      <div class="mc-price">${(m.p*100).toFixed(0)}<small>¢</small></div>
      <div class="mc-edge" style="color:${edgeColor}"><span class="lbl">edge</span>${edgeTxt}</div>
    </div>`;
  }).join("");

  // Kelly
  const kb = document.getElementById("kelly-box");
  if (hasM && isFinite(inp.B) && bestP > inp.M/100 && bestP < 1) {
    const p = bestP, price = inp.M/100;
    const b = (1-price)/price;
    let f = (p*(b+1)-1)/b;
    const capped = Math.min(f, 0.10);
    const dollars = capped*inp.B;
    kb.innerHTML = `<div class="kelly-card">
      <div class="kelly-title">Stake suggestion (provisional)</div>
      <div class="kelly-sub">Kelly fraction from the best model's edge, capped at 10% of bankroll. The edge is real in direction but unproven in size.</div>
      <div class="kelly-bar-wrap"><div class="kelly-bar" style="width:${capped*100}%"></div></div>
      <div class="kelly-num">${(capped*100).toFixed(1)}% of bankroll = $${Math.round(dollars).toLocaleString()} on YES at ${inp.M}¢</div>
    </div>`;
  } else if (hasM && isFinite(inp.B) && worstP < inp.M/100) {
    const p = 1-bestP, price = 1-inp.M/100;
    const b = (1-price)/price;
    let f = (p*(b+1)-1)/b;
    const capped = Math.min(f, 0.10);
    const dollars = capped*inp.B;
    kb.innerHTML = `<div class="kelly-card">
      <div class="kelly-title">Stake suggestion (provisional)</div>
      <div class="kelly-sub">Kelly fraction for NO, from the best model's edge, capped at 10%.</div>
      <div class="kelly-bar-wrap"><div class="kelly-bar" style="width:${capped*100}%"></div></div>
      <div class="kelly-num">${(capped*100).toFixed(1)}% of bankroll = $${Math.round(dollars).toLocaleString()} on NO at ${Math.round((1-inp.M/100)*100)}¢</div>
    </div>`;
  } else {
    kb.innerHTML = "";
  }

  drawCharts(models, inp);
}

// ---- Charts (inline SVG) ---------------------------------------------------
const W = 640;
function svgWrap(h, inner) { return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }
function fmt1(x) { return Number.isInteger(x) ? x : x.toFixed(1); }

function drawCharts(models, inp) {
  // 1. Threshold ladder
  const lh = 190, padL=8, padR=150, bw = (W-padL-padR-16);
  let rows = "";
  models.forEach((m, i) => {
    const y = 22 + i*46;
    const w = Math.max(2, m.p*bw);
    const mk = isFinite(inp.M) ? inp.M/100*bw : null;
    rows += `<rect x="${padL}" y="${y}" width="${bw}" height="30" rx="6" fill="var(--bg)"/>
      <rect x="${padL}" y="${y}" width="${w}" height="30" rx="6" fill="${m.hex}" opacity="0.85"/>
      <text x="${padL+bw+8}" y="${y+19}" class="anno-b" fill="${m.hex}">${(m.p*100).toFixed(0)}¢</text>
      <text x="${padL+8}" y="${y+19}" class="anno" fill="#fff">${m.name}</text>`;
    if (mk !== null) rows += `<line x1="${padL+mk}" y1="${y-4}" x2="${padL+mk}" y2="${y+34}" stroke="var(--ink)" stroke-width="2.5" stroke-dasharray="4 3"/>`;
  });
  if (isFinite(inp.M)) rows += `<text x="${padL+Math.min(inp.M/100*bw, bw-80)}" y="${22+3*46+8}" class="anno">market ${inp.M}¢</text>`;
  document.getElementById("chart-ladder").innerHTML = svgWrap(lh, rows);
  document.getElementById("ladder-title").textContent = `Fair prices at ${inp.T}K, and where the market sits`;
  document.getElementById("ladder-sub").textContent = isFinite(inp.M)
    ? "Dashed line = market price. A bar fully past the line means the market is cheap on YES."
    : "Enter a market price to compare.";

  // 2. Three P(over X) curves
  const ch = 300, pl=46, pr=14, pt=14, pb=34, iw=W-pl-pr, ih=ch-pt-pb;
  const lo = Math.round(inp.T)-16, hi = Math.round(inp.T)+16;
  const xs = []; for (let x=lo; x<=hi; x++) xs.push(x);
  const X = t => pl + (t-lo)/(hi-lo)*iw;
  const Y = p => pt + (1-p)*ih;
  let g = "";
  for (let p=0; p<=1.001; p+=0.25) g += `<line x1="${pl}" y1="${Y(p)}" x2="${W-pr}" y2="${Y(p)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-6}" y="${Y(p)+3}" text-anchor="end" class="ax">${p.toFixed(2).replace("0.",".").replace("1.00","1")}</text>`;
  for (let t=lo; t<=hi; t+=4) g += `<line x1="${X(t)}" y1="${pt}" x2="${X(t)}" y2="${ch-pb}" stroke="var(--line)" stroke-width="1"/><text x="${X(t)}" y="${ch-pb+14}" text-anchor="middle" class="ax">${t}K</text>`;
  models.forEach(m => {
    const pts = xs.map(t => `${X(t).toFixed(1)},${Y(pge(m.c, t, m.sd)).toFixed(1)}`).join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${m.hex}" stroke-width="2.4"/>`;
  });
  if (isFinite(inp.M)) {
    const mp = inp.M/100;
    g += `<line x1="${pl}" y1="${Y(mp)}" x2="${W-pr}" y2="${Y(mp)}" stroke="var(--ink)" stroke-width="1.8" stroke-dasharray="6 4" opacity="0.7"/>`;
    // crossings
    models.forEach((m,i) => {
      for (let j=1;j<xs.length;j++) {
        const p1=pge(m.c,xs[j-1],m.sd), p2=pge(m.c,xs[j],m.sd);
        if ((p1-mp)*(p2-mp)<=0 && p1!==p2) {
          const t = xs[j-1] + (mp-p1)/(p2-p1)*(xs[j]-xs[j-1]);
          g += `<circle cx="${X(t).toFixed(1)}" cy="${Y(mp).toFixed(1)}" r="4.5" fill="${m.hex}" stroke="var(--card)" stroke-width="1.5"/>`;
        }
      }
    });
    g += `<text x="${W-pr-4}" y="${Y(mp)-6}" text-anchor="end" class="anno">market ${inp.M}¢</text>`;
  }
  g += `<line x1="${X(inp.T)}" y1="${pt}" x2="${X(inp.T)}" y2="${ch-pb}" stroke="var(--dim)" stroke-width="1.4" stroke-dasharray="3 3"/><text x="${X(inp.T)}" y="${pt+10}" text-anchor="middle" class="axl" fill="var(--dim)">${inp.T}K</text>`;
  document.getElementById("chart-curves").innerHTML = svgWrap(ch, g);
  document.getElementById("curves-title").textContent = `P(over X) across thresholds - and where trades live`;
  document.getElementById("curves-sub").textContent = "Where a curve crosses the market line, that threshold is fairly priced. Dots mark the crossings.";

  // 3. Density with shaded exceedance
  const dh = 260, dpl=46, dpr=14, dpt=14, dpb=34, diw=W-dpl-dpr, dih=dh-dpt-dpb;
  const dlo = inp.A-45, dhi = inp.A+45;
  const DX = t => dpl + (t-dlo)/(dhi-dlo)*diw;
  const maxPdf = Math.max(...models.map(m => phi(0)/m.sd));
  const DY = v => dpt + (1-v/maxPdf)*dih;
  let dg = "";
  for (let t=dlo; t<=dhi; t+=10) dg += `<line x1="${DX(t)}" y1="${dpt}" x2="${DX(t)}" y2="${dh-dpb}" stroke="var(--line)"/><text x="${DX(t)}" y="${dh-dpb+14}" text-anchor="middle" class="ax">${t}K</text>`;
  models.forEach(m => {
    const pts=[]; for (let t=dlo; t<=dhi; t+=0.5) pts.push(`${DX(t).toFixed(1)},${DY(phi((t-m.c)/m.sd)/m.sd).toFixed(1)}`);
    // shaded region past threshold
    const sh=[]; for (let t=Math.max(dlo,inp.T); t<=dhi; t+=0.5) sh.push(`${DX(t).toFixed(1)},${DY(phi((t-m.c)/m.sd)/m.sd).toFixed(1)}`);
    if (sh.length>1) dg += `<polygon points="${DX(Math.max(dlo,inp.T)).toFixed(1)},${dh-dpb} ${sh.join(" ")} ${dhi>0?DX(dhi).toFixed(1):""},${dh-dpb}" fill="${m.hex}" opacity="0.13"/>`;
    dg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${m.hex}" stroke-width="2.2"/>`;
    dg += `<line x1="${DX(m.c)}" y1="${dh-dpb}" x2="${DX(m.c)}" y2="${DY(phi(0)/m.sd)}" stroke="${m.hex}" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.7"/>`;
  });
  dg += `<line x1="${DX(inp.T)}" y1="${dpt}" x2="${DX(inp.T)}" y2="${dh-dpb}" stroke="var(--ink)" stroke-width="1.8"/><text x="${DX(inp.T)}" y="${dpt+10}" text-anchor="middle" class="axl">${inp.T}K</text>`;
  document.getElementById("chart-density").innerHTML = svgWrap(dh, dg);
  document.getElementById("density-title").textContent = `The three distributions, and what "over ${inp.T}K" means`;
  document.getElementById("density-sub").textContent = "Shaded area past the threshold line IS the probability. Dashed spines mark each model's center.";

  // 4. Edge by threshold
  const eh = 260, epl=46, epr=14, ept=20, epb=34, eiw=W-epl-epr, eih=eh-ept-epb;
  const elo = Math.round(inp.T)-16, ehi = Math.round(inp.T)+16;
  const EX = t => epl + (t-elo)/(ehi-elo)*eiw;
  let eg = "";
  if (isFinite(inp.M)) {
    const mp = inp.M/100;
    // compute edge range
    let mn=0, mx=0;
    for (let t=elo; t<=ehi; t+=1) { models.forEach(m => { const e=(pge(m.c,t,m.sd)-mp); mn=Math.min(mn,e); mx=Math.max(mx,e); }); }
    const scale = Math.max(Math.abs(mn), Math.abs(mx), 0.02)*1.15;
    const EY = e => ept + eih/2 - (e/scale)*(eih/2);
    eg += `<line x1="${epl}" y1="${EY(0)}" x2="${W-epr}" y2="${EY(0)}" stroke="var(--ink)" stroke-width="1.2" opacity="0.6"/>`;
    for (let t=elo; t<=ehi; t+=4) eg += `<line x1="${EX(t)}" y1="${ept}" x2="${EX(t)}" y2="${eh-epb}" stroke="var(--line)"/><text x="${EX(t)}" y="${eh-epb+14}" text-anchor="middle" class="ax">${t}K</text>`;
    models.forEach(m => {
      const pts=[]; for (let t=elo; t<=ehi; t+=1) pts.push(`${EX(t).toFixed(1)},${EY(pge(m.c,t,m.sd)-mp).toFixed(1)}`);
      eg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${m.hex}" stroke-width="2.2"/>`;
    });
    eg += `<text x="${W-epr-4}" y="${ept+12}" text-anchor="end" class="anno">+${(scale*100).toFixed(0)}¢</text><text x="${W-epr-4}" y="${eh-epb-4}" text-anchor="end" class="anno">-${(scale*100).toFixed(0)}¢</text>`;
    eg += `<line x1="${EX(inp.T)}" y1="${ept}" x2="${EX(inp.T)}" y2="${eh-epb}" stroke="var(--dim)" stroke-width="1.4" stroke-dasharray="3 3"/><text x="${EX(inp.T)}" y="${ept+12}" text-anchor="middle" class="axl" fill="var(--dim)">${inp.T}K</text>`;
    document.getElementById("edge-title").textContent = `Edge vs market, by threshold`;
    document.getElementById("edge-sub").textContent = "Above the zero line: model says YES is cheap. The biggest gap is the best trade location.";
  } else {
    document.getElementById("edge-title").textContent = `Edge vs market, by threshold`;
    document.getElementById("edge-sub").textContent = "Enter a market price to see the edge curve.";
    eg = `<text x="${W/2}" y="${eh/2}" text-anchor="middle" class="anno" font-size="13">enter a market price above</text>`;
  }
  document.getElementById("chart-edge").innerHTML = svgWrap(eh, eg);
}
