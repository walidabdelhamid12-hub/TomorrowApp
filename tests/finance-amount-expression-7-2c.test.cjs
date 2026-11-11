const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('7.2C amount expression helper has safety boundaries', () => {
  const file = path.join(
    __dirname,
    '../src/features/finance/utils/amountExpression.ts'
  );
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /evaluateExpression/);
  assert.match(source, /hasValidCurrencyPrecision/);
  assert.match(source, /parseAmount/);
  assert.match(source, /Number\.isFinite/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\bnew Function\s*\(/);
});