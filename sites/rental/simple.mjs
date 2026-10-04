import {FIELDS,createProperty} from './schema.mjs';import {calculate} from './model.mjs';
const setup=FIELDS.filter(f=>f.group==='setup').map(f=>[f.key,1]);
const fixed=FIELDS.filter(f=>f.group==='fixed').map(f=>[f.key,/\/ year/.test(f.label)?1/12:1]);fixed.push(['repairsAnnual',1/12]);
export function newStudy(){const p=createProperty();Object.assign(p.values,{platform:3,repairPercent:5,replacementPercent:5,contingency:10});return p;}
export function readMajor(p,key){if(key==='closing')return calculate(p).startup.closing;if(key==='bills'&&(p.values.propertyTax==null||p.values.insurance==null))return null;if(key==='bills'||key==='setup')return (key==='bills'?fixed:setup).reduce((s,[k,f])=>s+(p.values[k]||0)*f,0);return p.values[key];}
export function writeMajor(p,key,value){
 if(key==='closing'){for(const k of ['lenderFees','title','transfer','legal','inspection','appraisal','prepaidInterest','points','sellerCredit'])p.values[k]=0;p.values.title=value;return;}
 if(key==='setup'||key==='bills'){const entries=key==='setup'?setup:fixed,total=entries.reduce((s,[k,f])=>s+(p.values[k]||0)*f,0);for(const [k]of entries)p.values[k]=total?(p.values[k]||0)*(value||0)/total:0;if(!total)p.values[key==='setup'?'otherSetup':'otherFixed']=value||0;if(value===null&&key==='bills'){p.values.propertyTax=null;p.values.insurance=null;}return;}
 p.values[key]=value;
}
