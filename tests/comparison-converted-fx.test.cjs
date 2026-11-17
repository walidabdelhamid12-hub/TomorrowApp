/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === '../constants/currencies') return { getCurrencyDecimals: code => code === 'OMR' ? 3 : 2 };
  if (id === './money') return { convertAmountUnrounded: (amount, from, to, rates, verified) => {
    if (from === to) return amount;
    if (!verified.includes(from) || !verified.includes(to)) return null;
    if (!(rates[from] > 0 && rates[to] > 0)) return null;
    return amount * rates[from] / rates[to];
  } };
  if (id.startsWith('@/')) return originalLoad.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return originalLoad.call(this, id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), { fileName:filename, compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText, filename);
const { buildConvertedComparison, convertComparisonTrend } = require('../src/features/finance/utils/comparisonConverted.ts');
const fx = { rates: { EGP:1, OMR:130, USD:50 }, verifiedCurrencies:['EGP','OMR','USD'] };
const data = { verified:true, currencies:[{currencyCode:'EGP',income:1300,expenses:650},{currencyCode:'OMR',income:10,expenses:3}],categories:[{kind:'expense',currencyCode:'EGP',categoryId:'food',amount:650},{kind:'expense',currencyCode:'OMR',categoryId:'food',amount:3}] };
test('All Accounts converts and groups category into Total Balance base OMR',()=>{
 const v=buildConvertedComparison(data,'OMR',fx); assert.equal(v.income,20); assert.equal(v.expenses,8); assert.equal(v.netDifference,12); assert.equal(v.categories.length,1); assert.equal(v.categories[0].amount,8);
});
test('base USD uses same verified rate map',()=>{const v=buildConvertedComparison(data,'USD',fx); assert.equal(v.income,52); assert.equal(v.expenses,20.8);});
test('missing or unverified rate fails closed',()=>{
 assert.equal(buildConvertedComparison(data,'OMR',{...fx,verifiedCurrencies:['OMR']}),null);
 assert.equal(buildConvertedComparison(data,'OMR',{...fx,rates:{EGP:1,OMR:0}}),null);
});
test('unknown transaction blocks totals',()=>{assert.equal(buildConvertedComparison({...data,verified:false},'OMR',fx),null);});
test('converted trend sums per-month across currencies',()=>{
 const p={label:'2026-11',period:{from:'2026-11-01',to:'2026-11-30'}};
 const r=convertComparisonTrend([{currencyCode:'EGP',verified:true,points:[{...p,income:1300,expenses:650}]},{currencyCode:'OMR',verified:true,points:[{...p,income:10,expenses:3}]}],'OMR',fx);
 assert.equal(r.verified,true);assert.equal(r.points[0].income,20);assert.equal(r.points[0].expenses,8);
});
test('trend mismatched buckets or missing rates fail closed',()=>{
 const p={label:'2026-11',period:{from:'2026-11-01',to:'2026-11-30'},income:10,expenses:5};
 const s=[{currencyCode:'EGP',verified:true,points:[p]},{currencyCode:'OMR',verified:true,points:[{...p,label:'2026-12'}]}];
 assert.equal(convertComparisonTrend(s,'OMR',fx).verified,false);
 assert.equal(convertComparisonTrend([{currencyCode:'USD',verified:true,points:[p]}],'OMR',{...fx,verifiedCurrencies:['OMR']}).verified,false);
});
