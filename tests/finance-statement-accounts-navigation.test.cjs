const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
test('Accounts report preserves month and optional account in statement navigation', () => {
  const report = read('app/finance/report-accounts.tsx');
  assert.match(report, /pathname: '\/finance\/statement-accounts'/);
  assert.match(report, /params: \{ month, \.\.\.\(accountId \? \{ accountId \} : \{\}\) \}/);
});
test('Accounts statement uses the same reconciled report and transfer legs without writes', () => {
  const screen = read('app/finance/statement-accounts.tsx');
  assert.match(screen, /aggregateAccountsReport\(\{ accounts, categories, transactions, transfers \}, period/);
  assert.match(screen, /row\.status === 'available' && row\.reconciled/);
  assert.match(screen, /t\.fromAmount \?\? t\.amount/);
  assert.match(screen, /t\.toAmount \?\? t\.amount/);
  assert.match(screen, /Credit-card repayments are transfer legs/);
  assert.doesNotMatch(screen, /addTransaction|updateTransaction|deleteTransaction|addTransfer|setState/);
});
