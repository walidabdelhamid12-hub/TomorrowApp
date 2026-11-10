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

test('1.4 account form validates numeric input before invoking onSave', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/finance/components/AddAccountModal.tsx'), 'utf8');
  assert.match(source, /const parsed = parseAmount\(amount\)/);
  assert.match(source, /parsed === null \|\| parsed < 0/);
  assert.match(source, /Number\.isSafeInteger\(Math\.round\(parsed \* 1000\)\)/);
  assert.ok(source.indexOf('const parsed = parseAmount(amount)') < source.indexOf('onSave({'));
});

test('1.4 ledger uses shared runtime money guard before rounding', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/finance/store/useLedgerStore.ts'), 'utf8');
  assert.match(source, /!isFiniteMoneyInput\(input\.amount\)/);
  assert.match(source, /!isFiniteMoneyInput\(input\.initialBalance\)/);
  assert.match(source, /!isFiniteMoneyInput\(input\.creditLimit\)/);
  assert.match(source, /!isFiniteMoneyInput\(clean\.initialBalance\)/);
  assert.match(source, /!isFiniteMoneyInput\(clean\.creditLimit\)/);
  const rounding = source.indexOf('const amount = roundMoney(input.amount');
  assert.ok(rounding >= 0);
  assert.ok(source.indexOf('!isFiniteMoneyInput(input.amount)') < rounding);
});

test('1.4 runtime money guard rejects strings, nonfinite and nonnumeric values', () => {
  const { isFiniteMoneyInput } = require('../src/features/finance/utils/finance.ts');
  for (const invalid of ['100', '0', '', null, undefined, NaN, Infinity, -Infinity, {}, [], true]) {
    assert.equal(isFiniteMoneyInput(invalid), false, String(invalid));
  }
  for (const valid of [0, -1.234, 0.001, 100, 1.2345]) {
    assert.equal(isFiniteMoneyInput(valid), true, String(valid));
  }
});
