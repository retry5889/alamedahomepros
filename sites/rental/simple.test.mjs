import test from 'node:test';import assert from 'node:assert/strict';
import {newStudy,readMajor,writeMajor} from './simple.mjs';
import {createProperty} from './schema.mjs';import {calculate,sanitizeProperty} from './model.mjs';
test('new study is blank, with explicit rough cost allowances',()=>{const p=newStudy();assert.equal(p.example,false);assert.equal(p.values.price,null);assert.equal(p.values.platform,3);assert.equal(p.values.repairPercent+p.values.replacementPercent,10);assert.ok(calculate(p).missing.length)});
test('major totals match engine and edits preserve relative cost detail',()=>{const p=createProperty(true),r=calculate(p);assert.equal(readMajor(p,'setup'),r.startup.setup);assert.equal(readMajor(p,'bills'),r.annual.fixed/12);const old=p.values.furniture;writeMajor(p,'setup',r.startup.setup*2);assert.equal(p.values.furniture,old*2)});
test('monthly bills includes annual and monthly expenses exactly once',()=>{const p=newStudy();assert.equal(readMajor(p,'bills'),null);writeMajor(p,'bills',1500);assert.equal(calculate(p).annual.fixed,18000);assert.equal(p.values.insurance,0);assert.equal(p.values.propertyTax,0)});
test('closing allowance edits are cash fees, not hidden extra fees',()=>{const p=createProperty(true);writeMajor(p,'closing',12000);assert.equal(calculate(p).startup.closing,12000);assert.equal(sanitizeProperty(p).values.title,12000)});
