/* global __dirname */
// Actual accounting stores, actual persist middleware, controllable native I/O.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), load = Module._load;
let native, session;
Module._load = function(id, parent, main) {
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

test('default production bindings stay legacy and cannot be switched to tracked persistence after initialization', async () => {
  const s = await actualSession({ tracked: false });
  assert.deepEqual(s.runtime.getStatus().boundKeys, []);
  assert.throws(() => s.installPaymentRuntimeBeforeStores(s.runtime), /before accounting stores/);
  s.finance.setState({ assets: [{ id: 'legacy' }] });
  await tick(); assert.equal(JSON.parse(s.native.data.get(F)).state.assets[0].id, 'legacy');
  assert.equal(s.native.events.some(e => e[1] === J), false);
  assert.equal(s.runtime.getStatus().postingAllowed, false);
});

test('one runtime owns both actual stores and the journal, with no automatic journal hydration/bootstrap', async () => {
  const s = await actualSession();
  assert.equal(s.createPaymentOperationRuntime(native), s.runtime);
  const { createPaymentOperationStore } = require('../src/features/finance/store/usePaymentOperationStore.ts');
  assert.equal(createPaymentOperationStore(native), s.runtime.journal);
  assert.deepEqual(s.runtime.getStatus().boundKeys.sort(), [F, L]);
  assert.deepEqual(s.runtime.getStatus().hydratingKeys, []);
  assert.equal(s.runtime.journal.getStatus().phase, 'unhydrated');
  assert.equal(s.native.events.some(e => e[1] === J), false);
  assert.equal(s.runtime.getStatus().postingAllowed, false);
  assert.equal(s.runtime.getStatus().productionActivation, 'blocked');
});

test('journal ownership cannot be independently released while its runtime still owns accounting stores', async () => {
  const s = await actualSession();
  const { createPaymentOperationStore } = require('../src/features/finance/store/usePaymentOperationStore.ts');
  await assert.rejects(createPaymentOperationStore(native).close(), /owning payment persistence runtime/);
  assert.equal(createPaymentOperationStore(native), s.runtime.journal);
  assert.equal(s.runtime.getStatus().phase, 'open');
  await s.runtime.close(); assert.equal(s.runtime.getStatus().phase, 'closed');
});

test('competing journal adapters and late runtime replacements are rejected', async () => {
  const s = await actualSession();
  const { createPaymentOperationStore } = require('../src/features/finance/store/usePaymentOperationStore.ts');
  const { createOrderedFinancePersistence } = require('../src/features/finance/store/financePersistence.ts');
  assert.throws(() => createPaymentOperationStore(native, native, createOrderedFinancePersistence(native)), /different persistence runtime/);
  const other = s.createPaymentOperationRuntime(memory());
  assert.throws(() => s.installPaymentRuntimeBeforeStores(other), /before accounting stores/);
  await other.close();
});

for (const key of [F, L]) {
  test(`${key} internal actions and external setState queue exact snapshots and await real acknowledgements`, async () => {
    const s = await actualSession(), gate = deferred(), events = [], original = native.setItem;
    native.setItem = async (name, value) => {
      events.push(['start', name]); if (events.length === 1) await gate.promise;
      await original(name, value); events.push(['ack', name]);
    };
    if (key === F) s.finance.getState().addDebt({ personName: 'Person', direction: 'payable', amount: 100, currencyCode: 'USD', date: '2026-11-05' });
    else s.ledger.getState().addAccount({ name: 'Bank', type: 'bank', currencyCode: 'USD', initialBalance: 100 });
    const store = key === F ? s.finance : s.ledger;
    store.setState({ paymentJournal: marker });
    let acknowledged = false; const barrier = s.runtime.persistence.flush(key).then(() => { acknowledged = true; });
    await tick(); assert.equal(acknowledged, false); assert.deepEqual(events, [['start', key]]);
    gate.resolve(); await barrier;
    assert.deepEqual(events, [['start', key], ['ack', key], ['start', key], ['ack', key]]);
    const writes = native.events.filter(e => e[0] === 'set' && e[1] === key).map(e => JSON.parse(e[2]).state);
    assert.equal(writes.length, 2); assert.equal(writes[0].paymentJournal, undefined);
    assert.deepEqual(writes[1].paymentJournal, marker);
    assert.equal((key === F ? writes[1].debts : writes[1].accounts).length, 1);
  });
}

test('reentrant actual-store mutations persist the latest state without an untracked outer write', async () => {
  const s = await actualSession(); let reentered = false;
  const unsubscribe = s.ledger.subscribe(() => { if (!reentered) { reentered = true; s.ledger.setState({ paymentJournal: marker }); } });
  s.ledger.getState().addAccount({ name: 'Bank', type: 'bank', currencyCode: 'USD', initialBalance: 100 });
  await s.runtime.persistence.flush(L); unsubscribe();
  const writes = native.events.filter(e => e[0] === 'set' && e[1] === L);
  assert.equal(writes.length, 2);
  for (const write of writes) {
    const saved = JSON.parse(write[2]).state;
    assert.deepEqual(saved.paymentJournal, marker); assert.equal(saved.accounts.length, 1);
  }
});

for (const fail of [false, true]) {
  test(`a subscriber barrier observes its still-running persisted mutation when acknowledgement ${fail ? 'fails' : 'succeeds'}`, async () => {
    const s = await actualSession(), gate = deferred(), original = native.setItem;
    native.setItem = async (key, value) => { await gate.promise; await original(key, value); };
    let observed;
    const unsubscribe = s.finance.subscribe(() => { observed = s.runtime.persistence.flush(F).then(() => 'acknowledged', error => error); });
    s.finance.setState({ paymentJournal: marker });
    let resolved = false; const result = observed.then(value => { resolved = true; return value; });
    await tick(); assert.equal(resolved, false); assert.equal(native.data.has(F), false);
    if (fail) gate.reject(new Error('Write failed')); else gate.resolve();
    const value = await result; unsubscribe();
    if (fail) assert.equal(value.operation, 'write'); else assert.equal(value, 'acknowledged');
  });
}

for (const key of [F, L]) {
  for (const mode of ['internal', 'external']) {
    test(`${key} ${mode} subscriber failure is observed before adapter enqueue and blocks barriers`, async () => {
      const s = await actualSession(), store = key === F ? s.finance : s.ledger;
      const unsubscribe = store.subscribe(() => { throw new Error('Subscriber failed'); });
      const mutate = mode === 'external' ? () => store.setState({ paymentJournal: marker })
        : key === F ? () => store.getState().addAsset({ name: 'Cash', category: 'local_currency', currencyCode: 'USD' })
          : () => store.getState().addAccount({ name: 'Bank', type: 'bank', currencyCode: 'USD', initialBalance: 10 });
      assert.throws(mutate, error => error.operation === 'mutation'); unsubscribe();
      await assert.rejects(s.runtime.persistence.flush(key));
      assert.equal(native.events.some(e => e[0] === 'set' && e[1] === key), false);
      assert.throws(() => store.setState({ paymentJournal: marker }));
      assert.equal(s.runtime.getStatus().failures.some(f => f.key === key), true);
    });
  }
}

for (const key of [F, L]) {
  test(`${key} JSON serialization errors cannot make an empty barrier look successful`, async () => {
    const s = await actualSession(), store = key === F ? s.finance : s.ledger;
    const patch = key === F ? { assets: [{ id: 'bad', quantity: 1n }] } : { accounts: [{ id: 'bad', initialBalance: 1n }] };
    assert.throws(() => store.setState(patch), error => error.operation === 'mutation');
    await assert.rejects(s.runtime.persistence.flush(key));
    assert.equal(native.events.some(e => e[0] === 'set' && e[1] === key), false);
  });
}

for (const key of [F, L]) {
  test(`${key} ignored automatic-write promises remain handled but a lost acknowledgement rejects the barrier`, async () => {
    const s = await actualSession(), original = native.setItem;
    native.setItem = async (name, value) => { await original(name, value); throw new Error('Lost acknowledgement'); };
    const store = key === F ? s.finance : s.ledger;
    // Deliberately ignore the Promise returned by the persisted external set.
    store.setState({ paymentJournal: marker });
    await assert.rejects(s.runtime.persistence.flush(key), error => error.uncertain);
    assert.deepEqual(JSON.parse(native.data.get(key)).state.paymentJournal, marker);
    await assert.rejects(s.runtime.exclusive(() => 'must not report success'));
  });
}

test('actual journal and accounting store writes use the same runtime barriers', async () => {
  const s = await actualSession(), gate = deferred(), original = native.setItem;
  await s.runtime.journal.hydrate();
  native.setItem = async (key, value) => { if (key === J) await gate.promise; await original(key, value); };
  const preparing = s.runtime.journal.prepare({ operationId: 'op', request: { entityType: 'debt', entityId: 'd',
    direction: 'payable', amount: 10, currencyCode: 'USD', date: '2026-11-05', funding: { kind: 'account', accountId: 'a', categoryId: 'out' } },
    paymentId: 'p', ledgerTransactionId: 't' });
  await tick(); let done = false; const barrier = s.runtime.persistence.flush(J).then(() => { done = true; });
  await tick(); assert.equal(done, false); assert.equal(native.data.has(J), false);
  gate.resolve(); await preparing; await barrier;
  assert.equal(JSON.parse(native.data.get(J)).state.receipts.length, 1);
});

test('exclusive execution orders concurrent jobs and awaits their issued accounting writes', async () => {
  const s = await actualSession(), gate = deferred(), events = [], original = native.setItem;
  native.setItem = async (key, value) => { if (key === F) await gate.promise; await original(key, value); };
  const first = s.runtime.exclusive(() => { events.push('first'); s.finance.setState({ paymentJournal: marker }); return 1; });
  const second = s.runtime.exclusive(() => { events.push('second'); s.ledger.setState({ paymentJournal: marker }); return 2; });
  await tick(); assert.deepEqual(events, ['first']);
  gate.resolve(); assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ['first', 'second']);
  for (const key of [F, L]) assert.deepEqual(JSON.parse(native.data.get(key)).state.paymentJournal, marker);
});

test('persist configuration replacement and direct storage deletion cannot bypass the tracked writers', async () => {
  const s = await actualSession();
  for (const store of [s.finance, s.ledger]) {
    assert.throws(() => store.persist.setOptions({ storage: { setItem() {}, getItem() { return null; }, removeItem() {} } }), /cannot be replaced/);
    assert.throws(() => store.persist.setOptions({ name: 'other' }), /cannot be replaced/);
    assert.throws(() => store.persist.clearStorage(), /domain reset/);
  }
  assert.equal(native.events.some(e => e[0] === 'remove'), false);
});

test('actual resets, migration and restart preserve existing arrays and generation metadata', async () => {
  const data = new Map([F, L].map(key => [key, JSON.stringify({ version: 1, state: { ...state(key), paymentJournal: marker } })]));
  const s = await actualSession({ data });
  await Promise.all([s.runtime.persistence.flush(F), s.runtime.persistence.flush(L)]);
  assert.equal(s.finance.getState().resetFinanceData(), true); assert.equal(s.ledger.getState().resetLedger(), true);
  await Promise.all([s.runtime.persistence.flush(F), s.runtime.persistence.flush(L)]);
  for (const key of [F, L]) assert.deepEqual(JSON.parse(data.get(key)).state.paymentJournal, marker);
  await s.runtime.close();
  const restarted = await actualSession({ data });
  assert.deepEqual(restarted.finance.getState().paymentJournal, marker);
  assert.deepEqual(restarted.ledger.getState().paymentJournal, marker);
  assert.equal(data.has(J), false);
});

test('closing fences new mutations and drains issued writes before runtime replacement', async () => {
  const s = await actualSession(), gate = deferred(), original = native.setItem;
  native.setItem = async (key, value) => { await gate.promise; await original(key, value); };
  s.finance.setState({ paymentJournal: marker }); await tick();
  let closed = false; const closing = s.runtime.close().then(() => { closed = true; });
  await tick(); assert.equal(closed, false);
  assert.throws(() => s.ledger.setState({ paymentJournal: marker }), /closed or closing/);
  await assert.rejects(s.runtime.exclusive(() => 'not run'), /closed or closing/);
  gate.resolve(); await closing;
  assert.equal(s.runtime.getStatus().phase, 'closed');
  assert.deepEqual(JSON.parse(native.data.get(F)).state.paymentJournal, marker);
  assert.throws(() => s.installPaymentRuntimeBeforeStores(s.createPaymentOperationRuntime(native)), /before accounting stores/);
});

test('tracked sticky errors demonstrate why legacy synchronous compensation cannot be activated unchanged', async () => {
  const s = await actualSession();
  s.finance.setState({ debts: [{ id: 'd', personName: 'Person', direction: 'payable', amount: 500,
    currencyCode: 'USD', date: '2026-11-05', payments: [] }] });
  s.ledger.setState({ accounts: [{ id: 'a', name: 'Bank', type: 'bank', currencyCode: 'USD', initialBalance: 1000 }],
    categories: [{ id: 'out', name: 'Other', kind: 'expense' }] });
  await Promise.all([s.runtime.persistence.flush(F), s.runtime.persistence.flush(L)]);
  let fired = false; const unsubscribe = s.ledger.subscribe(() => { if (!fired) { fired = true; throw new Error('Injected subscriber failure'); } });
  const { postLinkedPayment } = require('../src/features/finance/store/paymentOperations.ts');
  const result = postLinkedPayment({ entityType: 'debt', entityId: 'd', amount: 100, date: '2026-11-05', accountId: 'a', categoryId: 'out' });
  unsubscribe();
  assert.equal(result.ok, false); assert.match(result.reason, /rollback failed/);
  assert.equal(s.ledger.getState().transactions.length, 1);
  await assert.rejects(s.runtime.persistence.flush(L));
  assert.equal(s.runtime.getStatus().productionActivation, 'blocked');
});

test('real historical payment and transaction records survive tracked persistence and fresh hydration unchanged', async () => {
  const historical = { ...state(F), debts: [{ id: 'd', personName: 'Person', direction: 'payable', amount: 500,
    currencyCode: 'USD', date: '2026-11-05', payments: [{ id: 'legacy-pay', amount: 50, date: '2026-11-05', ledgerTransactionId: 'legacy-tx', accountId: 'a' }] }] };
  const accounting = { ...state(L), accounts: [{ id: 'a', name: 'Bank', type: 'bank', currencyCode: 'USD', initialBalance: 1000 }],
    transactions: [{ id: 'legacy-tx', type: 'expense', accountId: 'a', amount: 50, currencyCode: 'USD', date: '2026-11-05',
      purpose: 'debt_payment', linkedEntityType: 'debt', linkedEntityId: 'd', linkedPaymentId: 'legacy-pay' }] };
  const data = new Map([[F, JSON.stringify({ version: 2, state: historical })], [L, JSON.stringify({ version: 2, state: accounting })]]);
  const s = await actualSession({ data });
  s.finance.setState({ paymentJournal: marker }); s.ledger.setState({ paymentJournal: marker });
  await Promise.all([s.runtime.persistence.flush(F), s.runtime.persistence.flush(L)]);
  for (const [key, expected] of [[F, historical], [L, accounting]]) {
    const saved = JSON.parse(data.get(key)).state; delete saved.paymentJournal; assert.deepEqual(saved, expected);
  }
  await s.runtime.close(); const restarted = await actualSession({ data });
  assert.deepEqual(restarted.finance.getState().debts, historical.debts);
  assert.deepEqual(restarted.ledger.getState().transactions, accounting.transactions);
});

for (const key of [F, L]) {
  test(`${key} partialize validation failure is tracked without an adapter write`, async () => {
    const s = await actualSession(), store = key === F ? s.finance : s.ledger;
    assert.throws(() => store.setState({ paymentJournal: null }), error => error.operation === 'mutation');
    await assert.rejects(s.runtime.persistence.flush(key));
    assert.equal(native.events.some(e => e[0] === 'set' && e[1] === key), false);
  });
  test(`${key} invalid hydrated metadata poisons readiness/barriers without rewriting the document`, async () => {
    const bytes = JSON.stringify({ version: 2, state: { ...state(key), paymentJournal: null } });
    const s = await actualSession({ data: new Map([[key, bytes]]) });
    const store = key === F ? s.finance : s.ledger;
    assert.equal(store.persist.hasHydrated(), false); assert.deepEqual(s.runtime.getStatus().hydratingKeys, []);
    await assert.rejects(s.runtime.persistence.flush(key));
    assert.throws(() => store.setState({ paymentJournal: marker }));
    assert.equal(native.data.get(key), bytes); assert.equal(native.events.some(e => e[0] === 'set' && e[1] === key), false);
  });
}

test('close also waits for active accounting hydration and never falls back to raw persistence', async () => {
  const gate = deferred();
  const s = await actualSession({ waitHydration: false, configure: backend => {
    const get = backend.getItem; backend.getItem = async key => { await gate.promise; return get(key); };
  } });
  assert.deepEqual(s.runtime.getStatus().hydratingKeys.sort(), [F, L]);
  let closed = false; const closing = s.runtime.close().then(() => { closed = true; });
  await tick(); assert.equal(closed, false);
  gate.resolve(); await s.hydrated; await closing;
  assert.equal(s.runtime.getStatus().phase, 'closed');
  assert.throws(() => s.finance.setState({ paymentJournal: marker }), /closed or closing/);
  assert.equal(native.events.some(e => e[0] === 'set'), false);
});

test('unknown storage keys cannot produce a misleading successful runtime barrier or write', async () => {
  const s = await actualSession();
  await assert.rejects(s.runtime.persistence.flush('tomorrow'), /Unsupported/);
  await assert.rejects(s.runtime.persistence.storage.getItem('other'), /Unsupported/);
  assert.throws(() => s.runtime.persistence.storage.setItem('other', 'value'), /Unsupported/);
  assert.equal(native.events.some(e => e[1] === 'other' || e[1] === 'tomorrow'), false);
});

test('an exclusive job cannot return its optimistic success when its own write acknowledgement fails', async () => {
  const s = await actualSession(), original = native.setItem;
  native.setItem = async (key, value) => { await original(key, value); throw new Error('Lost acknowledgement'); };
  await assert.rejects(s.runtime.exclusive(() => {
    s.finance.setState({ paymentJournal: marker }); return { ok: true };
  }), error => error.operation === 'write' && error.uncertain);
  assert.deepEqual(JSON.parse(native.data.get(F)).state.paymentJournal, marker);
});
