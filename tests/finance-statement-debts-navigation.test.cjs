const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('debt reports preserve direction and month when opening statement', () => {
  const report = read('features/finance/components/DebtReportScreen.tsx');
  assert.match(report, /pathname: '\/finance\/statement-debts', params: \{ direction, month, from: period\.from, to: period\.to, currencyCode: activeCurrency \}/);
  assert.match(report, /<ReportStatementLink/);
});
test('statement lists period-filtered recorded payments and never writes', () => {
  const statement = read('app/finance/statement-debts.tsx');
  assert.match(statement, /aggregateDebtsReport\(debts, period, direction\)/);
  assert.match(statement, /payment\.date >= period\.from && payment\.date <= period\.to/);
  assert.match(statement, /Recorded payments only/);
  assert.doesNotMatch(statement, /addDebtPayment|deleteDebtPayment|updateDebtPayment|setState/);
});

test('Unverified historical rows cannot be presented as complete statements', () => {
  const screen = read('app/finance/statement-debts.tsx');
  assert.match(screen, /row\.status === 'available'/);
  assert.match(screen, /rows\.some\(row => row\.status !== 'available'\)/);
  assert.match(screen, /Payment details are withheld to avoid misleading totals/);
});
