const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('Loans report forwards its month to View Statement', () => {
  const report = read('app/finance/report-loans.tsx');
  assert.match(report, /pathname: '\/finance\/statement-loans', params: \{ month \}/);
  assert.match(report, /accessibilityLabel="View Statement"/);
});
test('Loans statement separates late fees and only reads payments in period', () => {
  const screen = read('app/finance/statement-loans.tsx');
  assert.match(screen, /aggregateLoansReport\(loans, period\)/);
  assert.match(screen, /payment\.date >= period\.from && payment\.date <= period\.to/);
  assert.match(screen, /Late fee:/);
  assert.doesNotMatch(screen, /addLoanPayment|updateLoan|deleteLoan|setState/);
});

test('Unverified historical rows cannot be presented as complete statements', () => {
  const screen = read('app/finance/statement-loans.tsx');
  assert.match(screen, /row\.status === 'available'/);
  assert.match(screen, /rows\.some\(row => row\.status !== 'available'\)/);
  assert.match(screen, /Payment details are withheld to avoid misleading totals/);
});
