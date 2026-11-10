const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function(id, parent, main) {
  return originalLoad.call(
    this,
    id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id,
    parent,
    main
  );
};
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename
  }).outputText, filename);
};

const { calculateCrossCurrency } =
  require('../src/features/finance/utils/crossCurrency.ts');

const date = '2026-11-08';
const fx = (currency, rate) => ({
  sourceCurrencyCode: currency,
  referenceCurrencyCode: 'EGP',
  rate,
  rateDate: date,
  source: 'manual'
});
const input = {
  originalAmount: 10,
  originalCurrencyCode: 'USD',
  accountCurrencyCode: 'OMR',
  transactionDate: date,
  originalFx: fx('USD', 50),
  accountFx: fx('OMR', 130)
};

test('historical estimate uses OMR 3 decimal places', () => {
  const result = calculateCrossCurrency(input);
  assert.equal(result.estimatedAccountAmount, 3.846);
  assert.equal(result.accountAmount, 3.846);
  assert.equal(result.usedActualAmount, false);
});

test('actual bank debit overrides estimate once', () => {
  const result = calculateCrossCurrency({ ...input, actualAccountAmount: 3.9 });
  assert.equal(result.estimatedAccountAmount, 3.846);
  assert.equal(result.accountAmount, 3.9);
  assert.equal(result.effectiveAccountRate, 0.39);
  assert.equal(result.usedActualAmount, true);
});

test('same currency produces original amount', () => {
  const result = calculateCrossCurrency({
    ...input,
    accountCurrencyCode: 'USD',
    accountFx: fx('USD', 50)
  });
  assert.equal(result.accountAmount, 10);
});

test('invalid zero or negative rates are rejected', () => {
  assert.equal(calculateCrossCurrency({
    ...input, accountFx: fx('OMR', 0)
  }), null);
});

test('stale historical snapshot is rejected', () => {
  assert.equal(calculateCrossCurrency({
    ...input, accountFx: { ...input.accountFx, rateDate: '2026-11-07' }
  }), null);
});

test('bank amount cannot exceed currency precision', () => {
  assert.equal(calculateCrossCurrency({
    ...input, actualAccountAmount: 3.9009
  }), null);
});

test('original amount must respect original currency precision', () => {
  assert.equal(calculateCrossCurrency({
    ...input, originalAmount: 10.001
  }), null);
});

test('nonfinite amounts are rejected', () => {
  assert.equal(calculateCrossCurrency({
    ...input, actualAccountAmount: Infinity
  }), null);
});