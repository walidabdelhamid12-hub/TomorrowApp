const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/calculator.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const m = { exports: {} };
new Function('module', 'exports', js)(m, m.exports);
const { evaluateExpression } = m.exports;

test('7.2 parentheses basic and precedence', () => {
  assert.equal(evaluateExpression('(10+5)×2'), 30);
  assert.equal(evaluateExpression('100÷(2+3)'), 20);
  assert.equal(evaluateExpression('2+3×4'), 14);
});

test('7.2 nested parentheses', () => {
  assert.equal(evaluateExpression('2×(3+(4×5))'), 46);
});

test('7.2 malformed parentheses rejected', () => {
  for (const expr of ['(10+5', '10+5)', '()', '2(3+4)', '(2+3)(4+5)', '(2+)']) {
    assert.equal(evaluateExpression(expr), null, expr);
  }
});

test('7.2 division by zero and invalid operators rejected', () => {
  for (const expr of ['10÷(5-5)', '(2++3)', '(2--3)']) {
    assert.equal(evaluateExpression(expr), null, expr);
  }
});

test('7.2 unsafe integers and valid decimals', () => {
  assert.equal(evaluateExpression('(9007199254740992+1)'), null);
  assert.equal(evaluateExpression('(1.5+2.5)×2'), 8);
});
test('7.2 maximum parentheses depth', () => {
  for (const depth of [20, 32]) {
    assert.equal(evaluateExpression('('.repeat(depth) + '1' + ')'.repeat(depth)), 1);
  }
  for (const depth of [33, 100]) {
    assert.equal(evaluateExpression('('.repeat(depth) + '1' + ')'.repeat(depth)), null);
  }
});