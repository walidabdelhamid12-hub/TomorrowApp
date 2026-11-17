/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function(id, parent, main) {
  if (id.startsWith('@/')) return originalLoad.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return originalLoad.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { buildComparisonStatement, buildComparisonExportTable } = require('../src/features/finance/utils/comparisonStatement.ts');
const { buildComparisonTrend } = require('../src/features/finance/utils/comparisonTrend.ts');
const aggregation = require('../src/features/finance/utils/reportAggregation.ts');
const period = { from: '2026-01-15', to: '2026-03-12' };
function fixture() {
  const comparison = { verified: true, unknown: [], period,
    currencies: [{ currencyCode: 'EGP', income: 100, expenses: 35, netDifference: 65,
      minorUnits: { income: 10000, expenses: 3500, netDifference: 6500 } }] };
  const income = { reconciled: true, report: { period, unknown: [] }, rows: [
    { id: 'i1', date: '2026-02-01', accountId: 'a', categoryId: 'salary', currencyCode: 'EGP', amount: 100 } ] };
  const expenses = { reconciled: true, report: { period, unknown: [] }, rows: [
    { id: 'e1', date: '2026-02-05', accountId: 'a', categoryId: 'food', currencyCode: 'EGP', amount: 50 },
    { id: 'r1', date: '2026-02-08', accountId: 'a', categoryId: 'food', currencyCode: 'EGP', amount: -15 } ] };
  return { comparison, income, expenses };
}
test('statement reconciles income and net expenses including refund', () => {
  const f = fixture(); const rows = buildComparisonStatement(f.comparison, f.income, f.expenses, 'EGP');
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(r => r.kind === 'Expenses').reduce((s,r) => s + r.amount, 0), 35);
  assert.deepEqual(rows.map(r => r.id), ['r1','e1','i1']);
});
test('statement rejects incomplete comparison and unreconciled streams', () => {
  const f = fixture(); f.comparison.verified = false;
  assert.throws(() => buildComparisonStatement(f.comparison, f.income, f.expenses, 'EGP'), /not verified/);
  f.comparison.verified = true; f.expenses.reconciled = false;
  assert.throws(() => buildComparisonStatement(f.comparison, f.income, f.expenses, 'EGP'), /not verified/);
});
test('statement rejects tampered totals, duplicate IDs, unsafe amounts and date drift', () => {
  for (const kind of ['total', 'duplicate', 'precision', 'date']) {
    const f = fixture();
    if (kind === 'total') f.comparison.currencies[0].minorUnits.expenses = 3600;
    if (kind === 'duplicate') f.expenses.rows[0].id = 'i1';
    if (kind === 'precision') f.expenses.rows[0].amount = 50.001;
    if (kind === 'date') f.expenses.rows[0].date = '2025-12-31';
    assert.throws(() => buildComparisonStatement(f.comparison, f.income, f.expenses, 'EGP'), undefined, kind);
  }
});
test('statement keeps currencies isolated', () => {
  const f = fixture(); f.income.rows.push({ id:'i2', date:'2026-02-01', accountId:'a', categoryId:'salary', currencyCode:'OMR', amount: 2 });
  assert.equal(buildComparisonStatement(f.comparison, f.income, f.expenses, 'EGP').length, 3);
  assert.throws(() => buildComparisonStatement(f.comparison, f.income, f.expenses, 'OMR'), /currency is unavailable/);
});
test('export table contains verified rows and rejects missing names', () => {
  const f = fixture(); const names = { accounts: new Map([['a','Cash']]), categories: new Map([['salary','Salary'],['food','Food']]) };
  const table = buildComparisonExportTable(f.comparison, f.income, f.expenses, 'EGP', names);
  assert.equal(table.verified, true); assert.equal(table.rows.length, 3);
  assert.deepEqual(table.numericColumns, [5]); assert.equal(table.rows[0][1], 'Expenses');
  assert.throws(() => buildComparisonExportTable(f.comparison, f.income, f.expenses, 'EGP', { ...names, accounts: new Map() }), /Missing comparison statement names/);
});
test('trend splits partial months and reconciles exact units', () => {
  const original = aggregation.aggregateOperatingReport;
  aggregation.aggregateOperatingReport = (_ctx, slice) => {
    const month = slice.from.slice(0, 7);
    const data = { '2026-01':[1000,500], '2026-02':[7000,2000], '2026-03':[2000,1000] }[month];
    return { unknown: [], currencies: [{ currencyCode:'EGP', minorUnits: { income:data[0], expenses:data[1] } }] };
  };
  try {
    const overall = { period, unknown:[], currencies:[{currencyCode:'EGP',minorUnits:{income:10000,expenses:3500}}] };
    const result = buildComparisonTrend({}, period, {}, overall, 'EGP');
    assert.equal(result.verified, true); assert.equal(result.points.length, 3);
    assert.deepEqual(result.points[0].period, {from:'2026-01-15',to:'2026-01-31'});
    assert.deepEqual(result.points[2].period, {from:'2026-03-01',to:'2026-03-12'});
    overall.currencies[0].minorUnits.income = 10001;
    assert.equal(buildComparisonTrend({}, period, {}, overall, 'EGP').verified, false);
  } finally { aggregation.aggregateOperatingReport = original; }
});
test('trend fails closed on unknown transactions, invalid dates, missing minor units', () => {
  const overall = { period, unknown:[{id:'x'}], currencies:[{currencyCode:'EGP',minorUnits:{income:0,expenses:0}}] };
  assert.equal(buildComparisonTrend({}, period, {}, overall, 'EGP').verified, false);
  overall.unknown = [];
  assert.equal(buildComparisonTrend({}, {from:'2026-03-12',to:'2026-01-15'}, {}, overall, 'EGP').verified, false);
  overall.currencies[0].minorUnits = undefined;
  assert.equal(buildComparisonTrend({}, period, {}, overall, 'EGP').verified, false);
});
