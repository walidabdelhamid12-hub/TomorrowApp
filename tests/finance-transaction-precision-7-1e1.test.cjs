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
  assert.equal((body.match(/operationId => addTransaction\(input, operationId\)/g) || []).length, 2);
  assert.ok(guard < body.indexOf('operationId => addTransaction(input, operationId)'));
  assert.match(modal, /const amountToRecord = manualDirectSelected \? manualAccountAmount : crossCurrencyPreview\?\.accountAmount/);
  assert.match(body, /const accountAmount = isCross \? amountToRecord! : value/);
});

test('7.1E-1 refund uses original transaction currency', () => {
  assert.match(body, /entryMode === 'refund'/);
  assert.match(body, /selectedOriginal\?\.transaction.originalCurrencyCode \?\? selectedOriginal\?\.transaction.currencyCode/);
  const refundSave = body.indexOf("if (entryMode === 'refund')", guard);
  assert.ok(refundSave > guard);
  assert.match(body, /value > selectedOriginal.remainingAmount/);
});

test('7.1E-1 resolver rejects invalid amounts and precision', () => {
  assert.match(resolver, /hasValidCurrencyPrecision/);
  assert.match(resolver, /if \(!text \|\| text\.length > 256 \|\| !isSupportedCurrency\(currencyCode\)\) return null/);
  assert.match(resolver, /exactAmountToNumber\(exact, getCurrencyDecimals\(currencyCode\)\)/);
  assert.match(read('src/features/finance/utils/exactAmountArithmetic.ts'), /value\.numerator <= 0n/);
  assert.match(resolver, /return null/);
});

test('7.1E-1 protected transactions remain blocked', () => {
  const protection = body.indexOf('isProtectedTransaction(current,');
  assert.ok(protection >= 0 && protection < resolution);
  assert.match(body, /Manage its payment from Loans or Debts/);
});

test('7.1E-1 save paths use validated transaction or account amount', () => {
  const refundCreditSaves = body.match(/amount:\s*credit\b/g) || [];
  const accountAmountSaves = body.match(/amount:\s*accountAmount\b/g) || [];

  assert.equal(refundCreditSaves.length, 1, 'Ledger stores the actual bank credit');
  assert.match(body, /originalAmount: value/);
  assert.equal(accountAmountSaves.length, 2, 'Create and edit must save account currency amount');
  assert.ok(resolution < body.indexOf('amount: accountAmount'));
  assert.match(body, /const accountAmount = isCross/);
});
