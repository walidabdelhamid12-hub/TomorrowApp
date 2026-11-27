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
for(const corruptState of ['unchanged','new'])for(const admission of ['retry','rotate'])test(`V6 identity ${corruptState}/${admission}: contradictory receipt preserves identity, accounting and evidence`,async t=>{
 let s=await fixture();let api=require('../src/features/finance/store/productionFinancePersistence.ts');
 const payload={amount:1,account:'v6-bank'};
 await api.financeSubmissions.run('v6-retry',payload,id=>s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id));
 const key='tomorrow:finance-submissions:v1',r=JSON.parse(s.native.data.get(key));r.slots[0].state=corruptState;if(corruptState==='new')r.slots[0].request=null;s.native.data.set(key,JSON.stringify(r));
 const bytes=new Map(s.native.data);s=await actualSession({tracked:false,data:s.native.data});api=require('../src/features/finance/store/productionFinancePersistence.ts');let calls=0;
 let error;try {
  if(admission==='rotate')await api.financeSubmissions.startNew('v6-retry');
  else await api.financeSubmissions.run('v6-retry',payload,id=>{calls++;return s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'},id);});
 }catch(cause){error=cause;}
 t.diagnostic(`callback count=${calls}; transaction count=${s.ledger.getState().transactions.length}`);
 assert.equal(calls,0);assert.ok(error,'Contradictory evidence must reject before rotating or rebinding');assert.deepEqual(s.native.data,bytes);assert.equal(s.ledger.getState().transactions.length,1);
});
test('V6 identity: legitimate unchanged validation can be corrected and explicit repeats remain independent',async()=>{
 const s=await fixture();const {financeSubmissions}=require('../src/features/finance/store/productionFinancePersistence.ts');
 await financeSubmissions.run('v6-valid',{invalid:true},()=>null);
 const pay=()=>s.ledger.getState().addTransaction({type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:1,date:'2026-11-26'});
 await financeSubmissions.run('v6-valid',{amount:1},pay);await financeSubmissions.run('v6-valid',{amount:1},()=>{throw Error('Duplicate callback');});assert.equal(s.ledger.getState().transactions.length,1);
 await financeSubmissions.startNew('v6-valid');await financeSubmissions.run('v6-valid',{amount:1},pay);assert.equal(s.ledger.getState().transactions.length,2);
});
for(const archived of ['false','yes',1,null,{},[]])test('V6 archive rejects malformed '+JSON.stringify(archived)+' and retains raw bytes',async()=>{
 const category={id:'bad-archive',name:'History',kind:'expense',icon:'cash',color:'#000',isDefault:false,archived};
 const raw=JSON.stringify({version:2,state:{...state(L),categories:[category]}});const s=await actualSession({tracked:false,data:new Map([[L,raw]])});
 assert.equal(s.ledger.persist.hasHydrated(),false);assert.throws(()=>s.ledger.setState({categories:[]}),/hydrated|persistence/);assert.equal(s.native.data.get(L),raw);assert.equal(s.native.events.some(e=>e[0]!=='get'),false);
});
for(const archived of [undefined,false,true])test('V6 archive accepts '+String(archived)+' and preserves historical references',async()=>{
 const stamp={createdAt:'2026-11-26',updatedAt:'2026-11-26'},category={id:'history-category',name:'History',kind:'expense',icon:'cash',color:'#000',isDefault:false,...(archived===undefined?{}:{archived})};
 const account={...stamp,id:'history-account',name:'Bank',type:'bank',currencyCode:'OMR',initialBalance:10.123,archived:false};
 const transaction={...stamp,id:'history-tx',type:'expense',accountId:account.id,categoryId:category.id,currencyCode:'OMR',amount:1.234,date:'2026-11-26'};
 const raw=JSON.stringify({version:2,state:{...state(L),accounts:[account],categories:[category],transactions:[transaction]}});const s=await actualSession({tracked:false,data:new Map([[L,raw]])});
 assert.equal(s.ledger.persist.hasHydrated(),true);assert.deepEqual(s.ledger.getState().categories,[category]);assert.deepEqual(s.ledger.getState().transactions,[transaction]);assert.equal(s.native.data.get(L),raw);assert.equal(s.native.events.some(e=>e[0]!=='get'),false);
 assert.equal(require('../src/features/finance/utils/ledger.ts').getAccountBalance(account,s.ledger.getState().transactions),8.889);
});
test('V6 receipt-only UI completes exhausted FX refund after restart without another mutation; missing receipt fences',async()=>{
 let s=await fixture();let api=require('../src/features/finance/store/productionFinancePersistence.ts');
 const purchaseInput={type:'expense',accountId:'v6-bank',categoryId:'v6-meals',amount:4,date:'2026-11-24',originalAmount:10,originalCurrencyCode:'USD',accountFxRate:0.4,directHistoricalFx:{source:'manual',accountCurrencyCode:'OMR',transactionCurrencyCode:'USD',rate:2.5,rateDate:'2026-11-24'}};
 const purchase=await api.financeSubmissions.run('v6-purchase',purchaseInput,id=>s.ledger.getState().addTransaction(purchaseInput,id));assert.ok(purchase);
 const refund={...purchaseInput,entryType:'refund',relatedTransactionId:purchase,amount:4.123,date:'2026-11-26',accountFxRate:4.123/10,directHistoricalFx:{...purchaseInput.directHistoricalFx,rate:2.6,rateDate:'2026-11-26'}};
 const scope='src/features/finance/components/AddTransactionModal.tsx:746';let completions=0;
 const {submitFinanceForm,formPayload}=require('../src/features/finance/components/explicitFinanceForm.ts');
 await submitFinanceForm(scope,formPayload('refund.create',purchase,refund),id=>s.ledger.getState().addTransaction(refund,id),()=>{throw Error('UI lost after commit');},()=>{throw Error('Unexpected rejection');});
 const refundId=s.ledger.getState().transactions.find(t=>t.entryType==='refund').id;
 s=await actualSession({tracked:false,data:new Map(s.native.data)});api=require('../src/features/finance/store/productionFinancePersistence.ts');await api.financeSubmissions.initialize();
 const {completeRetainedFinanceSubmission:finish}=require('../src/features/finance/components/acknowledgedFinanceHandler.ts');assert.equal(typeof finish,'function','Receipt-only completion missing');
 assert.equal(s.ledger.getState().transactions.filter(t=>t.entryType==='refund').reduce((n,t)=>n+t.originalAmount,0),10);
 const componentPath=path.join(root,'src/features/finance/components/FinanceSubmissionReceipt.tsx');assert.ok(fs.existsSync(componentPath));
 const source=fs.readFileSync(componentPath,'utf8'),ast=ts.createSourceFile(componentPath,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const decl=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='FinanceSubmissionReceipt');
 const js=ts.transpileModule(decl.getText(ast).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const bound={require,exports:{},useState:v=>[v,()=>{}],useEffect:()=>{},useSyncExternalStore:(_s,get)=>get(),useAppLanguage:()=>({t:en=>en}),financeSubmissions:api.financeSubmissions,completeRetainedFinanceSubmission:finish,View:'View',AppText:'AppText',AppButton:'AppButton'};
 const Component=new Function(...Object.keys(bound),js+';return FinanceSubmissionReceipt;')(...Object.values(bound));
 const tree=Component({scope,onCommitted:value=>{assert.equal(value,refundId);completions++;}});const button=tree.props.children.find(c=>c?.type==='AppButton');assert.ok(button);assert.equal(button.props.disabled,false);
 const gate=deferred(),set=s.native.setItem;let waiting=false;s.native.setItem=async(key,raw)=>{if(key==='tomorrow:finance-submissions:v1'){waiting=true;await gate.promise;}return set(key,raw);};
 button.props.onPress();for(let i=0;i<30&&!waiting;i++)await tick();assert.equal(waiting,true);assert.equal(completions,0);gate.resolve();for(let i=0;i<30&&!completions;i++)await tick();assert.equal(completions,1);
 assert.equal(s.ledger.getState().transactions.length,2);assert.equal(require('../src/features/finance/utils/ledger.ts').getAccountBalance(s.ledger.getState().accounts[0],s.ledger.getState().transactions),10.123);assert.equal(s.native.events.some(e=>e[0]==='set'&&[F,L].includes(e[1])),false);
 const slot=api.financeSubmissions.getSnapshot().slots.find(v=>v.scope===scope);s.native.data.delete('tomorrow:finance-save-receipt:v1:'+slot.operationId);const bytes=new Map(s.native.data);await assert.rejects(finish(scope),/missing|receipt/i);assert.deepEqual(s.native.data,bytes);
 const modal=fs.readFileSync(path.join(root,'src/features/finance/components/AddTransactionModal.tsx'),'utf8');assert.match(modal,/<FinanceSubmissionReceipt\s+scope="src\/features\/finance\/components\/AddTransactionModal.tsx:746"/);assert.ok(modal.indexOf('<FinanceSubmissionReceipt')<modal.indexOf('{isEditingRefund ? ('));
});
