const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('src/features/finance/utils/expenseDateRange.ts', 'utf8');
const ts = require('typescript');
const body = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText.replace('export function previousExpensePeriod', 'function previousExpensePeriod');
const previousExpensePeriod = new Function('const exports = {}; ' + body + '\nreturn exports.previousExpensePeriod;')();

test('inclusive one-day previous period', () => {
  assert.deepEqual(previousExpensePeriod({ from: '2026-11-12', to: '2026-11-12' }), { from: '2026-11-11', to: '2026-11-11' });
});
test('arbitrary three-day period crossing month', () => {
  assert.deepEqual(previousExpensePeriod({ from: '2026-03-01', to: '2026-03-03' }), { from: '2026-02-26', to: '2026-02-28' });
});
test('leap year inclusive range', () => {
  assert.deepEqual(previousExpensePeriod({ from: '2024-03-01', to: '2024-03-01' }), { from: '2024-02-29', to: '2024-02-29' });
});
test('reject invalid and reversed dates', () => {
  assert.throws(() => previousExpensePeriod({ from: '2026-02-30', to: '2026-03-01' }));
  assert.throws(() => previousExpensePeriod({ from: '2026-11-13', to: '2026-11-12' }));
});
