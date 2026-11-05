'use strict';
/* global __dirname */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), originalLoad = Module._load;
let native;
const sessions = [];
Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: native };
  return originalLoad.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const F = 'tomorrow:finance', L = 'tomorrow:ledger', J = 'tomorrow:payment-operations';
const marker = { schemaVersion: 1, generationId: 'g' };
const entity = { entityType: 'debt', entityId: 'd' };
const request = () => ({ operationId: 'operation', entity: { ...entity }, predecessor: null });
const binding = (key = F, stage = key === F ? 'finance-insert' : 'ledger-insert') => ({ ...request(), key, stage });
const json = v => JSON.parse(JSON.stringify(v));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function bytes() {
  return new Map([[F, JSON.stringify({ version: 2, state: { assets: [], debts: [], loans: [], cheques: [], paymentJournal: marker } })],
    [L, JSON.stringify({ version: 2, state: { accounts: [], categories: [], transactions: [], transfers: [], paymentJournal: marker } })],
    [J, JSON.stringify({ version: 3, state: { installation: { ...marker, phase: 'active' }, receipts: [], baselines: [] } })]]);
}
async function actual(configure, data = bytes(), deferAccess = false) {
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.join(root, 'src', 'features', 'finance'))) delete require.cache[file];
  const events = [];
  native = { data, events, getItem: async key => { events.push(['get', key]); return data.get(key) ?? null; },
    setItem: async (key, value) => { events.push(['set', key, value]); data.set(key, value); },
    removeItem: async key => { events.push(['remove', key]); data.delete(key); } };
  configure?.(native);
  const mod = require('../src/features/finance/store/paymentOperationRuntime.ts');
  const runtime = mod.createPaymentOperationRuntime(native); mod.installPaymentRuntimeBeforeStores(runtime);
  const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
  const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
  const s = { runtime, finance, ledger, native, mod }; sessions.push(s);
  await Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  if (!deferAccess) s.access = mod.createCoordinatorRuntimeAccess(runtime);
  return s;
}
afterEach(async () => { await Promise.all(sessions.splice(0).map(s => s.runtime.close())); });
const document = (s, key = F) => JSON.parse(s.native.data.get(key)).state;
function updated(s, key = F) {
  const data = document(s, key);
  if (key === F) data.assets = [{ id: 'authorization-test', name: 'Fixture', category: 'local_currency', currencyCode: 'USD', entries: [] }];
  else data.accounts = [{ id: 'authorization-test', name: 'Fixture', type: 'bank', currencyCode: 'USD', initialBalance: 0, archived: false }];
  return data;
}
const writes = s => s.native.events.filter(e => e[0] === 'set');

for (const key of [F, L]) test(`authorized ${key} stage uses actual Zustand notification and tracked persistence`, async () => {
  const s = await actual(), data = updated(s, key), store = key === F ? s.finance : s.ledger;
  let notifications = 0; const off = store.subscribe(state => { notifications++; assert.equal(Object.isFrozen(state), true); });
  await s.access.withWriteLease(request(), async lease => {
    const b = binding(key), cap = lease.issue(b);
    assert.deepEqual(Object.keys(cap), []); assert.equal(Object.isFrozen(cap), true);
    await lease.write(cap, b, data);
    await assert.rejects(lease.write(cap, b, data), /reused/);
    assert.throws(() => lease.issue(b), /already issued/);
  });
  off(); assert.equal(notifications, 1); assert.equal(writes(s).length, 1); assert.deepEqual(document(s, key), data);
  assert.equal(s.runtime.getStatus().postingAllowed, false); assert.equal(s.runtime.getStatus().readiness, 'blocked');
});

test('synchronous subscribers cannot inherit private setter, adapter, hydration, or cross-store authority', async () => {
  const s = await actual(), data = updated(s), caught = [];
  let lease, cap;
  const off = s.finance.subscribe(() => {
    for (const mutate of [
      () => s.finance.getState().clearAssets(), () => s.finance.setState({ assets: [] }),
      () => s.ledger.setState({ accounts: [] }), () => s.ledger.getState().addAccount({ name: 'Bad', type: 'bank', currencyCode: 'USD', initialBalance: 0 }),
      () => s.runtime.persistence.runMutation(F, () => assert.fail('callback must not execute')),
      () => s.finance.persist.getOptions().storage.setItem(F, { state: data, version: 2 }),
      () => s.finance.persist.getOptions().partialize(s.finance.getState()),
      () => s.finance.persist.rehydrate(), () => s.ledger.persist.rehydrate(),
      () => s.finance.persist.clearStorage(), () => s.finance.persist.setOptions({ name: 'bad' }),
      () => lease.issue(binding(L)),
      ...[F, L, J].flatMap(key => [() => s.runtime.persistence.storage.setItem(key, '{}'), () => s.runtime.persistence.storage.removeItem(key)]),
    ]) assert.throws(mutate, /excludes|ownership|notification|busy/i);
    caught.push(s.runtime.journal.hydrate(), s.runtime.journal.beginInstallation('bad'), lease.write(cap, binding(), data),
      s.access.withWriteLease(request(), async () => assert.fail('nested lease')), s.runtime.exclusive(() => assert.fail('nested gate')),
      s.runtime.readForensicSnapshot(), s.runtime.readRecoverySnapshot());
  });
  await s.access.withWriteLease(request(), async value => { lease = value; cap = lease.issue(binding()); await lease.write(cap, binding(), data); });
  off(); const failures = await Promise.allSettled(caught); assert.equal(failures.every(r => r.status === 'rejected'), true);
  assert.equal(writes(s).length, 1); assert.deepEqual(document(s), data); assert.equal(document(s, L).accounts.length, 0);
  assert.equal(s.runtime.getStatus().failures.length, 0);
});

test('subscriber microtasks remain public while an authorized acknowledgement is pending', async () => {
  const s = await actual(), gate = deferred(), entered = deferred(), set = s.native.setItem;
  s.native.setItem = async (key, value) => { entered.resolve(); await gate.promise; return set(key, value); };
  let microtask;
  const off = s.finance.subscribe(() => { microtask = Promise.resolve().then(() => {
    assert.throws(() => s.finance.setState({ assets: [] }), /ownership/);
    assert.throws(() => s.ledger.setState({ accounts: [] }), /ownership/);
    assert.throws(() => s.runtime.persistence.storage.setItem(J, '{}'), /ownership/);
    assert.throws(() => s.finance.persist.getOptions().storage.setItem(F, {}), /ownership/);
  }); });
  const running = s.access.withWriteLease(request(), async lease => { await lease.write(lease.issue(binding()), binding(), updated(s)); });
  try { await entered.promise; await microtask; assert.equal(writes(s).length, 0); }
  finally { gate.resolve(); off(); }
  await running; assert.equal(writes(s).length, 1);
});
for (const fail of [false, true]) test(`subscriber barrier captures the authorized ${fail ? 'failed' : 'successful'} persistence prefix`, async () => {
  const s = await actual(), gate = deferred(), entered = deferred(), set = s.native.setItem;
  s.native.setItem = async (key, value) => { entered.resolve(); await gate.promise; await set(key, value); if (fail) throw new Error('Lost acknowledgement'); };
  let observed, settled = false;
  const off = s.finance.subscribe(() => { observed = s.runtime.persistence.flush(F).then(() => { settled = true; return 'acknowledged'; }, error => { settled = true; return error; }); });
  const running = s.access.withWriteLease(request(), async lease => { await lease.write(lease.issue(binding()), binding(), updated(s)); });
  const outcome = running.then(() => 'completed', error => error);
  try { await entered.promise; await tick(); assert.equal(settled, false); assert.equal(writes(s).length, 0); }
  finally { gate.resolve(); off(); }
  const value = await observed, result = await outcome;
  if (fail) { assert.equal(value.operation, 'write'); assert.notEqual(result, 'completed'); }
  else { assert.equal(value, 'acknowledged'); assert.equal(result, 'completed'); }
  assert.equal(writes(s).length, 1);
});

for (const invalid of ['key', 'stage', 'operation', 'predecessor', 'entity', 'forged']) test(`capability rejects ${invalid} before changing state`, async () => {
  const s = await actual(), before = s.finance.getState();
  await s.access.withWriteLease(request(), async lease => {
    const b = binding(), cap = lease.issue(b), bad = json(b);
    if (invalid === 'key') bad.key = L;
    if (invalid === 'stage') bad.stage = 'finance-finalize';
    if (invalid === 'operation') bad.operationId = 'other';
    if (invalid === 'predecessor') bad.predecessor = { revision: 1, operationId: 'before' };
    if (invalid === 'entity') bad.entity.entityId = 'other';
    await assert.rejects(lease.write(invalid === 'forged' ? Object.freeze({}) : cap, bad, updated(s)), /binding|Wrong|Forged/);
    if (invalid !== 'forged') await assert.rejects(lease.write(cap, b, updated(s)), /reused/);
  });
  assert.equal(s.finance.getState(), before); assert.equal(writes(s).length, 0);
});
test('capability cannot cross runtime identity, even while both owners are live', async () => {
  const a = await actual(), b = await actual();
  await a.access.withWriteLease(request(), async first => {
    const cap = first.issue(binding());
    await b.access.withWriteLease(request(), async second => { await assert.rejects(second.write(cap, binding(), updated(b)), /wrong-runtime/); });
    await first.write(cap, binding(), updated(a));
  });
  assert.equal(writes(a).length, 1); assert.equal(writes(b).length, 0);
});
test('validation traps cannot reenter capability issuance or borrow a private continuation', async () => {
  const s = await actual(); let checked = 0;
  await s.access.withWriteLease(request(), async lease => {
    const trap = target => new Proxy(target, { getPrototypeOf(value) {
      assert.throws(() => lease.issue(binding(L)), /busy/);
      assert.throws(() => s.finance.setState({ assets: [] }), /ownership/);
      checked++; return Object.getPrototypeOf(value);
    } });
    const cap = lease.issue(trap(binding()));
    await lease.write(cap, binding(), trap(updated(s)));
  });
  assert.equal(checked, 2); assert.equal(writes(s).length, 1);
});
test('capabilities expire at lease release and cannot authorize a later lease', async () => {
  const s = await actual(); let cap, oldLease;
  await s.access.withWriteLease(request(), async lease => { oldLease = lease; cap = lease.issue(binding()); });
  await assert.rejects(oldLease.write(cap, binding(), updated(s)), /expired/);
  await s.access.withWriteLease(request(), async lease => { await assert.rejects(lease.write(cap, binding(), updated(s)), /Forged/); });
  assert.equal(writes(s).length, 0);
});
test('journal stages have no execution port or V3 transition in 3A', async () => {
  const s = await actual(), original = s.native.data.get(J);
  await s.access.withWriteLease(request(), async lease => {
    const b = binding(J, 'journal-prepare'); await assert.rejects(lease.write(lease.issue(b), b, {}), /No private journal/);
  });
  assert.equal(s.native.data.get(J), original); assert.equal(writes(s).length, 0);
});
for (const mode of ['getter', 'toJSON', 'function', 'prototype', 'cycle']) test(`private stage rejects executable ${mode} data without invoking it`, async () => {
  const s = await actual(), data = updated(s); let called = false;
  if (mode === 'getter') Object.defineProperty(data, 'assets', { enumerable: true, get() { called = true; return []; } });
  if (mode === 'toJSON') data.toJSON = () => { called = true; return {}; };
  if (mode === 'function') data.assets.push(() => { called = true; });
  if (mode === 'prototype') data.assets.push(new Date());
  if (mode === 'cycle') data.assets.push(data);
  await s.access.withWriteLease(request(), async lease => { await assert.rejects(lease.write(lease.issue(binding()), binding(), data)); });
  assert.equal(called, false); assert.equal(writes(s).length, 0);
});
test('actual predecessor is rechecked at the private store port', async () => {
  const s = await actual();
  await assert.rejects(s.access.withWriteLease(request(), async lease => {
    const first = updated(s); first.paymentAccounting = { schemaVersion: 1, entityHeads: [{ entity, head: { revision: 1, operationId: 'changed' } }] };
    await lease.write(lease.issue(binding()), binding(), first);
    const second = binding(F, 'finance-finalize'); await lease.write(lease.issue(second), second, first);
  }), /predecessor/);
  assert.equal(writes(s).length, 1); assert.match(s.runtime.getStatus().writeFence, /failed|interrupted/);
});

function assertFenced(s) {
  for (const mutate of [() => s.finance.getState().clearAssets(), () => s.ledger.setState({ accounts: [] }),
    () => s.finance.persist.rehydrate(), () => s.ledger.persist.clearStorage(), () => s.runtime.persistence.storage.setItem(J, '{}')]) assert.throws(mutate, /fenced|closed|excludes/);
  assert.ok(s.finance.getState()); assert.ok(s.ledger.getState()); assert.ok(s.runtime.journal.getState());
  assert.equal(s.runtime.getStatus().postingAllowed, false);
}
for (const mode of ['reject-before-write', 'lost-ack', 'subscriber']) test(`${mode} fences every accounting key and preserves forensic reads`, async () => {
  const s = await actual(), original = s.native.data.get(F), set = s.native.setItem;
  let off = () => {};
  if (mode === 'subscriber') off = s.finance.subscribe(() => { throw new Error('Subscriber failed'); });
  else s.native.setItem = async (key, value) => { if (mode === 'lost-ack') await set(key, value); throw new Error('Persistence failed'); };
  await assert.rejects(s.access.withWriteLease(request(), async lease => { await lease.write(lease.issue(binding()), binding(), updated(s)); })); off();
  assertFenced(s); await assert.rejects(s.runtime.persistence.flush(F));
  const failures = s.runtime.getStatus().failures, reads = await s.runtime.readForensicSnapshot();
  assert.equal(reads.coherent, false); assert.equal(reads.readiness, 'blocked'); assert.equal(reads.postingAllowed, false);
  assert.equal(reads.documents.find(d => d.key === F).raw, s.native.data.get(F));
  assert.equal(s.native.data.get(F) === original, mode !== 'lost-ack');
  assert.deepEqual(s.runtime.getStatus().failures, failures); await assert.rejects(s.runtime.persistence.flush(F));
  await assert.rejects(s.runtime.journal.hydrate(), /fenced/);
  await assert.rejects(s.access.withWriteLease(request(), async () => assert.fail('must not reopen')), /fenced/);
});
test('explicit unresolved evidence fences unrelated entities without any accounting write', async () => {
  const s = await actual();
  await assert.rejects(s.access.withWriteLease(request(), async lease => { lease.fence('Prepared evidence unresolved'); }), /fenced/);
  assertFenced(s); assert.equal(writes(s).length, 0); assert.equal((await s.runtime.readForensicSnapshot()).documents.length, 3);
});
test('explicit coordinator mode starts and stays public-write-closed, even before first lease', async () => {
  const s = await actual();
  for (const mutate of [() => s.finance.setState({ assets: [] }), () => s.ledger.setState({ accounts: [] }),
    () => s.finance.persist.rehydrate(), () => s.runtime.persistence.storage.setItem(J, '{}')]) {
    assert.throws(mutate, /write-closed/);
  }
  await s.access.withWriteLease(request(), async () => {});
  assert.throws(() => s.finance.getState().clearAssets(), /write-closed/);
  assert.equal(writes(s).length, 0); assert.equal(s.runtime.getStatus().coordinatorSession, 'write-closed');
});
test('private partialize failure remains sticky and changes neither state nor disk', async () => {
  const s = await actual(), before = s.finance.getState(), data = updated(s); data.paymentAccounting = { schemaVersion: 9, entityHeads: [] };
  await assert.rejects(s.access.withWriteLease(request(), async lease => { await lease.write(lease.issue(binding()), binding(), data); }));
  assert.equal(s.finance.getState(), before); assert.equal(writes(s).length, 0);
  await assert.rejects(s.runtime.persistence.flush(F)); assertFenced(s);
  await s.runtime.readForensicSnapshot(); await assert.rejects(s.runtime.persistence.flush(F));
});
test('private stages cannot change the installation generation marker', async () => {
  const s = await actual(), data = updated(s); data.paymentJournal = { ...marker, generationId: 'other' };
  await assert.rejects(s.access.withWriteLease(request(), async lease => { await lease.write(lease.issue(binding()), binding(), data); }), /generation marker/);
  assert.equal(writes(s).length, 0); assert.equal(document(s).paymentJournal.generationId, 'g'); assertFenced(s);
});
test('hydration interference is rejected before listeners or hydration state change', async () => {
  const s = await actual(); let listeners = 0; const off = s.finance.persist.onHydrate(() => { listeners++; });
  await s.access.withWriteLease(request(), async () => {
    assert.throws(() => s.finance.persist.rehydrate(), /excludes/);
    assert.equal(s.finance.persist.hasHydrated(), true); assert.equal(listeners, 0);
    await assert.rejects(s.runtime.journal.hydrate(), /ownership/);
  }); off();
});
test('lease waits for accepted hydration and persistence, then excludes public mutations', async () => {
  const s = await actual(undefined, bytes(), true), gate = deferred(), entered = deferred(), get = s.native.getItem;
  s.native.getItem = async key => { if (key === F) { entered.resolve(); await gate.promise; } return get(key); };
  const hydrating = s.finance.persist.rehydrate(); await entered.promise;
  s.access = s.mod.createCoordinatorRuntimeAccess(s.runtime);
  let acquired = false; const running = s.access.withWriteLease(request(), async lease => { acquired = true; assert.throws(() => s.finance.setState({ assets: [] }), /ownership/); await lease.write(lease.issue(binding()), binding(), updated(s)); });
  await tick(); assert.equal(acquired, false); assert.throws(() => s.ledger.setState({ accounts: [] }), /write-closed/);
  gate.resolve(); await hydrating; await running; assert.equal(acquired, true);
});
test('close before lease acquisition rejects queued ownership without new writes', async () => {
  const s = await actual(), gate = deferred(), entered = deferred();
  const first = s.runtime.exclusive(async () => { entered.resolve(); await gate.promise; }); await entered.promise;
  const queued = s.access.withWriteLease(request(), async () => assert.fail('must not acquire'));
  const rejected = assert.rejects(queued, /closed or closing/), closing = s.runtime.close(); gate.resolve();
  await first; await rejected; await closing; assert.equal(writes(s).length, 0);
});
test('close after capability issuance but before use rejects authority without writing', async () => {
  const s = await actual(); let closing;
  await assert.rejects(s.access.withWriteLease(request(), async lease => {
    const cap = lease.issue(binding()); closing = s.runtime.close();
    await assert.rejects(lease.write(cap, binding(), updated(s)), /expired|closing/); await closing;
  }), error => error.outcome === 'rejected');
  await closing; assert.equal(writes(s).length, 0);
});
test('close between acknowledged stages prevents another mutation and retains the first', async () => {
  const s = await actual(); let closing;
  await assert.rejects(s.access.withWriteLease(request(), async lease => {
    await lease.write(lease.issue(binding()), binding(), updated(s)); closing = s.runtime.close();
    assert.throws(() => lease.issue(binding(L)), /expired|closing/); await closing;
  }), error => error.outcome === 'uncertain');
  await closing; assert.equal(writes(s).length, 1); assert.equal(document(s).assets.length, 1);
});
test('awaiting close inside the lease callback cannot deadlock', async () => {
  const s = await actual();
  await assert.rejects(s.access.withWriteLease(request(), async () => { await s.runtime.close(); }), error => error.outcome === 'rejected');
  await s.runtime.close(); assert.equal(s.runtime.getStatus().phase, 'closed');
});
for (const key of [F, L]) test(`close during ${key} acknowledgement drains issued I/O and stops later stages`, async () => {
  const s = await actual(), gate = deferred(), entered = deferred(), set = s.native.setItem;
  s.native.setItem = async (name, value) => { entered.resolve(); await gate.promise; return set(name, value); };
  let later = false;
  const running = s.access.withWriteLease(request(), async lease => {
    await lease.write(lease.issue(binding(key)), binding(key), updated(s, key)); later = true;
    const b = binding(F, 'finance-finalize'); await lease.write(lease.issue(b), b, updated(s));
  });
  const rejected = assert.rejects(running, error => error.outcome === 'uncertain');
  await entered.promise; let closed = false; const closing = s.runtime.close().then(() => { closed = true; });
  try { await tick(); assert.equal(closed, false); assertFenced(s); }
  finally { gate.resolve(); }
  await rejected; await closing;
  assert.equal(later, true, 'caller continuation may run but cannot obtain another capability');
  assert.equal(writes(s).length, 1); assert.equal(s.runtime.getStatus().phase, 'closed');
});
test('close during subscriber notification retains memory evidence but does not issue a later write', async () => {
  const s = await actual(), before = s.native.data.get(F);
  const off = s.finance.subscribe(() => { void s.runtime.close(); });
  await assert.rejects(s.access.withWriteLease(request(), async lease => { await lease.write(lease.issue(binding()), binding(), updated(s)); }), e => e.outcome === 'uncertain');
  off(); await s.runtime.close(); assert.equal(s.native.data.get(F), before); assert.equal(s.finance.getState().assets.length, 1);
  assert.equal(writes(s).length, 0); assert.equal((await s.runtime.readForensicSnapshot()).documents.find(d => d.key === F).raw, before);
});
test('forensic read errors remain explicit, never verified readiness', async () => {
  const s = await actual(); s.native.getItem = async () => { throw new Error('Unreadable'); };
  const result = await s.runtime.readForensicSnapshot(); assert.equal(result.documents.every(d => d.error), true);
  assert.equal(result.coherent, false); assert.equal(result.postingAllowed, false);
});
test('restart does not admit unresolved V3 prepared evidence or promote a legacy journal', async () => {
  const data = bytes(); data.set(J, JSON.stringify({ version: 2, state: { receipts: [] } }));
  const legacy = await actual(undefined, data);
  await assert.rejects(legacy.access.withWriteLease(request(), async () => assert.fail('no promotion')), /V3/);
  assert.equal(writes(legacy).length, 0);
  const fresh = await actual();
  const old = { operationId: 'old', request: { entityType: 'debt', entityId: 'd', currencyCode: 'USD', amount: 1, date: '2026-11-05', direction: 'payable', funding: { kind: 'account', accountId: 'a', categoryId: 'c' } }, paymentId: 'p', ledgerTransactionId: 't', status: 'prepared' };
  const saved = JSON.parse(fresh.native.data.get(J)); saved.state.receipts.push(old); fresh.native.data.set(J, JSON.stringify(saved));
  await assert.rejects(fresh.access.withWriteLease(request(), async () => assert.fail('no replay')), /unresolved/);
  assertFenced(fresh); assert.equal(writes(fresh).length, 0);
});
test('a valid V3 prepared-unapplied receipt reconstructs the write fence before any authorized stage', async () => {
  const data = bytes(), f = JSON.parse(data.get(F)), l = JSON.parse(data.get(L)), j = JSON.parse(data.get(J));
  const header = { ...entity, direction: 'payable', amount: 100, currencyCode: 'USD' };
  f.state.debts = [{ id: 'd', direction: 'payable', amount: 100, currencyCode: 'USD', payments: [] }];
  l.state.accounts = [{ id: 'a', type: 'bank', currencyCode: 'USD', initialBalance: 100 }];
  l.state.categories = [{ id: 'c', kind: 'expense' }];
  const q = { ...entity, direction: 'payable', amount: 10, currencyCode: 'USD', date: '2026-11-05', funding: { kind: 'account', accountId: 'a', categoryId: 'c' } };
  j.state.baselines = [{ schemaVersion: 1, baselineId: 'baseline', generationId: 'g', parent: { ...header, payments: [] } }];
  j.state.receipts = [{ schemaVersion: 2, operationId: 'pending', generationId: 'g', baselineId: 'baseline', state: 'prepared',
    revision: { entity, before: null, after: { revision: 1, operationId: 'pending' } },
    plan: { kind: 'post', request: q, target: { ...entity, paymentId: 'p', ledgerTransactionId: 't' }, delta: {
      parentBefore: header, parentAfter: header, paymentBefore: null,
      paymentAfter: { id: 'p', amount: 10, date: q.date, accountId: 'a', ledgerTransactionId: 't' }, transactionBefore: null,
      transactionAfter: { id: 't', type: 'expense', entryType: 'normal', purpose: 'debt_payment', amount: 10, date: q.date,
        currencyCode: 'USD', accountId: 'a', categoryId: 'c', linkedEntityType: 'debt', linkedEntityId: 'd', linkedPaymentId: 'p' },
    } } }];
  data.set(F, JSON.stringify(f)); data.set(L, JSON.stringify(l)); data.set(J, JSON.stringify(j));
  const s = await actual(undefined, data);
  const { verifyPersistedPaymentAccounting } = require('../src/features/finance/store/paymentAccountingVerification.ts');
  assert.equal(verifyPersistedPaymentAccounting(Object.fromEntries(data)).findings.at(-1).classification, 'prepared-unapplied');
  assert.throws(() => s.finance.getState().clearAssets(), /write-closed/);
  await assert.rejects(s.access.withWriteLease(request(), async () => assert.fail('must not replay')), /unresolved/);
  assertFenced(s); assert.equal(writes(s).length, 0);
  const report = await s.runtime.readForensicSnapshot(); assert.equal(report.documents.find(d => d.key === J).raw, data.get(J));
});
