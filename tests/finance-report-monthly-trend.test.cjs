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
const { aggregateMonthlyOperatingTrend: trend } = require('../src/features/finance/utils/reportMonthlyTrend.ts');
const tx = (id, type, amount, date, extra = {}) => ({
  id, type, amount, date, accountId: 'egp', currencyCode: 'EGP', categoryId: 'food', ...extra,
});
const ctx = (transactions = []) => ({
  ledger: { accounts: [{ id: 'egp', currencyCode: 'EGP' }, { id: 'omr', currencyCode: 'OMR' }, { id: 'usd', currencyCode: 'USD' }],
    transactions, transfers: [], categories: [] },
  finance: { assets: [], loans: [], debts: [], cheques: [] },
});
const point = (result, currency, index) => result.currencies.find(c => c.currencyCode === currency).points[index];

test('one month and empty known zeros', () => {
  const r = trend(ctx(), '2026-11', 1);
  assert.equal(r.months.length, 1);
  assert.equal(r.months[0].status, 'no_transactions');
  assert.deepEqual(point(r, 'EGP', 0), { month: '2026-11', status: 'no_operating_activity', income: 0, expenses: 0, net: 0 });
});
test('24 months chronological across year boundary', () => {
  const r = trend(ctx(), '2025-12', 24);
  assert.equal(r.months.length, 24);
  assert.equal(r.months[0].month, '2025-12');
  assert.equal(r.months[23].month, '2027-11');
});
test('leap year and century boundaries', () => {
  assert.equal(trend(ctx(), '2024-02', 1).months[0].report.period.to, '2024-02-29');
  assert.equal(trend(ctx(), '2100-02', 1).months[0].report.period.to, '2100-02-28');
});
test('filters are applied identically to every month', () => {
  const r = trend(ctx([
    tx('a', 'income', 5, '2026-10-01'),
    tx('b', 'income', 8, '2026-11-01', { categoryId: 'other' }),
    tx('c', 'income', 3, '2026-11-02'),
  ]), '2026-10', 2, { accountId: 'egp', categoryId: 'food' });
  assert.equal(point(r, 'EGP', 0).income, 5);
  assert.equal(point(r, 'EGP', 1).income, 3);
});
test('refund retains original category and negative expense', () => {
  const r = trend(ctx([
    tx('buy', 'expense', 10, '2026-10-01'),
    tx('refund', 'expense', 3, '2026-11-01', { entryType: 'refund', relatedTransactionId: 'buy', categoryId: 'other' }),
  ]), '2026-10', 2, { categoryId: 'food' });
  assert.equal(point(r, 'EGP', 1).expenses, -3);
  assert.equal(point(r, 'EGP', 1).net, 3);
});
test('currencies remain separate with three decimal precision', () => {
  const r = trend(ctx([tx('omr', 'income', 0.003, '2026-11-01', { accountId: 'omr', currencyCode: 'OMR' }),
    tx('egp', 'expense', 0.02, '2026-11-02')]), '2026-11', 1);
  assert.equal(point(r, 'OMR', 0).income, 0.003);
  assert.equal(point(r, 'EGP', 0).expenses, 0.02);
});
test('unknown and invalid dates fail closed for every currency', () => {
  const r = trend(ctx([tx('bad', 'income', 2, '2026-11-31')]), '2026-10', 2);
  for (const month of r.months) assert.equal(month.status, 'incomplete');
  for (const currency of r.currencies) for (const p of currency.points) assert.equal(p.income, null);
});
test('protected financing is not counted as ordinary income', () => {
  const r = trend(ctx([tx('protected', 'income', 50, '2026-11-01', { purpose: 'loan_receipt' })]), '2026-11', 1);
  assert.equal(r.months[0].status, 'incomplete');
  assert.equal(point(r, 'EGP', 0).income, null);
});
test('invalid inputs and out of range reject', () => {
  for (const [month, count] of [['2026-1', 1], ['0000-01', 1], ['2026-11', 0], ['2026-11', 25], ['9999-12', 2]]) {
    assert.throws(() => trend(ctx(), month, count), /Invalid monthly trend range/);
  }
  assert.throws(() => trend(ctx(), '2026-11', 1, { accountId: '' }), /Invalid report filter/);
});
test('frozen inputs remain unchanged', () => {
  const data = ctx([tx('x', 'income', 5, '2026-11-01')]);
  const freeze = o => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); };
  freeze(data);
  const r = trend(data, '2026-11', 1);
  assert.equal(point(r, 'EGP', 0).income, 5);
});
