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

test('7.1E-1 income and expense distinguish transaction and account currencies', () => {
  assert.match(body, /: amountCurrencyCode/);
  assert.match(body, /const isCross = amountCurrency !== activeAccount\.currencyCode/);
  assert.ok(resolution >= 0 && guard > resolution);
  assert.ok(guard < body.indexOf('updateTransaction(current.id'));
  assert.ok(guard < body.indexOf('addTransaction({'));
  assert.match(modal, /const amountToRecord = manualDirectSelected \? manualAccountAmount : crossCurrencyPreview\?\.accountAmount/);
  assert.match(body, /const accountAmount = isCross \? amountToRecord! : value/);
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

test('7.1E-1 save paths use validated transaction or account amount', () => {
  const originalAmountSaves = body.match(/amount:\s*value\b/g) || [];
  const accountAmountSaves = body.match(/amount:\s*accountAmount\b/g) || [];

  assert.equal(originalAmountSaves.length, 1, 'Refund must retain original currency amount');
  assert.equal(accountAmountSaves.length, 2, 'Create and edit must save account currency amount');
  assert.ok(resolution < body.indexOf('amount: accountAmount'));
  assert.match(body, /const accountAmount = isCross/);
});
