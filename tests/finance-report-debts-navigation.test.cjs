const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('both debt directions have dedicated enabled routes', () => {
  const nav = read('app/finance/reports.tsx');
  assert.match(nav, /name === 'Debts Receivable' \? '\/finance\/report-receivable'/);
  assert.match(nav, /name === 'Debts Payable' \? '\/finance\/report-payable'/);
  assert.match(read('app/finance/report-receivable.tsx'), /direction="receivable"/);
  assert.match(read('app/finance/report-payable.tsx'), /direction="payable"/);
});
test('shared report is read-only and distinguishes period from current remaining', () => {
  const screen = read('features/finance/components/DebtReportScreen.tsx');
  assert.match(screen, /aggregateDebtsReport\(debts, period, direction\)/);
  assert.match(screen, /Remaining at period end/);
  assert.match(screen, /Current remaining/);
  assert.doesNotMatch(screen, /addDebtPayment|updateDebt|deleteDebt|setState/);
});
