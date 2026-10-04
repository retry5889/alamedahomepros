/* USD assumptions. Example amounts are fictional, not market estimates. */
export const GROUPS = [
 {id:'purchase',title:'The purchase',description:'What you pay, how you finance it, and what is already paid.',page:'startup'},
 {id:'closing',title:'Getting the keys',description:'Cash due beyond the down payment. Use lender and escrow quotes.',page:'startup'},
 {id:'setup',title:'Making it guest-ready',description:'One-time work and everything needed for the first guest.',page:'startup'},
 {id:'opening',title:'Room for the unexpected',description:'Contingency, launch delay and cash held back for operations.',page:'startup'},
 {id:'fixed',title:'Costs that keep coming',description:'These accrue even when the property is empty.',page:'recurring'},
 {id:'variable',title:'The cost of each booking',description:'Per-stay, per-night and percentage-based expenses.',page:'recurring'},
 {id:'replacement',title:'Upkeep & your time',description:'Separate recurring repairs, future replacements and owner labor.',page:'recurring'},
 {id:'income',title:'Your booking assumptions',description:'Use achieved rates and seasonal demand, not just advertised prices.',page:'income'},
 {id:'goals',title:'Your investment target',description:'Choose your own minimum return. No appreciation or tax benefit assumed.',page:'income'}
];
let group;
const fields=[];
function f(key,label,unit,example,help,opts={}){
 const max=unit==='percent'?100:unit==='usd'?100000000:100000;
 fields.push({key,label,unit,group,min:0,max,step:0.01,default:0,required:false,example,help,...opts});
}
group='purchase';
f('price','Purchase price','usd',525000,'Use your expected accepted offer, not an automated valuation.',{default:null,required:true});
f('down','Down payment','percent',25,'100% models an all-cash purchase. Other acquisition and startup costs are funded with cash.',{default:25});
f('rate','Mortgage interest rate','percent',6.75,'Fixed annual note rate, not APR. Confirm that the loan allows short-term rental use.',{default:null,required:true,max:40});
f('term','Loan amortization','years',30,'Fully amortizing monthly payments only. No balloon, adjustable-rate or interest-only modeling.',{default:30,min:1,max:50,step:1});
f('earnest','Earnest money already paid','usd',10000,'Credited against remaining cash needed. Already included in the purchase, never added twice.');
group='closing';
f('sellerCredit','Seller credits','usd',0,'Credits reduce closing cash only, limited to modeled closing charges. Confirm lender limits.');
f('points','Loan points','percent',0.5,'Percentage of loan principal paid once at closing. Zero for all-cash.');
f('lenderFees','Other lender fees','usd',1200,'Origination and underwriting fees excluding points. Enter zero for all-cash.');
f('title','Title & escrow fees','usd',2200,'Quote from the closing agent. Do not include the purchase price or loan principal.');
f('transfer','Transfer & recording taxes','usd',800,'Use the local transfer-tax and recording charges quoted for this purchase.');
f('legal','Purchase legal review','usd',650,'Contract, title and local rental-restriction review.');
f('inspection','Property inspections','usd',900,'General, pest, septic, roof and other specialist inspections.');
f('appraisal','Appraisal & survey','usd',700,'Lender appraisal and any survey needed for purchase.');
f('prepaidInterest','Prepaid interest','usd',900,'Interest charged between closing and the first regular payment period.');
f('prepaids','Escrow & refundable deposits','usd',3500,'Cash tied up in escrow or refundable deposits, not an additional expense. Do not also enter an annual premium already included in recurring costs; see model limitations.');
group='setup';
f('renovation','Repairs & renovation','usd',16000,'Written contractor estimates. Do not include the routine repairs budget below.');
f('permits','Building permits & design','usd',800,'One-time permits and professional design or engineering for the work.');
f('furniture','Furniture & mattresses','usd',14000,'Beds, seating, dining, storage and outdoor furniture, including tax and delivery.');
f('appliances','Appliances','usd',3500,'Purchase and installation. Future replacements are reserved separately.');
f('linens','Linens & towels','usd',1200,'Initial sets plus backup inventory for turnovers.');
f('kitchen','Kitchen & housewares','usd',1600,'Cookware, tableware, small appliances and guest essentials.');
f('technology','Locks, Wi-Fi & technology','usd',700,'Smart locks, network setup and televisions. No ongoing subscriptions here.');
f('safety','Safety & accessibility','usd',450,'Required alarms, extinguishers, signage and accessibility work. Confirm local requirements.');
f('outdoor','Outdoor setup','usd',1500,'Outdoor amenities and initial landscaping. Maintenance belongs in recurring costs.');
f('photography','Photography & launch','usd',700,'Professional photos, listing setup, branding and initial marketing.');
f('deepClean','Opening deep clean','usd',500,'One-time post-construction or pre-opening clean.');
f('initialSupplies','Initial supplies','usd',350,'Initial consumables and cleaning inventory; replenishment is a running cost.');
f('businessSetup','Business & STR registration','usd',600,'Initial business setup, permit application, legal and accounting setup. Annual renewals belong in recurring costs.');
f('otherSetup','Other one-time costs','usd',0,'Delivery, assembly, travel or other startup costs not captured above. Explain in your research note.');
group='opening';
f('contingency','Startup contingency','percent',15,'Applied to guest-ready setup costs, not to the purchase price, closing or opening reserve.',{default:15});
f('delay','Months before opening','months',2,'Whole months after acquisition with no guests. Fixed costs and debt are pre-funded as carrying cash.',{max:12,step:1});
f('rampMonths','Initial ramp-up period','months',3,'Whole months after opening at reduced occupancy, before reaching your regular assumptions.',{max:12,step:1});
f('rampPercent','Occupancy during ramp-up','percent',65,'Percentage of your normal occupancy. 65 means a 60% normal occupancy becomes 39%.',{default:100});
f('reserveCash','Opening operating reserve','usd',15000,'Cash retained for operating losses and emergencies, separate from the pre-opening carrying budget.');
group='fixed';
f('propertyTax','Property tax / year','usd',6300,'Research assessed value after purchase and all local assessments. Do not add lender escrow payments too.',{default:null,required:true});
f('insurance','STR insurance / year','usd',3200,'Written quote explicitly allowing short-term rentals. Include any required flood, fire or liability coverage.',{default:null,required:true});
f('hoa','HOA dues / month','usd',0,'Include association dues. Verify rental restrictions and pending special assessments separately.');
f('electric','Electricity & gas / month','usd',220,'Full average monthly bill, including empty months. Avoid also charging these same costs per occupied night.');
f('water','Water & sewer / month','usd',90,'For septic properties include recurring service or a separate maintenance allowance.');
f('trash','Trash service / month','usd',45,'Scheduled collection and any fixed bin charges.');
f('internet','Internet / month','usd',75,'Internet and any recurring television subscriptions.');
f('landscape','Landscaping / month','usd',100,'Recurring yard, grounds or snow service averaged over the year.');
f('pool','Pool or spa service / month','usd',0,'Routine service only; reserve for equipment replacement separately.');
f('pest','Pest control / month','usd',30,'Annual contract divided by 12 if billed less often.');
f('software','Software / month','usd',35,'Property management, pricing, smart-lock and other software subscriptions.');
f('accounting','Accounting & legal / year','usd',1200,'Bookkeeping, tax preparation and recurring legal support. Income taxes themselves are not modeled.');
f('renewals','Licenses & inspections / year','usd',350,'Annual STR permit renewal, business license and routine inspection costs.');
f('otherFixed','Other fixed costs / month','usd',50,'Marketing, local-contact retainers, storage or other recurring charges.');
group='variable';
f('platform','Platform & payment fees','percent',3,'Host-side booking and payment fees. Use a channel-weighted quote; this is not a current platform fee recommendation.');
f('platformOnCleaning','Platform fees include cleaning','count',1,'1 applies fees to lodging plus cleaning revenue. 0 applies fees to lodging only.',{max:1,step:1,default:1});
f('management','Management fee','percent',18,'Revenue percentage charged by the manager. Fixed retainers belong in other fixed costs.');
f('managementOnCleaning','Management includes cleaning','count',0,'1 applies management to lodging plus cleaning revenue. 0 applies it to lodging only.',{max:1,step:1});
f('cleaningCost','Cleaner cost / stay','usd',145,'Actual turnover charge paid, separately from what you charge the guest.',{default:null,required:true});
f('laundry','Laundry / stay','usd',15,'Enter zero if included in the cleaning quote.');
f('turnoverSupplies','Restocking / stay','usd',10,'Welcome items and supplies used per booking, excluding per-night consumables.');
f('nightSupplies','Consumables / occupied night','usd',4,'Incremental guest supplies. Do not duplicate items in per-stay restocking.');
f('lodgingTax','Owner-absorbed lodging tax','percent',0,'Only tax you pay out of revenue. Guest-collected and remitted taxes are pass-through and excluded. Applied to lodging plus cleaning here; confirm your local tax base.');
group='replacement';
f('repairPercent','Routine repairs / lodging revenue','percent',3,'Variable allowance for minor maintenance and unreimbursed damage. Excludes major replacements.');
f('repairsAnnual','Fixed routine repairs / year','usd',600,'Scheduled servicing or minimum repairs allowance, additional to the percentage budget.');
f('replacementPercent','Replacement reserve / lodging revenue','percent',3,'Cash set aside for future capital replacements. Excluded from NOI, deducted from spendable cash.');
f('replacementAnnual','Additional replacement reserve / year','usd',1200,'Fixed annual allocation for roof, HVAC, furniture and appliance replacement. Do not also subtract reserve-funded replacement purchases.');
f('ownerHours','Owner work / month','hours',10,'Your time on messages, coordination, purchasing and bookkeeping. Economic cost only, not an actual cash expense.');
f('ownerRate','Value of your time / hour','usd',35,'Used to show cash flow after valuing your work, separately from actual cash flow.');
group='income';
f('adr','Average nightly rate','usd',260,'Achieved nightly rate after discounts, excluding guest fees and taxes. Source comparable properties, dates and room mix.',{default:null,required:true});
f('occupancy','Booked share of available nights','percent',58,'Booked nights divided by nights offered to guests, not all calendar nights. Use monthly overrides for seasonality.',{default:null,required:true});
f('stayLength','Average length of stay','nights',3,'Expected booked nights per reservation. Drives cleaning income and turnover costs.',{default:3,min:1,max:365});
f('cleaningFee','Cleaning fee charged / stay','usd',160,'Guest fee before platform or manager deductions. Cleaner expense is modeled separately.');
f('nightCap','Annual rental-night limit','nights',365,'Maximum nights legally or operationally allowed to be sold. 365 is unrestricted for this non-leap model; 0 means no rentals.',{default:365,max:365,step:1});
group='goals';
f('target','Target cash-on-cash return','percent',8,'Your minimum annual pre-income-tax cash return on all initial cash, including opening reserves.',{default:8});
for(const key of ['down','term','stayLength','nightCap','target'])fields.find(f=>f.key===key).required=true;
export const FIELDS=fields;
export const REVIEW_ITEMS=[
 {key:'legal',label:'Legal right to operate',help:'Confirm zoning, STR permits, transferability, minimum stay, night caps and maximum guests directly with the jurisdiction.'},
 {key:'hoa',label:'HOA, title & deed restrictions',help:'Read governing documents, rental rules and special assessments. Confirm not applicable when there is no restriction.'},
 {key:'insurance',label:'Insurance that covers this use',help:'Obtain a written STR quote, exclusions and deductible amounts. Do not rely on a standard homeowner policy.'},
 {key:'lender',label:'Financing allows short stays',help:'Confirm rental use, rate, amortization and cash requirements with the lender. Confirm not applicable for all-cash.'},
 {key:'demand',label:'Revenue backed by comparable stays',help:'Record achieved rates, occupancy, seasonal availability and average stay length for genuinely comparable properties.'},
 {key:'quotes',label:'Startup & recurring costs checked',help:'Verify contractor, furnishing, cleaner, manager, utilities, post-sale tax and insurance estimates. Review every zero-cost assumption.'}
];
export const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
export function createProperty(example=false){
 return {id:globalThis.crypto?.randomUUID?.()||`p-${Date.now()}-${Math.random().toString(36).slice(2)}`,name:example?'The headland cottage':'Untitled property',example,
 values:Object.fromEntries(FIELDS.map(f=>[f.key,example?f.example:f.default])),
 months:MONTHS.map(()=>({adr:null,occupancy:null,blocked:0})),
 research:Object.fromEntries(REVIEW_ITEMS.map(r=>[r.key,'unknown'])),notes:{},scenarios:{down:{adrChange:-15,occupancyChange:-10,costChange:15,startupChange:15},up:{adrChange:10,occupancyChange:5,costChange:0,startupChange:0}}};
}
