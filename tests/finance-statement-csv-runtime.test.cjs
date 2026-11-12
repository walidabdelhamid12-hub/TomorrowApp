const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/statementCsv.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { serializeStatementCsv } = mod.exports;
const period = { from: '2026-01-01', to: '2026-01-31', title: 'Income' };
const row = { date: '2026-01-02', account: 'Bank', category: 'Salary', note: 'OK', amount: '-125.50', currency: 'EGP' };

test('CSV runtime keeps negative numeric cells and BOM', () => {
  const csv = serializeStatementCsv([row], period);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"-125.50"'));
  assert.ok(!csv.includes('"\'-125.50"'));
  assert.ok(csv.endsWith('\r\n'));
});
test('CSV runtime escapes user text formulas and embedded quotes', () => {
  const csv = serializeStatementCsv([{ ...row, account: '=SUM(A1)', category: '@cmd', note: 'hello "world"\nnext' }], period);
  assert.ok(csv.includes('"\'=SUM(A1)"'));
  assert.ok(csv.includes('"\'@cmd"'));
  assert.ok(csv.includes('"hello ""world""\nnext"'));
});
test('CSV runtime rejects impossible dates and out-of-period rows', () => {
  assert.throws(() => serializeStatementCsv([row], { ...period, from: '2026-02-30' }), /metadata/);
  assert.throws(() => serializeStatementCsv([{ ...row, date: '2026-02-29' }], { from: '2026-02-01', to: '2026-02-28', title: 'Income' }), /row/);
  assert.throws(() => serializeStatementCsv([{ ...row, date: '2026-02-01' }], period), /row/);
  assert.doesNotThrow(() => serializeStatementCsv([{ ...row, date: '2024-02-29' }], { from: '2024-02-01', to: '2024-02-29', title: 'Income' }));
});
test('CSV runtime rejects malformed numeric amounts and currency codes', () => {
  for (const amount of ['=1+1', '1,000', 'NaN', '1e6']) {
    assert.throws(() => serializeStatementCsv([{ ...row, amount }], period), /row/);
  }
  assert.throws(() => serializeStatementCsv([{ ...row, currency: 'egp' }], period), /row/);
});
