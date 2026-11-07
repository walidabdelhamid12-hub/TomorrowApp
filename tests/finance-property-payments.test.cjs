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
  fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
const { useFinanceStore } = require('../src/features/finance/store/useFinanceStore.ts');
const { useLedgerStore } = require('../src/features/finance/store/useLedgerStore.ts');
const { usePropertyInstallmentsStore } = require('../src/features/finance/store/usePropertyInstallmentsStore.ts');
const { postPropertyInstallmentPayment } = require('../src/features/finance/store/propertyPaymentOperations.ts');
const contract = { developerName: 'D', projectName: 'P', unitReference: 'A',
  currencyCode: 'EGP', contractPrice: 100, contractDate: '2026-11-01' };
let contractId, installmentId, accountId, categoryId;
before(async () => {
  await Promise.all([useFinanceStore.persist.rehydrate(), useLedgerStore.persist.rehydrate(),
    usePropertyInstallmentsStore.persist.rehydrate()]);
});
beforeEach(() => {
  useFinanceStore.setState({ loans: [], debts: [] });
  useLedgerStore.setState({ accounts: [], transactions: [], transfers: [] });
  usePropertyInstallmentsStore.setState({ contracts: [], installments: [], payments: [] });
  contractId = usePropertyInstallmentsStore.getState().addContract(contract);
  installmentId = usePropertyInstallmentsStore.getState().addInstallment({
    contractId, kind: 'regular', amount: 60, dueDate: '2027-01-01',
  });
  accountId = useLedgerStore.getState().addAccount({
    name: 'Bank', type: 'bank', currencyCode: 'EGP', initialBalance: 100,
  });
  categoryId = useLedgerStore.getState().categories.find(c => c.kind === 'expense').id;
});
const pay = (amount, extra = {}) => postPropertyInstallmentPayment({
  contractId, installmentId, accountId, categoryId, amount, date: '2027-01-01', ...extra,
});
test('partial and final property payments post exactly once each', () => {
  assert.equal(pay(20).ok, true);
  assert.equal(pay(40).ok, true);
  assert.equal(usePropertyInstallmentsStore.getState().payments.length, 2);
  assert.equal(useLedgerStore.getState().transactions.length, 2);
  assert.equal(pay(0.001).ok, false);
  assert.equal(useLedgerStore.getState().transactions.length, 2);
});
test('reject overpayment and wrong currency without posting cash', () => {
  assert.equal(pay(61).ok, false);
  assert.equal(pay(1, { accountId: 'missing' }).ok, false);
  assert.equal(useLedgerStore.getState().transactions.length, 0);
});
test('property payment ledger entry rejects generic edits and deletion', () => {
  assert.equal(pay(20).ok, true);
  const tx = useLedgerStore.getState().transactions[0];
  assert.equal(useLedgerStore.getState().updateTransaction(tx.id, { amount: 10 }), false);
  assert.equal(useLedgerStore.getState().removeTransaction(tx.id), false);
});
test('existing orphaned property payment prevents further posting', () => {
  useLedgerStore.setState(s => ({ transactions: [...s.transactions, {
    id: 'orphan', linkedEntityType: 'property', linkedEntityId: contractId,
    linkedPaymentId: 'missing', type: 'expense', purpose: 'property_installment_payment',
    amount: 1, accountId, categoryId, currencyCode: 'EGP', date: '2027-01-01',
    createdAt: '', updatedAt: '',
  }] }));
  assert.equal(pay(10).ok, false);
  assert.equal(usePropertyInstallmentsStore.getState().payments.length, 0);
});
