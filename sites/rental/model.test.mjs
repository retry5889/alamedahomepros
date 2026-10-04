import test from 'node:test';
import assert from 'node:assert/strict';
import { createProperty, FIELDS } from './schema.mjs';
import { calculate, mortgagePayment, sanitizeProperty, validateProperty } from './model.mjs';
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const demo=()=>createProperty(true);
test('mortgage matches reference, zero APR and all cash',()=>{
 close(mortgagePayment(300000,6,30),1798.651575,0.00001);
 close(mortgagePayment(120000,0,10),1000);
 close(mortgagePayment(0,8,30),0);
 assert.throws(()=>mortgagePayment(100,4,0));
});
test('schema has thorough unique editable inputs',()=>{
 assert.ok(FIELDS.length>=65); assert.equal(new Set(FIELDS.map(f=>f.key)).size,FIELDS.length);
});
test('empty property cannot receive positive verdict or misleading return',()=>{
 const r=calculate(createProperty()); assert.notEqual(r.verdict.tone,'positive'); assert.ok(r.missing.length>0); assert.equal(r.annual.cashOnCash,null);
});
test('example stays clearly hypothetical and unverified',()=>{
 const p=demo(),r=calculate(p); assert.equal(p.example,true); assert.notEqual(r.verdict.tone,'positive'); assert.ok(r.research.confirmed<r.research.total);
});
test('annual totals reconcile to monthly operating statements',()=>{
 const r=calculate(demo());
 for(const key of ['revenue','expenses','cashFlow']) close(r.annual[key],r.monthly.reduce((s,m)=>s+m[key],0));
 close(r.annual.noi,r.annual.revenue-r.annual.expenses);
 close(r.annual.cashFlow,r.annual.noi-r.annual.debtService-r.annual.replacementReserve);
 close(r.annual.expenses,r.annual.fixed+r.annual.variable);
 close(r.costs.reduce((s,x)=>s+x.amount,0),r.annual.expenses+r.annual.debtService+r.annual.replacementReserve);
});
test('cash requirement reconciles and earnest is credited once',()=>{
 const p=demo();p.values.earnest=10000;const r=calculate(p);
 close(r.startup.total,r.startup.items.reduce((s,x)=>s+x.amount,0));
 close(r.startup.remaining,r.startup.total-10000);
 close(r.startup.equity+r.startup.loan,p.values.price);
});
test('all cash removes debt and does not alter operating NOI',()=>{
 const p=demo(),a=calculate(p);p.values.down=100;const b=calculate(p);
 close(b.annual.debtService,0);close(a.annual.noi,b.annual.noi);assert.equal(b.annual.dscr,null);
});
test('zero occupancy keeps fixed costs, debt, and zero cleaning',()=>{
 const p=demo();p.values.occupancy=0;const r=calculate(p);
 close(r.annual.revenue,0);close(r.annual.stays,0);close(r.annual.variable,0);assert.ok(r.annual.cashFlow<0);
});
test('cleaning revenue and turnover expense are not netted out',()=>{
 const p=demo();p.values.platform=0;p.values.management=0;p.values.lodgingTax=0;
 const a=calculate(p);p.values.cleaningFee+=25;const b=calculate(p);
 close(b.annual.cleaningRevenue-a.annual.cleaningRevenue,a.annual.stays*25);
 close(b.annual.expenses,a.annual.expenses);
});
test('replacement reserve affects cash but not NOI',()=>{
 const p=demo(),a=calculate(p);p.values.replacementAnnual+=1200;const b=calculate(p);
 close(a.annual.noi,b.annual.noi);close(a.annual.cashFlow-b.annual.cashFlow,1200);
});
test('monthly overrides and blocked nights govern annual income',()=>{
 const p=demo();p.values.occupancy=50;p.months[0]={adr:400,occupancy:100,blocked:11};
 const r=calculate(p);close(r.monthly[0].availableNights,20);close(r.monthly[0].occupiedNights,20);close(r.monthly[0].lodging,8000);
});
test('rental cap constrains nights including zero allowed',()=>{
 const p=demo();p.values.nightCap=100;close(calculate(p).annual.occupiedNights,100);
 p.values.nightCap=0;const r=calculate(p);close(r.annual.occupiedNights,0);assert.equal(r.breakEven.possible,false);
});
test('break even solves actual cash flow and reports impossible',()=>{
 const p=demo();p.values.down=100;const r=calculate(p);assert.equal(r.breakEven.possible,true);
 p.values.occupancy=r.breakEven.occupancy;close(calculate(p).annual.cashFlow,0,0.001);
 p.values.adr=1;assert.equal(calculate(p).breakEven.possible,false);
});
test('downside lowers cash flow; startup shock raises initial cash',()=>{
 const p=demo(),a=calculate(p),b=calculate(p,{adrChange:-15,occupancyChange:-10,costChange:15,startupChange:20});
 assert.ok(b.annual.cashFlow<a.annual.cashFlow);assert.ok(b.startup.total>a.startup.total);
});
test('pre-opening carrying funded once; first-year balance reconciles',()=>{
 const p=demo();p.values.delay=3;p.values.reserveCash=20000;const r=calculate(p);
 close(r.startup.carrying,3*(r.annual.fixed/12+r.annual.debtService/12));
 close(r.firstYear.monthly[2].balance,20000);
 close(r.firstYear.monthly[11].balance,r.startup.reserve+r.startup.carrying+r.firstYear.cashFlow);
 for(let i=0;i<3;i++)close(r.firstYear.monthly[i].revenue,0);
});
test('operating deficit flags additional funding',()=>{
 const p=demo();p.values.reserveCash=0;p.values.occupancy=0;p.values.delay=0;
 const r=calculate(p);assert.ok(r.firstYear.additionalCashNeeded>0);close(r.firstYear.additionalCashNeeded,-r.firstYear.lowestBalance);
});
test('bad number entries produce errors without NaN charts',()=>{
 const p=demo();p.values.price=-1;p.values.occupancy=150;
 const r=calculate(p);assert.ok(r.errors.length>=2);assert.notEqual(r.verdict.tone,'positive');assert.ok(Number.isFinite(r.annual.cashFlow));
});
test('strict imports reject corrupt data and sanitize untrusted properties',()=>{
 assert.throws(()=>sanitizeProperty({}));
 const p=demo();p.values.price='1000';assert.throws(()=>sanitizeProperty(p));
 p.values.price=Infinity;assert.throws(()=>sanitizeProperty(p));
 p.values.price=1000;p.months=[];assert.throws(()=>sanitizeProperty(p));
 const clean=demo();clean.evil='x';const s=sanitizeProperty(clean);assert.equal(s.evil,undefined);assert.equal(s.name,clean.name);
});
test('all inputs have declared numeric bounds',()=>{
 for(const f of FIELDS){assert.ok(Number.isFinite(f.min));assert.ok(Number.isFinite(f.max));assert.ok(f.help.length>10);}
});
test('fees including cleaning use explicit selected bases',()=>{
 const p=demo();p.values.platformOnCleaning=0;p.values.managementOnCleaning=0;const a=calculate(p);
 p.values.platformOnCleaning=1;p.values.managementOnCleaning=1;const b=calculate(p);
 close(b.annual.expenses-a.annual.expenses,a.annual.cleaningRevenue*(p.values.platform+p.values.management)/100);
});
test('positive verdict requires research confirmed and user target met',()=>{
 const p=demo();p.example=false;p.values.down=100;p.values.adr=600;p.values.target=1;
 assert.notEqual(calculate(p).verdict.tone,'positive');
 for(const key in p.research)p.research[key]='confirmed';
 assert.equal(calculate(p).verdict.tone,'positive');
 p.research.legal='blocked';assert.equal(calculate(p).verdict.tone,'negative');
});

test('cleared structural inputs stay incomplete instead of silently changing financing',()=>{
 for(const key of ['down','term','stayLength','nightCap','target']){const p=demo();p.values[key]=null;assert.ok(calculate(p).missing.length>0,key);}
});
test('zero-rate small loan is stable and finite',()=>{
 close(mortgagePayment(100000,1e-10,30),100000/360,1e-5);
});
test('seller credits are limited to modeled closing expenses',()=>{
 const p=demo();p.values.sellerCredit=1000000;const r=calculate(p);close(r.startup.closing,0);assert.ok(r.warnings.some(x=>x.includes('Seller credits')));
});
test('all 12 months closed: carrying funds the year without replacement transfers',()=>{
 const p=demo();p.values.delay=12;const r=calculate(p);close(r.firstYear.monthly[11].balance,p.values.reserveCash);close(r.firstYear.monthly.reduce((s,x)=>s+x.revenue,0),0);
});
test('scenario backup preserves modifiers and rejects invalid imported numbers',()=>{
 const p=demo();p.scenarios.down.adrChange=-30;assert.equal(sanitizeProperty(p).scenarios.down.adrChange,-30);p.scenarios.up.occupancyChange=101;assert.throws(()=>sanitizeProperty(p));
});
test('months fully blocked cannot meet positive fixed operating costs',()=>{
 const p=demo();p.months.forEach((m,i)=>m.blocked=[31,28,31,30,31,30,31,31,30,31,30,31][i]);const r=calculate(p);assert.equal(r.breakEven.possible,false);close(r.annual.availableNights,0);close(r.annual.revenue,0);
});

test('independent hand-calculated operating example',()=>{
 const p=demo();for(const f of FIELDS)p.values[f.key]=0;
 Object.assign(p.values,{price:100000,down:100,term:30,adr:100,occupancy:50,stayLength:2,nightCap:365,propertyTax:1200,insurance:600,cleaningFee:40,cleaningCost:30,management:10,platform:3,platformOnCleaning:1,rampPercent:100});
 const r=calculate(p);assert.equal(r.errors.length,0);close(r.annual.occupiedNights,182.5);close(r.annual.revenue,21900);close(r.annual.expenses,7019.5);close(r.annual.noi,14880.5);close(r.annual.cashFlow,14880.5);close(r.startup.total,100000);close(r.annual.cashOnCash,14.8805);
});
