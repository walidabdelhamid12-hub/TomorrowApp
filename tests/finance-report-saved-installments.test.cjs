const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('saved installments report is schedule-only and does not calculate payments', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/reportSavedInstallments.ts'), 'utf8');
  assert.match(source, /validateInstallmentContract\(contract\)/);
  assert.match(source, /dueDate >= from && item\.dueDate <= to/);
  assert.doesNotMatch(source, /ledgerTransactionId|postingAllowed|setState|confirmedPaid/);
});
test('report screen loads persisted contracts without writing to storage', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/report-installments.tsx'), 'utf8');
  assert.match(source, /saved\.contracts/);
  assert.match(source, /aggregateSavedInstallmentsReport/);
  assert.doesNotMatch(source, /createContract\(|updateContract\(|deleteContract\(/);
});
