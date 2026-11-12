const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = Module._load;
Module._load = function(id, parent, main) {
  if (id.startsWith('@/')) return load.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return load.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
const { buildExpensesXlsx, bytesToBase64 } = require('../src/features/finance/utils/expensesXlsx.ts');

function entries(bytes) {
  const data = Buffer.from(bytes);
  const files = new Map();
  let offset = 0;
  while (data.readUInt32LE(offset) === 0x04034b50) {
    const size = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const contentStart = offset + 30 + nameLength + extraLength;
    files.set(name, data.subarray(contentStart, contentStart + size).toString('utf8'));
    offset = contentStart + size;
  }
  assert.equal(data.readUInt32LE(offset), 0x02014b50, 'central directory must exist');
  assert.equal(data.readUInt32LE(data.length - 22), 0x06054b50, 'ZIP end record must exist');
  return files;
}
const names = { accounts: new Map([['bank', 'Bank']]), categories: new Map([['food', 'Food']]) };
const statement = { reconciled: true, report: { unknown: [] }, rows: [{
  id: 'a', date: '2026-11-12', accountId: 'bank', categoryId: 'food',
  currencyCode: 'EGP', amount: 123.45, note: 'Lunch & <coffee> وصف',
}] };
test('XLSX has valid ZIP/OOXML parts, escaped text and numeric amount', () => {
  const bytes = buildExpensesXlsx(statement, { from: '2026-11-01', to: '2026-11-30' }, names);
  const files = entries(bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) assert.ok(files.has(name), name);
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /Lunch &amp; &lt;coffee&gt; وصف/);
  assert.match(sheet, /<c r="E11" s="4"><v>123\.45<\/v><\/c>/);
  assert.equal(Buffer.from(bytesToBase64(bytes), 'base64').equals(Buffer.from(bytes)), true);
});
test('XLSX refuses unreconciled or unknown statements', () => {
  assert.throws(() => buildExpensesXlsx({ ...statement, reconciled: false }, { from: '2026-11-01', to: '2026-11-30' }, names), /verified/);
  assert.throws(() => buildExpensesXlsx({ ...statement, report: { unknown: [{ id: 'bad' }] } }, { from: '2026-11-01', to: '2026-11-30' }, names), /verified/);
});
