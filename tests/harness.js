const fs = require("fs");
const store = {};
function el(id) {
  if (store[id]) return store[id];
  return store[id] = {
    id, value: "", innerHTML: "", textContent: "", className: "", hidden: false,
    dataset: {}, classList: { add(c){ store[id].className += " "+c; } },
    setAttribute(){}, addEventListener(){}, focus(){}, blur(){},
    querySelector(){ return null; },
  };
}
global.document = {
  getElementById: el,
  querySelectorAll: () => [],
  body: { scrollTop: 0 },
  documentElement: { scrollTop: 0 },
};
global.window = { scrollTo(){}, addEventListener(){}, requestAnimationFrame: null, crypto: null };
global.sessionStorage = { getItem: () => null, setItem(){}, removeItem(){} };
global.fetch = () => new Promise(()=>{});

let code = fs.readFileSync("app.js", "utf8");
code += `
;globalThis.__test = { recalc, els, getCur: () => cur, invNormCdf, Phi };
`;
eval(code.replace('"use strict";', ""));

const T = globalThis.__test;
// math sanity
const q = T.invNormCdf(0.975);
console.log("invNormCdf(0.975) =", q.toFixed(5), Math.abs(q-1.95996)<1e-3 ? "OK" : "FAIL");
console.log("invNormCdf symmetry:", Math.abs(T.invNormCdf(0.3)+T.invNormCdf(0.7))<1e-9 ? "OK" : "FAIL");

// scenario 1: anchor 203, T 192, no market
T.els["in-anchor"].value = "203";
T.els["in-threshold"].value = "192";
T.els["in-consensus"].value = "";
T.els["in-forecast"].value = "";
T.els["in-market"].value = "";
T.recalc(true);
console.log("verdict:", el("v-tag").textContent, "|", el("v-big").textContent);
const dist = el("chart-dist").innerHTML;
const filled = (dist.match(/fill="var\(--blue\)" rx/g) || []).length;
const empty = (dist.match(/fill="var\(--track\)"/g) || []).length;
console.log("waffle filled/empty:", filled, empty, filled+empty === 100 ? "OK" : "FAIL");
console.log("expected filled:", Math.round(T.Phi((203-192)/13)*100));
// label bounds check across all charts
let bad = 0;
for (const id of ["chart-dist","chart-ev","chart-edge"]) {
  const svgStr = el(id).innerHTML;
  for (const m of svgStr.matchAll(/<text x="([\d.-]+)"/g)) {
    const x = parseFloat(m[1]);
    if (x < 0 || x > 336) { bad++; console.log("OOB text in", id, x); }
  }
}
console.log("text labels out of bounds:", bad);
console.log("no market -> ev:", el("chart-ev").innerHTML.includes("ev-empty") ? "placeholder OK" : "FAIL");
console.log("edge hdr:", el("edge-hdr").textContent);

// scenario 2: market 72
T.els["in-market"].value = "72";
T.recalc(true);
console.log("verdict2:", el("v-tag").textContent, "|", el("v-big").textContent);
console.log("v-sub2:", el("v-sub").textContent);
const ev = el("chart-ev").innerHTML;
console.log("ev rungs:", (ev.match(/<rect/g)||[]).length === 3 ? "3 OK" : "FAIL", "| nets:", [...ev.matchAll(/>([+\-]\d+\.\d)\u00a2</g)].map(m=>m[1]).join(", "));
console.log("edge hdr2:", el("edge-hdr").textContent);

// scenario 3: market 95 (YES RICH)
T.els["in-market"].value = "95";
T.recalc(true);
console.log("verdict3:", el("v-tag").textContent, "|", el("v-big").textContent);

// scenario 4: all models live, no market -> range
T.els["in-consensus"].value = "210";
T.els["in-forecast"].value = "212";
T.els["in-market"].value = "";
T.recalc(true);
console.log("verdict4:", el("v-tag").textContent, "|", el("v-big").textContent);
console.log("legend:", (el("edge-legend").innerHTML.match(/lg-dot/g)||[]).length, "entries");
