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
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename,
  );
}
const { aggregateOperatingReport } = require('../src/features/finance/utils/reportAggregation.ts');
const { classifyReportTransactions } = require('../src/features/finance/utils/reportTransactionClassifier.ts');
const period = { from: '2026-11-01', to: '2026-11-30' };
const tx = (id, amount, extra = {}) => ({
  id, amount, type: 'income', date: '2026-11-10',
  accountId: 'egp', currencyCode: 'EGP', categoryId: 'salary', ...extra,
});
const context = (transactions) => ({
  ledger: {
    accounts: [{ id: 'egp', currencyCode: 'EGP' }, { id: 'usd', currencyCode: 'USD' }],
    categories: [], transactions, transfers: [],
  },
  finance: { assets: [], debts: [], loans: [], cheques: [] },
});
const screen = fs.readFileSync(path.join(root, 'src/app/finance/statement-income.tsx'), 'utf8');

test('statement is read-only and uses the same report classifier and aggregator', () => {
  assert.match(screen, /buildIncomeStatement\(/);
  const logic = fs.readFileSync(path.join(root, 'src/features/finance/utils/incomeStatementReconciliation.ts'), 'utf8');
  assert.match(logic, /classifyReportTransactions\(context\)/);
  assert.match(logic, /aggregateOperatingReport\(context,/);
  assert.doesNotMatch(screen, /\b(addTransaction|updateTransaction|removeTransaction|addPaymentTransaction)\s*\(/);
});
test('currency totals are distinct for EGP and USD', () => {
  const ctx = context([tx('egp-income', 250), tx('usd-income', 12.5, {
    accountId: 'usd', currencyCode: 'USD',
  })]);
  const result = aggregateOperatingReport(ctx, period);
  assert.deepEqual(result.currencies.map(c => [c.currencyCode, c.income]),
    [['EGP', 250], ['USD', 12.5]]);
});
test('account and category filters narrow income correctly', () => {
  const ctx = context([tx('salary', 500), tx('gift', 40, { categoryId: 'gift' }),
    tx('usd-salary', 20, { accountId: 'usd', currencyCode: 'USD' })]);
  const result = aggregateOperatingReport(ctx, period, { accountId: 'egp', categoryId: 'salary' });
  assert.deepEqual(result.currencies.map(c => [c.currencyCode, c.income]), [['EGP', 500]]);
});
test('unsafe income is classified as income but excluded from report totals', () => {
  const ctx = context([tx('valid', 100), tx('unsafe', Number.MAX_SAFE_INTEGER)]);
  const classified = classifyReportTransactions(ctx);
  assert.equal(classified[1].kind, 'income');
  const report = aggregateOperatingReport(ctx, period);
  assert.equal(report.currencies[0].income, 100);
  assert.equal(report.unknown.length, 1);
  assert.equal(report.unknown[0].id, 'unsafe');
});
test('sub-cent USD income is excluded from verified report', () => {
  const ctx = context([tx('fraction', 0.001, { accountId: 'usd', currencyCode: 'USD' })]);
  assert.equal(classifyReportTransactions(ctx)[0].kind, 'income');
  const report = aggregateOperatingReport(ctx, period);
  assert.equal(report.currencies.length, 0);
  assert.equal(report.unknown.length, 1);
});
test('loan receipts are not ordinary income', () => {
  const receipt = tx('loan-receipt', 10000);
  const ctx = context([receipt]);
  ctx.finance.loans.push({
    id: 'loan', receiptTransactionId: 'loan-receipt', receivedAmount: 10000,
    receivedAt: receipt.date, currencyCode: 'EGP', payments: [],
  });
  assert.notEqual(classifyReportTransactions(ctx)[0].kind, 'income');
  assert.equal(aggregateOperatingReport(ctx, period).currencies.length, 0);
});