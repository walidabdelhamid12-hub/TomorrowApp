const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const navigation = fs.readFileSync(path.join(__dirname, '../src/app/finance/reports.tsx'), 'utf8');
const screen = fs.readFileSync(path.join(__dirname, '../src/app/finance/report-loans.tsx'), 'utf8');
test('Loans is enabled and navigates to its own report', () => {
  require('./helpers/assert-finance-report-navigation.cjs')(navigation);
  assert.match(screen, /aggregateLoansReport\(loans, dates\)/);
});
test('Loans report stays read-only and preserves uncertainty labels', () => {
  assert.match(screen, /Historical figures unavailable/);
  assert.match(screen, /Recorded payments in period/);
  assert.match(screen, /Current principal remaining/);
  assert.doesNotMatch(screen, /addLoanPayment|updateLoan|setState|postingAllowed\s*=\s*true/);
});
