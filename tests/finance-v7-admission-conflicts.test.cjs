/* global __dirname */
// Actual accounting stores, actual persist middleware, controllable native I/O.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), load = Module._load;
let native, session;
const phase1Alerts = [];
Module._load = function(id, parent, main) {
  if (id === 'react-native') return { Alert: { alert: (...args) => phase1Alerts.push(args) } };
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: native };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const F = 'tomorrow:finance', L = 'tomorrow:ledger', J = 'tomorrow:payment-operations';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = key => key === F ? { assets: [], debts: [], loans: [], cheques: [] }
  : { accounts: [], categories: [], transactions: [], transfers: [] };
const marker = { schemaVersion: 1, generationId: 'retained' };
function memory(data = new Map()) {
  const events = [];
  return { data, events, getItem: async key => { events.push(['get', key]); return data.get(key) ?? null; },
    setItem: async (key, value) => { events.push(['set', key, value]); data.set(key, value); },
    removeItem: async key => { events.push(['remove', key]); data.delete(key); } };
}
async function actualSession({ tracked = true, data, configure, waitHydration = true } = {}) {
  if (session) await session.runtime.close();
  // Simulate a fresh JS runtime, with the prior owner's I/O fully drained.
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.join(root, 'src', 'features', 'finance'))) delete require.cache[file];
  native = memory(data);
  configure?.(native);
  const module = require('../src/features/finance/store/paymentOperationRuntime.ts');
  const runtime = module.createPaymentOperationRuntime(native);
  if (tracked) module.installPaymentRuntimeBeforeStores(runtime);
  const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
  const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
  const hydrated = Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  session = { ...module, runtime, finance, ledger, native, hydrated };
  if (waitHydration) await hydrated;
  return session;
}
afterEach(async () => { if (session) await session.runtime.close(); session = undefined; });

async function fixture() {
 const stamp={createdAt:'2026-11-26',updatedAt:'2026-11-26'};
 const account={...stamp,id:'v6-bank',name:'Bank',type:'bank',currencyCode:'OMR',initialBalance:10,archived:false};
 const category={id:'v6-meals',name:'Meals',kind:'expense',icon:'cash',color:'#000',isDefault:false};
 const data=new Map([[F,JSON.stringify({version:2,state:state(F)})],[L,JSON.stringify({version:2,state:{...state(L),accounts:[account],categories:[category]}})]]);
 return actualSession({tracked:false,data});
}
function api(){return require('../src/features/finance/store/productionFinancePersistence.ts');}
function canonicalScope(scope,payload){return {handler:scope,payload};}
test('V7 account creation: changed payload is local, inspect stays clean, explicit second account and restart retry are safe',async()=>{
 let s=await actualSession({tracked:false,data:new Map([[F,JSON.stringify({version:2,state:state(F)})],[L,JSON.stringify({version:2,state:state(L)})]])});let a=api();
 const {submitFinanceForm,formPayload}=require('../src/features/finance/components/explicitFinanceForm.ts');const scope='src/app/finance/accounts.tsx:68';
 const usd={name:'USD',type:'bank',currencyCode:'USD',initialBalance:1000},omr={name:'OMR',type:'bank',currencyCode:'OMR',initialBalance:10};
 const request=input=>formPayload('account.create',null,input,{openingDate:'2026-11-20'});let successful=0,callbacks=0;
 const first=await submitFinanceForm(scope,request(usd),()=>{callbacks++;return s.ledger.getState().addAccount(usd,'2026-11-20');},()=>successful++,()=>{throw Error('Unexpected validation rejection');});assert.ok(first);
 const before=new Map(s.native.data),events=s.native.events.length,id=a.financeSubmissions.getSnapshot().slots.find(v=>v.scope===scope).operationId;
 await assert.rejects(a.financeSubmissions.run(scope,canonicalScope(scope,request(omr)),()=>{callbacks++;throw Error('Conflict invoked mutation');}),e=>e.name==='FinanceSubmissionAdmissionError');
 assert.equal(a.durableFinanceOperations.getStatus().phase,'ready');assert.equal(a.financeSubmissions.getSnapshot().phase,'ready');assert.deepEqual(s.native.data,before);assert.equal(s.native.events.slice(events).some(e=>e[0]!=='get'),false);assert.equal(a.financeSubmissions.getSnapshot().slots.find(v=>v.scope===scope).operationId,id);
 assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');
 const alerts=phase1Alerts.length;await submitFinanceForm(scope,request(omr),()=>{callbacks++;throw Error('UI conflict invoked mutation');},()=>successful++,()=>{});
 assert.equal(phase1Alerts[alerts][0],'Conflicting Finance submission');assert.equal(callbacks,1);assert.equal(successful,1);assert.equal(a.durableFinanceOperations.getStatus().phase,'ready');
 await a.financeSubmissions.startNew(scope);await submitFinanceForm(scope,request(omr),()=>{callbacks++;return s.ledger.getState().addAccount(omr,'2026-11-20');},()=>successful++,()=>{throw Error('Second account rejected');});
 assert.deepEqual(s.ledger.getState().accounts.map(v=>[v.currencyCode,v.initialBalance]),[['USD',1000],['OMR',10]]);assert.equal(s.ledger.getState().transactions.length,0);
 s=await actualSession({tracked:false,data:new Map(s.native.data)});a=api();await a.financeSubmissions.run(scope,canonicalScope(scope,request(omr)),()=>{throw Error('Restart duplicate');});assert.equal(s.ledger.getState().accounts.length,2);assert.equal(s.ledger.getState().transactions.length,0);assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');
});
for(const kind of ['category','transaction','debt','asset','fee-transfer'])test('V7 local admission conflict preserves accounting and permits unrelated scope: '+kind,async()=>{
 const s=await fixture(),a=api();let calls=0;let destination;
 if(kind==='fee-transfer')destination=await a.financeSubmissions.run('seed-account',{destination:true},()=>s.ledger.getState().addAccount({name:'Destination',type:'bank',currencyCode:'OMR',initialBalance:0}));
 const action=id=>{calls++;
  if(kind==='category')return s.ledger.getState().addCategory({name:'New category',kind:'expense',icon:'cash',color:'#000'});
  if(kind==='transaction')return s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id);
  if(kind==='debt')return s.finance.getState().addDebt({personName:'Synthetic',direction:'payable',amount:100,currencyCode:'OMR',date:'2026-11-26'});
  if(kind==='asset')return s.finance.getState().addAsset({name:'Synthetic',category:'local_currency',currencyCode:'OMR'});
  return s.ledger.getState().addTransfer({type:'internal',fromAccountId:'v6-bank',toAccountId:destination,fromAmount:1,toAmount:1,fromCurrencyCode:'OMR',toCurrencyCode:'OMR',exchangeRate:1,date:'2026-11-26',feeAmount:0.1,feeCategoryId:'v6-meals',actualReceivedConfirmed:true});
 };
 const original=await a.financeSubmissions.run('v7-'+kind,{kind,value:1},action);assert.ok(original);const bytes=new Map(s.native.data);
 await assert.rejects(a.financeSubmissions.run('v7-'+kind,{kind,value:2},action),e=>e.name==='FinanceSubmissionAdmissionError');assert.equal(calls,1);assert.deepEqual(s.native.data,bytes);assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');
 await a.financeSubmissions.run('unrelated-'+kind,{name:'Unaffected'},()=>s.ledger.getState().addCategory({name:'Unaffected',kind:'income',icon:'cash',color:'#000'}));
 assert.equal(calls,1);assert.equal(a.durableFinanceOperations.getStatus().phase,'ready');
 if(kind==='fee-transfer'){const balance=require('../src/features/finance/utils/ledger.ts').getAccountBalance;assert.equal(balance(s.ledger.getState().accounts.find(v=>v.id==='v6-bank'),s.ledger.getState().transactions,s.ledger.getState().transfers),8.9);assert.equal(s.ledger.getState().transfers.length,1);assert.equal(s.ledger.getState().transactions.filter(t=>t.purpose==='transfer_fee').length,1);}
});
for(const mode of ['missing-receipt','wrong-result','intent','read-failure','corrupt-registry'])test('V7 payload mismatch still fences genuine evidence problem: '+mode,async()=>{
 const s=await fixture(),a=api();await a.financeSubmissions.run('v7-unsafe',{value:1},id=>s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id));
 const key='tomorrow:finance-submissions:v1',slot=a.financeSubmissions.getSnapshot().slots[0],receiptKey='tomorrow:finance-save-receipt:v1:'+slot.operationId;
 if(mode==='missing-receipt')s.native.data.delete(receiptKey);
 if(mode==='wrong-result'){const r=JSON.parse(s.native.data.get(receiptKey));r.result='wrong';s.native.data.set(receiptKey,JSON.stringify(r));}
 if(mode==='intent')s.native.data.set('tomorrow:finance-save-intent:v1','{"retained":"unknown"}');
 if(mode==='corrupt-registry')s.native.data.set(key,'{bad');
 if(mode==='read-failure'){const get=s.native.getItem;s.native.getItem=async name=>{if(name===receiptKey)throw Error('Receipt read uncertain');return get(name);};}
 const bytes=new Map(s.native.data);let invoked=0;await assert.rejects(a.financeSubmissions.run('v7-unsafe',{value:2},()=>{invoked++;return null;}));assert.equal(invoked,0);assert.equal(a.durableFinanceOperations.getStatus().phase,'blocked');assert.equal(a.financeSubmissions.getSnapshot().phase,'blocked');assert.deepEqual(s.native.data,bytes);
});
test('V7 current R2 recovery model: cold restart clears only volatile fence with no intent; preserves accounts and identity bytes',async()=>{
 let s=await fixture(),a=api();await a.financeSubmissions.run('v7-restart',{value:1},()=>s.ledger.getState().addAccount({name:'USD',type:'bank',currencyCode:'USD',initialBalance:1000}));
 const bytes=new Map(s.native.data);a.durableFinanceOperations.block(Error('Legacy non-mutating rejection'));assert.equal((await a.durableFinanceOperations.inspect()).classification,'conflict');
 s=await actualSession({tracked:false,data:new Map(s.native.data)});a=api();assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');assert.deepEqual(s.native.data,bytes);assert.equal(s.ledger.getState().accounts.find(v=>v.name==='USD').initialBalance,1000);assert.equal(s.ledger.getState().transactions.length,0);assert.equal(s.native.events.some(e=>e[0]!=='get'),false);
});

test('V7 restart mismatch retains original receipt and same-payload retry returns committed result without mutation',async()=>{
 let s=await fixture(),a=api();const scope='restart-committed',payload={amount:1};let calls=0;
 const result=await a.financeSubmissions.run(scope,payload,id=>{calls++;return s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id);});
 s=await actualSession({tracked:false,data:new Map(s.native.data)});a=api();const bytes=new Map(s.native.data);
 await assert.rejects(a.financeSubmissions.run(scope,{amount:2},()=>{throw Error('Rejected payload ran');}),e=>e.name==='FinanceSubmissionAdmissionError');
 assert.deepEqual(s.native.data,bytes);assert.equal(await a.financeSubmissions.run(scope,payload,()=>{calls++;throw Error('Replayed');}),result);assert.equal(calls,1);assert.equal(s.ledger.getState().transactions.length,1);assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');
});
test('V7 lost registry completion acknowledgement: mismatch is local and retained receipt completes original retry',async()=>{
 let s=await fixture(),a=api();const scope='lost-completion',payload={amount:1};const result=await a.financeSubmissions.run(scope,payload,id=>s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id));
 const key='tomorrow:finance-submissions:v1',registry=JSON.parse(s.native.data.get(key));registry.slots[0].state='open';registry.slots[0].result=null;s.native.data.set(key,JSON.stringify(registry));
 s=await actualSession({tracked:false,data:new Map(s.native.data)});a=api();const bytes=new Map(s.native.data);
 await assert.rejects(a.financeSubmissions.run(scope,{amount:2},()=>{throw Error('Conflict mutation');}),e=>e.name==='FinanceSubmissionAdmissionError');assert.deepEqual(s.native.data,bytes);
 assert.equal(await a.financeSubmissions.run(scope,payload,()=>{throw Error('Duplicate accounting');}),result);assert.equal(a.financeSubmissions.getSnapshot().slots[0].state,'completed');assert.equal(s.ledger.getState().transactions.length,1);assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');
});
test('V7 open identity before accounting survives restart; mismatch neither rotates identity nor prevents original retry',async()=>{
 let s=await fixture();const scope='open-before-mutation',payload={amount:1},operationId='submission-v7-open-retained';const {financeRequest}=require('../src/features/finance/store/durableFinanceOperations.ts');
 s.native.data.set('tomorrow:finance-submissions:v1',JSON.stringify({schemaVersion:1,slots:[{scope,operationId,request:financeRequest(payload),state:'open',result:null}]}));
 s=await actualSession({tracked:false,data:new Map(s.native.data)});const a=api(),bytes=new Map(s.native.data);let calls=0;
 await assert.rejects(a.financeSubmissions.run(scope,{amount:2},()=>{calls++;}),e=>e.name==='FinanceSubmissionAdmissionError');assert.deepEqual(s.native.data,bytes);assert.equal(calls,0);assert.equal(a.financeSubmissions.getSnapshot().slots[0].operationId,operationId);
 await a.financeSubmissions.run(scope,payload,id=>{calls++;assert.equal(id,operationId);return s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id);});assert.equal(calls,1);assert.equal(s.ledger.getState().transactions.length,1);
});
test('V7 concurrent admissions reject changed payload without interrupting or duplicating the pending save',async()=>{
 const s=await fixture(),a=api(),gate=deferred(),entered=deferred();const get=s.native.getItem;let delay=true,calls=0;
 s.native.getItem=async key=>{if(key==='tomorrow:finance-submissions:v1'&&delay){delay=false;entered.resolve();await gate.promise;}return get(key);};
 const scope='concurrent-v7',payload={amount:1};const pending=a.financeSubmissions.run(scope,payload,id=>{calls++;return s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id);});await entered.promise;
 const duplicate=a.financeSubmissions.run(scope,payload,()=>{throw Error('Concurrent duplicate');});assert.equal(pending,duplicate);
 await assert.rejects(a.financeSubmissions.run(scope,{amount:2},()=>{throw Error('Concurrent conflict');}),/different Finance submission/);assert.notEqual(a.durableFinanceOperations.getStatus().phase,'blocked');gate.resolve();assert.equal(await pending,await duplicate);assert.equal(calls,1);assert.equal(s.ledger.getState().transactions.length,1);assert.equal((await a.durableFinanceOperations.inspect()).classification,'clean');
});
test('V7 callback cannot spoof trusted admission error and bypass uncertainty fence',async()=>{
 const s=await fixture(),a=api();const error=Error('spoofed');error.name='FinanceSubmissionAdmissionError';
 await assert.rejects(a.financeSubmissions.run('spoofed',{amount:1},id=>{s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id);throw error;}),e=>e===error);
 assert.equal(a.durableFinanceOperations.getStatus().phase,'blocked');assert.equal(s.ledger.getState().transactions.length,0);assert.equal(require('../src/features/finance/store/financeSubmissionIdentity.ts').isFinanceAdmissionRejection(error),false);
});

test('R4 cross-currency debt submission is durable and retry-safe after restart',async()=>{
 let s=await fixture(),a=api();const date='2026-11-26';
 const debt={personName:'FX Debt',direction:'payable',amount:100,currencyCode:'USD',date};
 const id=await a.financeSubmissions.run('r4-debt',debt,()=>s.finance.getState().addDebt(debt));assert.ok(id);
 const input={entityType:'debt',entityId:id,amount:10,accountId:'v6-bank',categoryId:'v6-meals',date,debtFx:{actualAmount:4,quotedRate:2.5}};
 const post=require('../src/features/finance/store/paymentOperations.ts').postLinkedPayment;
 assert.equal(await a.financeSubmissions.run('r4-fx-pay',input,()=>post(input).ok),true);
 const check=()=>{const d=s.finance.getState().debts.find(d=>d.id===id),t=s.ledger.getState().transactions;assert.equal(d.payments.length,1);assert.equal(d.payments[0].amount,10);assert.equal(t.length,1);assert.equal(t[0].amount,4);assert.equal(t[0].originalAmount,10);assert.equal(t[0].directHistoricalFx.rate,2.5);};check();
 s=await actualSession({tracked:false,data:new Map(s.native.data)});a=api();assert.equal(await a.financeSubmissions.run('r4-fx-pay',input,()=>{throw Error('duplicate after restart');}),true);check();
 const {reverseLinkedPayment}=require('../src/features/finance/store/paymentOperations.ts');const ref={entityType:'debt',entityId:id,paymentId:s.finance.getState().debts[0].payments[0].id};assert.equal(await a.financeSubmissions.run('r4-fx-reverse',ref,()=>reverseLinkedPayment(ref).ok),true);assert.equal(s.finance.getState().debts[0].payments.length,0);assert.equal(s.ledger.getState().transactions.length,0);
});

test('R4 deleted debt receipt cannot recreate a record until explicit new identity',async()=>{
 const s=await fixture(),a=api();const input={personName:'Repeat debt',direction:'receivable',amount:100,currencyCode:'USD',date:'2026-11-26'},scope='r4-create-debt';
 const first=await a.financeSubmissions.run(scope,input,()=>s.finance.getState().addDebt(input));assert.ok(first);
 assert.equal(await a.financeSubmissions.run('r4-remove-debt',{id:first},()=>s.finance.getState().deleteDebt(first)),true);
 assert.equal(await a.financeSubmissions.run(scope,input,()=>{throw Error('Unexpected mutation');}),first);assert.equal(s.finance.getState().debts.length,0);
 await a.financeSubmissions.startNew(scope);const second=await a.financeSubmissions.run(scope,input,()=>s.finance.getState().addDebt(input));assert.ok(second);assert.notEqual(second,first);assert.equal(s.finance.getState().debts.length,1);
});
