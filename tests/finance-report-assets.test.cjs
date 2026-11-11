/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    module._compile(output.outputText, filename);
  };
}
const { aggregateAssetsReport } = require('../src/features/finance/utils/reportAssets.ts');
const period = { from: '2026-11-01', to: '2026-11-30' };
const asset = (entries = [], overrides = {}) => ({
  id: 'a1', name: 'Gold', category: 'gold', karat: 24,
  entries: entries.map((e, i) => ({ id: `e${i}`, ...e })), ...overrides,
});

test('opening, additions, withdrawals, closing and net reconcile', () => {
  const [r] = aggregateAssetsReport([asset([
    { date: '2026-10-31', amount: 10.125 },
    { date: '2026-11-01', amount: 2.375 },
    { date: '2026-11-30', amount: -1.125 },
    { date: '2026-12-01', amount: 9 },
  ])], period);
  assert.equal(r.status, 'available');
  assert.deepEqual([r.openingQuantity, r.additions, r.withdrawals, r.closingQuantity, r.netChange],
    [10.125, 2.375, 1.125, 11.375, 1.25]);
  assert.equal(r.historicalValuationStatus, 'historical_data_unavailable');
});

test('empty history is a known zero quantity, not a fabricated valuation', () => {
  const [r] = aggregateAssetsReport([asset([])], period);
  assert.equal(r.closingQuantity, 0);
  assert.equal(r.historicalValuationStatus, 'historical_data_unavailable');
});

test('separate assets and currencies are never combined', () => {
  const result = aggregateAssetsReport([
    asset([{ date: '2026-11-02', amount: 3 }]),
    asset([{ date: '2026-11-02', amount: 5.125 }],
      { id: 'a2', category: 'foreign_currency', currencyCode: 'USD', name: 'Dollars' }),
  ], period);
  assert.deepEqual(result.map(x => [x.unit, x.closingQuantity]), [['g', 3], ['USD', 5.125]]);
});

test('malformed dates fail closed, including outside period', () => {
  const [r] = aggregateAssetsReport([asset([{ date: '2026-02-30', amount: 1 }])], period);
  assert.equal(r.status, 'historical_data_unavailable');
  assert.equal(r.closingQuantity, null);
});

test('unsafe precision fails closed rather than rounding silently', () => {
  const [r] = aggregateAssetsReport([asset([{ date: '2026-11-01', amount: 0.0001 }])], period);
  assert.equal(r.status, 'historical_data_unavailable');
});

test('duplicate entry IDs fail closed', () => {
  const [r] = aggregateAssetsReport([asset([
    { id: 'dup', date: '2026-11-01', amount: 1 },
    { id: 'dup', date: '2026-11-02', amount: 1 },
  ])], period);
  assert.equal(r.status, 'historical_data_unavailable');
});

test('duplicate asset IDs fail closed for both records', () => {
  const rows = aggregateAssetsReport([asset(), asset()], period);
  assert.ok(rows.every(r => r.status === 'historical_data_unavailable'));
});

test('invalid periods reject including non-leap February', () => {
  assert.throws(() => aggregateAssetsReport([], { from: '2025-02-29', to: '2025-03-01' }));
  assert.throws(() => aggregateAssetsReport([], { from: '2026-12-01', to: '2026-11-01' }));
  assert.doesNotThrow(() => aggregateAssetsReport([], { from: '2024-02-29', to: '2024-02-29' }));
});

test('frozen inputs are never modified', () => {
  const e = Object.freeze({ id: 'e1', date: '2026-11-01', amount: -0.125 });
  const a = Object.freeze(asset([], { entries: Object.freeze([e]) }));
  const p = Object.freeze({ ...period });
  assert.equal(aggregateAssetsReport(Object.freeze([a]), p)[0].withdrawals, 0.125);
});

test('unsafe aggregate overflow is unavailable', () => {
  const large = 9007199254740;
  const [r] = aggregateAssetsReport([asset([
    { date: '2026-11-01', amount: large },
    { date: '2026-11-02', amount: large },
  ])], period);
  assert.equal(r.status, 'historical_data_unavailable');
});
