const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const dir = path.join(__dirname, '../src/features/finance/utils');
function load(name, deps = {}) {
  const source = fs.readFileSync(path.join(dir, name), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, key => {
    if (!(key in deps)) throw Error('Unexpected dependency ' + key);
    return deps[key];
  });
  return module.exports;
}
const csv = load('statementCsv.ts');
const { buildStatementPrintHtml } = load('statementPrintHtml.ts', { './statementCsv': csv });
const period = { from: '2026-11-01', to: '2026-11-30' };
const rows = [{ date: '2026-11-12', account: 'Bank', category: 'Groceries',
  note: 'Weekly food', amount: '12.500', currency: 'OMR' }];

test('English printable PDF explicitly uses LTR, branded header and same-line date', () => {
  const html = buildStatementPrintHtml(rows, { ...period, title: 'Expenses Statement' });
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.match(html, /TOMORROW <span>FINANCE<\/span>/);
  assert.match(html, /class="heading-row"/);
  assert.match(html, /\.header\{[^}]*page-break-inside:avoid/);
  assert.match(html, /01 Nov 2026 – 30 Nov 2026/);
  assert.match(html, /#f28b82/);
  assert.match(html, /<h2 class="section">Transactions<\/h2>/);
});
test('Income uses green, expenses uses coral; values and currencies are unchanged', () => {
  const income = buildStatementPrintHtml(rows, { ...period, title: 'Income Statement' });
  const expenses = buildStatementPrintHtml(rows, { ...period, title: 'Expenses Statement' });
  assert.match(income, /#65d6a3/);
  assert.match(expenses, /#f28b82/);
  for (const html of [income, expenses]) {
    assert.match(html, /12\.500/);
    assert.match(html, /OMR/);
    assert.match(html, /Groceries/);
    assert.match(html, /Weekly food/);
    assert.match(html, /<thead>/);
  }
});
test('Untrusted labels are escaped and malformed amounts are rejected', () => {
  const html = buildStatementPrintHtml([{ ...rows[0], category: '<script>alert(1)</script>' }],
    { ...period, title: 'Expenses Statement' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.throws(() => buildStatementPrintHtml([{ ...rows[0], amount: '1x' }],
    { ...period, title: 'Expenses Statement' }), /Invalid statement export row/);
});
test('Multiple currencies remain separate without mixed-currency total', () => {
  const html = buildStatementPrintHtml([...rows, { ...rows[0], currency: 'EGP' }],
    { ...period, title: 'Expenses Statement' });
  assert.match(html, /Currencies \(2\)/);
  assert.match(html, /EGP<\/span>/);
  assert.match(html, /OMR<\/span>/);
  assert.match(html, /currency-separator/);
  assert.doesNotMatch(html, /Total Expenses/);
});

test('PDF summary order and inline flag and food icons', () => {
  const html = buildStatementPrintHtml([
    { ...rows[0], category: 'Food', currency: 'EGP' },
    { ...rows[0], category: 'Food', currency: 'USD' },
  ], { ...period, title: 'Expenses Statement' });
  const reportType = html.indexOf('<div class="summary-label">Report Type</div>');
  const transactions = html.indexOf('<div class="summary-label">Transactions</div>');
  const currencies = html.indexOf('<div class="summary-label">Currencies (2)</div>');
  assert.ok(reportType >= 0 && reportType < transactions && transactions < currencies);
  assert.match(html, /<svg[^>]+class="inline-icon"/);
  assert.match(html, /stroke-linecap="round"/);
  assert.match(html, /#ce1126/);
  assert.match(html, /#3c3b6e/);
});
