const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/components/TransferModal.tsx'), 'utf8');
const start = source.indexOf('const submit = () => {');
const end = source.indexOf('\n  return (', start);
assert.ok(start >= 0 && end > start, 'Submit handler not found');
const body = source.slice(start, end);
const guard = body.indexOf('hasValidCurrencyPrecision(fromAmount, source.currencyCode)');

test('7.1E-2 transfer amount uses source currency precision', () => {
  assert.ok(guard >= 0, 'Source currency precision guard missing');
  assert.match(body, /getCurrencyDecimals\(source.currencyCode\)/);
  assert.match(body, /Invalid amount precision/);
  assert.ok(guard > body.indexOf('if (amount === null || amount <= 0)'));
});

test('7.1E-2 guard runs before transfer creation and editing', () => {
  assert.ok(guard >= 0);
  assert.match(body, /mode === 'credit_card_payment'/);
  assert.ok(guard < body.indexOf('addTransfer(') || guard < body.indexOf('addTransfer({'));
  assert.ok(guard < body.indexOf('updateTransfer('));
});

test('7.1E-2 exchange rate keeps independent validation', () => {
  assert.match(body, /const rate = parseAmount\(exchangeRate\)/);
  assert.match(body, /rate === null \|\| rate <= 0/);
  assert.doesNotMatch(body, /hasValidCurrencyPrecision\(exchangeRate/);
  assert.doesNotMatch(body, /getCurrencyDecimals\(destination.currencyCode\)/);
});