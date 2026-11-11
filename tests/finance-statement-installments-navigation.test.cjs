const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('Installments report forwards month to schedule statement', () => {
  const report = read('app/finance/report-installments.tsx');
  assert.match(report, /pathname: '\/finance\/statement-installments', params: \{ month \}/);
  assert.match(report, /accessibilityLabel="View Statement"/);
});
test('Installments statement only projects scheduled due dates', () => {
  const screen = read('app/finance/statement-installments.tsx');
  assert.match(screen, /aggregateSavedInstallmentsReport\(saved\.contracts, period\.from, period\.to\)/);
  assert.match(screen, /item\.dueDate >= period\.from && item\.dueDate <= period\.to/);
  assert.match(screen, /Paid, overdue and remaining balances are not verified/);
  assert.doesNotMatch(screen, /createContract|updateContract|deleteContract|setState|postingAllowed\s*=\s*true/);
});
