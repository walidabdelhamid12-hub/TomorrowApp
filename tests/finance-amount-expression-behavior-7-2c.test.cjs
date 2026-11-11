const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const moduleCache = new Map();

function loadTs(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath).exports;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const localRequire = (specifier) => {
    let target;

    if (specifier.startsWith('@/')) {
      target = path.resolve(root, 'src', specifier.slice(2));
    } else if (specifier.startsWith('.')) {
      target = path.resolve(path.dirname(absolutePath), specifier);
    } else {
      throw new Error(`Unexpected import: ${specifier}`);
    }

    return loadTs(path.relative(root, target + '.ts'));
  };

  new Function('require', 'module', 'exports', compiled)(
    localRequire,
    module,
    module.exports
  );

  return module.exports;
}

const { resolveAmountExpression } = loadTs(
  'src/features/finance/utils/amountExpression.ts'
);

test('addition', () => {
  assert.equal(resolveAmountExpression('12+3', 'USD'), 15);
});

test('division using calculator symbol', () => {
  assert.equal(resolveAmountExpression('100÷4', 'USD'), 25);
});

test('division using Android keyboard slash', () => {
  assert.equal(resolveAmountExpression('100/4', 'USD'), 25);
});

test('operator precedence', () => {
  assert.equal(resolveAmountExpression('2+3*4', 'USD'), 14);
});

test('ordinary numeric amount', () => {
  assert.equal(resolveAmountExpression('12.50', 'USD'), 12.5);
});

test('incomplete expression rejected', () => {
  assert.equal(resolveAmountExpression('12+', 'USD'), null);
});

test('invalid expression rejected', () => {
  assert.equal(resolveAmountExpression('2++3', 'USD'), null);
});

test('division by zero rejected', () => {
  assert.equal(resolveAmountExpression('1/0', 'USD'), null);
});

test('excess currency precision rejected', () => {
  assert.equal(resolveAmountExpression('1/16', 'USD'), null);
});

test('floating-point arithmetic accepts valid cents', () => {
  assert.equal(resolveAmountExpression('0.1+0.2', 'USD'), 0.3);
});

test('negative and zero results rejected', () => {
  assert.equal(resolveAmountExpression('2-3', 'USD'), null);
  assert.equal(resolveAmountExpression('2-2', 'USD'), null);
});