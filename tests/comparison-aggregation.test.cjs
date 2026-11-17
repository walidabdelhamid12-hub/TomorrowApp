/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id.startsWith('@/')) return originalLoad.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return originalLoad.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    module._compile(output, filename);
  };
}

const { buildOperatingComparison } = require('../src/features/finance/utils/comparisonAggregation.ts');

function report(overrides = {}) {
  return {
    period: { from: '2026-11-01', to: '2026-11-16' },
    currencies: [{
      currencyCode: 'EGP', income: 100, expenses: 40, net: 60,
      minorUnits: { income: 10000, expenses: 4000, net: 6000 },
    }],
    incomeCategories: [{ currencyCode: 'EGP', categoryId: 'salary', amount: 100 }],
    expenseCategories: [{ currencyCode: 'EGP', categoryId: 'food', amount: 40 }],
    unknown: [], includedTransactions: 2, ...overrides,
  };
}

test('calculates net and ratio using exact minor units', () => {
  const result = buildOperatingComparison(report());
  assert.equal(result.currencies[0].netDifference, 60);
  assert.equal(result.currencies[0].spendingRatio, 40);
  assert.equal(result.verified, true);
});
test('keeps currencies separate', () => {
  const result = buildOperatingComparison(report({ currencies: [
    { currencyCode: 'EGP', income: 100, expenses: 40, net: 60, minorUnits: { income: 10000, expenses: 4000, net: 6000 } },
    { currencyCode: 'OMR', income: 2, expenses: 1, net: 1, minorUnits: { income: 2000, expenses: 1000, net: 1000 } },
  ] }));
  assert.deepEqual(result.currencies.map(x => x.currencyCode), ['EGP', 'OMR']);
});
test('ratio is null for zero income', () => {
  const result = buildOperatingComparison(report({ currencies: [
    { currencyCode: 'EGP', income: 0, expenses: 12, net: -12, minorUnits: { income: 0, expenses: 1200, net: -1200 } },
  ] }));
  assert.equal(result.currencies[0].spendingRatio, null);
  assert.equal(result.currencies[0].netDifference, -12);
});
test('ratio may exceed 100 percent', () => {
  const result = buildOperatingComparison(report({ currencies: [
    { currencyCode: 'EGP', income: 10, expenses: 15, net: -5, minorUnits: { income: 1000, expenses: 1500, net: -500 } },
  ] }));
  assert.equal(result.currencies[0].spendingRatio, 150);
});
test('unknown transactions make report unverified', () => {
  const result = buildOperatingComparison(report({ unknown: [{ id: 'x', date: '2026-11-04', reason: 'Unknown' }] }));
  assert.equal(result.verified, false);
});
test('missing minor units fail closed', () => {
  assert.throws(() => buildOperatingComparison(report({ currencies: [
    { currencyCode: 'EGP', income: 100, expenses: 40, net: 60 },
  ] })), /Exact minor-unit totals unavailable/);
});
test('display totals must match exact units', () => {
  assert.throws(() => buildOperatingComparison(report({ currencies: [
    { currencyCode: 'EGP', income: 101, expenses: 40, net: 61, minorUnits: { income: 10000, expenses: 4000, net: 6000 } },
  ] })), /Displayed totals do not match/);
});
