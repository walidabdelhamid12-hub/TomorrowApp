'use strict';
/* global __dirname */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), data = new Map(), load = Module._load;
const native = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); },
  removeItem: async key => { data.delete(key); } };
Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: native };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { buildCreationImageV1: build, inspectCreationEligibility: inspect, preserveCreationLifecycle: lifecycle } = require('../src/features/finance/store/creationProvenance.ts');
const { useFinanceStore: store } = require('../src/features/finance/store/useFinanceStore.ts');
const { registerLedgerProtectionReader } = require('../src/features/finance/store/ledgerProtectionReader.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const F = 'tomorrow:finance', stamp = '2026-11-05T00:00:00.000Z';
let ledger;
function fixture(kind = 'debt', disposition = 'candidate') {
  const common = { id: 'entity', currencyCode: 'USD', payments: [], createdAt: stamp, updatedAt: stamp };
  const row = kind === 'debt' ? { ...common, personName: 'Person', direction: 'payable', amount: 100, date: '2026-11-05' }
    : { ...common, name: 'Loan', lenderName: 'Lender', principalAmount: 100, monthlyInstallment: 10,
      totalRepaymentAmount: 100, numberOfInstallments: 10, firstDueDate: '2026-11-05', status: 'active' };
  return { assets: [], debts: kind === 'debt' ? [row] : [], loans: kind === 'loan' ? [row] : [], cheques: [],
    paymentJournal: { schemaVersion: 1, generationId: 'g' }, creationProvenance: { schemaVersion: 1, entries: [{ disposition,
      attestation: { schemaVersion: 1, entity: { entityType: kind, entityId: row.id }, creationId: 'creation', generationId: 'g',
        image: build(kind, row) } }] } };
}
const rowOf = (state, kind) => state[kind === 'debt' ? 'debts' : 'loans'][0];
const disposition = () => store.getState().creationProvenance.entries[0].disposition;
async function hydrate(state) {
  data.set(F, JSON.stringify({ version: 2, state })); await store.persist.rehydrate();
  assert.equal(store.persist.hasHydrated(), true);
}
beforeEach(async () => {
  ledger = { hydrated: true, paymentJournal: { schemaVersion: 1, generationId: 'g' }, transactions: [], transfers: [], accounts: [], categories: [] };
  registerLedgerProtectionReader(() => ledger);
  await hydrate({ assets: [], debts: [], loans: [], cheques: [] });
});
for (const kind of ['debt', 'loan']) {
  test(`${kind} builder is deterministic, detached, deeply frozen and not an attestation`, () => {
    const state = fixture(kind), input = rowOf(state, kind), before = clone(input), result = build(kind, input);
    assert.deepEqual(result, build(kind, clone(input))); assert.deepEqual(input, before);
    input.payments.push({ id: 'later' }); assert.deepEqual(result.payments, []);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.payments));
    assert.equal(Object.hasOwn(result, 'creationId'), false);
  });
  for (const invalid of ['payments', 'missing-id', 'history', 'unknown', 'getter']) test(`${kind} builder rejects ${invalid}`, () => {
    const input = clone(rowOf(fixture(kind), kind)); let ran = false;
    if (invalid === 'payments') input.payments = [{ id: 'old', amount: 1, date: '2026-11-05' }];
    if (invalid === 'missing-id') delete input.id;
    if (invalid === 'history') input.receivedAmount = 100;
    if (invalid === 'unknown') input.acknowledged = true;
    if (invalid === 'getter') Object.defineProperty(input, 'id', { enumerable: true, get() { ran = true; return 'entity'; } });
    assert.throws(() => build(kind, input)); assert.equal(ran, false);
  });
  test(`${kind} matching baseline still cannot authorize issuance, posting or eligibility`, () => {
    const state = fixture(kind), entity = { entityType: kind, entityId: 'entity' };
    const result = inspect(state, ledger, entity);
    assert.equal(result.baselineMatches, true); assert.equal(result.eligible, false); assert.equal(result.postingAllowed, false);
    for (const mode of ['legacy', 'generation', 'ledger-generation', 'ledger-head', 'identity', 'cash', 'missing-ledger', 'history', 'financial']) {
      const s = clone(state), l = clone(ledger);
      if (mode === 'legacy') delete s.creationProvenance;
      if (mode === 'generation') s.paymentJournal.generationId = 'other';
      if (mode === 'ledger-generation') l.paymentJournal.generationId = 'other';
      if (mode === 'ledger-head') l.paymentAccounting = { schemaVersion: 1, entityHeads: [{ entity, head: { revision: 1, operationId: 'old' } }] };
      if (mode === 'identity') rowOf(s, kind).id = 'other';
      if (mode === 'cash') l.transactions.push({ linkedEntityId: 'entity' });
      if (mode === 'missing-ledger') l.hydrated = false;
      if (mode === 'history') rowOf(s, kind).payments.push({ id: 'history', amount: 1, date: '2026-11-05' });
      if (mode === 'financial') rowOf(s, kind).currencyCode = 'EUR';
      assert.equal(inspect(s, l, entity).baselineMatches, false, mode);
      assert.equal(inspect(s, l, entity).eligible, false);
    }
  });
  for (const patch of kind === 'debt' ? [{ personName: 'Changed' }, { notes: 'Note' }] : [{ name: 'Changed' }, { lenderName: 'Changed' }, { notes: 'Note' }]) {
    test(`${kind} descriptive edit ${Object.keys(patch)[0]} preserves attestation and candidate across persistence`, async () => {
      const state = fixture(kind), original = clone(state.creationProvenance); await hydrate(state);
      store.getState()[kind === 'debt' ? 'updateDebt' : 'updateLoan']('entity', patch);
      assert.equal(disposition(), 'candidate'); assert.deepEqual(store.getState().creationProvenance, original);
      await Promise.resolve(); assert.deepEqual(JSON.parse(data.get(F)).state.creationProvenance, original);
      await store.persist.rehydrate(); assert.equal(disposition(), 'candidate');
      assert.equal(inspect(store.getState(), ledger, { entityType: kind, entityId: 'entity' }).baselineMatches, true);
    });
  }
  for (const patch of kind === 'debt' ? [{ amount: 101 }, { direction: 'receivable' }, { date: '2026-11-06' }, { currencyCode: 'EUR' }]
    : [{ principalAmount: 90 }, { monthlyInstallment: 9 }, { totalRepaymentAmount: 101 }, { firstDueDate: '2026-11-06' }, { depositMethodLabel: 'Cash' }]) {
    test(`${kind} financial change ${Object.keys(patch)[0]} permanently blocks even after reverting`, async () => {
      const state = fixture(kind), original = clone(rowOf(state, kind)); await hydrate(state);
      const action = kind === 'debt' ? 'updateDebt' : 'updateLoan';
      store.getState()[action]('entity', patch); assert.equal(disposition(), 'blocked');
      store.getState()[action]('entity', original); assert.equal(disposition(), 'blocked');
      await store.persist.rehydrate(); assert.equal(disposition(), 'blocked');
    });
  }
  test(`${kind} payment add/edit/delete never restores baseline; rejection leaves evidence unchanged`, async () => {
    const state = fixture(kind); await hydrate(state);
    const add = kind === 'debt' ? 'addDebtPayment' : 'addLoanPayment';
    assert.equal(store.getState()[add]('entity', { amount: -1, date: '2026-11-05' }), null);
    assert.equal(disposition(), 'candidate');
    const id = store.getState()[add]('entity', { amount: 1, date: '2026-11-05', ...(kind === 'loan' ? { paymentMode: 'simple', paymentMethodLabel: 'Cash' } : {}) });
    assert.equal(typeof id, 'string'); assert.equal(disposition(), 'consumed');
    if (kind === 'debt') {
      assert.equal(store.getState().linkDebtPaymentTransaction('entity', id, 'transaction'), true);
      assert.equal(store.getState().updateDebtPayment('entity', id, { amount: 2 }), true);
      assert.equal(store.getState().deleteDebtPayment('entity', id, 'transaction'), true);
    } else {
      assert.equal(store.getState().updateLoanPayment('entity', id, { amount: 2, paymentMode: 'simple' }), true);
      assert.equal(store.getState().deleteLoanPayment('entity', id), true);
    }
    assert.equal(rowOf(store.getState(), kind).payments.length, 0); assert.equal(disposition(), 'consumed');
    await store.persist.rehydrate(); assert.equal(disposition(), 'consumed');
  });
  for (const initial of ['candidate', 'blocked', 'consumed']) test(`${kind} deletion retains ${initial} evidence as deleted through reset and hydration`, async () => {
    await hydrate(fixture(kind, initial));
    assert.equal(store.getState()[kind === 'debt' ? 'deleteDebt' : 'deleteLoan']('entity'), true);
    assert.equal(disposition(), 'deleted'); assert.equal(store.getState().resetFinanceData(), true);
    assert.equal(disposition(), 'deleted'); await store.persist.rehydrate(); assert.equal(disposition(), 'deleted');
    assert.equal(store.getState().creationProvenance.entries[0].attestation.creationId, 'creation');
  });
  test(`${kind} unknown ownership blocks descriptive change without creating new provenance`, async () => {
    await hydrate(fixture(kind)); ledger.hydrated = false;
    store.getState()[kind === 'debt' ? 'updateDebt' : 'updateLoan']('entity', { notes: 'changed' });
    assert.equal(disposition(), 'blocked');
  });
  test(`${kind} identity replacement is rejected before mutation`, async () => {
    await hydrate(fixture(kind)); const before = store.getState();
    assert.throws(() => store.getState()[kind === 'debt' ? 'updateDebt' : 'updateLoan']('entity', { id: 'replacement' }), /identity/);
    assert.equal(store.getState(), before);
  });
}
test('pure lifecycle rejects attestation replacement and identity reuse', () => {
  const state = fixture(), next = clone(state); next.creationProvenance.entries[0].attestation.creationId = 'forged';
  assert.throws(() => lifecycle(state, next, ledger));
  const deleted = clone(state); deleted.debts = []; deleted.creationProvenance.entries[0].disposition = 'deleted';
  const restored = { ...deleted, debts: state.debts };
  assert.throws(() => lifecycle(deleted, restored, ledger));
});
test('pure lifecycle fails closed on cross-entity payment ownership without mutating either input', () => {
  const state = fixture(), next = clone(state); next.debts[0].payments = [{ id: 'shared', amount: 1, date: '2026-11-05' }];
  next.debts.push({ ...clone(next.debts[0]), id: 'other' }); const before = clone(next);
  assert.throws(() => lifecycle(state, next, ledger)); assert.deepEqual(next, before);
});
test('public synchronous creation remains legacy and uncertified', () => {
  const d = clone(rowOf(fixture(), 'debt')), l = clone(rowOf(fixture('loan'), 'loan'));
  assert.equal(typeof store.getState().addDebt(d), 'string'); assert.equal(typeof store.getState().addLoan(l), 'string');
  assert.equal(Object.hasOwn(store.getState(), 'creationProvenance'), false);
});
test('builder canonicalizes only known optional undefined fields, without normalizing supplied amounts', () => {
  const row = clone(rowOf(fixture('loan'), 'loan')); row.principalAmount = undefined; row.notes = undefined;
  const result = build('loan', row);
  assert.equal(Object.hasOwn(result, 'principalAmount'), false); assert.equal(Object.hasOwn(result, 'notes'), false);
  assert.equal(Object.hasOwn(row, 'principalAmount'), true);
  row.unknown = undefined; assert.throws(() => build('loan', row)); delete row.unknown;
  row.monthlyInstallment = 0.1001; assert.throws(() => build('loan', row));
});
test('legacy snapshot compensation cannot reset consumed provenance after a payment mutation', async () => {
  const state = fixture(); await hydrate(state);
  const snapshots = { debts: store.getState().debts, loans: store.getState().loans };
  store.getState().addDebtPayment('entity', { amount: 1, date: '2026-11-05' });
  assert.equal(disposition(), 'consumed');
  store.setState(snapshots);
  assert.equal(disposition(), 'consumed'); assert.equal(store.getState().debts[0].payments.length, 0);
  await store.persist.rehydrate(); assert.equal(disposition(), 'consumed');
});
test('existing custom loan reversal consumes historical candidate evidence and never certifies absence', async () => {
  const { useLedgerStore: ledgerStore } = require('../src/features/finance/store/useLedgerStore.ts');
  await ledgerStore.persist.rehydrate();
  ledgerStore.setState({ ...ledger });
  const state = fixture('loan'); state.loans[0].payments = [{ id: 'historical', amount: 1,
    date: '2026-11-05', paymentMode: 'simple', paymentMethodLabel: 'Cash', latePaymentFee: 0 }];
  await hydrate(state);
  const { reverseLinkedPayment } = require('../src/features/finance/store/paymentOperations.ts');
  assert.equal(reverseLinkedPayment({ entityType: 'loan', entityId: 'entity', paymentId: 'historical' }).ok, true);
  assert.equal(disposition(), 'consumed'); assert.deepEqual(store.getState().loans[0].payments, []);
  await store.persist.rehydrate(); assert.equal(disposition(), 'consumed');
});
test('descriptive mutation with a stale Ledger generation permanently blocks the candidate', async () => {
  await hydrate(fixture()); ledger.paymentJournal.generationId = 'stale';
  store.getState().updateDebt('entity', { notes: 'Description' });
  assert.equal(disposition(), 'blocked');
  ledger.paymentJournal.generationId = 'g'; store.getState().updateDebt('entity', { notes: 'Another description' });
  assert.equal(disposition(), 'blocked');
});
