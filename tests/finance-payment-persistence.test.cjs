/* global __dirname */
// Actual Zustand middleware and journal; only native storage is replaced.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');
const { persist, createJSONStorage } = require('zustand/middleware');
const root = path.resolve(__dirname, '..');
const nativeCalls = [];
const load = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
    getItem: async key => { nativeCalls.push(['get', key]); return null; },
    setItem: async (key, value) => { nativeCalls.push(['set', key, value]); },
    removeItem: async key => { nativeCalls.push(['remove', key]); },
  } };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, filename);
const { createOrderedFinancePersistence, FinancePersistenceError } = require('../src/features/finance/store/financePersistence.ts');
const { createPaymentOperationStore, PAYMENT_OPERATION_STORAGE_KEY: KEY } = require('../src/features/finance/store/usePaymentOperationStore.ts');
const { paymentOperationRequestsMatch, readPaymentOperationJournal } = require('../src/features/finance/types/paymentOperations.ts');
const request = () => ({ entityType: 'debt', entityId: 'debt', direction: 'payable', currencyCode: 'USD',
  amount: 25, date: '2026-11-05', funding: { kind: 'account', accountId: 'a', categoryId: 'out' } });
const prepared = (id = 'one', req = request()) => ({ operationId: id, request: req, paymentId: 'payment-' + id,
  ...(req.funding.kind === 'account' ? { ledgerTransactionId: 'transaction-' + id } : {}) });
const receipt = (id = 'one') => ({ ...prepared(id), status: 'prepared' });
const envelope = receipts => JSON.stringify({ version: 1, state: { receipts } });
function memory(initial = []) {
  const data = new Map(initial), calls = [];
  return { data, calls, getItem: async key => { calls.push(['get', key]); return data.get(key) ?? null; },
    setItem: async (key, value) => { calls.push(['set', key, value]); data.set(key, value); },
    removeItem: async key => { calls.push(['remove', key]); data.delete(key); } };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('journal infrastructure is dormant and writes are rejected until explicit hydration', async () => {
  assert.deepEqual(nativeCalls, []);
  const backend = memory(), journal = createPaymentOperationStore(backend);
  assert.deepEqual(backend.calls, []);
  assert.equal(journal.getStatus().phase, 'unhydrated');
  await assert.rejects(journal.prepare(prepared()), /not hydrated/);
  await assert.rejects(journal.complete('one', { paymentId: 'payment-one', ledgerTransactionId: 'transaction-one' }), /not hydrated/);
  await journal.hydrate();
  assert.equal(journal.getStatus().phase, 'ready');
  assert.deepEqual(journal.getState().receipts, []);
  assert.deepEqual(backend.calls, [['get', KEY]]);
});

test('concurrent hydration callers share the same pending read', async () => {
  const gate = deferred(); let reads = 0;
  const journal = createPaymentOperationStore({ ...memory(), getItem: () => { reads++; return gate.promise; } });
  const first = journal.hydrate(), second = journal.hydrate();
  assert.equal(first, second); assert.equal(journal.getStatus().phase, 'hydrating');
  await assert.rejects(journal.prepare(prepared()));
  await tick(); assert.equal(reads, 1);
  gate.resolve(null); await first;
  assert.equal(journal.getStatus().phase, 'ready');
});

test('preparation and duplicate delivery cannot resolve before the storage acknowledgement', async () => {
  const backend = memory(), gate = deferred();
  backend.setItem = async (key, value) => { await gate.promise; backend.data.set(key, value); };
  const journal = createPaymentOperationStore(backend); await journal.hydrate();
  let resolved = 0;
  const first = journal.prepare(prepared()).then(() => { resolved++; });
  const duplicate = journal.prepare(prepared()).then(() => { resolved++; });
  await tick(); assert.equal(resolved, 0); assert.equal(backend.data.has(KEY), false);
  gate.resolve(); await Promise.all([first, duplicate]);
  assert.equal(resolved, 2); assert.equal(JSON.parse(backend.data.get(KEY)).state.receipts.length, 1);
});

test('a throwing subscriber blocks optimistic in-memory receipts from being acknowledged on retry', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  const unsubscribe = journal.subscribe(() => { throw new Error('Subscriber failed'); });
  await assert.rejects(journal.prepare(prepared()), error => error.operation === 'mutation' && error.originalError.message === 'Subscriber failed');
  unsubscribe();
  assert.equal(journal.getStatus().phase, 'blocked');
  assert.equal(journal.getState().receipts.length, 1);
  assert.equal(backend.data.has(KEY), false);
  await assert.rejects(journal.prepare(prepared()));
});

test('rejected queued journal writes cannot overwrite the last acknowledged document', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  await journal.prepare(prepared('prior'));
  const bytes = backend.data.get(KEY); let writes = 0;
  backend.setItem = async () => { writes++; throw new Error('Write failed'); };
  const results = await Promise.allSettled([journal.prepare(prepared('one')), journal.prepare(prepared('two'))]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(writes, 1); assert.equal(journal.getStatus().phase, 'blocked');
  assert.equal(backend.data.get(KEY), bytes);
});

test('invalid preparation and completion leave state and storage unchanged without blocking a healthy journal', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  const empty = journal.getState();
  await assert.rejects(journal.prepare({ ...prepared(), request: { ...request(), amount: Infinity } }));
  assert.equal(journal.getState(), empty); assert.equal(backend.data.has(KEY), false);
  await journal.prepare(prepared()); const bytes = backend.data.get(KEY), previous = journal.getState();
  await assert.rejects(journal.complete('missing', { paymentId: 'missing' }));
  await assert.rejects(journal.complete('one', { paymentId: 'payment-one' }));
  assert.equal(journal.getState(), previous); assert.equal(backend.data.get(KEY), bytes);
  assert.equal(journal.getStatus().phase, 'ready');
});

test('prepared and completed immutable requests/outcomes survive a fresh journal instance', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend);
  await journal.hydrate();
  const input = prepared(); const saved = await journal.prepare(input);
  input.request.amount = 999; input.request.funding.accountId = 'changed';
  assert.equal(saved.request.amount, 25); assert.equal(saved.request.funding.accountId, 'a');
  assert.ok(Object.isFrozen(saved) && Object.isFrozen(saved.request) && Object.isFrozen(saved.request.funding));
  const outcome = { paymentId: saved.paymentId, ledgerTransactionId: saved.ledgerTransactionId };
  await journal.complete('one', outcome); outcome.paymentId = 'changed';
  await journal.close();
  const restarted = createPaymentOperationStore(backend); await restarted.hydrate();
  const completed = restarted.getState().receipts[0];
  assert.equal(completed.status, 'completed'); assert.equal(completed.outcome.paymentId, 'payment-one');
  assert.ok(Object.isFrozen(completed.outcome));
  const before = backend.calls.filter(c => c[0] === 'set').length;
  assert.deepEqual(await restarted.prepare(prepared()), completed);
  assert.deepEqual(await restarted.complete('one', completed.outcome), completed);
  assert.equal(backend.calls.filter(c => c[0] === 'set').length, before);
});

test('distinct operations may have identical requests and concurrent duplicate preparation writes once', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  await Promise.all([journal.prepare(prepared()), journal.prepare(prepared())]);
  assert.equal(backend.calls.filter(c => c[0] === 'set').length, 1);
  await journal.prepare(prepared('two'));
  assert.equal(journal.getState().receipts.length, 2);
  assert.ok(paymentOperationRequestsMatch(journal.getState().receipts[0].request, journal.getState().receipts[1].request));
});

for (const change of [
  { entityId: 'other' }, { direction: 'receivable' }, { currencyCode: 'EUR' }, { amount: 26 },
  { date: '2026-11-06' }, { note: 'Changed' }, { funding: { kind: 'account', accountId: 'b', categoryId: 'out' } },
  { funding: { kind: 'account', accountId: 'a', categoryId: 'other' } },
]) {
  test(`operation ID cannot be reused with changed request ${JSON.stringify(change)}`, async () => {
    const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
    await journal.prepare(prepared()); const before = backend.data.get(KEY);
    await assert.rejects(journal.prepare(prepared('one', { ...request(), ...change })), /different immutable request/);
    assert.equal(backend.data.get(KEY), before); assert.equal(journal.getState().receipts.length, 1);
  });
}

test('request matching is independent of key order and checks loan fees, settlement and custom method', () => {
  const a = request();
  const b = { funding: { categoryId: 'out', accountId: 'a', kind: 'account' }, date: a.date,
    amount: 25, currencyCode: 'USD', direction: 'payable', entityId: 'debt', entityType: 'debt' };
  assert.equal(paymentOperationRequestsMatch(a, b), true);
  const loan = { entityType: 'loan', entityId: 'loan', currencyCode: 'USD', amount: 25, date: a.date,
    latePaymentFee: 2, settlement: false, funding: { kind: 'custom', methodLabel: 'Cash outside app' } };
  for (const patch of [{ latePaymentFee: 3 }, { settlement: true }, { funding: { kind: 'custom', methodLabel: 'Other' } }]) {
    assert.equal(paymentOperationRequestsMatch(loan, { ...loan, ...patch }), false);
  }
});

test('custom loan operation reserves and persists no ledger transaction', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  const req = { entityType: 'loan', entityId: 'loan', currencyCode: 'USD', amount: 25, date: '2026-11-05',
    latePaymentFee: 0, settlement: false, funding: { kind: 'custom', methodLabel: 'Cash' } };
  await journal.prepare(prepared('custom', req));
  await assert.rejects(journal.complete('custom', { paymentId: 'payment-custom', ledgerTransactionId: 'unexpected' }));
  await journal.complete('custom', { paymentId: 'payment-custom' });
  await journal.close();
  const restarted = createPaymentOperationStore(backend); await restarted.hydrate();
  assert.equal(restarted.getState().receipts[0].ledgerTransactionId, undefined);
  assert.deepEqual(restarted.getState().receipts[0].outcome, { paymentId: 'payment-custom' });
});

for (const invalid of [
  'not-json', 'null', '{}', '{"version":1}', envelope([null]), envelope([{ ...receipt(), status: 'unknown' }]),
  envelope([{ ...receipt(), request: { ...request(), amount: '25' } }]),
  envelope([{ ...receipt(), request: { ...request(), amount: 0 } }]),
  envelope([{ ...receipt(), request: { ...request(), date: '2026-02-30' } }]),
  envelope([{ ...receipt(), request: { ...request(), hidden: true } }]),
  envelope([{ ...receipt(), ledgerTransactionId: undefined }]),
  envelope([{ ...receipt(), status: 'completed' }]),
  envelope([{ ...receipt(), status: 'completed', outcome: { paymentId: 'other', ledgerTransactionId: 'transaction-one' } }]),
  envelope([receipt(), receipt()]),
  envelope([receipt(), { ...receipt('two'), paymentId: 'payment-one' }]),
  envelope([receipt(), { ...receipt('two'), ledgerTransactionId: 'transaction-one' }]),
  JSON.stringify({ version: 2, state: { receipts: [] } }),
  JSON.stringify({ state: { receipts: [] } }),
  JSON.stringify({ version: 1, state: { receipts: [] }, extra: true }),
  JSON.stringify({ version: 1, state: { receipts: [], extra: true } }),
]) {
  test(`invalid journal fails closed and preserves bytes: ${invalid.slice(0, 100)}`, async () => {
    const backend = memory([[KEY, invalid]]), journal = createPaymentOperationStore(backend);
    await assert.rejects(journal.hydrate());
    assert.equal(journal.getStatus().phase, 'blocked');
    await assert.rejects(journal.prepare(prepared())); await assert.rejects(journal.hydrate());
    assert.equal(backend.data.get(KEY), invalid);
    assert.equal(backend.calls.some(c => c[0] !== 'get'), false);
  });
}

test('unreadable journal blocks preparation without overwriting or clearing storage', async () => {
  const backend = memory([[KEY, envelope([receipt()])]]);
  const bytes = backend.data.get(KEY); backend.getItem = async () => { throw new Error('Read failed'); };
  const journal = createPaymentOperationStore(backend);
  await assert.rejects(journal.hydrate()); await assert.rejects(journal.prepare(prepared('two')));
  assert.equal(journal.getStatus().phase, 'blocked'); assert.equal(backend.data.get(KEY), bytes);
  assert.deepEqual(backend.calls, []);
});

test('hydration retains pending, reversal and review evidence without completing or repairing anything', async () => {
  const receipts = ['prepared', 'completed', 'reversing', 'reversed', 'needsReview'].map((status, index) => {
    const r = receipt(String(index));
    return { ...r, status, ...(status === 'prepared' || status === 'needsReview' ? {} : {
      outcome: { paymentId: r.paymentId, ledgerTransactionId: r.ledgerTransactionId },
    }) };
  });
  const backend = memory([[KEY, envelope(receipts)]]), journal = createPaymentOperationStore(backend);
  await journal.hydrate(); assert.deepEqual(journal.getState(), readPaymentOperationJournal({ receipts }));
  for (const id of ['2', '3', '4']) await assert.rejects(journal.complete(id, journal.getState().receipts[Number(id)].outcome));
  assert.equal(backend.calls.some(c => c[0] === 'set'), false);
});

test('reserved IDs cannot change or be shared by distinct operations', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  await journal.prepare(prepared()); const before = backend.data.get(KEY);
  for (const input of [{ ...prepared(), paymentId: 'changed' }, { ...prepared(), ledgerTransactionId: 'changed' },
    { ...prepared('two'), paymentId: 'payment-one' }, { ...prepared('two'), ledgerTransactionId: 'transaction-one' }]) {
    await assert.rejects(journal.prepare(input));
  }
  assert.equal(backend.data.get(KEY), before);
});

test('Zustand automatic writes preserve JSON snapshots and wait for ordered acknowledgements', async () => {
  const backend = memory(), first = deferred(), events = [];
  backend.setItem = async (key, value) => {
    const n = JSON.parse(value).state.n; events.push(['start', n]);
    if (n === 1) await first.promise;
    backend.data.set(key, value); events.push(['ack', n]);
  };
  const tracked = createOrderedFinancePersistence(backend);
  const store = createStore()(persist(set => ({ n: 0, change: n => { set({ n }); } }), {
    name: 'example', storage: createJSONStorage(() => tracked.storage), skipHydration: true,
    partialize: state => ({ n: state.n }),
  }));
  store.getState().change(1); const barrier = tracked.flush('example');
  store.getState().change(2); await tick(); assert.deepEqual(events, [['start', 1]]);
  first.resolve(); await barrier; await tracked.flush('example');
  assert.deepEqual(events, [['start', 1], ['ack', 1], ['start', 2], ['ack', 2]]);
  assert.equal(JSON.parse(backend.data.get('example')).state.n, 2);
});

test('a barrier does not wait for writes enqueued after its invocation', async () => {
  const first = deferred(), second = deferred();
  const backend = memory(); backend.setItem = async (_key, value) => { await (value === 'one' ? first.promise : second.promise); };
  const tracked = createOrderedFinancePersistence(backend);
  tracked.storage.setItem('key', 'one'); const prefix = tracked.flush('key');
  tracked.storage.setItem('key', 'two'); let laterDone = false;
  const later = tracked.flush('key').then(() => { laterDone = true; });
  first.resolve(); await prefix; assert.equal(laterDone, false);
  second.resolve(); await later;
});

test('different keys are independent; explicit barriers establish journal/Finance/Ledger ordering', async () => {
  const backend = memory(), gate = deferred(), events = [];
  backend.setItem = async (key, value) => { events.push('start:' + key); if (key === 'journal') await gate.promise;
    backend.data.set(key, value); events.push('ack:' + key); };
  const tracked = createOrderedFinancePersistence(backend);
  tracked.storage.setItem('journal', 'prepared');
  const postingOrder = (async () => {
    await tracked.flush('journal');
    tracked.storage.setItem('finance', 'payment'); await tracked.flush('finance');
    tracked.storage.setItem('ledger', 'transaction'); await tracked.flush('ledger');
    tracked.storage.setItem('journal', 'completed'); await tracked.flush('journal');
  })();
  tracked.storage.setItem('unrelated', 'value'); await tracked.flush('unrelated');
  assert.equal(events.includes('start:finance'), false);
  gate.resolve(); await postingOrder;
  assert.deepEqual(events.filter(e => !e.endsWith(':unrelated')), ['start:journal', 'ack:journal', 'start:finance',
    'ack:finance', 'start:ledger', 'ack:ledger', 'start:journal', 'ack:journal']);
});

for (const afterWrite of [false, true]) {
  test(`rejected ${afterWrite ? 'acknowledgement' : 'write'} is uncertain, sticky, and blocks queued writes`, async () => {
    const backend = memory(), events = [];
    backend.setItem = async (key, value) => { events.push(value); if (afterWrite) backend.data.set(key, value); throw new Error('Storage failed'); };
    const tracked = createOrderedFinancePersistence(backend);
    const one = tracked.storage.setItem('key', 'one'), two = tracked.storage.setItem('key', 'two');
    await assert.rejects(one, error => error instanceof FinancePersistenceError && error.uncertain);
    await assert.rejects(two); await assert.rejects(tracked.flush('key'));
    await assert.rejects(tracked.storage.setItem('key', 'three'));
    await assert.rejects(tracked.storage.getItem('key'));
    assert.deepEqual(events, ['one']);
    assert.equal(backend.data.get('key'), afterWrite ? 'one' : undefined);
  });
}

test('synchronous backend throws and rejected removals are also observed by barriers', async () => {
  const backend = memory(); backend.setItem = () => { throw new Error('Synchronous write'); };
  const tracked = createOrderedFinancePersistence(backend);
  await assert.rejects(tracked.storage.setItem('write', 'value'));
  await assert.rejects(tracked.flush('write'));
  backend.removeItem = async () => { throw new Error('Removal acknowledgement failed'); };
  await assert.rejects(tracked.storage.removeItem('remove'));
  await assert.rejects(tracked.flush('remove'), error => error.operation === 'remove' && error.uncertain);
});

test('ordered removals and reads cannot overtake earlier writes', async () => {
  const backend = memory(), gate = deferred();
  backend.setItem = async (key, value) => { await gate.promise; backend.calls.push(['set', key]); backend.data.set(key, value); };
  const tracked = createOrderedFinancePersistence(backend);
  tracked.storage.setItem('key', 'value'); tracked.storage.removeItem('key');
  const read = tracked.storage.getItem('key'); await tick(); assert.deepEqual(backend.calls, []);
  gate.resolve(); assert.equal(await read, null);
  assert.deepEqual(backend.calls, [['set', 'key'], ['remove', 'key'], ['get', 'key']]);
});

for (const stage of ['prepare', 'complete']) {
  test(`journal ${stage} acknowledgement failure blocks in-session retry and preserves uncertain evidence`, async () => {
    const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
    if (stage === 'complete') await journal.prepare(prepared());
    const realSet = backend.setItem;
    backend.setItem = async (key, value) => { await realSet(key, value); throw new Error('Lost acknowledgement'); };
    const outcome = { paymentId: 'payment-one', ledgerTransactionId: 'transaction-one' };
    await assert.rejects(stage === 'prepare' ? journal.prepare(prepared()) : journal.complete('one', outcome));
    assert.equal(journal.getStatus().phase, 'blocked');
    await assert.rejects(journal.prepare(prepared())); await assert.rejects(journal.hydrate());
    backend.setItem = realSet;
    await journal.close();
    const restarted = createPaymentOperationStore(backend); await restarted.hydrate();
    assert.equal(restarted.getState().receipts[0].status, stage === 'prepare' ? 'prepared' : 'completed');
    assert.deepEqual(backend.calls.filter(c => c[0] === 'set').map(c => c[1]), stage === 'prepare' ? [KEY] : [KEY, KEY]);
  });
}

for (const stage of ['prepare', 'complete']) {
  for (const fail of [false, true]) {
    test(`subscriber reentry into ${stage} shares the real ${fail ? 'failed' : 'successful'} acknowledgement`, async () => {
      const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
      if (stage === 'complete') await journal.prepare(prepared());
      const before = backend.data.get(KEY), gate = deferred(); let writes = 0, duplicate;
      backend.setItem = async (key, value) => { writes++; await gate.promise; backend.data.set(key, value); };
      const submit = () => stage === 'prepare' ? journal.prepare(prepared())
        : journal.complete('one', { paymentId: 'payment-one', ledgerTransactionId: 'transaction-one' });
      const unsubscribe = journal.subscribe(() => { duplicate = submit(); });
      const first = submit(); let resolved = false;
      const observed = first.then(() => { resolved = true; }, () => {});
      await tick();
      assert.equal(first, duplicate);
      assert.equal(resolved, false); assert.equal(writes, 1); assert.equal(backend.data.get(KEY), before);
      const all = Promise.allSettled([first, duplicate]);
      if (fail) gate.reject(new Error('Rejected acknowledgement')); else gate.resolve();
      const results = await all; await observed; unsubscribe();
      assert.ok(results.every(r => r.status === (fail ? 'rejected' : 'fulfilled')));
      assert.equal(resolved, !fail);
      if (fail) {
        assert.equal(journal.getStatus().phase, 'blocked'); assert.equal(backend.data.get(KEY), before);
      } else {
        assert.equal(results[0].value, results[1].value);
        assert.equal(results[0].value.status, stage === 'prepare' ? 'prepared' : 'completed');
      }
    });
  }
}

test('reentrant retry cannot succeed when its subscriber throws before persistence enqueueing', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  let duplicate;
  const unsubscribe = journal.subscribe(() => { duplicate = journal.prepare(prepared()); throw new Error('Subscriber failed'); });
  const first = journal.prepare(prepared());
  const firstResult = first.catch(error => error);
  const error = await firstResult;
  assert.equal(first, duplicate);
  await assert.rejects(duplicate, other => other === error && other.operation === 'mutation');
  assert.equal(journal.getStatus().phase, 'blocked'); assert.equal(backend.data.has(KEY), false);
  unsubscribe();
});

test('reentrant conflicting request rejects without joining or changing the original operation', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  let conflicting;
  const unsubscribe = journal.subscribe(() => {
    conflicting = journal.prepare(prepared('one', { ...request(), amount: 26 })).catch(error => error);
  });
  const saved = await journal.prepare(prepared());
  assert.match((await conflicting).message, /different immutable request/);
  assert.equal(saved.request.amount, 25); assert.equal(journal.getStatus().phase, 'ready');
  assert.equal(JSON.parse(backend.data.get(KEY)).state.receipts[0].request.amount, 25);
  unsubscribe();
});

for (const failCompletion of [false, true]) {
  test(`overlapping prepare/complete returns acknowledged snapshots when completion ${failCompletion ? 'fails' : 'succeeds'}`, async () => {
    const backend = memory(), firstGate = deferred(), secondGate = deferred(); let writes = 0;
    backend.setItem = async (key, value) => {
      writes++; await (writes === 1 ? firstGate.promise : secondGate.promise); backend.data.set(key, value);
    };
    const journal = createPaymentOperationStore(backend); await journal.hydrate();
    const preparation = journal.prepare(prepared());
    const completion = journal.complete('one', { paymentId: 'payment-one', ledgerTransactionId: 'transaction-one' });
    const completionResult = completion.then(value => ({ value }), error => ({ error }));
    await tick(); assert.equal(writes, 1);
    firstGate.resolve(); const acknowledged = await preparation; await tick();
    assert.equal(writes, 2); assert.equal(acknowledged.status, 'prepared');
    assert.equal(acknowledged.outcome, undefined); assert.ok(Object.isFrozen(acknowledged));
    assert.equal(JSON.parse(backend.data.get(KEY)).state.receipts[0].status, 'prepared');
    // Even though latest optimistic state is completed, the first caller only
    // receives the prepared snapshot whose persistence actually succeeded.
    assert.equal(journal.getState().receipts[0].status, 'completed');
    if (failCompletion) secondGate.reject(new Error('Completion acknowledgement failed')); else secondGate.resolve();
    const result = await completionResult;
    assert.equal(acknowledged.status, 'prepared');
    if (failCompletion) {
      assert.ok(result.error instanceof FinancePersistenceError);
      assert.equal(JSON.parse(backend.data.get(KEY)).state.receipts[0].status, 'prepared');
      assert.equal(journal.getStatus().phase, 'blocked');
    } else {
      assert.equal(result.value.status, 'completed');
      assert.deepEqual(result.value, JSON.parse(backend.data.get(KEY)).state.receipts[0]);
    }
  });
}

test('multiple factory callers share one owner and preserve both independent operations', async () => {
  const backend = memory();
  const a = createPaymentOperationStore(backend), b = createPaymentOperationStore(backend);
  assert.equal(a, b); await Promise.all([a.hydrate(), b.hydrate()]);
  await Promise.all([a.prepare(prepared('A')), b.prepare(prepared('B'))]);
  assert.deepEqual(JSON.parse(backend.data.get(KEY)).state.receipts.map(r => r.operationId), ['A', 'B']);
  assert.equal(a.getState(), b.getState());
});

test('backend wrappers sharing an explicit namespace identity cannot become competing owners', async () => {
  const backend = memory(), identity = {};
  const a = createPaymentOperationStore({ ...backend }, identity);
  const b = createPaymentOperationStore({ ...backend }, identity);
  assert.equal(a, b); await a.hydrate();
  await a.prepare(prepared('A')); await b.prepare(prepared('B'));
  assert.equal(JSON.parse(backend.data.get(KEY)).state.receipts.length, 2);
});

test('owner replacement waits for accepted writes and fences the closed owner', async () => {
  const backend = memory(), gate = deferred();
  backend.setItem = async (key, value) => { await gate.promise; backend.data.set(key, value); };
  const original = createPaymentOperationStore(backend); await original.hydrate();
  const preparing = original.prepare(prepared()); await tick();
  let closed = false; const close = original.close().then(() => { closed = true; });
  assert.equal(createPaymentOperationStore(backend), original);
  await assert.rejects(original.prepare(prepared('two')), /closed/);
  await tick(); assert.equal(closed, false);
  gate.resolve(); await preparing; await close;
  const fresh = createPaymentOperationStore(backend); assert.notEqual(fresh, original);
  await fresh.hydrate(); assert.equal(fresh.getState().receipts[0].operationId, 'one');
  await assert.rejects(original.hydrate(), /closed/); await assert.rejects(original.complete('one', {}), /closed/);
});

test('blocked owner cannot be bypassed by another factory call before explicit close and rehydration', async () => {
  const backend = memory(), originalSet = backend.setItem;
  backend.setItem = async () => { throw new Error('Failed write'); };
  const journal = createPaymentOperationStore(backend); await journal.hydrate();
  await assert.rejects(journal.prepare(prepared()));
  assert.equal(createPaymentOperationStore(backend), journal);
  await assert.rejects(createPaymentOperationStore(backend).prepare(prepared()));
  await journal.close(); backend.setItem = originalSet;
  const fresh = createPaymentOperationStore(backend); await fresh.hydrate();
  assert.deepEqual(fresh.getState().receipts, []);
  await fresh.prepare(prepared());
});

for (const failure of ['serialization', 'partialize', 'subscriber']) {
  test(`guarded Zustand ${failure} error rejects barriers even before adapter enqueueing`, async () => {
    const backend = memory(), tracked = createOrderedFinancePersistence(backend);
    const store = createStore()(persist(() => ({ n: 0 }), { name: 'guarded', skipHydration: true,
      storage: createJSONStorage(() => tracked.storage),
      partialize: state => { if (failure === 'partialize') throw new Error('Partialize failed'); return state; },
    }));
    if (failure === 'subscriber') store.subscribe(() => { throw new Error('Subscriber failed'); });
    assert.throws(() => tracked.runMutation('guarded', () => store.setState({ n: failure === 'serialization' ? 1n : 1 })),
      error => error instanceof FinancePersistenceError && error.operation === 'mutation');
    await assert.rejects(tracked.flush('guarded'));
    await assert.rejects(tracked.storage.setItem('guarded', 'must not be written'));
    assert.equal(tracked.getFailure('guarded').operation, 'mutation');
    assert.equal(backend.calls.length, 0);
  });
}

test('journal serialization failure and reentrant duplicate both reject without false acknowledgement', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  const stringify = JSON.stringify; let duplicate;
  const unsubscribe = journal.subscribe(() => { duplicate = journal.prepare(prepared()); });
  JSON.stringify = (value, ...args) => {
    if (value?.version === 1 && value?.state?.receipts) throw new Error('Journal serialization failed');
    return stringify(value, ...args);
  };
  try {
    const first = journal.prepare(prepared());
    const error = await first.catch(error => error);
    assert.equal(first, duplicate);
    assert.equal(error.operation, 'mutation'); assert.equal(error.originalError.message, 'Journal serialization failed');
    await assert.rejects(duplicate);
    assert.equal(backend.data.has(KEY), false); assert.equal(journal.getStatus().phase, 'blocked');
  } finally { JSON.stringify = stringify; unsubscribe(); }
});

test('queued transitions capture caller inputs before awaiting or notifying subscribers', async () => {
  const backend = memory(), journal = createPaymentOperationStore(backend); await journal.hydrate();
  const input = prepared(); const preparing = journal.prepare(input);
  input.request.amount = 999; input.request.funding.accountId = 'changed';
  const saved = await preparing;
  assert.equal(saved.request.amount, 25); assert.equal(saved.request.funding.accountId, 'a');
  const outcome = { paymentId: 'payment-one', ledgerTransactionId: 'transaction-one' };
  const completing = journal.complete('one', outcome); outcome.paymentId = 'changed';
  const completed = await completing;
  assert.equal(completed.outcome.paymentId, 'payment-one');
  assert.deepEqual(completed, JSON.parse(backend.data.get(KEY)).state.receipts[0]);
});
