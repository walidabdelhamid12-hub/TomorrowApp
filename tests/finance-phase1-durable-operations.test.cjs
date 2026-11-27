const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), Module = require('node:module');
require.extensions['.ts'] = (m, name) => m._compile(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, name);
const {createDurableFinanceOperations: create, FINANCE_INTENT_KEY: I, FINANCE_KEYS: [F,L]} =
  require('../src/features/finance/store/durableFinanceOperations.ts');
const raw = n => JSON.stringify({version: 2, state: {value: n}});
const tick = () => new Promise(resolve => setImmediate(resolve));
function scenario({data = new Map([[F,raw(1)],[L,raw(1)]]), fault, after = false, readback = false} = {}) {
  let writes = 0, reads = 0, armed;
  const events = [];
  const backend = {
    getItem: key => {
      reads++; events.push(['get', key]);
      if (readback && armed === key) {armed = undefined; throw new Error('Injected readback failure');}
      return data.get(key) ?? null;
    },
    setItem: async (key, value) => {
      writes++; events.push(['set',key,value]);
      if (writes === fault && !after && !readback) throw new Error('Injected write failure');
      data.set(key,value);
      if (writes === fault && after) throw new Error('Lost ACK');
      if (writes === fault && readback) armed = key;
    },
    removeItem: async key => {
      writes++; events.push(['remove',key]);
      if (writes === fault && !after && !readback) throw new Error('Injected remove failure');
      data.delete(key);
      if (writes === fault && after) throw new Error('Lost remove ACK');
      if (writes === fault && readback) armed = key;
    },
  };
  const ops = create(backend, async () => {});
  const model = { [F]: 1, [L]: 1 };
  for (const key of [F,L]) ops.register(key, {
    ready: () => true, snapshot: () => model[key], restore: n => {model[key] = n;},
  });
  const mutate = (n = 2) => {
    for (const key of [F,L]) {
      ops.assertWritable(); model[key] = n;
      assert.equal(ops.stage(key,raw(n)),true);
    }
    return {id:'payment-one'};
  };
  return {ops,data,events,backend,model,mutate,writes:()=>writes,reads:()=>reads};
}
test('native intent precedes both accounting writes, receipt and clear; readbacks precede success', async () => {
  const s=scenario(); const result=await s.ops.run('op-one',{amount:2},s.mutate);
  assert.deepEqual(result,{id:'payment-one'});
  assert.deepEqual(s.events.filter(e=>e[0]!=='get').map(e=>e[1]),
    [I,F,L,'tomorrow:finance-save-receipt:v1:op-one',I]);
  assert.equal(s.ops.getStatus().phase,'ready');
  assert.equal(s.ops.getStatus().postingAllowed,false);
  assert.equal((await s.ops.inspect()).classification,'clean');
});
test('same identity is single-flight, survives restart and never repeats economic effects', async () => {
  const s=scenario();let calls=0;
  const a=s.ops.run('same-op',{a:1,b:2},()=>{calls++;return s.mutate();});
  const b=s.ops.run('same-op',{b:2,a:1},()=>{calls++;return s.mutate();});
  assert.equal(a,b);await a;assert.equal(calls,1);
  const restarted=scenario({data:s.data});await restarted.ops.run('same-op',{a:1,b:2},()=>{calls++;return restarted.mutate(3);});
  assert.equal(calls,1);assert.equal(restarted.writes(),0);assert.equal(s.data.get(F),raw(2));
  await assert.rejects(restarted.ops.run('same-op',{a:9},()=>restarted.mutate(3)),/identity|receipt/i);
  assert.equal(restarted.writes(),0);
});
test('different concurrent identities and public mutation during async admission are rejected', async () => {
  const s=scenario();s.ops.initialize();
  const job=s.ops.run('one',{},s.mutate);
  assert.throws(()=>s.ops.assertWritable(),/awaiting acknowledgement/);
  await assert.rejects(s.ops.run('two',{},s.mutate),/pending/);await job;
});
const classifications = {
  before: ['clean','unapplied','partial','applied-unconfirmed','applied-unconfirmed'],
  after: ['unapplied','partial','applied-unconfirmed','applied-unconfirmed','clean'],
  readback: ['unapplied','partial','applied-unconfirmed','applied-unconfirmed','clean'],
};
for (const mode of ['before','after','readback']) for(let boundary=1;boundary<=5;boundary++) {
  test(mode+' failure at durable boundary '+boundary+' preserves evidence, fences and never replays', async () => {
    const s=scenario({fault:boundary,after:mode==='after',readback:mode==='readback'});
    await assert.rejects(s.ops.run('interrupted',{amount:2},s.mutate),/Injected|ACK/);
    assert.equal(s.ops.getStatus().phase,'blocked');
    const bytes=new Map(s.data),count=s.writes();
    await assert.rejects(s.ops.run('retry-new-id',{amount:2},s.mutate),/review|Injected|ACK|mismatch/i);
    assert.equal(s.writes(),count);assert.deepEqual(s.data,bytes);
    const restarted=scenario({data:s.data});restarted.ops.initialize();
    const evidence=await restarted.ops.inspect();
    assert.equal(evidence.classification,classifications[mode][boundary-1]);
    assert.equal(restarted.writes(),0);assert.deepEqual(s.data,bytes);
    if(evidence.classification==='partial') {
      await assert.rejects(restarted.ops.resolve('interrupted','accept-applied'),/Partial/);
      await assert.rejects(restarted.ops.resolve('interrupted','dismiss-unapplied'),/Partial/);
      assert.equal(restarted.writes(),0);assert.deepEqual(s.data,bytes);
    }
    if(evidence.classification==='applied-unconfirmed') {
      await restarted.ops.resolve('interrupted','accept-applied');
      assert.equal(s.data.get(F),raw(2));assert.equal(s.data.get(L),raw(2));
      assert.equal(restarted.events.some(e=>e[0]!=='get'&&[F,L].includes(e[1])),false);
      assert.equal(restarted.ops.getStatus().phase,'blocked');
      assert.equal(s.data.get('tomorrow:finance-save-evidence:v1:interrupted'),bytes.get(I));
      const clean=scenario({data:s.data});let calls=0;
      const result=await clean.ops.run('interrupted',{amount:2},()=>{calls++;return clean.mutate(3);});
      assert.equal(calls,0);assert.deepEqual(result,{id:'payment-one'});assert.equal(clean.writes(),0);
    }
  });
}
test('explicit dismissal of verified unapplied intent archives bytes and never touches accounting', async () => {
  const s=scenario({fault:2});await assert.rejects(s.ops.run('not-applied',{},s.mutate));
  const original=s.data.get(I),restarted=scenario({data:s.data});
  await restarted.ops.resolve('not-applied','dismiss-unapplied');
  assert.equal(s.data.get(F),raw(1));assert.equal(s.data.get(L),raw(1));
  assert.equal(s.data.get('tomorrow:finance-save-evidence:v1:not-applied'),original);
  const clean=scenario({data:s.data});await assert.rejects(clean.ops.run('not-applied',{},clean.mutate),/abandoned/);
  assert.equal(clean.writes(),0);
});
test('conflicting bytes, malformed intent and changed recovery identity fail closed', async () => {
  const s=scenario({fault:3});await assert.rejects(s.ops.run('conflict',{},s.mutate));
  s.data.set(F,raw(999));const restarted=scenario({data:s.data});
  assert.equal((await restarted.ops.inspect()).classification,'conflict');
  await assert.rejects(restarted.ops.resolve('conflict','accept-applied'));assert.equal(restarted.writes(),0);
  const corrupt=scenario({data:new Map([[I,'{broken']])});
  assert.throws(()=>corrupt.ops.initialize());assert.equal(corrupt.ops.getStatus().phase,'blocked');
});
test('synchronous domain rejection restores captured memory with zero native writes', async () => {
  const s=scenario();await assert.rejects(s.ops.run('reject',{},()=>{s.mutate();throw new Error('domain rejected');}),/domain rejected/);
  assert.deepEqual(s.model,{[F]:1,[L]:1});assert.equal(s.writes(),0);
});
test('async mutation callbacks are rejected and do not write staged accounting', async () => {
  const s=scenario();await assert.rejects(s.ops.run('async',{},()=>{s.mutate();return Promise.resolve('bad');}),/synchronous/);
  assert.equal(s.writes(),0);assert.deepEqual(s.model,{[F]:1,[L]:1});
});
test('save result stays pending while native ACK is delayed', async () => {
  const s=scenario();let release;const gate=new Promise(r=>release=r);const original=s.backend.setItem;
  s.backend.setItem=async(k,v)=>{await gate;return original(k,v);};
  let done=false;const saving=s.ops.run('delayed',{},s.mutate).then(()=>done=true);
  await tick();assert.equal(done,false);assert.equal(s.ops.getStatus().phase,'saving');
  release();await saving;assert.equal(done,true);
});



test('evidence inspection excludes concurrent saves, mutations and hydration', async () => {
  const s=scenario();s.ops.initialize();let release;
  const gate=new Promise(r=>release=r);
  const reading=s.ops.withEvidenceRead(async()=>{await gate;return 'retained';});
  assert.throws(()=>s.ops.assertWritable(),/inspection/);
  assert.throws(()=>s.ops.assertHydrationAllowed(),/inspection/);
  await assert.rejects(s.ops.run('blocked-by-review',{},s.mutate),/review/);
  assert.equal(s.writes(),0);release();assert.equal(await reading,'retained');
  await s.ops.run('after-review',{},s.mutate);assert.equal(s.data.get(F),raw(2));
});

test('pending save excludes hydration and invalid recovery decisions never write', async () => {
  const s=scenario();s.ops.initialize();const saving=s.ops.run('one',{},s.mutate);
  assert.throws(()=>s.ops.assertHydrationAllowed(),/hydration/);await saving;
  const count=s.writes();await assert.rejects(s.ops.resolve('one','unsupported'),/Unsupported/);
  assert.equal(s.writes(),count);
});


test('audit: persisted drift from hydrated snapshot is rejected before any economic mutation', async () => {
  const s=scenario();
  // The test port supplies the same persisted snapshot contract as production.
  const isolated=create(s.backend,async()=>{});let calls=0;
  for(const key of [F,L]) isolated.register(key,{ready:()=>true,snapshot:()=>1,restore:()=>{},persisted:()=>raw(1)});
  s.data.set(F,raw(999));const original=new Map(s.data);
  await assert.rejects(isolated.run('stale',{},()=>{calls++;isolated.stage(F,raw(2));}),/changed|stale/i);
  assert.equal(calls,0);assert.equal(s.writes(),0);assert.deepEqual(s.data,original);
});


test('audit: recovery preserves and rejects a conflicting completed receipt result', async () => {
  const s=scenario({fault:5});await assert.rejects(s.ops.run('receipt-conflict',{},s.mutate));
  const key='tomorrow:finance-save-receipt:v1:receipt-conflict';
  const receipt=JSON.parse(s.data.get(key));receipt.result={id:'different-payment'};s.data.set(key,JSON.stringify(receipt));
  const original=new Map(s.data),restarted=scenario({data:s.data});
  await assert.rejects(restarted.ops.resolve('receipt-conflict','accept-applied'),/Conflicting/);
  assert.equal(restarted.writes(),0);assert.deepEqual(s.data,original);
});
