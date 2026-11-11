const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const modal = read('src/features/finance/components/AddTransactionModal.tsx');
const helper = read('src/features/finance/utils/amountExpression.ts');

test('7.2C preserves native Android decimal keyboard', () => {
  assert.match(modal, /keyboardType="decimal-pad"/);
});

test('7.2C modal imports validated amount resolver', () => {
  assert.match(modal, /import\s*\{\s*resolveAmountExpression\s*\}/);
});

test('7.2C resolver delegates to safe calculator', () => {
  assert.match(helper, /import\s*\{\s*evaluateExpression\s*\}/);
  assert.match(helper, /evaluateExpression\(expression\)/);
});

test('7.2C blur and keyboard confirmation resolve expressions', () => {
  assert.match(modal, /onBlur=\{/);
  assert.match(modal, /onSubmitEditing=\{/);
  const calls = modal.match(/resolveAmountExpression\(amount,\s*currencyCode\)/g) || [];
  assert.ok(calls.length >= 2);
});

test('7.2C save resolves and rejects invalid amounts', () => {
  const submit = modal.slice(modal.indexOf('const submit = () => {'));
  assert.match(submit, /const value = resolveAmountExpression\(amount,\s*amountCurrency\)/);
  assert.match(submit, /if \(value === null\)/);
  assert.doesNotMatch(submit, /const value = parseAmount\(amount\)/);
});

test('7.2C resolver enforces currency precision', () => {
  assert.match(helper, /hasValidCurrencyPrecision/);
  assert.match(helper, /getCurrencyDecimals/);
  assert.match(helper, /value <= 0/);
});

test('7.2C preserves protected transaction checks', () => {
  assert.match(modal, /isProtectedTransaction\(current,/);
});
