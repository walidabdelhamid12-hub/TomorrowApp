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

  assert.match(source, /evaluateExactAmountExpression/);
  assert.match(source, /hasValidCurrencyPrecision/);
  assert.match(source, /parseAmount/);
  const exact = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/exactAmountArithmetic.ts'), 'utf8');
  assert.match(exact, /Number\.isFinite/);
  assert.match(exact, /units > MAX_SAFE/);
  assert.match(exact, /scaled % value.denominator/);
  assert.doesNotMatch(exact, /\beval\s*\(|\bnew Function\s*\(/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\bnew Function\s*\(/);
});