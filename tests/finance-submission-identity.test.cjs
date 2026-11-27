const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createDurableFinanceOperations:create,FINANCE_INTENT_KEY:I,FINANCE_KEYS:[F,L]}=require('../src/features/finance/store/durableFinanceOperations.ts');
const {createFinanceSubmissions:submissions,FINANCE_SUBMISSIONS_KEY:S}=require('../src/features/finance/store/financeSubmissionIdentity.ts');
const raw=n=>JSON.stringify({version:2,state:{counter:n}});
function session({data=new Map([[F,raw(0)],[L,raw(0)]]),fault,after=false,readback=false}={}){
 let writes=0,armed;const events=[];
 const backend={
  getItem:k=>{if(armed===k){armed=undefined;throw Error('Readback lost');}return data.get(k)??null;},
  setItem:async(k,v)=>{events.push(['set',k,v]);if(++writes===fault&&!after&&!readback)throw Error('Write rejected');data.set(k,v);if(writes===fault&&after)throw Error('ACK lost');if(writes===fault&&readback)armed=k;},
  removeItem:async k=>{events.push(['remove',k]);if(++writes===fault&&!after&&!readback)throw Error('Remove rejected');data.delete(k);if(writes===fault&&after)throw Error('ACK lost');if(writes===fault&&readback)armed=k;},
 };
 const ops=create(backend,async()=>{}),model={[F]:JSON.parse(data.get(F)).state.counter,[L]:JSON.parse(data.get(L)).state.counter};
 for(const k of [F,L])ops.register(k,{ready:()=>true,snapshot:()=>model[k],restore:n=>model[k]=n});
 const registry=submissions(backend,{run:ops.run,assertIdle:()=>{if(['saving','blocked'].includes(ops.getStatus().phase))throw Error('Recovery pending');},fence:ops.block});
 let calls=0;
 const pay=()=>{
  calls++;const slot=JSON.parse(data.get(S)).slots[0];
  assert.equal(typeof slot.operationId,'string');assert.equal(typeof slot.request,'string');
  for(const k of [F,L]){ops.assertWritable();model[k]++;assert.equal(ops.stage(k,raw(model[k])),true);}
  return {paymentId:'payment-'+model[F]};
 };
 return {data,backend,ops,registry,pay,calls:()=>calls,events};
}
test('identity and full canonical payload are acknowledged before any financial mutation',async()=>{
 const s=session();const result=await s.registry.run('payment',{amount:50,date:'2026-11-25'},s.pay);
 assert.equal(s.events[0][1],S);assert.deepEqual(result,{paymentId:'payment-1'});
 const stored=JSON.parse(s.data.get(S)).slots[0];assert.equal(stored.state,'completed');
});
test('restart retries reuse identity and result; explicit new operation permits identical real payments',async()=>{
 const payload={amount:50,date:'2026-11-25'},s=session();
 const first=await s.registry.run('payment',payload,s.pay);const id=JSON.parse(s.data.get(S)).slots[0].operationId;
 const restarted=session({data:s.data});const retry=await restarted.registry.run('payment',payload,restarted.pay);
 assert.deepEqual(retry,first);assert.equal(restarted.calls(),0);assert.equal(JSON.parse(s.data.get(F)).state.counter,1);
 const next=await restarted.registry.startNew('payment');assert.notEqual(id,next);
 await restarted.registry.run('payment',payload,restarted.pay);assert.equal(restarted.calls(),1);
 assert.equal(JSON.parse(s.data.get(F)).state.counter,2);assert.equal(JSON.parse(s.data.get(L)).state.counter,2);
 assert.ok(s.data.has('tomorrow:finance-submission-history:v1:'+id));
});
test('same persisted identity rejects a changed amount, target, date or FX payload without another financial effect',async()=>{
 for(const payload of [{amount:60},{amount:50,target:'different'},{amount:50,date:'2026-11-26'},{amount:50,fx:2}]){
  const s=session();await s.registry.run('payment',{amount:50},s.pay);const bytes=new Map(s.data);
  const restarted=session({data:s.data});await assert.rejects(restarted.registry.run('payment',payload,restarted.pay),/payload conflicts/);
  assert.equal(restarted.calls(),0);assert.deepEqual(s.data,bytes);
 }
});
test('concurrent retries are single-flight; conflicting submission/new transitions cannot race',async()=>{
 const s=session();let release;const gate=new Promise(r=>release=r),set=s.backend.setItem;
 s.backend.setItem=async(k,v)=>{await gate;return set(k,v);};
 const a=s.registry.run('payment',{amount:50},s.pay),b=s.registry.run('payment',{amount:50},s.pay);
 assert.equal(a,b);await assert.rejects(s.registry.run('payment',{amount:60},s.pay),/conflicting/);
 await assert.rejects(s.registry.startNew('payment'),/pending/);
 assert.equal(s.calls(),0);release();await a;assert.equal(s.calls(),1);
});
for(const mode of ['before','after','readback'])for(let boundary=1;boundary<=7;boundary++){
 test(mode+' interruption at identity/accounting/completion boundary '+boundary+' preserves restart identity and prevents replay',async()=>{
  const s=session({fault:boundary,after:mode==='after',readback:mode==='readback'});
  await assert.rejects(s.registry.run('payment',{amount:50},s.pay));
  const bytes=new Map(s.data),restarted=session({data:s.data});
  restarted.ops.initialize();const e=await restarted.ops.inspect();
  assert.equal(restarted.calls(),0);assert.deepEqual(s.data,bytes);
  if(e.classification==='partial'||e.classification==='unapplied'){
   await assert.rejects(restarted.registry.run('payment',{amount:50},restarted.pay));
   assert.equal(restarted.calls(),0);assert.deepEqual(s.data,bytes);
  }else{
   let clean=restarted;
   if(e.classification==='applied-unconfirmed'){
    await restarted.ops.resolve(e.intent.operationId,'accept-applied');clean=session({data:s.data});
   }
   await clean.registry.run('payment',{amount:50},clean.pay);
   assert.equal(JSON.parse(s.data.get(F)).state.counter,1);
   assert.equal(JSON.parse(s.data.get(L)).state.counter,1);
   if(JSON.parse(bytes.get(F)).state.counter===1)assert.equal(clean.calls(),0);
  }
 });
}
test('corrupted registry, missing receipt and inconsistent result are preserved and block identity rotation',async()=>{
 const s=session();await s.registry.run('payment',{amount:50},s.pay);
 const slot=JSON.parse(s.data.get(S)).slots[0];s.data.delete('tomorrow:finance-save-receipt:v1:'+slot.operationId);
 const bytes=new Map(s.data),r=session({data:s.data});await assert.rejects(r.registry.startNew('payment'),/missing/);assert.deepEqual(s.data,bytes);
 const corrupt=session({data:new Map([[F,raw(0)],[L,raw(0)],[S,'{broken']])});
 await assert.rejects(corrupt.registry.run('payment',{},corrupt.pay));assert.equal(corrupt.calls(),0);assert.equal(corrupt.data.get(S),'{broken');
});



for(const mode of ['before','after','readback'])for(const boundary of [1,2])test('explicit new identity '+mode+' failure at boundary '+boundary+' preserves old receipt and does not post',async()=>{
 const s=session();await s.registry.run('payment',{amount:50},s.pay);const previous=JSON.parse(s.data.get(S)).slots[0].operationId;
 const failing=session({data:s.data,fault:boundary,after:mode==='after',readback:mode==='readback'});
 await assert.rejects(failing.registry.startNew('payment'));
 assert.equal(JSON.parse(s.data.get(F)).state.counter,1);assert.equal(JSON.parse(s.data.get(L)).state.counter,1);assert.equal(failing.calls(),0);
 assert.ok(s.data.has('tomorrow:finance-save-receipt:v1:'+previous));
 const fresh=session({data:s.data});await fresh.registry.initialize();
 const current=JSON.parse(s.data.get(S)).slots[0];
 if(current.operationId===previous){await fresh.registry.run('payment',{amount:50},fresh.pay);assert.equal(fresh.calls(),0);}
 else{assert.equal(current.state,'new');await fresh.registry.run('payment',{amount:50},fresh.pay);assert.equal(fresh.calls(),1);}
});

test('explicit dismissal retains identity evidence and permits a separately confirmed new attempt',async()=>{
 const s=session({fault:3});await assert.rejects(s.registry.run('payment',{amount:50},s.pay));
 const r=session({data:s.data}),e=await r.ops.inspect();assert.equal(e.classification,'unapplied');
 await r.ops.resolve(e.intent.operationId,'dismiss-unapplied');
 const next=session({data:s.data});await next.registry.initialize();const id=await next.registry.startNew('payment');assert.notEqual(id,e.intent.operationId);
 await next.registry.run('payment',{amount:50},next.pay);assert.equal(JSON.parse(s.data.get(F)).state.counter,1);
});


test('R4 contract injects the persisted identity into the financial callback and does not replace it on restart',async()=>{
 const s=session();let received;
 await s.registry.run('r4-payment',{target:'debt-one',amount:50},id=>{received=id;return s.pay();});
 const stored=JSON.parse(s.data.get(S)).slots[0];assert.equal(received,stored.operationId);
 const restarted=session({data:s.data});await restarted.registry.run('r4-payment',{target:'debt-one',amount:50},()=>{throw Error('Must not allocate a new domain attempt ID');});
 assert.equal(restarted.calls(),0);assert.equal(JSON.parse(s.data.get(S)).slots[0].operationId,received);
});


test('re-audit: missing or corrupted known-completed receipt blocks retry before any financial callback',async()=>{
 for(const mode of ['missing','unknown-field','wrong-result']){
  const s=session();await s.registry.run('payment',{amount:50},s.pay);
  const id=JSON.parse(s.data.get(S)).slots[0].operationId,key='tomorrow:finance-save-receipt:v1:'+id;
  if(mode==='missing')s.data.delete(key);else{const r=JSON.parse(s.data.get(key));if(mode==='unknown-field')r.acknowledged=true;else r.result={paymentId:'different'};s.data.set(key,JSON.stringify(r));}
  const before=new Map(s.data),restarted=session({data:s.data});
  await assert.rejects(restarted.registry.run('payment',{amount:50},restarted.pay));
  assert.equal(restarted.calls(),0);assert.deepEqual(s.data,before);
 }
});

test('local explicit rotation is bound to reviewed completed identity and never invokes accounting',async()=>{
 const s=session(); await s.registry.run('payment',{amount:50},s.pay);
 const previous=JSON.parse(s.data.get(S)).slots[0],firstCalls=s.calls();
 const next=await s.registry.startNew('payment',previous.operationId);
 assert.notEqual(next,previous.operationId); assert.equal(s.calls(),firstCalls);
 assert.equal(JSON.parse(s.data.get(F)).state.counter,1);
 assert.equal(JSON.parse(s.data.get(L)).state.counter,1);
 assert.equal(JSON.parse(s.data.get(S)).slots[0].state,'new');
 assert.ok(s.data.has('tomorrow:finance-submission-history:v1:'+previous.operationId));
 const bytes=new Map(s.data);
 await assert.rejects(s.registry.startNew('payment',previous.operationId),/selected saved operation has changed/);
 assert.deepEqual(s.data,bytes);assert.equal(s.ops.getStatus().phase,'ready');
 await s.registry.run('payment',{amount:50},s.pay); assert.equal(s.calls(),2);
 assert.equal(JSON.parse(s.data.get(F)).state.counter,2);
});
test('explicit local rotation with matching reviewed ID still fences missing receipt and retains evidence',async()=>{
 const s=session();await s.registry.run('payment',{amount:50},s.pay);
 const slot=JSON.parse(s.data.get(S)).slots[0];s.data.delete('tomorrow:finance-save-receipt:v1:'+slot.operationId);
 const bytes=new Map(s.data);await assert.rejects(s.registry.startNew('payment',slot.operationId),/missing/);
 assert.deepEqual(s.data,bytes);assert.equal(s.calls(),1);assert.equal(s.ops.getStatus().phase,'blocked');
});
test('explicit local rotation cannot discard an unresolved open identity',async()=>{
 const s=session();await s.registry.run('payment',{amount:50},s.pay);
 const registry=JSON.parse(s.data.get(S)),slot=registry.slots[0];slot.state='open';slot.result=null;s.data.set(S,JSON.stringify(registry));
 const bytes=new Map(s.data);await assert.rejects(s.registry.startNew('payment',slot.operationId),/selected saved operation has changed/);
 assert.deepEqual(s.data,bytes);assert.equal(s.calls(),1);assert.equal(s.ops.getStatus().phase,'ready');
});
