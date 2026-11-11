const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function loadTs(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: absolutePath,
  }).outputText;

  const module = { exports: {} };
  cache.set(absolutePath, module);

  function localRequire(specifier) {
    let target;
    if (specifier.startsWith('@/')) {
      target = path.resolve(root, 'src', specifier.slice(2));
    } else if (specifier.startsWith('.')) {
      target = path.resolve(path.dirname(absolutePath), specifier);
    } else {
      throw new Error(`Unexpected import: ${specifier}`);
    }
    return loadTs(path.relative(root, target + '.ts'));
  }

  new Function('require', 'module', 'exports', compiled)(
    localRequire, module, module.exports
  );
  return module.exports;
}

const { resolveAmountExpression } = loadTs(
  'src/features/finance/utils/amountExpression.ts'
);

test('floating-point cents normalize correctly', () => {
  assert.equal(resolveAmountExpression('0.1+0.2', 'USD'), 0.3);
});

test('USD rejects three decimal places', () => {
  assert.equal(resolveAmountExpression('1/8', 'USD'), null);
});

test('KWD accepts three decimal places', () => {
  assert.equal(resolveAmountExpression('1/8', 'KWD'), 0.125);
});

test('repeating decimal is rejected', () => {
  assert.equal(resolveAmountExpression('1/3', 'USD'), null);
});

test('unsafe integer expression is rejected', () => {
  assert.equal(
    resolveAmountExpression('9007199254740993+1', 'USD'),
    null
  );
});

test('large value cannot hide excess precision', () => {
  assert.equal(
    resolveAmountExpression('1000000000000+0.001', 'USD'),
    null
  );
});

test('ordinary two-decimal USD amount remains valid', () => {
  assert.equal(resolveAmountExpression('12345.67', 'USD'), 12345.67);
});