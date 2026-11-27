const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function loadTs(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;

  const module = { exports: {} };
  cache.set(absolutePath, module);

  function localRequire(specifier) {
    let target;
    if (specifier.startsWith('@/')) {
      target = path.resolve(root, 'src', specifier.slice(2));
    } else if (specifier.startsWith('.')) {
      target = path.resolve(path.dirname(absolutePath), specifier);
    } else {
      throw new Error(`Unexpected import: ${specifier}`);
    }
    return loadTs(path.relative(root, target + '.ts'));
  }

  new Function('require', 'module', 'exports', compiled)(
    localRequire, module, module.exports
  );
  return module.exports;
}

const { getTransferRateSuggestion: suggest } = loadTs('src/features/finance/utils/transferRateSuggestion.ts');
const { previewTransferAccounting: preview } = loadTs('review/transferAccountingPreview.ts');
const rates = { EGP:1, USD:50, OMR:130, KWD:160 };
const verified = ['EGP','USD','OMR','KWD'];
const sources = { EGP:'live', USD:'manual', OMR:'live', KWD:'default' };
const valid = {fromCurrency:'OMR',toCurrency:'USD',principal:'10.123',actualReceived:'26.32',sourceFee:'0.100'};
for (const [name,fn] of [
 ['same currency fixed without rate',()=>assert.deepEqual(suggest('USD','USD',{},[],{}),{rate:1,source:'fixed'})],
 ['unsupported same currency rejected',()=>assert.equal(suggest('ZZZ','ZZZ',rates,verified,sources),null)],
 ['manual rate',()=>assert.deepEqual(suggest('USD','EGP',rates,verified,sources),{rate:50,source:'saved-manual'})],
 ['reverse manual',()=>assert.deepEqual(suggest('EGP','USD',rates,verified,sources),{rate:0.02,source:'saved-manual'})],
 ['saved live',()=>assert.deepEqual(suggest('OMR','EGP',rates,verified,sources),{rate:130,source:'saved-live'})],
 ['mixed',()=>assert.deepEqual(suggest('OMR','USD',rates,verified,sources),{rate:2.6,source:'saved-mixed'})],
 ['default blocked even when verified list inconsistent',()=>assert.equal(suggest('KWD','EGP',rates,verified,sources),null)],
 ['missing verification blocked',()=>assert.equal(suggest('USD','EGP',rates,['EGP'],sources),null)],
 ['missing source blocked',()=>assert.equal(suggest('USD','EGP',rates,verified,undefined),null)],
 ['missing verification array blocked',()=>assert.equal(suggest('USD','EGP',rates,undefined,sources),null)],
 ['invalid anchor blocked',()=>assert.equal(suggest('USD','EGP',{...rates,EGP:2},verified,sources),null)],
 ['nonfinite blocked',()=>assert.equal(suggest('USD','EGP',{...rates,USD:Infinity},verified,sources),null)],
 ['exponent rejected instead of unusable input',()=>assert.equal(suggest('USD','EGP',{...rates,USD:1e-9},verified,sources),null)],
 ['fee once and actual credit independent',()=>assert.deepEqual(preview(valid),{sourcePrincipalMinor:'10123',sourceFeeMinor:'100',sourceDebitMinor:'10223',destinationCreditMinor:'2632',postingAllowed:false,needsReview:true})],
 ['no fee',()=>assert.equal(preview({...valid,sourceFee:''}).sourceDebitMinor,'10123')],
 ['Arabic digits',()=>assert.equal(preview({...valid,principal:'١٠٫١٢٣',sourceFee:'٠٫١٠٠'}).sourceDebitMinor,'10223')],
 ['USD destination precision rejected',()=>assert.equal(preview({...valid,actualReceived:'26.321'}),null)],
 ['negative fee rejected',()=>assert.equal(preview({...valid,sourceFee:'-0.100'}),null)],
 ['zero credit rejected',()=>assert.equal(preview({...valid,actualReceived:'0'}),null)],
 ['same currency fee separate',()=>assert.equal(preview({...valid,toCurrency:'OMR',actualReceived:'10.123'}).sourceDebitMinor,'10223')],
 ['same currency inconsistent principal credit rejected',()=>assert.equal(preview({...valid,toCurrency:'OMR',actualReceived:'10.023'}),null)],
 ['unsupported currency rejected',()=>assert.equal(preview({...valid,toCurrency:'ZZZ'}),null)],
 ['unsafe combined debit rejected',()=>assert.equal(preview({fromCurrency:'USD',toCurrency:'USD',principal:'90071992547409',actualReceived:'90071992547409',sourceFee:'1'}),null)],
 ['unsafe actual credit rejected',()=>assert.equal(preview({...valid,actualReceived:'9007199254740993'}),null)],
 ['missing amount rejected',()=>assert.equal(preview({...valid,actualReceived:''}),null)],
]) test(name,fn);

// The fee projection is review-only: old and new legs are reconciled exactly.
const { previewTransferChange: change }=loadTs('review/transferAccountingPreview.ts');
const originalTransfer={...valid,id:'tr',fromAccountId:'a',toAccountId:'b',feeCategoryId:'fees'};
const balances=x=>Object.fromEntries(x.accountDeltas.map(r=>[r.accountId,r.minor]));
test('review create debits principal and fee exactly once and credits actual received',()=>{const x=change(null,originalTransfer);assert.deepEqual(balances(x),{a:'-10223',b:'2632'});assert.deepEqual(x.expenseDeltas,[{categoryId:'fees',currencyCode:'OMR',minor:'100'}]);assert.equal(x.postingAllowed,false);assert.equal(x.needsReview,true)});
test('review edit removes previous legs before applying corrected fee and credit',()=>{const x=change(originalTransfer,{...originalTransfer,actualReceived:'26.31',sourceFee:'0.050'});assert.deepEqual(balances(x),{a:'50',b:'-1'});assert.equal(x.expenseDeltas[0].minor,'-50')});
test('review deletion reverses both account legs and the expense exactly once',()=>{const x=change(originalTransfer,null);assert.deepEqual(balances(x),{a:'10223',b:'-2632'});assert.equal(x.expenseDeltas[0].minor,'-100')});
test('review fee removal reverses only the expense debit',()=>{const x=change(originalTransfer,{...originalTransfer,sourceFee:'0'});assert.deepEqual(balances(x),{a:'100',b:'0'});assert.equal(x.expenseDeltas[0].minor,'-100')});
test('review identical edit has zero accounting delta, not proof of durable replay',()=>{const x=change(originalTransfer,originalTransfer);assert.deepEqual(balances(x),{a:'0',b:'0'});assert.equal(x.expenseDeltas[0].minor,'0')});
test('review rejects fee without expense category',()=>assert.equal(change(null,{...originalTransfer,feeCategoryId:undefined}),null));
test('review rejects a mismatched transfer identity',()=>assert.equal(change(originalTransfer,{...originalTransfer,id:'different'}),null));
test('review rejects conflicting currency for same account across edit',()=>assert.equal(change(originalTransfer,{...originalTransfer,fromCurrency:'USD',toCurrency:'EGP',principal:'10',sourceFee:'0.10',actualReceived:'500'}),null));
test('review refuses to reverse malformed original evidence',()=>assert.equal(change({...originalTransfer,actualReceived:'26.321'},null),null));
test('review same currency transfer charges fee only as expense',()=>{const x=change(null,{...originalTransfer,toCurrency:'OMR',actualReceived:'10.123'});assert.deepEqual(balances(x),{a:'-10223',b:'10123'});assert.equal(x.expenseDeltas[0].minor,'100')});
