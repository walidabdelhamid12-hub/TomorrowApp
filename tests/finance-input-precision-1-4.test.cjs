const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  return originalLoad.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);
const { parseAmount } = require('../src/features/finance/utils/money.ts');
const { formatAmount } = require('../src/features/finance/utils/amountFormat.ts');
const { roundMoney } = require('../src/features/finance/utils/finance.ts');

test('1.4 parser accepts canonical western, Arabic and Persian numbers', () => {
  for (const [text, expected] of [
    ['1,234.567', 1234.567], ['١٬٢٣٤٫٥٦٧', 1234.567],
    ['۱۲۳۴٫۵', 1234.5], ['.5', 0.5], ['-0.125', -0.125],
    [' 12. ', 12], ['0', 0],
  ]) assert.equal(parseAmount(text), expected, text);
});
test('1.4 parser rejects ambiguous grouping, invalid and nonfinite values', () => {
  for (const text of ['', ' ', '1,23', '12,34', '1.2.3', '1 234',
    '1e3', 'Infinity', 'NaN', '--1', '+1', '1,234,56',
    '1٫2,3', '1.234,56', '1'.padEnd(400, '0')]) {
    assert.equal(parseAmount(text), null, text);
  }
});
test('1.4 display rounding remains symmetric at decimal ties', () => {
  assert.equal(formatAmount(1.005, 'EGP'), '1.01');
  assert.equal(formatAmount(-1.005, 'EGP'), '-1.01');
  assert.equal(formatAmount(1.2345, 'OMR'), '1.235');
  assert.equal(formatAmount(-1.2345, 'OMR'), '-1.235');
});
test('1.4 identify legacy rounding behavior without silently changing stored arithmetic', () => {
  assert.equal(roundMoney(1.2345), 1.235);
  assert.equal(roundMoney(-1.2345), -1.234);
});
