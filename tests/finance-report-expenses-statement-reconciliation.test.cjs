const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = Module._load;
Module._load = function (id, parent, main) {
  if (id.startsWith('@/')) return load.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return load.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
}
const { buildExpensesStatement } = require('../src/features/finance/utils/expensesStatementReconciliation.ts');
const period = { from: '2026-11-01', to: '2026-11-30' };
const tx = (id, amount, extra = {}) => ({
  id, amount, type: 'expense', date: '2026-11-10',
  accountId: 'egp', currencyCode: 'EGP', categoryId: 'food', ...extra,
});
const ctx = (transactions) => ({
  ledger: { accounts: [{ id: 'egp', currencyCode: 'EGP' }, { id: 'usd', currencyCode: 'USD' }],
    categories: [], transactions, transfers: [] },
  finance: { assets: [], debts: [], loans: [], cheques: [] },
});
test('exact EGP statement reconciles with report', () => {
  const result = buildExpensesStatement(ctx([tx('a', 100), tx('b', 50)]), period);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.rows.map(r => r.id), ['a', 'b']);
  assert.equal(result.report.currencies[0].expenses, 150);
});
test('two currencies stay separate', () => {
  const result = buildExpensesStatement(ctx([tx('a', 100), tx('b', 12.5, {
    accountId: 'usd', currencyCode: 'USD',
  })]), period);
  assert.equal(result.reconciled, true);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.report.currencies.map(r => [r.currencyCode, r.expenses]),
    [['EGP', 100], ['USD', 12.5]]);
});
test('account and category filters apply to rows and totals', () => {
  const result = buildExpensesStatement(ctx([tx('a', 100), tx('b', 50, { categoryId: 'gift' }),
    tx('c', 10, { accountId: 'usd', currencyCode: 'USD' })]),
  period, { accountId: 'egp', categoryId: 'food' });
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.rows.map(r => r.id), ['a']);
  assert.equal(result.report.currencies[0].expenses, 100);
});
test('unsafe and sub-cent transactions excluded, known subtotal reconciles', () => {
  const result = buildExpensesStatement(ctx([tx('valid', 100), tx('unsafe', Number.MAX_SAFE_INTEGER),
    tx('subcent', 0.001, { accountId: 'usd', currencyCode: 'USD' })]), period);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.rows.map(r => r.id), ['valid']);
  assert.equal(result.report.unknown.length, 2);
});
test('verified refund reduces expense total and uses original category', () => {
  const original = tx('purchase', 100, { categoryId: 'food' });
  const refund = tx('refund', 30, { entryType: 'refund',
    relatedTransactionId: 'purchase', categoryId: 'other' });
  const result = buildExpensesStatement(ctx([original, refund]), period, { categoryId: 'food' });
  assert.equal(result.reconciled, true);
  assert.equal(result.report.currencies[0].expenses, 70);
  assert.deepEqual(result.rows.map(r => [r.id, r.amount]),
    [['purchase', 100], ['refund', -30]]);
});
test('orphan refund is unknown and excluded from expense rows', () => {
  const result = buildExpensesStatement(ctx([tx('orphan', 20, {
    entryType: 'refund', relatedTransactionId: 'missing',
  })]), period);
  assert.equal(result.reconciled, true);
  assert.equal(result.rows.length, 0);
  assert.equal(result.report.unknown.length, 1);
});
test('period boundaries include both endpoints', () => {
  const result = buildExpensesStatement(ctx([tx('a', 10, { date: period.from }),
    tx('b', 20, { date: period.to }), tx('c', 30, { date: '2026-12-01' })]), period);
  assert.equal(result.reconciled, true);
  assert.deepEqual(result.rows.map(r => r.id), ['b', 'a']);
});
