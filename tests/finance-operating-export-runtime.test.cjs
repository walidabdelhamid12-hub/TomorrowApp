const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(name, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/', name), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, id => {
    if (!(id in dependencies)) throw new Error('Unexpected dependency: ' + id);
    return dependencies[id];
  });
  return mod.exports;
}
const csv = loadTs('statementCsv.ts', {});
const print = loadTs('statementPrintHtml.ts', {});
const format = { formatAmount: (n) => n.toFixed(2) };
const operating = loadTs('operatingStatementCsv.ts', {
  './amountFormat': format, './statementCsv': csv,
});
const printable = loadTs('operatingStatementPrintHtml.ts', {
  './operatingStatementCsv': operating, './statementPrintHtml': print,
});
const names = {
  accounts: new Map([['bank', 'Main Bank']]),
  categories: new Map([['salary', 'Salary']]),
};
const statement = {
  reconciled: true, report: { unknown: [] },
  rows: [{ date: '2026-01-05', accountId: 'bank', categoryId: 'salary',
    currencyCode: 'EGP', amount: 125.5, note: 'January salary' }],
};
const period = { from: '2026-01-01', to: '2026-01-31' };

test('Income CSV and printable document use identical verified row values', () => {
  const csvText = operating.buildOperatingStatementCsv(statement, 'income', period, names);
  const html = printable.buildOperatingStatementPrintHtml(statement, 'income', period, names);
  for (const value of ['2026-01-05', 'Main Bank', 'Salary', 'January salary', '125.50', 'EGP']) {
    assert.ok(csvText.includes(value));
    assert.ok(html.includes(value));
  }
});
test('Both formats fail closed on unverified statements', () => {
  for (const bad of [{ ...statement, reconciled: false }, { ...statement, report: { unknown: [{ id: 'x' }] } }]) {
    assert.throws(() => operating.buildOperatingStatementCsv(bad, 'income', period, names), /verified/);
    assert.throws(() => printable.buildOperatingStatementPrintHtml(bad, 'income', period, names), /verified/);
  }
});
test('Both formats refuse missing account or category labels', () => {
  for (const missing of [{ ...names, accounts: new Map() }, { ...names, categories: new Map() }]) {
    assert.throws(() => operating.buildOperatingStatementCsv(statement, 'income', period, missing), /missing/);
    assert.throws(() => printable.buildOperatingStatementPrintHtml(statement, 'income', period, missing), /missing/);
  }
});
