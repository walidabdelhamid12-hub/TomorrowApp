/* global __dirname */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { createStore } = require('zustand/vanilla');
const { persist, createJSONStorage } = require('zustand/middleware');
const root = path.resolve(__dirname, '..'), nativeData = new Map();
const native = { getItem: async key => nativeData.get(key) ?? null,
  setItem: async (key, value) => { nativeData.set(key, value); }, removeItem: async key => { nativeData.delete(key); } };
const load = Module._load;
Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: native };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { createPaymentOperationStore, PAYMENT_OPERATION_STORAGE_KEY: J } = require('../src/features/finance/store/usePaymentOperationStore.ts');
const { createPaymentInstallationRecovery } = require('../src/features/finance/store/paymentOperationRecovery.ts');
const { createOrderedFinancePersistence } = require('../src/features/finance/store/financePersistence.ts');
const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
const F = 'tomorrow:finance', L = 'tomorrow:ledger';
const marker = generationId => ({ schemaVersion: 1, generationId });
const emptyFinance = () => ({ assets: [], debts: [], loans: [], cheques: [] });
const emptyLedger = () => ({ accounts: [], categories: [], transactions: [], transfers: [] });
const envelope = (state, version = 2) => JSON.stringify({ version, state });
const journalBytes = (generationId, phase = 'active', receipts = []) => envelope({ receipts,
  ...(generationId ? { installation: { ...marker(generationId), phase } } : {}) });
const history = () => ({ ...emptyFinance(), assets: [{ id: 'asset', entries: [{ id: 'entry', amount: 1.234, date: '2026-11-01' }] }],
  debts: [{ id: 'legacy-debt', currencyCode: 'USD', payments: [{ id: 'legacy-payment', amount: 25, ledgerTransactionId: 'legacy-tx' }] }],
  loans: [{ id: 'legacy-loan', payments: [{ id: 'custom', amount: 10, paymentMethodLabel: 'Cash' }] }] });
before(async () => { await Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]); });

async function scenario(data = new Map(), failure) {
  const events = [];
  const backend = { getItem: async key => data.get(key) ?? null, removeItem: async key => { data.delete(key); },
    setItem: async (key, value) => {
      const phase = key === J ? JSON.parse(value).state.installation?.phase : 'marker';
      events.push(key === J ? phase : key === F ? 'finance' : 'ledger');
      if (failure?.key === key && (!failure.phase || failure.phase === phase)) {
        if (failure.afterWrite) data.set(key, value);
        throw new Error('Injected acknowledgement failure');
      }
      data.set(key, value);
    } };
  const tracked = createOrderedFinancePersistence(backend);
  const fixture = (key, initial) => {
    const store = createStore()(persist(set => ({ ...initial,
      mark: value => tracked.runMutation(key, () => set({ paymentJournal: value })),
    }), { name: key, version: 2, skipHydration: true, storage: createJSONStorage(() => tracked.storage),
      partialize: state => Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'mark')) }));
    return { store, port: { readPersisted: () => tracked.storage.getItem(key),
      acknowledgeMarker: async value => { store.getState().mark(value); await tracked.flush(key); } } };
  };
  const f = fixture(F, emptyFinance()), l = fixture(L, emptyLedger());
  await Promise.all([f.store.persist.rehydrate(), l.store.persist.rehydrate()]);
  const journal = createPaymentOperationStore(tracked.storage, backend);
  let writersReady = true;
  const recovery = createPaymentInstallationRecovery({ journal, finance: f.port, ledger: l.port,
    createGenerationId: () => 'generation-one', sharedPersistenceReady: () => writersReady });
  return { data, events, journal, recovery, f, l, disableWriters: () => { writersReady = false; } };
}

test('ordinary accounting-store hydration does not create a journal or bootstrap markers', async () => {
  assert.equal(nativeData.has(J), false);
  assert.equal(finance.getState().paymentJournal, undefined);
  assert.equal(ledger.getState().paymentJournal, undefined);
});

for (const legacy of [false, true]) {
  test(`${legacy ? 'valid legacy' : 'fresh'} installation uses acknowledged journal/Finance/Ledger/activation order`, async () => {
    const original = history();
    const data = legacy ? new Map([[F, envelope(original)], [L, envelope(emptyLedger())]]) : new Map();
    const s = await scenario(data);
    assert.deepEqual(s.events, []);
    assert.equal((await s.recovery.check()).status, 'legacy');
    const active = await s.recovery.bootstrap();
    assert.equal(active.installation.phase, 'active');
    assert.deepEqual(s.events, ['initializing', 'finance', 'ledger', 'active']);
    for (const key of [F, L]) assert.deepEqual(JSON.parse(data.get(key)).state.paymentJournal, marker('generation-one'));
    assert.equal(s.recovery.getStatus().postingAllowed, false);
    if (legacy) {
      const saved = JSON.parse(data.get(F)).state; delete saved.paymentJournal;
      assert.deepEqual(saved, original);
      assert.equal(saved.debts[0].payments[0].operationId, undefined);
    }
    await s.journal.close();
    const restarted = await scenario(data);
    assert.equal((await restarted.recovery.check()).status, 'metadata-ready');
    assert.deepEqual(restarted.events, []);
    await restarted.recovery.bootstrap(); assert.deepEqual(restarted.events, []);
  });
}

test('bootstrap is disabled without an explicit shared tracked-writer integration', async () => {
  const s = await scenario(); s.disableWriters();
  await assert.rejects(s.recovery.bootstrap(), /not integrated/);
  assert.deepEqual(s.events, []); assert.equal(s.data.size, 0);
  assert.equal(s.recovery.getStatus().status, 'blocked');
});

for (const failure of [
  { key: J, phase: 'initializing' }, { key: F }, { key: L }, { key: J, phase: 'active' },
]) for (const afterWrite of [false, true]) {
  test(`bootstrap rejects ${failure.key}/${failure.phase ?? 'marker'} ${afterWrite ? 'lost acknowledgement' : 'write failure'} and restart never repairs accounting`, async () => {
    const data = new Map([[F, envelope(history())], [L, envelope(emptyLedger())]]);
    const s = await scenario(data, { ...failure, afterWrite });
    await assert.rejects(s.recovery.bootstrap());
    assert.equal(s.recovery.getStatus().status, 'blocked');
    const written = s.events.length;
    await assert.rejects(s.recovery.bootstrap()); assert.equal(s.events.length, written);
    const bytes = new Map(data);
    await s.journal.close();
    const restarted = await scenario(data);
    const whollyAbsent = !data.has(J);
    const fullyActive = data.has(J) && JSON.parse(data.get(J)).state.installation?.phase === 'active';
    if (whollyAbsent) assert.equal((await restarted.recovery.check()).status, 'legacy');
    else if (fullyActive) assert.equal((await restarted.recovery.check()).status, 'metadata-ready');
    else {
      await assert.rejects(restarted.recovery.check(), /Interrupted/);
      await assert.rejects(restarted.recovery.bootstrap());
    }
    assert.deepEqual(data, bytes); assert.deepEqual(restarted.events, []);
    const saved = JSON.parse(data.get(F)).state; delete saved.paymentJournal;
    assert.deepEqual(saved, history());
  });
}

for (const state of ['journal-only', 'finance-marked', 'both-marked']) {
  test(`interrupted ${state} bootstrap remains blocked after fresh hydration`, async () => {
    const data = new Map([[J, journalBytes('generation-one', 'initializing')],
      [F, envelope({ ...emptyFinance(), ...(state !== 'journal-only' ? { paymentJournal: marker('generation-one') } : {}) })],
      [L, envelope({ ...emptyLedger(), ...(state === 'both-marked' ? { paymentJournal: marker('generation-one') } : {}) })]]);
    const s = await scenario(data), before = new Map(data);
    await assert.rejects(s.recovery.bootstrap(), /Interrupted/);
    assert.deepEqual(data, before); assert.deepEqual(s.events, []);
  });
}

for (const patch of [
  { key: J, remove: true }, { key: F, remove: true }, { key: L, remove: true },
  { key: F, value: envelope({ ...emptyFinance(), paymentJournal: marker('other') }) },
  { key: L, value: envelope(emptyLedger()) },
  { key: J, value: journalBytes('other') },
  { key: J, value: envelope({ receipts: [] }) },
  { key: J, value: 'not JSON' },
  { key: F, value: envelope({ ...emptyFinance(), paymentJournal: { schemaVersion: 2, generationId: 'generation-one' } }) },
  { key: L, value: envelope({ ...emptyLedger(), paymentJournal: null }) },
  { key: F, value: envelope(emptyFinance(), 99) },
  { key: L, value: JSON.stringify({ version: null, state: emptyLedger() }) },
]) {
  test(`activated metadata corruption/deletion fails closed: ${JSON.stringify(patch)}`, async () => {
    const s = await scenario(); await s.recovery.bootstrap();
    if (patch.remove) s.data.delete(patch.key); else s.data.set(patch.key, patch.value);
    const before = new Map(s.data);
    // The live journal must reread persisted bytes, not trust cached activation.
    await assert.rejects(s.recovery.check());
    assert.equal(s.recovery.getStatus().status, 'blocked'); assert.deepEqual(s.data, before);
    await s.journal.close(); const restarted = await scenario(s.data);
    await assert.rejects(restarted.recovery.check()); assert.deepEqual(s.data, before);
  });
}

test('an apparently successful marker port cannot activate without persisted marker verification', async () => {
  const s = await scenario();
  const broken = createPaymentInstallationRecovery({ journal: s.journal,
    finance: { ...s.f.port, acknowledgeMarker: async () => {} }, ledger: s.l.port,
    createGenerationId: () => 'generation-one', sharedPersistenceReady: () => true });
  await assert.rejects(broken.bootstrap(), /Finance marker acknowledgement/);
  assert.deepEqual(s.events, ['initializing']);
  assert.equal(JSON.parse(s.data.get(J)).state.installation.phase, 'initializing');
});

for (const key of [F, L]) {
  test(`${key} operation evidence without installation metadata cannot bootstrap as legacy`, async () => {
    const state = key === F ? { ...emptyFinance(), debts: [{ id: 'd', payments: [{ id: 'p', operationId: 'op' }] }] }
      : { ...emptyLedger(), transactions: [{ id: 't', operationId: 'op' }] };
    const s = await scenario(new Map([[key, envelope(state)]]));
    await assert.rejects(s.recovery.bootstrap(), /operation evidence/); assert.deepEqual(s.events, []);
  });
}

test('empty Phase 1 journals remain readable without migration writes; nonempty ones require review', async () => {
  const data = new Map([[J, envelope({ receipts: [] }, 1)]]), s = await scenario(data);
  const before = data.get(J);
  assert.equal((await s.recovery.check()).status, 'legacy'); assert.equal(data.get(J), before);
  assert.deepEqual(s.events, []);
  await s.recovery.bootstrap(); assert.equal(JSON.parse(data.get(J)).version, 2);
  await s.journal.close();
  const receipt = { operationId: 'op', request: { entityType: 'debt', entityId: 'd', direction: 'payable', amount: 25,
    currencyCode: 'USD', date: '2026-11-05', funding: { kind: 'account', accountId: 'a', categoryId: 'out' } },
    paymentId: 'p', ledgerTransactionId: 't', status: 'prepared' };
  const other = await scenario(new Map([[J, envelope({ receipts: [receipt] }, 1)]]));
  await assert.rejects(other.recovery.bootstrap(), /operation evidence/); assert.deepEqual(other.events, []);
});

test('journal metadata cannot be downgraded or replaced and survives later receipt writes', async () => {
  const s = await scenario(); await s.recovery.bootstrap();
  await assert.rejects(s.journal.beginInstallation('other'));
  await s.journal.beginInstallation('generation-one');
  assert.equal(s.journal.getState().installation.phase, 'active');
  const request = { entityType: 'debt', entityId: 'd', direction: 'payable', currencyCode: 'USD', amount: 25,
    date: '2026-11-05', funding: { kind: 'account', accountId: 'a', categoryId: 'out' } };
  await s.journal.prepare({ operationId: 'op', request, paymentId: 'p', ledgerTransactionId: 't' });
  await assert.rejects(s.recovery.check(), /Unresolved/);
  await s.journal.complete('op', { paymentId: 'p', ledgerTransactionId: 't' });
  assert.equal(JSON.parse(s.data.get(J)).state.installation.phase, 'active');
  assert.equal(s.recovery.getStatus().postingAllowed, false);
});

for (const installation of [null, { schemaVersion: 2, generationId: 'g', phase: 'active' },
  { schemaVersion: 1, generationId: '', phase: 'active' }, { schemaVersion: 1, generationId: 'g', phase: 'invalid' }]) {
  test(`invalid journal installation metadata blocks without writes: ${JSON.stringify(installation)}`, async () => {
    const bytes = envelope({ receipts: [], installation }), s = await scenario(new Map([[J, bytes]]));
    await assert.rejects(s.recovery.bootstrap()); assert.equal(s.data.get(J), bytes); assert.deepEqual(s.events, []);
  });
}

for (const [key, state] of [[F, {}], [L, {}], [F, { ...emptyFinance(), loans: [{ id: 'l', payments: 'corrupt' }] }]]) {
  test(`malformed historical ${key} document cannot be silently bootstrapped`, async () => {
    const bytes = envelope(state), s = await scenario(new Map([[key, bytes]]));
    await assert.rejects(s.recovery.bootstrap()); assert.equal(s.data.get(key), bytes); assert.deepEqual(s.events, []);
  });
}

test('real Finance/Ledger migrations, partialize and resets preserve generation metadata', async () => {
  nativeData.set(F, envelope({ ...emptyFinance(), paymentJournal: marker('retained') }, 1));
  nativeData.set(L, envelope({ ...emptyLedger(), paymentJournal: marker('retained') }, 1));
  await Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  assert.equal(finance.getState().paymentJournal.generationId, 'retained');
  assert.equal(ledger.getState().paymentJournal.generationId, 'retained');
  assert.equal(finance.getState().resetFinanceData(), true); assert.equal(ledger.getState().resetLedger(), true);
  await Promise.resolve();
  for (const key of [F, L]) assert.deepEqual(JSON.parse(nativeData.get(key)).state.paymentJournal, marker('retained'));
  await Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  assert.equal(finance.getState().paymentJournal.generationId, 'retained');
  assert.equal(ledger.getState().paymentJournal.generationId, 'retained');
});

for (const [key, store, empty] of [[F, finance, emptyFinance], [L, ledger, emptyLedger]]) {
  for (const incompatible of [false, true]) {
    test(`${key} rejects ${incompatible ? 'future schema' : 'invalid marker'} without overwriting bytes`, async () => {
      const bytes = envelope({ ...empty(), paymentJournal: incompatible ? marker('retained') : null }, incompatible ? 99 : 2);
      nativeData.set(key, bytes); await store.persist.rehydrate();
      assert.equal(store.persist.hasHydrated(), false); assert.equal(nativeData.get(key), bytes);
      nativeData.set(key, envelope(empty())); await store.persist.rehydrate();
      assert.equal(store.persist.hasHydrated(), true); assert.equal(store.getState().paymentJournal, undefined);
    });
  }
}
