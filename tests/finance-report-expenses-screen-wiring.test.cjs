const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Expenses Report is reachable from Reports while retaining the eight implemented report routes', () => {
  const navigation = read('src/app/finance/reports.tsx');
  assert.match(navigation, /name === 'Expenses' \? '\/finance\/report-expenses'/);
  assert.match(navigation, /disabled=\{name !== 'Income' && name !== 'Expenses' && name !== 'Accounts' && name !== 'Assets' && name !== 'Installments' && name !== 'Loans' && name !== 'Debts Receivable' && name !== 'Debts Payable'\}/);
});
test('Expenses Report uses expense categories and expense aggregates', () => {
  const screen = read('src/app/finance/report-expenses.tsx');
  assert.match(screen, /category\.kind === 'expense'/);
  assert.match(screen, /report\.expenseCategories/);
  assert.match(screen, /item\.expenses/);
  assert.match(screen, /row\.expenses/);
  assert.doesNotMatch(screen, /report\.incomeCategories|row\.income|item\.income/);
});
test('Expenses Statement retains report filters and is read-only', () => {
  const report = read('src/app/finance/report-expenses.tsx');
  const statement = read('src/app/finance/statement-expenses.tsx');
  assert.match(report, /pathname: '\/finance\/statement-expenses'/);
  for (const key of ['from', 'to', 'accountId', 'categoryId']) {
    assert.match(report, new RegExp('\\b' + key + '\\b'));
    assert.match(statement, new RegExp('\\b' + key + '\\b'));
  }
  assert.match(statement, /buildExpensesStatement\(/);
  assert.doesNotMatch(statement, /\b(addTransaction|updateTransaction|removeTransaction|addPaymentTransaction)\s*\(/);
  assert.doesNotMatch(statement, /Â·/);
});
test('Expenses reconciliation includes verified refunds and checks expense minor units', () => {
  const helper = read('src/features/finance/utils/expensesStatementReconciliation.ts');
  assert.match(helper, /item\.kind !== 'refund'/);
  assert.match(helper, /total\.minorUnits\.expenses/);
  assert.match(helper, /total\.minorUnits\?\.expenses/);
  assert.doesNotMatch(helper, /minorUnits\??\.income/);
});
