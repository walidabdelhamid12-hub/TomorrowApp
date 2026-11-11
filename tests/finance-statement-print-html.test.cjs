const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/statementPrintHtml.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
const csvSource = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/statementCsv.ts'), 'utf8');
const csvJs = ts.transpileModule(csvSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const csvMod = { exports: {} };
new Function('module', 'exports', csvJs)(csvMod, csvMod.exports);
new Function('module', 'exports', 'require', js)(mod, mod.exports, id => {
  if (id === './statementCsv') return csvMod.exports;
  throw new Error('Unexpected dependency: ' + id);
});
const { buildStatementPrintHtml } = mod.exports;
const period = { from: '2026-01-01', to: '2026-01-31', title: 'Income <Statement>' };
const row = { date: '2026-01-02', account: '<script>alert(1)</script>', category: 'Salary', note: 'A&B "quote"', amount: '-125.50', currency: 'EGP' };

test('Printable statement escapes HTML and preserves numeric values', () => {
  const html = buildStatementPrintHtml([row], period);
  assert.ok(html.includes('Income &lt;Statement&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('A&amp;B &quot;quote&quot;'));
  assert.ok(html.includes('<td>-125.50</td>'));
});
test('Printable statement rejects malformed rows and period', () => {
  assert.throws(() => buildStatementPrintHtml([row], { ...period, from: '2026-02-01' }), /metadata/);
  assert.throws(() => buildStatementPrintHtml([{ ...row, amount: '=1+1' }], period), /row/);
  assert.throws(() => buildStatementPrintHtml([{ ...row, currency: 'egp' }], period), /row/);
  assert.throws(() => buildStatementPrintHtml([row], { ...period, to: '2026-02-30' }), /metadata/);
});
