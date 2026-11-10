const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = Module._load;
const storage = new Map();
Module._load = function (id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async key => { storage.delete(key); },
  };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);
const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
const date = '2026-11-08';
const fx = (currency, rate, rateDate = date) => ({
  sourceCurrencyCode: currency, referenceCurrencyCode: 'EGP', rate, rateDate, source: 'manual',
});
const metadata = () => ({
  originalAmount: 10, originalCurrencyCode: 'USD', accountFxRate: 0.3901,
  accountFxSnapshot: fx('USD', 50), historicalFx: fx('OMR', 130),
});
const input = () => ({
  type: 'expense', accountId: 'omr', categoryId: 'out', amount: 3.901, date, ...metadata(),
});
const account = (id, currencyCode) => ({
  id, name: id, type: 'bank', currencyCode, initialBalance: 100, archived: false,
  createdAt: date, updatedAt: date,
});
before(async () => { await Promise.all([ledger.persist.rehydrate(), finance.persist.rehydrate()]); });
beforeEach(() => {
  finance.setState({ loans: [], debts: [] });
  ledger.setState({ accounts: [account('omr', 'OMR'), account('omr2', 'OMR'), account('eur', 'EUR')],
    categories: [{ id: 'out', name: 'Other', kind: 'expense', icon: 'cash', color: '#000', isDefault: false }],
    transactions: [], transfers: [] });
});
function rejectedUpdate(patch) {
  const id = ledger.getState().addTransaction(input());
  assert.ok(id);
  const previous = ledger.getState().transactions;
  assert.equal(ledger.getState().updateTransaction(id, patch), false);
  assert.strictEqual(ledger.getState().transactions, previous);
}
test('valid metadata retains OMR three-decimal amount on add and edit', () => {
  const id = ledger.getState().addTransaction(input());
  assert.ok(id);
  assert.equal(ledger.getState().transactions[0].amount, 3.901);
  assert.equal(ledger.getState().updateTransaction(id, { note: 'preserve precision' }), true);
  assert.equal(ledger.getState().transactions[0].amount, 3.901);
  assert.deepEqual(ledger.getState().transactions[0].accountFxSnapshot, fx('USD', 50));
});
for (const [name, patch] of Object.entries({
  partial: { accountFxSnapshot: undefined },
  rate: { accountFxRate: 0.39 },
  precision: { amount: 3.9019 },
  originalPrecision: { originalAmount: 10.001 },
  currency: { accountFxSnapshot: fx('EUR', 55) },
  staleOriginal: { accountFxSnapshot: fx('USD', 50, '2026-11-07') },
  missingHistorical: { historicalFx: undefined },
  sameCurrency: { originalCurrencyCode: 'OMR', accountFxSnapshot: fx('OMR', 130) },
})) {
  test(`invalid ${name} metadata rejects insertion without mutation`, () => {
    const previous = ledger.getState().transactions;
    assert.equal(ledger.getState().addTransaction({ ...input(), ...patch }), null);
    assert.strictEqual(ledger.getState().transactions, previous);
  });
}
test('amount edits require a matching effective rate', () => {
  rejectedUpdate({ amount: 3.902 });
  const id = ledger.getState().transactions[0].id;
  assert.equal(ledger.getState().updateTransaction(id, { amount: 3.902, accountFxRate: 0.3902 }), true);
  assert.equal(ledger.getState().transactions[0].amount, 3.902);
});
test('excess precision on update is rejected before rounding', () => rejectedUpdate({ amount: 3.9019 }));
test('date edits validate both FX snapshots', () => {
  rejectedUpdate({ date: '2026-11-07', historicalFx: fx('OMR', 130, '2026-11-07') });
  const id = ledger.getState().transactions[0].id;
  assert.equal(ledger.getState().updateTransaction(id, {
    date: '2026-11-07', historicalFx: fx('OMR', 130, '2026-11-07'),
    accountFxSnapshot: fx('USD', 50, '2026-11-07'),
  }), true);
});
test('undefined metadata cannot erase retained evidence', () => {
  rejectedUpdate({ date: '2026-11-07', historicalFx: undefined, accountFxSnapshot: undefined });
});
test('account edits validate against destination currency and permit matching metadata', () => {
  rejectedUpdate({ accountId: 'eur' });
  const id = ledger.getState().transactions[0].id;
  assert.equal(ledger.getState().updateTransaction(id, {
    accountId: 'eur', amount: 9.09, accountFxRate: 0.909, historicalFx: fx('EUR', 55),
  }), true);
  assert.equal(ledger.getState().transactions[0].currencyCode, 'EUR');
});
test('same currency account change preserves metadata', () => {
  const id = ledger.getState().addTransaction(input());
  assert.equal(ledger.getState().updateTransaction(id, { accountId: 'omr2' }), true);
  assert.equal(ledger.getState().transactions[0].amount, 3.901);
});
test('invalid historical FX edits are rejected', () => rejectedUpdate({ historicalFx: fx('OMR', -1) }));
test('legacy records without cross-currency metadata still add and update', () => {
  const id = ledger.getState().addTransaction({ type: 'expense', accountId: 'omr', categoryId: 'out', amount: 10, date });
  assert.ok(id);
  assert.equal(ledger.getState().updateTransaction(id, { amount: 11, date: '2026-11-07' }), true);
  assert.equal(ledger.getState().transactions[0].originalAmount, undefined);
});
test('legacy record may receive complete metadata but rejects partial metadata', () => {
  const id = ledger.getState().addTransaction({ type: 'expense', accountId: 'omr', categoryId: 'out', amount: 10, date });
  assert.equal(ledger.getState().updateTransaction(id, { originalAmount: 10 }), false);
  assert.equal(ledger.getState().updateTransaction(id, { ...metadata(), amount: 3.901 }), true);
});
test('refund rules and protected transaction guards remain active', () => {
  const id = ledger.getState().addTransaction({ type: 'expense', accountId: 'omr', categoryId: 'out', amount: 10, date });
  const refund = ledger.getState().addTransaction({ type: 'expense', entryType: 'refund', relatedTransactionId: id,
    accountId: 'omr', categoryId: 'out', amount: 2, date });
  assert.ok(refund);
  assert.equal(ledger.getState().updateTransaction(refund, { note: 'blocked' }), false);
  assert.equal(ledger.getState().updateTransaction(id, { amount: 1 }), false);
  for (const purpose of ['loan_payment', 'debt_payment', 'property_installment_payment']) {
    ledger.setState({ transactions: [{ ...input(), currencyCode: 'OMR', id: purpose, purpose }] });
    assert.equal(ledger.getState().updateTransaction(purpose, { note: 'blocked' }), false);
  }
});
