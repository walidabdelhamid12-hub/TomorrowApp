const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const modal = read('src/features/finance/components/AddTransactionModal.tsx');
const resolver = read('src/features/finance/utils/amountExpression.ts');

const start = modal.indexOf('const submit = () => {');
const end = modal.indexOf('\n  return (', start);
assert.ok(start >= 0 && end > start, 'Submit handler not found');

const body = modal.slice(start, end);
const guard = body.indexOf('if (value === null)');
const resolution = body.indexOf('const value = resolveAmountExpression(amount, amountCurrency)');

test('7.1E-1 income and expense use selected account currency', () => {
  assert.match(body, /activeAccount\?\.currencyCode/);
  assert.ok(resolution >= 0 && guard > resolution);
  assert.ok(guard < body.indexOf('updateTransaction(transaction.id'));
  assert.ok(guard < body.indexOf('addTransaction({'));
});

test('7.1E-1 refund uses original transaction currency', () => {
  assert.match(body, /entryMode === 'refund'/);
  assert.match(body, /selectedOriginal\?\.transaction.currencyCode/);
  const refundSave = body.indexOf("if (entryMode === 'refund')", guard);
  assert.ok(refundSave > guard);
  assert.match(body, /value > selectedOriginal.remainingAmount/);
});

test('7.1E-1 resolver rejects invalid amounts and precision', () => {
  assert.match(resolver, /hasValidCurrencyPrecision/);
  assert.match(resolver, /if \(!text\) return null/);
  assert.match(resolver, /value <= 0/);
  assert.match(resolver, /return null/);
});

test('7.1E-1 protected transactions remain blocked', () => {
  const protection = body.indexOf('isProtectedTransaction(current,');
  assert.ok(protection >= 0 && protection < resolution);
  assert.match(body, /Manage its payment from Loans or Debts/);
});

test('7.1E-1 all save paths use validated value', () => {
  const matches = body.match(/amount: value/g) || [];
  assert.equal(matches.length, 3);
  assert.ok(resolution < body.indexOf('amount: value'));
});
