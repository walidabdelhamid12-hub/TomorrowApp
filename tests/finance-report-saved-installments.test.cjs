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

test('report rejects impossible calendar dates and repeated contract identities', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/reportSavedInstallments.ts'), 'utf8');
  assert.match(source, /getUTCDate\(\)/);
  assert.match(source, /if \(ids\.has\(contract\.id\)\) throw/);
});
test('month navigation uses device-local calendar and has year bounds', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/report-installments.tsx'), 'utf8');
  assert.match(source, /getFullYear\(\)/);
  assert.match(source, /getMonth\(\)/);
  assert.match(source, /date\.getFullYear\(\) < 100/);
  assert.doesNotMatch(source, /toISOString\(\)\.slice\(0, 7\)/);
});

test('report contract cards open details and label both monetary and count metrics', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/report-installments.tsx'), 'utf8');
  assert.match(source, /accessibilityLabel=\{"Open installment contract " \+ row\.name\}/);
  assert.match(source, /pathname: '\/finance\/installment-contract'/);
  assert.match(source, /mode: 'details'/);
  assert.match(source, /Contract total \(all scheduled\): \{row\.totalScheduled\}/);
  assert.match(source, /Due this month: \{row\.dueInPeriod\}/);
  assert.match(source, /Installments scheduled this month: \{row\.dueCount\}/);
  assert.match(source, /accessibilityLabel="Previous month"/);
  assert.match(source, /accessibilityLabel="Next month"/);
  assert.doesNotMatch(source, /\\\\n\s*<Pressable/);
});

test('currency summary remains read-only and never combines currencies', () => {
  const utility = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/reportSavedInstallments.ts'), 'utf8');
  const screen = fs.readFileSync(path.join(__dirname, '../src/app/finance/report-installments.tsx'), 'utf8');
  assert.match(utility, /new Map<string,/);
  assert.match(utility, /totals\.get\(row\.currencyCode\)/);
  assert.match(utility, /totals\.set\(row\.currencyCode, current\)/);
  assert.match(utility, /current\.total \+= units\(row\.totalScheduled, decimals\)/);
  assert.match(utility, /current\.due \+= units\(row\.dueInPeriod, decimals\)/);
  assert.match(screen, /summarizeSavedInstallmentsByCurrency\(rows\)/);
  assert.match(screen, /Summary by currency/);
  assert.match(screen, /All scheduled contracts: \{item\.totalScheduled\}/);
  assert.doesNotMatch(utility, /setState|createContract\(|updateContract\(|deleteContract\(/);
});
