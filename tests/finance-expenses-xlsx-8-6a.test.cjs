const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const oldLoad = Module._load;
Module._load = function(id, parent, main) {
  if (id.startsWith('@/')) return oldLoad.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return oldLoad.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
const { buildExpensesXlsx } = require('../src/features/finance/utils/expensesXlsx.ts');
function unzipStored(bytes) {
  const b = Buffer.from(bytes), files = new Map(); let off = 0;
  while (b.readUInt32LE(off) === 0x04034b50) {
    const size = b.readUInt32LE(off + 18), n = b.readUInt16LE(off + 26), extra = b.readUInt16LE(off + 28);
    const name = b.subarray(off + 30, off + 30 + n).toString('utf8');
    files.set(name, b.subarray(off + 30 + n + extra, off + 30 + n + extra + size).toString('utf8'));
    off += 30 + n + extra + size;
  }
  assert.equal(b.readUInt32LE(off), 0x02014b50);
  return files;
}
const names = {accounts: new Map([['a','NBE']]),categories:new Map([['f','Food'],['t','Transport']])};
const row = (id, currencyCode, categoryId, amount) => ({id,date:'2026-11-03',accountId:'a',categoryId,currencyCode,amount,note:'Coffee & <tea>'});
const statement = rows => ({reconciled:true,report:{unknown:[]},rows});
const period = {from:'2026-11-01',to:'2026-11-12'};
test('branded workbook has period, frozen headers, styles, chart OOXML and numeric transactions',()=>{
  const f=unzipStored(buildExpensesXlsx(statement([row('1','EGP','f',1)]),period,names));
  for(const n of ['xl/styles.xml','xl/drawings/drawing1.xml','xl/drawings/_rels/drawing1.xml.rels','xl/charts/chart1.xml','xl/worksheets/_rels/sheet1.xml.rels']) assert.ok(f.has(n),n);
  const sheet=f.get('xl/worksheets/sheet1.xml');
  assert.match(sheet,/TOMORROW FINANCE/);assert.match(sheet,/2026-11-01/);
  assert.match(sheet,/pane ySplit="10"/);assert.match(sheet,/autoFilter ref="A10:F11"/);
  assert.match(sheet,/<c r="E11" s="4"><v>1(?:\.00)?<\/v><\/c>/);
  assert.match(sheet,/Coffee &amp; &lt;tea&gt;/);
  assert.match(f.get('xl/charts/chart1.xml'),/Expenses by Category/);
  assert.match(f.get('xl/charts/chart1.xml'),/Food \(EGP\)/);
});
test('refunds net against same category, negatives do not become positive bars',()=>{
  const f=unzipStored(buildExpensesXlsx(statement([row('1','EGP','f',100),row('2','EGP','f',-40),row('3','EGP','t',-20)]),period,names));
  const chart=f.get('xl/charts/chart1.xml');
  assert.match(chart,/Food \(EGP\)/);assert.doesNotMatch(chart,/Transport \(EGP\)/);
  assert.match(f.get('xl/worksheets/sheet1.xml'),/<v>-20(?:\.00)?<\/v>/);
});
test('currency-specific chart series do not sum EGP and OMR',()=>{
  const f=unzipStored(buildExpensesXlsx(statement([row('1','EGP','f',100),row('2','OMR','f',3)]),period,names));
  const chart=f.get('xl/charts/chart1.xml');
  assert.match(chart,/Food \(EGP\)/);assert.match(chart,/Food \(OMR\)/);
  assert.match(chart,/<c:v>EGP<\/c:v>/);assert.match(chart,/<c:v>OMR<\/c:v>/);
});
test('unverified statements fail closed',()=>{
  assert.throws(()=>buildExpensesXlsx({...statement([]),reconciled:false},period,names),/verified/);
  assert.throws(()=>buildExpensesXlsx({...statement([]),report:{unknown:[{id:'x'}]}},period,names),/verified/);
});
