const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function(id, parent, main) {
  return originalLoad.call(this,
    id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id,
    parent, main);
};
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename
  }).outputText, filename);
};

const { isValidCrossCurrencyMetadata } =
  require('../src/features/finance/utils/crossCurrencyMetadata.ts');

const date = '2026-11-08';
const fx = (currency, rate) => ({
  sourceCurrencyCode: currency,
  referenceCurrencyCode: 'EGP',
  rate,
  rateDate: date,
  source: 'manual'
});
const valid = {
  amount: 3.9,
  currencyCode: 'OMR',
  date,
  originalAmount: 10,
  originalCurrencyCode: 'USD',
  accountFxRate: 0.39,
  accountFxSnapshot: fx('USD', 50),
  historicalFx: fx('OMR', 130)
};

test('legacy transaction without metadata remains valid', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    amount: 10, currencyCode: 'OMR', date
  }), true);
});

test('complete metadata with actual bank amount is valid', () => {
  assert.equal(isValidCrossCurrencyMetadata(valid), true);
});

test('partial metadata is rejected', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...valid, accountFxSnapshot: undefined
  }), false);
});

test('wrong original currency evidence is rejected', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...valid, accountFxSnapshot: fx('EUR', 50)
  }), false);
});

test('stale original FX evidence is rejected', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...valid, accountFxSnapshot: {
      ...valid.accountFxSnapshot, rateDate: '2026-11-07'
    }
  }), false);
});

test('incorrect effective account rate is rejected', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...valid, accountFxRate: 0.3846
  }), false);
});

test('excessive account-currency precision is rejected', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...valid, amount: 3.9009
  }), false);
});

test('same-currency metadata is rejected by cross-currency validator', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...valid, originalCurrencyCode: 'OMR',
    accountFxSnapshot: fx('OMR', 130)
  }), false);
});