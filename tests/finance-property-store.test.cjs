const { test, beforeEach, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const storage = new Map();
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async key => { storage.delete(key); },
  };
  return originalLoad.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);

const { usePropertyInstallmentsStore: store } =
  require('../src/features/finance/store/usePropertyInstallmentsStore.ts');
const contract = { developerName: 'Developer', projectName: 'Project', unitReference: 'A-101',
  currencyCode: 'EGP', contractPrice: 100, contractDate: '2026-11-01' };
before(async () => { await store.persist.rehydrate(); });
beforeEach(() => store.setState({ contracts: [], installments: [], payments: [] }));

test('each property has independent contract and schedule', () => {
  const a = store.getState().addContract(contract);
  const b = store.getState().addContract({ ...contract, unitReference: 'A-102' });
  assert.ok(a && b && a !== b);
  assert.equal(store.getState().replaceDraftSchedule({ contractId: a, firstDueDate: '2027-01-31',
    count: 3, intervalMonths: 1, totalAmount: 90 }), true);
  assert.equal(store.getState().installments.filter(i => i.contractId === a).length, 3);
  assert.equal(store.getState().installments.filter(i => i.contractId === b).length, 0);
});

test('invalid contract and schedule amounts leave state unchanged', () => {
  assert.equal(store.getState().addContract({ ...contract, contractPrice: -1 }), null);
  const id = store.getState().addContract(contract);
  assert.equal(store.getState().addInstallment({ contractId: id, kind: 'regular',
    dueDate: '2027-01-01', amount: 101 }), null);
  assert.equal(store.getState().replaceDraftSchedule({ contractId: id, firstDueDate: '2027-01-01',
    count: 3, intervalMonths: 1, totalAmount: 101 }), false);
  assert.equal(store.getState().installments.length, 0);
});

test('schedule replacement is atomic and contract cannot be deleted with schedule', () => {
  const id = store.getState().addContract(contract);
  const plan = { contractId: id, firstDueDate: '2027-01-01', count: 2, intervalMonths: 1, totalAmount: 90 };
  assert.equal(store.getState().replaceDraftSchedule(plan), true);
  assert.equal(store.getState().replaceDraftSchedule({ ...plan, totalAmount: 110 }), false);
  assert.equal(store.getState().installments.length, 2);
  assert.equal(store.getState().deleteContract(id), false);
  assert.equal(store.getState().updateContract(id, { contractPrice: 80 }), false);
  assert.equal(store.getState().updateContract(id, { currencyCode: 'USD' }), false);
});

test('paid installment cannot be edited or deleted and draft schedule cannot be replaced', () => {
  const id = store.getState().addContract(contract);
  const installmentId = store.getState().addInstallment({ contractId: id, kind: 'regular',
    dueDate: '2027-01-01', amount: 20 });
  store.setState({ payments: [{ id: 'p1', contractId: id, installmentId,
    date: '2027-01-01', amount: 10, accountId: 'a', ledgerTransactionId: 'tx1' }] });
  assert.equal(store.getState().updateInstallment(installmentId, { amount: 15 }), false);
  assert.equal(store.getState().deleteInstallment(installmentId), false);
  assert.equal(store.getState().replaceDraftSchedule({ contractId: id,
    firstDueDate: '2027-02-01', count: 2, intervalMonths: 1, totalAmount: 40 }), false);
});

test('draft schedules survive rehydration', async () => {
  const id = store.getState().addContract(contract);
  store.getState().addInstallment({ contractId: id, kind: 'handover', dueDate: '2027-01-01', amount: 25 });
  await store.persist.rehydrate();
  assert.equal(store.getState().contracts.some(c => c.id === id), true);
  assert.equal(store.getState().installments.some(i => i.contractId === id), true);
});
