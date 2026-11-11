const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id.startsWith('@/')) return originalLoad.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return originalLoad.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) =>
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
const { classifyReportTransaction, classifyReportTransactions, classifyReportTransfer } =
  require('../src/features/finance/utils/reportTransactionClassifier.ts');

const account = (id = 'bank', currencyCode = 'EGP') => ({ id, currencyCode });
const tx = (id, type, amount, extra = {}) => ({
  id, type, amount, currencyCode: 'EGP', accountId: 'bank', categoryId: 'general',
  date: '2026-11-10', ...extra,
});
const ctx = (transactions, loans = [], debts = [], property) => ({
  ledger: { accounts: [account(), account('other', 'USD')], transactions, transfers: [], categories: [] },
  finance: { assets: [], loans, debts, cheques: [] },
  property,
});
function classify(t, context) { return classifyReportTransaction(t, context); }

test('ordinary income and expense are separate P&L values', () => {
  const a = tx('salary', 'income', 20000), b = tx('food', 'expense', 3000);
  const c = ctx([a, b]);
  assert.deepEqual([classify(a, c).incomeAmount, classify(a, c).expenseAmount], [20000, 0]);
  assert.deepEqual([classify(b, c).incomeAmount, classify(b, c).expenseAmount], [0, 3000]);
});
test('transfers and credit card settlement never become income/expense', () => {
  assert.equal(classifyReportTransfer({ type: 'internal' }), 'transfer');
  assert.equal(classifyReportTransfer({ type: 'credit_card_payment' }), 'credit_card_payment');
});
test('refund can reference original outside period and different bank account/currency', () => {
  const original = tx('old', 'expense', 100, { date: '2026-01-01', accountId: 'other', currencyCode: 'USD' });
  const refund = tx('back', 'expense', 4100, { entryType: 'refund', relatedTransactionId: 'old' });
  const c = ctx([original, refund]);
  assert.equal(classify(refund, c).kind, 'refund');
  assert.equal(classify(refund, c).expenseAmount, -4100);
});
test('orphan refund is unknown, not a negative expense', () => {
  const refund = tx('back', 'expense', 500, { entryType: 'refund', relatedTransactionId: 'missing' });
  assert.equal(classify(refund, ctx([refund])).kind, 'unknown');
});
test('verified loan receipt is excluded from P&L', () => {
  const receipt = tx('receipt', 'income', 100000);
  const loan = { id: 'loan', receiptTransactionId: 'receipt', receivedAmount: 100000,
    receivedAt: receipt.date, currencyCode: 'EGP', payments: [] };
  const item = classify(receipt, ctx([receipt], [loan]));
  assert.equal(item.kind, 'loan_receipt');
  assert.equal(item.incomeAmount, 0);
});
test('loan payment is classified without inventing interest/principal split', () => {
  const payment = tx('pay', 'expense', 10200, { purpose: 'loan_payment', linkedEntityType: 'loan',
    linkedEntityId: 'loan', linkedPaymentId: 'p' });
  const loan = { id: 'loan', currencyCode: 'EGP', payments: [{ id: 'p', amount: 10000,
    latePaymentFee: 200, date: payment.date, accountId: 'bank', ledgerTransactionId: 'pay' }] };
  const item = classify(payment, ctx([payment], [loan]));
  assert.equal(item.kind, 'loan_payment');
  assert.equal(item.expenseAmount, 0);
});
test('verified receivable collection is excluded from operating income', () => {
  const t = tx('col', 'income', 700, { purpose: 'debt_collection', linkedEntityType: 'debt',
    linkedEntityId: 'debt', linkedPaymentId: 'p' });
  const debt = { id: 'debt', direction: 'receivable', currencyCode: 'EGP',
    payments: [{ id: 'p', amount: 700, date: t.date, accountId: 'bank', ledgerTransactionId: 'col' }] };
  assert.equal(classify(t, ctx([t], [], [debt])).kind, 'debt_collection');
});
test('unverified linked payment is unknown', () => {
  const t = tx('pay', 'expense', 100, { purpose: 'loan_payment', linkedEntityType: 'loan',
    linkedEntityId: 'missing', linkedPaymentId: 'p' });
  assert.equal(classify(t, ctx([t])).kind, 'unknown');
});
test('duplicate transaction ID is unknown', () => {
  const a = tx('dup', 'income', 100), b = tx('dup', 'expense', 50);
  assert.equal(classify(a, ctx([a, b])).kind, 'unknown');
});
test('verified property payment is not an operating expense', () => {
  const t = tx('ptx', 'expense', 2000, { purpose: 'property_installment_payment',
    linkedEntityType: 'property', linkedEntityId: 'contract', linkedPaymentId: 'p' });
  const property = { contracts: [{ id: 'contract', currencyCode: 'EGP' }],
    installments: [{ id: 'i', contractId: 'contract', amount: 5000 }],
    payments: [{ id: 'p', contractId: 'contract', installmentId: 'i',
      amount: 2000, date: t.date, accountId: 'bank', ledgerTransactionId: 'ptx' }] };
  assert.equal(classify(t, ctx([t], [], [], property)).kind, 'property_installment_payment');
});
test('property schedule without confirmed ledger payment has no transaction', () => {
  const property = { contracts: [{ id: 'c', currencyCode: 'EGP' }],
    installments: [{ id: 'i', contractId: 'c', amount: 5000 }], payments: [] };
  assert.deepEqual(classifyReportTransactions(ctx([], [], [], property)), []);
});
test('classifier does not mutate input', () => {
  const a = tx('salary', 'income', 100, { originalAmount: 2, originalCurrencyCode: 'USD' });
  const c = ctx([a]);
  const before = structuredClone(c);
  const item = classify(a, c);
  assert.deepEqual(c, before);
  assert.equal(item.originalAmount, 2);
  assert.equal(item.originalCurrencyCode, 'USD');
});

test('refund keeps original expense category across periods', () => {
  const original = tx('original-food', 'expense', 100, {
    categoryId: 'food', date: '2026-01-01',
  });
  const refund = tx('refund-food', 'expense', 40, {
    categoryId: 'other',
    entryType: 'refund',
    relatedTransactionId: 'original-food',
  });
  const item = classify(refund, ctx([original, refund]));
  assert.equal(item.kind, 'refund');
  assert.equal(item.categoryId, 'food');
  assert.equal(item.expenseAmount, -40);
});

test('duplicate property payment ID is rejected', () => {
  const paymentTx = tx('property-duplicate', 'expense', 2000, {
    purpose: 'property_installment_payment',
    linkedEntityType: 'property',
    linkedEntityId: 'contract',
    linkedPaymentId: 'payment',
  });
  const payment = {
    id: 'payment', contractId: 'contract',
    installmentId: 'installment', amount: 2000,
    date: paymentTx.date, accountId: 'bank',
    ledgerTransactionId: paymentTx.id,
  };
  const property = {
    contracts: [{ id: 'contract', currencyCode: 'EGP' }],
    installments: [{ id: 'installment', contractId: 'contract' }],
    payments: [
      payment,
      { ...payment, ledgerTransactionId: 'another-transaction' },
    ],
  };
  assert.equal(
    classify(paymentTx, ctx([paymentTx], [], [], property)).kind,
    'unknown',
  );
});

test('conflicting property ledger ownership is rejected', () => {
  const paymentTx = tx('property-conflict', 'expense', 2000, {
    purpose: 'property_installment_payment',
    linkedEntityType: 'property',
    linkedEntityId: 'contract',
    linkedPaymentId: 'payment',
  });
  const property = {
    contracts: [{ id: 'contract', currencyCode: 'EGP' }],
    installments: [{ id: 'installment', contractId: 'contract' }],
    payments: [
      {
        id: 'payment', contractId: 'contract',
        installmentId: 'installment', amount: 2000,
        date: paymentTx.date, accountId: 'bank',
        ledgerTransactionId: paymentTx.id,
      },
      {
        id: 'other-payment', contractId: 'contract',
        installmentId: 'installment', amount: 2000,
        date: paymentTx.date, accountId: 'bank',
        ledgerTransactionId: paymentTx.id,
      },
    ],
  };
  assert.equal(
    classify(paymentTx, ctx([paymentTx], [], [], property)).kind,
    'unknown',
  );
});
for (const amount of [0, -1, NaN, Infinity]) {
  test('refund cannot verify against invalid original amount: ' + amount, () => {
    const original = tx('original', 'expense', amount);
    const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id });
    assert.equal(classify(refund, ctx([original, refund])).kind, 'unknown');
  });
}
test('refund cannot bypass reverse property ownership evidence', () => {
  const original = tx('original', 'expense', 100);
  const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id });
  const property = { contracts: [], installments: [], payments: [{ id: 'p', ledgerTransactionId: original.id }] };
  assert.equal(classify(refund, ctx([original, refund], [], [], property)).kind, 'unknown');
});
for (const type of ['adjustment', undefined, null, 7]) {
  test('unsupported transaction type is explicitly unknown: ' + type, () => {
    const t = tx('bad', type, 100);
    assert.equal(classify(t, ctx([t])).kind, 'unknown');
  });
}

test('refund with reverse property ownership is unknown', () => {
  const original = tx('original', 'expense', 100);
  const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id });
  const property = { contracts: [], installments: [], payments: [{ id: 'p', ledgerTransactionId: refund.id }] };
  assert.equal(classify(refund, ctx([original, refund], [], [], property)).kind, 'unknown');
});
test('refund with unsupported purpose is unknown', () => {
  const original = tx('original', 'expense', 100);
  const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id, purpose: 'unsupported' });
  assert.equal(classify(refund, ctx([original, refund])).kind, 'unknown');
});
test('account IDs must be unique even across currencies', () => {
  const t = tx('ordinary', 'income', 100);
  const data = ctx([t]);
  data.ledger.accounts.push(account('bank', 'USD'));
  assert.equal(classify(t, data).kind, 'unknown');
});
