import {FIELDS,REVIEW_ITEMS,MONTHS,DAYS,createProperty} from './schema.mjs';
const sum=a=>a.reduce((s,v)=>s+v,0);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const number=x=>typeof x==='number'&&Number.isFinite(x);
const definitions=Object.fromEntries(FIELDS.map(f=>[f.key,f]));

export function mortgagePayment(principal,annualRatePercent,years){
 if(![principal,annualRatePercent,years].every(number)||principal<0||annualRatePercent<0||years<=0)throw new Error('Invalid mortgage terms.');
 if(principal===0)return 0;
 const n=years*12,r=annualRatePercent/1200;
 return r===0?principal/n:principal*r/(-Math.expm1(-n*Math.log1p(r)));
}
export function validateProperty(p){
 const errors=[],missing=[],warnings=[];
 for(const f of FIELDS){
  const v=p?.values?.[f.key];
  const skip=(f.key==='rate'||f.key==='term')&&p?.values?.down===100;
  if(v==null){if(f.required&&!skip)missing.push(f.label);continue;}
  if(!number(v)||v<f.min||v>f.max||(f.step===1&&f.unit!=='usd'&&!Number.isInteger(v)))errors.push(`${f.label}: enter ${f.min} to ${f.max}${f.step===1&&f.unit!=='usd'?' in whole numbers':''}.`);
 }
 if(p?.values?.price===0)missing.push('A purchase price greater than zero');
 if(!Array.isArray(p?.months)||p.months.length!==12)errors.push('Twelve monthly assumptions are required.');
 else p.months.forEach((m,i)=>{
  if(!m||typeof m!=='object'){errors.push(`${MONTHS[i]}: invalid monthly inputs.`);return;}
  for(const [key,max] of [['adr',100000000],['occupancy',100],['blocked',DAYS[i]]]){
   const v=m[key];if(v==null&&key!=='blocked')continue;
   if(!number(v)||v<0||v>max||(key==='blocked'&&!Number.isInteger(v)))errors.push(`${MONTHS[i]} ${key}: enter 0 to ${max}.`);
  }
 });
 if(p?.values?.earnest>p?.values?.price)warnings.push('Earnest money exceeds the purchase price. Confirm what has already been paid.');
 if(p?.values?.down===100&&(p?.values?.lenderFees||p?.values?.prepaidInterest||p?.values?.appraisal))warnings.push('All-cash purchase: check lender, prepaid interest and appraisal charges. These entered dollar costs are still included.');
 if(p?.values?.prepaids>0)warnings.push('Escrow/deposits are tied-up cash, not extra operating expenses. Annual bills are accrued separately; actual payment dates are not modeled.');
 if(p?.values?.nightCap<365)warnings.push('Annual night cap is allocated proportionally across requested monthly bookings, not optimized toward higher-rate months.');
 return {errors,missing,warnings};
}
export function sanitizeProperty(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!input.values||typeof input.values!=='object'||Array.isArray(input.values))throw new Error('Backup contains an invalid property.');
 if(typeof input.name!=='string'||input.name.length>160||typeof input.id!=='string'||input.id.length>160||!input.id)throw new Error('Property name or identifier is invalid.');
 if(typeof input.example!=='boolean')throw new Error('Property example marker is invalid.');
 const p=createProperty();p.id=input.id;p.name=input.name;p.example=input.example;
 for(const f of FIELDS){
  if(!Object.hasOwn(input.values,f.key))throw new Error(`Backup is missing ${f.label}.`);
  const v=input.values[f.key];if(v!==null&&!number(v))throw new Error(`${f.label} must be a number or blank.`);p.values[f.key]=v;
 }
 if(!Array.isArray(input.months)||input.months.length!==12)throw new Error('Backup needs 12 months.');
 p.months=input.months.map((m,i)=>{
  if(!m||!['adr','occupancy','blocked'].every(k=>Object.hasOwn(m,k)))throw new Error(`Missing ${MONTHS[i]} assumptions.`);
  return {adr:m.adr,occupancy:m.occupancy,blocked:m.blocked};
 });
 if(!input.research||typeof input.research!=='object')throw new Error('Research checklist is missing.');
 for(const r of REVIEW_ITEMS){
  if(!['unknown','confirmed','blocked'].includes(input.research[r.key]))throw new Error(`Invalid status for ${r.label}.`);
  p.research[r.key]=input.research[r.key];
 }
 if(input.notes!=null&&(typeof input.notes!=='object'||Array.isArray(input.notes)))throw new Error('Invalid research notes.');
 for(const key of [...FIELDS.map(f=>f.key),...REVIEW_ITEMS.map(r=>`review:${r.key}`),'property']){
  const note=input.notes?.[key];if(note==null)continue;
  if(typeof note!=='object'||Array.isArray(note))throw new Error('Invalid research note.');
  p.notes[key]={};
  for(const k of ['source','date','note']){
   if(typeof note[k]!=='string'||note[k].length>12000)throw new Error('Invalid or overlong research note.');
   p.notes[key][k]=note[k];
  }
 }
 if(input.scenarios!==undefined){
  for(const side of ['down','up'])for(const key of ['adrChange','occupancyChange','costChange','startupChange']){
   const value=input.scenarios?.[side]?.[key];
   if(!number(value)||value < -100||value>(key==='occupancyChange'?100:500))throw new Error('Invalid scenario assumptions.');
   p.scenarios[side][key]=value;
  }
 }
 const {errors}=validateProperty(p);if(errors.length)throw new Error(errors[0]);return p;
}
function inputs(p){
 return Object.fromEntries(FIELDS.map(f=>{
  let value=p?.values?.[f.key];value=number(value)?clamp(value,f.min,f.max):0;
  if(f.step===1&&f.unit!=='usd')value=Math.floor(value);
  return [f.key,value];
 }));
}
function scenarioOptions(s={}){
 const get=(k,min,max)=>clamp(number(s[k])?s[k]:0,min,max);
 return {adr:get('adrChange',-100,500)/100+1,occupancy:get('occupancyChange',-100,100),cost:get('costChange',-100,500)/100+1,startup:get('startupChange',-100,500)/100+1};
}
function context(p,scenario){
 const v=inputs(p),s=scenarioOptions(scenario);
 const loan=v.price*(1-v.down/100),debt=mortgagePayment(loan,v.rate,v.term||30);
 const fixedItems=[
  ['Property taxes',v.propertyTax],['STR insurance',v.insurance],['HOA dues',v.hoa*12],
  ['Electricity & gas',v.electric*12],['Water & sewer',v.water*12],['Trash',v.trash*12],
  ['Internet',v.internet*12],['Grounds & snow',v.landscape*12],['Pool & spa service',v.pool*12],
  ['Pest control',v.pest*12],['Software',v.software*12],['Accounting & legal',v.accounting],
  ['Licenses & inspections',v.renewals],['Other fixed expenses',v.otherFixed*12],['Scheduled routine repairs',v.repairsAnnual]
 ].map(([label,amount])=>({label,amount:amount*s.cost,kind:'fixed'}));
 const fixed=sum(fixedItems.map(x=>x.amount));
 return {v,s,loan,debt,fixed,fixedItems};
}
function monthPlan(p,c,firstYear=false,uniformOccupancy=null){
 const {v,s}=c;
 const plan=MONTHS.map((label,i)=>{
  const m=p.months?.[i]||{};
  const availableNights=DAYS[i]-clamp(number(m.blocked)?m.blocked:0,0,DAYS[i]);
  const adr=Math.max(0,number(m.adr)?m.adr:v.adr)*s.adr;
  let occupancy=uniformOccupancy??clamp((number(m.occupancy)?m.occupancy:v.occupancy)+s.occupancy,0,100);
  if(firstYear){
   if(i<v.delay)occupancy=0;
   else if(i<v.delay+v.rampMonths)occupancy*=v.rampPercent/100;
  }
  return {label,availableNights,adr,closed:firstYear&&i<v.delay,occupiedNights:availableNights*occupancy/100};
 });
 const total=sum(plan.map(m=>m.occupiedNights)),factor=total>v.nightCap?v.nightCap/total:1;
 return plan.map(m=>({...m,occupiedNights:m.occupiedNights*factor}));
}
function statement(plan,c){
 const {v,s,fixed,debt}=c;
 return plan.map(m=>{
  const nights=m.occupiedNights,stays=nights/(v.stayLength||3),lodging=nights*m.adr,cleaningRevenue=stays*v.cleaningFee;
  const variableItems=[
   ['Platform & payment fees',(lodging+cleaningRevenue*v.platformOnCleaning)*v.platform/100],
   ['Management',(lodging+cleaningRevenue*v.managementOnCleaning)*v.management/100],
   ['Cleaning & laundry',stays*(v.cleaningCost+v.laundry)],
   ['Guest supplies',stays*v.turnoverSupplies+nights*v.nightSupplies],
   ['Owner-absorbed lodging tax',(lodging+cleaningRevenue)*v.lodgingTax/100],
   ['Revenue-based routine repairs',lodging*v.repairPercent/100]
  ].map(([label,amount])=>({label,amount:amount*s.cost,kind:'variable'}));
  const variable=sum(variableItems.map(x=>x.amount));
  const revenue=lodging+cleaningRevenue,expenses=fixed/12+variable;
  const reserve=m.closed?0:(lodging*v.replacementPercent/100+v.replacementAnnual/12)*s.cost;
  return {...m,stays,lodging,cleaningRevenue,revenue,variable,variableItems,expenses,debt,reserve,cashFlow:revenue-expenses-debt-reserve};
 });
}
function breakEven(p,c){
 const flow=occupancy=>sum(statement(monthPlan(p,c,false,occupancy),c).map(m=>m.cashFlow));
 if(flow(0)>=0)return {occupancy:0,occupiedNights:0,possible:true};
 if(flow(100)<-1e-8)return {occupancy:null,occupiedNights:null,possible:false};
 let lo=0,hi=100;
 for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(flow(mid)>=0)hi=mid;else lo=mid;}
 return {occupancy:hi,occupiedNights:sum(monthPlan(p,c,false,hi).map(m=>m.occupiedNights)),possible:true};
}
export function calculateBreakEven(p){return breakEven(p,context(p,{}));}
export function calculate(p,scenario={}){
 const checked=validateProperty(p),c=context(p,scenario),{v,s,loan,debt,fixed,fixedItems}=c;
 const monthly=statement(monthPlan(p,c),c),total=k=>sum(monthly.map(m=>m[k]));
 const revenue=total('revenue'),expenses=total('expenses'),noi=revenue-expenses;
 const setup=sum(FIELDS.filter(f=>f.group==='setup').map(f=>v[f.key]))*s.startup;
 const contingency=setup*v.contingency/100;
 const closingGross=sum(['lenderFees','title','transfer','legal','inspection','appraisal','prepaidInterest'].map(k=>v[k]))+loan*v.points/100;
 const closing=closingGross-Math.min(v.sellerCredit,closingGross);
 if(v.sellerCredit>closingGross)checked.warnings.push('Seller credits exceed modeled closing charges. Excess is not credited to you.');
 const startup={equity:v.price-loan,loan,closing,setup,contingency,carrying:v.delay*(fixed/12+debt),reserve:v.reserveCash,prepaids:v.prepaids};
 startup.items=[['Down payment / equity',startup.equity],['Closing & due diligence',closing],['Guest-ready setup',setup],['Setup contingency',contingency],['Pre-opening carrying',startup.carrying],['Opening operating reserve',startup.reserve],['Escrow & deposits',startup.prepaids]].map(([label,amount])=>({label,amount}));
 startup.total=sum(startup.items.map(x=>x.amount));startup.remaining=Math.max(0,startup.total-v.earnest);
 const cashFlow=total('cashFlow'),occupiedNights=total('occupiedNights'),availableNights=total('availableNights');
 const annual={revenue,lodging:total('lodging'),cleaningRevenue:total('cleaningRevenue'),occupiedNights,availableNights,stays:total('stays'),occupancy:availableNights?occupiedNights/availableNights*100:0,adr:occupiedNights?total('lodging')/occupiedNights:0,fixed,variable:total('variable'),expenses,noi,debtService:debt*12,replacementReserve:total('reserve'),cashFlow,cashOnCash:startup.total>0?cashFlow/startup.total*100:null,capRate:v.price>0?noi/v.price*100:null,dscr:debt>0?noi/(debt*12):null,ownerLabor:v.ownerHours*v.ownerRate*12};
 annual.economicCashFlow=cashFlow-annual.ownerLabor;
 let balance=startup.reserve+startup.carrying;
 const firstMonths=statement(monthPlan(p,c,true),c).map(m=>{balance+=m.cashFlow;return {...m,balance};});
 const lowestBalance=Math.min(startup.reserve+startup.carrying,...firstMonths.map(m=>m.balance));
 const firstYear={cashFlow:sum(firstMonths.map(m=>m.cashFlow)),lowestBalance,additionalCashNeeded:Math.max(0,-lowestBalance),monthly:firstMonths};
 const variableItems=monthly[0].variableItems.map((x,i)=>({...x,amount:sum(monthly.map(m=>m.variableItems[i].amount))}));
 const costs=[...fixedItems,...variableItems,{label:'Mortgage principal & interest',amount:annual.debtService,kind:'debt'},{label:'Capital replacement reserve',amount:annual.replacementReserve,kind:'reserve'}];
 const research={confirmed:REVIEW_ITEMS.filter(r=>p.research?.[r.key]==='confirmed').length,total:REVIEW_ITEMS.length};
 const blocked=REVIEW_ITEMS.filter(r=>p.research?.[r.key]==='blocked');
 let verdict;
 if(checked.errors.length)verdict={tone:'negative',title:'Check your inputs',detail:'Some values are outside their allowed range. Results below are provisional until corrected.'};
 else if(checked.missing.length)verdict={tone:'neutral',title:'A few numbers first',detail:'Complete the missing core assumptions before treating this as an investment estimate. Unentered costs are modeled as zero.'};
 else if(blocked.length)verdict={tone:'negative',title:'Resolve the flagged research',detail:`Unresolved: ${blocked.map(x=>x.label).join(', ')}. Financial returns do not override these concerns.`};
 else if(p.example)verdict={tone:'neutral',title:'An example, not a recommendation',detail:'These are fictional numbers for exploring the tool. Start a property with your own research before making a decision.'};
 else if(cashFlow<0)verdict={tone:'negative',title:'Costs exceed projected income',detail:'Your stabilized assumptions produce negative cash flow after debt and replacement reserves. Review pricing, demand and the cost structure.'};
 else if(research.confirmed<research.total)verdict={tone:'warning',title:'The research is not finished',detail:'The numbers alone cannot establish feasibility. Confirm operating permission, insurance, financing, comparable demand and cost quotes.'};
 else if(annual.cashOnCash<v.target)verdict={tone:'warning',title:'Below your return target',detail:`Projected cash-on-cash return is below your ${v.target}% target. This comparison excludes appreciation and income-tax effects.`};
 else if(firstYear.additionalCashNeeded>0)verdict={tone:'warning',title:'More operating cash is needed',detail:'The stabilized return meets your target, but the acquisition-year cash balance drops below zero. Increase reserves or revise the launch plan.'};
 else verdict={tone:'positive',title:'Meets your stated assumptions',detail:'Projected return meets your target and your research checklist is confirmed. This is a conditional screening result, not a purchase recommendation.'};
 if(annual.occupiedNights===0)checked.warnings.push('No nights are projected to sell. Fixed costs and debt continue.');
 return {valid:!checked.errors.length&&!checked.missing.length,...checked,startup,annual,monthly,firstYear,costs,breakEven:breakEven(p,c),verdict,research};
}
