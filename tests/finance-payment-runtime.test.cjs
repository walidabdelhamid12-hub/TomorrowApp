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

function holdWrites(key) {
  const gates = [deferred(), deferred(), deferred()], original = native.setItem;
  let started = 0;
  native.setItem = async (name, value) => {
    if (name === key) await gates[started++].promise;
    await original(name, value);
  };
  return { gates, started: () => started, release: () => gates.forEach(gate => gate.resolve()) };
}
const trackedSnapshot = (key, generationId) => JSON.stringify({ version: 2,
  state: { ...state(key), paymentJournal: { schemaVersion: 1, generationId } } });
const observe = promise => promise.then(value => ({ status: 'fulfilled', value }), error => ({ status: 'rejected', error }));

for (const key of [F, L]) {
  for (const failSecond of [false, true]) {
    test(`${key} mixed guarded/direct barrier waits for the captured second ${failSecond ? 'failed' : 'successful'} acknowledgement`, async () => {
      const s = await actualSession(), held = holdWrites(key);
      try {
        const store = key === F ? s.finance : s.ledger;
        store.setState({ paymentJournal: marker });
        const second = observe(s.runtime.persistence.storage.setItem(key, trackedSnapshot(key, 'second')));
        let settled = false;
        const barrier = observe(s.runtime.persistence.flush(key)).then(result => { settled = true; return result; });
        await tick(); assert.equal(held.started(), 1); assert.equal(settled, false);
        held.gates[0].resolve(); await tick();
        assert.equal(held.started(), 2);
        assert.equal(JSON.parse(native.data.get(key)).state.paymentJournal.generationId, 'retained');
        assert.equal(settled, false, 'a captured queued write must not be hidden by the first mutation acknowledgement');
        if (failSecond) held.gates[1].reject(new Error('Second acknowledgement failed')); else held.gates[1].resolve();
        const result = await barrier; const direct = await second;
        assert.equal(result.status, failSecond ? 'rejected' : 'fulfilled');
        assert.equal(direct.status, result.status);
        if (failSecond) {
          assert.equal(result.error.operation, 'write');
          await assert.rejects(s.runtime.persistence.flush(key));
        } else assert.equal(JSON.parse(native.data.get(key)).state.paymentJournal.generationId, 'second');
      } finally { held.release(); }
    });
  }

  for (const failLate of [false, true]) {
    test(`${key} writes queued after flush invocation do not extend its prefix when the later write ${failLate ? 'fails' : 'succeeds'}`, async () => {
      const s = await actualSession(), held = holdWrites(key);
      try {
        (key === F ? s.finance : s.ledger).setState({ paymentJournal: marker });
        const second = observe(s.runtime.persistence.storage.setItem(key, trackedSnapshot(key, 'second')));
        let capturedDone = false;
        const captured = observe(s.runtime.persistence.flush(key)).then(result => { capturedDone = true; return result; });
        // This write is queued after the captured barrier but before either
        // earlier acknowledgement; a dynamic re-read of the tail is incorrect.
        const late = observe(s.runtime.persistence.storage.setItem(key, trackedSnapshot(key, 'late')));
        let laterDone = false;
        const includingLate = observe(s.runtime.persistence.flush(key)).then(result => { laterDone = true; return result; });
        await tick(); held.gates[0].resolve(); await tick();
        assert.equal(capturedDone, false); assert.equal(laterDone, false);
        held.gates[1].resolve();
        const prefixResult = await captured; await second; await tick();
        assert.equal(prefixResult.status, 'fulfilled');
        assert.equal(held.started(), 3); assert.equal(laterDone, false);
        assert.equal(JSON.parse(native.data.get(key)).state.paymentJournal.generationId, 'second');
        if (failLate) held.gates[2].reject(new Error('Uncaptured later write failed')); else held.gates[2].resolve();
        const laterResult = await includingLate; await late;
        assert.equal(laterResult.status, failLate ? 'rejected' : 'fulfilled');
        assert.equal(prefixResult.status, 'fulfilled');
        if (failLate) await assert.rejects(s.runtime.persistence.flush(key));
        else assert.equal(JSON.parse(native.data.get(key)).state.paymentJournal.generationId, 'late');
      } finally { held.release(); }
    });
  }

  for (const failSecond of [false, true]) {
    test(`${key} exclusive gate includes mixed tracked writes and ${failSecond ? 'rejects failure' : 'acknowledges success'} before releasing the next job`, async () => {
      const s = await actualSession(), held = holdWrites(key), events = [];
      try {
        let second;
        const first = observe(s.runtime.exclusive(() => {
          events.push('first');
          (key === F ? s.finance : s.ledger).setState({ paymentJournal: marker });
          second = observe(s.runtime.persistence.storage.setItem(key, trackedSnapshot(key, 'second')));
          return 'acknowledged';
        }));
        const next = observe(s.runtime.exclusive(() => { events.push('next'); return 'next'; }));
        let settled = false; const firstResult = first.then(result => { settled = true; return result; });
        await tick(); held.gates[0].resolve(); await tick();
        assert.equal(held.started(), 2); assert.equal(settled, false); assert.deepEqual(events, ['first']);
        if (failSecond) held.gates[1].reject(new Error('Second acknowledgement failed')); else held.gates[1].resolve();
        const result = await firstResult; await second; const following = await next;
        assert.equal(result.status, failSecond ? 'rejected' : 'fulfilled');
        assert.equal(following.status, failSecond ? 'rejected' : 'fulfilled');
        assert.deepEqual(events, failSecond ? ['first'] : ['first', 'next']);
        if (failSecond) assert.equal(result.error.operation, 'write');
        else assert.equal(result.value, 'acknowledged');
      } finally { held.release(); }
    });
  }
}


test('Phase 1 production hydration rejects malformed evidence without overwriting or allowing retry', async () => {
  const raw = JSON.stringify({version: 2, state: {...state(F), debts: [{id: 'broken', amount: 'invalid'}]}});
  const s = await actualSession({tracked: false, data: new Map([[F, raw]])});
  assert.equal(s.finance.persist.hasHydrated(), false);
  assert.throws(() => s.finance.setState({assets: []}), /hydrated|persistence/);
  await tick();
  assert.equal(s.native.data.get(F), raw);
  assert.equal(s.native.events.filter(e => e[0] === 'set' && e[1] === F).length, 0);
});

test('Phase 1 production acknowledges native writes and fences uncertain retries', async () => {
  const pending = deferred();
  const s = await actualSession({tracked: false, configure: io => {io.setItem = () => pending.promise;}});
  const {acknowledgeFinancePersistence: ack} = require('../src/features/finance/store/productionFinancePersistence.ts');
  s.finance.setState({assets: []});
  let done = false;
  const result = ack(F).then(() => {done = true;});
  await tick(); assert.equal(done, false);
  pending.reject(new Error('native write failed'));
  await assert.rejects(result, /persistence write/);
  assert.throws(() => s.finance.setState({assets: []}), /persistence write/);
  await assert.rejects(ack(F), /persistence write/);
});


for (const key of [F, L]) {
  for (const mode of ['null row', 'duplicate', 'bad date', 'bad amount', 'unknown state', 'invalid envelope']) {
    test(`Phase 1 production ${key} preserves ${mode} evidence and fences writes`, async () => {
      const saved = state(key);
      const row = key === F ? {id: 'd', direction: 'payable', amount: 5, currencyCode: 'USD', date: '2026-11-24', payments: []}
        : {id: 'a', type: 'bank', currencyCode: 'USD', initialBalance: 1};
      const list = key === F ? 'debts' : 'accounts';
      saved[list] = [row];
      if (mode === 'null row') saved[list].push(null);
      if (mode === 'duplicate') saved[list].push({...row});
      if (mode === 'bad date') row.openingBalanceDate = '2026-02-30';
      if (mode === 'bad amount') row[key === F ? 'amount' : 'initialBalance'] = '5';
      if (mode === 'unknown state') saved.futureEvidence = {retained: true};
      const raw = JSON.stringify({version: mode === 'invalid envelope' ? '2' : 2, state: saved});
      const s = await actualSession({tracked: false, data: new Map([[key, raw]])});
      const store = key === F ? s.finance : s.ledger;
      assert.equal(store.persist.hasHydrated(), false);
      assert.throws(() => store.setState({}), /hydrated|persistence/);
      assert.equal(s.native.data.get(key), raw);
      assert.equal(s.native.events.filter(e => e[0] === 'set' && e[1] === key).length, 0);
    });
  }
}

test('Phase 1 subscriber acknowledgement covers serialization and production controls cannot erase evidence', async () => {
  const pending = deferred();
  const s = await actualSession({tracked: false, configure: io => {io.setItem = () => pending.promise;}});
  const {acknowledgeFinancePersistence: ack} = require('../src/features/finance/store/productionFinancePersistence.ts');
  let barrier, done = false;
  const unsubscribe = s.finance.subscribe(() => {barrier = ack(F).then(() => {done = true;});});
  s.finance.setState({assets: []}); unsubscribe();
  await tick(); assert.equal(done, false);
  pending.resolve(); await barrier; assert.equal(done, true);
  assert.throws(() => s.finance.persist.clearStorage(), /evidence/);
  assert.throws(() => s.finance.persist.getOptions().storage.removeItem(F), /evidence/);
  assert.throws(() => s.finance.persist.setOptions({name: 'other'}), /configuration/);
});


test('Phase 1 uncertain production write is inspectable and restart reads it without replay', async () => {
  const data = new Map();
  const s = await actualSession({tracked: false, data, configure: io => {
    io.setItem = async (key, value) => {data.set(key, value); throw new Error('ACK lost after write');};
  }});
  const {acknowledgeFinancePersistence: ack, readFinancePersistenceEvidence: inspect} = require('../src/features/finance/store/productionFinancePersistence.ts');
  s.finance.setState({assets: []});
  await assert.rejects(ack(F), /persistence write/);
  const raw = data.get(F), evidence = await inspect();
  assert.equal(evidence.postingAllowed, false);
  assert.equal(evidence.documents.find(d => d.key === F).raw, raw);
  assert.equal(evidence.documents.find(d => d.key === F).failure.uncertain, true);
  assert.throws(() => s.finance.setState({assets: []}), /persistence write/);
  const restarted = await actualSession({tracked: false, data});
  assert.equal(restarted.finance.persist.hasHydrated(), true);
  assert.equal(restarted.native.events.some(e => e[0] !== 'get'), false);
  assert.equal(data.get(F), raw);
});


for (const key of [F, L]) test(`Phase 1 ${key} explicit read retry clears stale metadata without replay`, async () => {
  const raw = JSON.stringify({version: 2, state: {...state(key), paymentAccounting: {schemaVersion: 1, entityHeads: []}}});
  const s = await actualSession({tracked: false, data: new Map([[key, raw]])});
  const store = key === F ? s.finance : s.ledger;
  assert.equal(store.persist.hasHydrated(), true);
  assert.equal(Object.hasOwn(store.getState(), 'paymentAccounting'), true);
  s.native.data.set(key, '{corrupt'); await store.persist.rehydrate();
  assert.equal(store.persist.hasHydrated(), false);
  assert.throws(() => store.setState({}), /hydrated|persistence/);
  const corrected = JSON.stringify({version: 2, state: state(key)});
  s.native.data.set(key, corrected); await store.persist.rehydrate();
  assert.equal(store.persist.hasHydrated(), true);
  assert.equal(Object.hasOwn(store.getState(), 'paymentAccounting'), false);
  assert.equal(s.native.data.get(key), corrected);
  assert.equal(s.native.events.some(e => e[0] !== 'get'), false);
});


test('Phase 1 reentrant subscriber barriers and inspection include the outer serialized write', async () => {
  const first = deferred(), second = deferred(); let issued = 0;
  const s = await actualSession({tracked: false, configure: io => {
    io.setItem = async (key, value) => {await (++issued === 1 ? first.promise : second.promise); io.data.set(key, value);};
  }});
  const {acknowledgeFinancePersistence: ack, readFinancePersistenceEvidence: inspect} = require('../src/features/finance/store/productionFinancePersistence.ts');
  let nested = false, barrier, evidence, done = false;
  const unsubscribe = s.finance.subscribe(() => {
    if (!nested) {nested = true; s.finance.setState({assets: []});}
    else {barrier = ack(F).then(() => {done = true;}); evidence = inspect();}
  });
  s.finance.setState({assets: []}); unsubscribe();
  await tick(); first.resolve(); await tick();
  assert.equal(done, false);
  assert.throws(() => s.finance.setState({assets: []}), /inspection/);
  second.resolve(); await barrier;
  const result = await evidence;
  assert.equal(done, true); assert.equal(issued, 2);
  assert.equal(result.documents.find(d => d.key === F).raw, s.native.data.get(F));
});


async function phase1PaymentFixture() {
  const s = await actualSession({tracked: false});
  const stamp = {createdAt: '2026-11-25', updatedAt: '2026-11-25'};
  s.finance.setState({debts: [{...stamp, id:'durable-debt', personName:'Person', direction:'payable', amount:100,
    currencyCode:'USD', date:'2026-11-25', payments:[]}]});
  s.ledger.setState({accounts:[{...stamp, id:'durable-bank', name:'Bank', type:'bank', currencyCode:'USD', initialBalance:1000, archived:false}],
    categories:[{id:'durable-expense',name:'Expense',kind:'expense',icon:'cash',color:'#000000',isDefault:false}]});
  const persistence = require('../src/features/finance/store/productionFinancePersistence.ts');
  await Promise.all([persistence.acknowledgeFinancePersistence(F),persistence.acknowledgeFinancePersistence(L)]);
  return {...s, ...persistence, ...require('../src/features/finance/components/acknowledgedFinanceHandler.ts'),
    ...require('../src/features/finance/store/paymentOperations.ts')};
}

test('Phase 1 actual production handler waits for both durable stores and prevents duplicate payment effects', async () => {
  const s = await phase1PaymentFixture(), gate = deferred();
  const before = new Map(s.native.data), set = s.native.setItem;
  s.native.setItem = async (key, raw) => {if(key==='tomorrow:finance-save-intent:v1') await gate.promise; return set(key,raw);};
  let closed=0,calls=0;
  const handler=s.acknowledgedFinanceHandler('durable-payment-ui',()=>{
    calls++;
    const result=s.postLinkedPayment({entityType:'debt',entityId:'durable-debt',amount:50,date:'2026-11-25',accountId:'durable-bank',categoryId:'durable-expense'});
    assert.equal(result.ok,true);
    s.afterFinanceSave(()=>closed++);
    return result;
  });
  const a=handler(),b=handler(); assert.equal(a,b);
  await tick(); assert.equal(closed,0);
  const identityKey='tomorrow:finance-submissions:v1';
  assert.equal(JSON.parse(s.native.data.get(identityKey)).slots[0].state,'open');
  assert.deepEqual(new Map([...s.native.data].filter(([key])=>key!==identityKey)),before);
  gate.resolve(); await a; assert.equal(closed,1); assert.equal(calls,1);
  assert.equal(s.finance.getState().debts[0].payments.length,1);
  assert.equal(s.ledger.getState().transactions.length,1);
  assert.equal(s.ledger.getState().transactions[0].amount,50);
  await handler(); assert.equal(closed,1); assert.equal(calls,1);
  const receiptKey=s.native.events.find(e=>e[0]==='set'&&e[1].startsWith('tomorrow:finance-save-receipt:v1:'))[1];
  const receipt=JSON.parse(s.native.data.get(receiptKey));
  const restarted=await actualSession({tracked:false,data:s.native.data});
  const {durableFinanceOperations: operations}=require('../src/features/finance/store/productionFinancePersistence.ts');
  await operations.run(receipt.operationId,{handler:'durable-payment-ui',arguments:[]},()=>{throw new Error('Must not repeat payment');});
  assert.equal(restarted.finance.getState().debts[0].payments.length,1);
  assert.equal(restarted.ledger.getState().transactions.length,1);
  assert.equal(restarted.native.events.some(e=>e[0]!=='get'),false);
});

test('Phase 1 actual handler preserves interrupted two-store evidence and never closes on lost acknowledgement', async () => {
  const s=await phase1PaymentFixture(),set=s.native.setItem;
  s.native.setItem=async(key,raw)=>{await set(key,raw);if(key===L)throw new Error('Lost ledger ACK');};
  let closed=false;
  const handler=s.acknowledgedFinanceHandler('lost-payment-ack',()=>{
    const result=s.postLinkedPayment({entityType:'debt',entityId:'durable-debt',amount:50,date:'2026-11-25',accountId:'durable-bank',categoryId:'durable-expense'});
    assert.equal(result.ok,true);s.afterFinanceSave(()=>closed=true);
  });
  await handler();assert.equal(closed,false);assert.equal(s.durableFinanceOperations.getStatus().phase,'blocked');
  const bytes=new Map(s.native.data),writes=s.native.events.filter(e=>e[0]==='set').length;
  await handler();assert.deepEqual(s.native.data,bytes);assert.equal(s.native.events.filter(e=>e[0]==='set').length,writes);
  const restarted=await actualSession({tracked:false,data:s.native.data});
  const {durableFinanceOperations: operations}=require('../src/features/finance/store/productionFinancePersistence.ts');
  const evidence=await operations.inspect();assert.equal(evidence.classification,'applied-unconfirmed');
  assert.equal(restarted.native.events.some(e=>e[0]!=='get'),false);
  assert.throws(()=>restarted.ledger.setState({transactions:[]}),/review|interrupted/);
  assert.equal(operations.getStatus().postingAllowed,false);assert.equal(closed,false);
});

test('Phase 1 nested form callbacks share one durable operation and ignore unused native press events', async () => {
  const s=await phase1PaymentFixture();let done=0;
  const inner=s.acknowledgedFinanceHandler('nested-inner',(name)=>{s.ledger.getState().updateAccount('durable-bank',{name});s.afterFinanceSave(()=>done++);});
  const outer=s.acknowledgedFinanceHandler('nested-outer',()=>inner('Renamed'));
  const event={nativeEvent:{}};event.self=event;
  await outer(event);
  assert.equal(done,1);assert.equal(s.ledger.getState().accounts[0].name,'Renamed');
  assert.equal(s.native.events.filter(e=>e[0]==='set'&&e[1]==='tomorrow:finance-save-intent:v1').length,1);
});


test('audit: UI retry after committed-save restart must not create a second financial effect', async () => {
  const s=await phase1PaymentFixture();let crashImage;
  const unsubscribe=s.durableFinanceOperations.subscribe(()=>{
    if(s.durableFinanceOperations.getStatus().phase==='ready' && [...s.native.data.keys()].some(k=>k.startsWith('tomorrow:finance-save-receipt:v1:'))) {
      crashImage=new Map(s.native.data); // process-loss point before handler completion effects
    }
  });
  const action=()=>s.postLinkedPayment({entityType:'debt',entityId:'durable-debt',amount:50,date:'2026-11-25',accountId:'durable-bank',categoryId:'durable-expense'});
  await s.acknowledgedFinanceHandler('restart-form-retry',action)();unsubscribe();assert.ok(crashImage);
  const restarted=await actualSession({tracked:false,data:crashImage});
  const {acknowledgedFinanceHandler:handler}=require('../src/features/finance/components/acknowledgedFinanceHandler.ts');
  const {postLinkedPayment:post}=require('../src/features/finance/store/paymentOperations.ts');
  await handler('restart-form-retry',()=>post({entityType:'debt',entityId:'durable-debt',amount:50,date:'2026-11-25',accountId:'durable-bank',categoryId:'durable-expense'}))();
  assert.equal(restarted.finance.getState().debts[0].payments.length,1,'Retry of the committed submission must not pay the debt twice');
  assert.equal(restarted.ledger.getState().transactions.length,1);
});


test('identity: committed result survives UI completion failure and a new handler/restart', async () => {
 const s=await phase1PaymentFixture();let completed=0;
 const payload={debtId:'durable-debt',amount:50,date:'2026-11-25',accountId:'durable-bank',categoryId:'durable-expense'};
 const handler=s.acknowledgedFinanceHandler('completion-failure',()=>s.postLinkedPayment({entityType:'debt',entityId:'durable-debt',amount:50,date:payload.date,accountId:payload.accountId,categoryId:payload.categoryId}),
  {payload,onCommitted:()=>{completed++;throw new Error('UI crashed after commit');}});
 await handler();assert.equal(completed,1);assert.equal(s.finance.getState().debts[0].payments.length,1);
 const data=new Map(s.native.data),restarted=await actualSession({tracked:false,data});
 const {acknowledgedFinanceHandler:retry}=require('../src/features/finance/components/acknowledgedFinanceHandler.ts');
 const result=await retry('completion-failure',()=>{throw new Error('Financial callback must not repeat');},{payload,onCommitted:()=>completed++})();
 assert.equal(result.ok,true);assert.equal(completed,2);
 assert.equal(restarted.finance.getState().debts[0].payments.length,1);assert.equal(restarted.ledger.getState().transactions.length,1);
});

test('identity: explicit new operation permits identical payments; conflicting payload cannot reuse one', async () => {
 const s=await phase1PaymentFixture();const {financeSubmissions}=require('../src/features/finance/store/productionFinancePersistence.ts');
 const payload={debtId:'durable-debt',amount:50,date:'2026-11-25',accountId:'durable-bank'};
 const action=()=>s.postLinkedPayment({entityType:'debt',entityId:'durable-debt',amount:50,date:payload.date,accountId:payload.accountId,categoryId:'durable-expense'});
 const first=s.acknowledgedFinanceHandler('independent-payment',action,{payload});
 await first();await first();assert.equal(s.finance.getState().debts[0].payments.length,1);
 await financeSubmissions.startNew('independent-payment');await first();
 assert.equal(s.finance.getState().debts[0].payments.length,2);assert.equal(s.ledger.getState().transactions.length,2);
 assert.equal(s.ledger.getState().transactions.reduce((n,t)=>n+t.amount,0),100);
 const before=new Map(s.native.data);
 await s.acknowledgedFinanceHandler('independent-payment',()=>{throw new Error('Conflict must not invoke callback');},{payload:{...payload,amount:75}})();
 assert.deepEqual(s.native.data,before);assert.equal(s.finance.getState().debts[0].payments.length,2);
});
