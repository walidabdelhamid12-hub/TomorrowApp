const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const load = Module._load;
Module._load = function(id, parent, main) { return load.call(this, id.startsWith('@/') ? path.join(__dirname, '../src', id.slice(2)) : id, parent, main); };
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { buildReportTableXlsx } = require('../src/features/finance/utils/reportTableXlsx.ts');
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0); } return (crc ^ -1) >>> 0; }
function unzip(bytes) {
  const data = Buffer.from(bytes), entries = new Map(); let at = 0;
  while (data.readUInt32LE(at) === 0x04034b50) {
    assert.equal(data.readUInt16LE(at + 8), 0, 'Stored ZIP entries');
    const size = data.readUInt32LE(at + 18), nameLength = data.readUInt16LE(at + 26), extra = data.readUInt16LE(at + 28);
    const name = data.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const content = data.subarray(at + 30 + nameLength + extra, at + 30 + nameLength + extra + size);
    assert.equal(crc32(content), data.readUInt32LE(at + 14), name + ' CRC');
    assert.ok(!entries.has(name)); entries.set(name, { text: content.toString('utf8'), offset: at, size });
    at += 30 + nameLength + extra + size;
  }
  const centralStart = at; let count = 0;
  while (data.readUInt32LE(at) === 0x02014b50) {
    const nameLength = data.readUInt16LE(at + 28), extra = data.readUInt16LE(at + 30), comment = data.readUInt16LE(at + 32);
    const name = data.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    assert.equal(entries.get(name).offset, data.readUInt32LE(at + 42)); assert.equal(entries.get(name).size, data.readUInt32LE(at + 24));
    count++; at += 46 + nameLength + extra + comment;
  }
  assert.equal(data.readUInt32LE(at), 0x06054b50); assert.equal(data.readUInt16LE(at + 10), entries.size); assert.equal(count, entries.size); assert.equal(data.readUInt32LE(at + 16), centralStart); assert.equal(at + 22, data.length);
  return new Map([...entries].map(([name, value]) => [name, value.text]));
}
const base = { period: { from: '2026-11-01', to: '2026-11-12' }, verified: true, notice: 'Read-only & verified <scope> "quoted"' };
const cases = [
  ['Income', ['Date','Account','Category','Description','Amount','Currency'], [['2026-11-10','Bank','Salary','<safe> & optional note',1.237,'OMR']], 'E6', '1.237'],
  ['Accounts', ['Account','Currency','Opening balance','Closing balance','Net change'], [['Bank','OMR',1.237,2.474,1.237]], 'D6','2.474'],
  ['Assets', ['Asset','Type','Unit','Opening quantity','Additions','Withdrawals','Closing quantity','Net change'], [['Gold','Gold','g',1.237,0.101,0,1.338,0.101]], 'G6','1.338'],
  ['Installments', ['Contract','Currency','Ownership','All scheduled','Due in period','Due count','Schedule count'], [['Schedule','OMR','Standalone contract','0.303','0.101',1,2]], 'E6','0.101'],
  ['Loans', ['Loan','Currency','Original principal','Contractual total','Payments','Fees','Current contractual remaining','Current principal remaining','Period-end remaining'], [['Loan','OMR',1000,1200,100,5,1100,916.6666666666666,1100]], 'H6','916.667'],
  ['Debts Receivable', ['Person','Currency','Total','Collected','Current remaining','Period-end remaining'], [['Debtor','OMR',10,1.237,8.763,8.763]], 'E6','8.763'],
  ['Debts Payable', ['Person','Currency','Total','Paid','Current remaining','Period-end remaining'], [['Creditor','OMR',10,1.237,8.763,8.763]], 'E6','8.763'],
];
for (const [title, columns, rows, ref, amount] of cases) test(title + ' exports a complete real OOXML workbook with correct numeric cells and scope', () => {
  const table = { ...base, title, columns, rows, ...(title === 'Installments' ? { numericColumns: [3,4,5,6], integerColumns: [5,6] } : {}) }; const before = structuredClone(table);
  const parts = unzip(buildReportTableXlsx(table));
  for (const name of ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml']) assert.ok(parts.has(name), name);
  const sheet = parts.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, new RegExp('<c r="' + ref + '"(?: s="[0-9]+")?><v>' + amount.replace('.', '\\.') + '</v></c>'));
  assert.match(sheet, /2026-11-01/); assert.match(sheet, /2026-11-12/); assert.match(sheet, /Read-only &amp; verified &lt;scope&gt; &quot;quoted&quot;/);
  assert.match(parts.get('xl/_rels/workbook.xml.rels'), /Target="worksheets\/sheet1.xml"/);
  assert.deepEqual(table, before);
});
test('currencies stay in separate worksheets without aggregated totals; formulas remain text', () => {
  const parts = unzip(buildReportTableXlsx({ ...base, title: 'Income', columns: ['Name','Currency','Amount'], rows: [['=SUM(A1)','OMR',1.237], ['USD only','USD',2.5]] }));
  assert.match(parts.get('xl/workbook.xml'), /name="OMR"/); assert.match(parts.get('xl/workbook.xml'), /name="USD"/);
  assert.doesNotMatch(parts.get('xl/worksheets/sheet1.xml'), /USD only/); assert.doesNotMatch(parts.get('xl/worksheets/sheet2.xml'), /SUM/);
  assert.match(parts.get('xl/worksheets/sheet1.xml'), /t="inlineStr"><is><t xml:space="preserve">=SUM\(A1\)/); assert.doesNotMatch(parts.get('xl/worksheets/sheet1.xml'), /<f[ >]/);
});
test('unverified, missing, nonfinite, unsafe precision, malformed metadata and row shape fail closed', () => {
  const table = { ...base, title: 'Loans', columns: ['Loan','Currency','Amount'], rows: [['Loan','OMR',1.237]] };
  for (const bad of [{ verified: false }, { rows: [['Loan','OMR',null]] }, { rows: [['Loan','OMR',Infinity]] }, { rows: [['Loan','OMR']] }, { period: { from: '2026-02-30', to: '2026-03-01' } }, { rows: [['Loan','OMR','9007199254740993.001']], numericColumns: [2] }]) assert.throws(() => buildReportTableXlsx({ ...table, ...bad }));
});
test('numeric workbook display uses the same decimal half-up rounding as the reporting UI', () => {
  const parts = unzip(buildReportTableXlsx({ ...base, title: 'Loans', columns: ['Loan','Currency','Amount'], rows: [['Loan','EGP',0.015]] }));
  assert.match(parts.get('xl/worksheets/sheet1.xml'), /<v>0\.02<\/v>/);
});
test('currency-denominated asset quantities retain three decimals and PDF/XLSX use the same precision', () => {
  const { buildReportTableHtml } = require('../src/features/finance/utils/reportTableExport.ts');
  const table = { ...base, title: 'Assets Quantity Report', decimalPlaces: 3, columns: ['Asset','Unit','Closing quantity'], rows: [['Cash asset','EGP',1.237]] };
  const sheet = unzip(buildReportTableXlsx(table)).get('xl/worksheets/sheet1.xml'); assert.match(sheet, /<v>1\.237<\/v>/); assert.match(buildReportTableHtml(table), />1\.237<\/td>/);
});
