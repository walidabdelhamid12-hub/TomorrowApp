const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('debt reports preserve direction and month when opening statement', () => {
  const report = read('features/finance/components/DebtReportScreen.tsx');
  assert.match(report, /pathname: '\/finance\/statement-debts', params: \{ direction, month \}/);
  assert.match(report, /accessibilityLabel="View Statement"/);
});
test('statement lists period-filtered recorded payments and never writes', () => {
  const statement = read('app/finance/statement-debts.tsx');
  assert.match(statement, /aggregateDebtsReport\(debts, period, direction\)/);
  assert.match(statement, /payment\.date >= period\.from && payment\.date <= period\.to/);
  assert.match(statement, /Recorded payments only/);
  assert.doesNotMatch(statement, /addDebtPayment|deleteDebtPayment|updateDebtPayment|setState/);
});
