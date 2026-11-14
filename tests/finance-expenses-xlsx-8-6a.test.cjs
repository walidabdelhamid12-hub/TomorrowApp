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


// Resolve the emitted cell's style through styles.xml rather than assuming a style index.
function monetaryCell(files, reference) {
  const sheet = files.get('xl/worksheets/sheet1.xml');
  const match = sheet.match(new RegExp('<c r="' + reference + '"([^>]*)>([\\s\\S]*?)</c>'));
  assert.ok(match, 'missing cell ' + reference);
  assert.doesNotMatch(match[1], /\bt="(?:inlineStr|s|str)"/, reference + ' must remain numeric');
  const value = match[2].match(/^<v>([^<]+)<\/v>$/);
  assert.ok(value, reference + ' must contain only a numeric value');
  const styleIndex = Number(match[1].match(/\bs="(\d+)"/)?.[1] ?? 0);
  const styles = files.get('xl/styles.xml');
  const xfs = [...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*\/>/g)];
  const xf = xfs[styleIndex]?.[0];
  assert.ok(xf, 'missing style for ' + reference);
  assert.match(xf, /applyNumberFormat="1"/);
  const formatId = xf.match(/numFmtId="(\d+)"/)[1];
  const format = styles.match(new RegExp('<numFmt numFmtId="' + formatId + '" formatCode="([^"]+)"'));
  assert.ok(format, 'missing number format for ' + reference);
  return { value: value[1], format: format[1], fill: Number(xf.match(/fillId="(\d+)"/)[1]) };
}

for (const [currency, decimals] of [
  ['EGP', 2], ['SAR', 2], ['AED', 2], ['USD', 2], ['EUR', 2],
  ['GBP', 2], ['QAR', 2], ['OMR', 3], ['JOD', 3], ['KWD', 3],
]) {
  test(currency + ' uses currency precision for numeric amounts, refunds, totals and chart cells', () => {
    const positive = decimals === 3 ? 1234.567 : 1234.56;
    const refund = decimals === 3 ? -12.345 : -12.34;
    const input = statement([row('1', currency, 'f', positive), row('2', currency, 'f', refund)]);
    const before = JSON.stringify(input);
    const files = unzipStored(buildExpensesXlsx(input, period, names));
    const fraction = '0'.repeat(decimals);
    const expectedFormat = '#,##0.' + fraction + ';[Red](#,##0.' + fraction + ')';
    const first = monetaryCell(files, 'E11');
    const second = monetaryCell(files, 'E12');
    assert.equal(first.value, positive.toFixed(decimals));
    assert.equal(second.value, refund.toFixed(decimals));
    assert.equal(Number(first.value), positive);
    assert.equal(Number(second.value), refund);
    assert.equal(first.format, expectedFormat);
    assert.equal(second.format, expectedFormat);
    assert.equal(first.fill, 0);
    assert.equal(second.fill, 4, 'alternating row fill must be preserved');
    for (const reference of ['C17', 'G17']) {
      const total = monetaryCell(files, reference);
      assert.equal(total.format, expectedFormat);
      assert.equal(total.value, String(positive + refund), 'existing numeric aggregate must not be rounded');
    }
    assert.equal(JSON.stringify(input), before);
  });
}

test('mixed-currency total and sparse chart-source styles follow each cell currency', () => {
  const amounts = { EGP: 123.45, OMR: 1.237, JOD: 2.345, KWD: 3.456 };
  const input = statement(Object.entries(amounts).map(([currency, amount], i) => row(String(i), currency, 'f', amount)));
  const files = unzipStored(buildExpensesXlsx(input, period, names));
  const currencies = Object.keys(amounts).sort();
  currencies.forEach((currency, i) => {
    const r = 19 + i;
    const fraction = currency === 'EGP' ? '00' : '000';
    assert.equal(monetaryCell(files, 'C' + r).value, String(amounts[currency]));
    assert.equal(monetaryCell(files, 'C' + r).format, '#,##0.' + fraction + ';[Red](#,##0.' + fraction + ')');
    currencies.forEach((seriesCurrency, j) => {
      const cell = monetaryCell(files, String.fromCharCode(71 + j) + r);
      const seriesFraction = seriesCurrency === 'EGP' ? '00' : '000';
      assert.equal(cell.value, String(seriesCurrency === currency ? amounts[currency] : 0));
      assert.equal(cell.format, '#,##0.' + seriesFraction + ';[Red](#,##0.' + seriesFraction + ')');
    });
    assert.ok(files.get('xl/charts/chart1.xml').includes('<c:v>' + currency + '</c:v>'));
  });
});

test('whole-number and zero OMR amounts retain numeric values with three-decimal display', () => {
  const files = unzipStored(buildExpensesXlsx(statement([row('1', 'OMR', 'f', 18), row('2', 'OMR', 'f', 0)]), period, names));
  assert.equal(monetaryCell(files, 'E11').value, '18.000');
  assert.equal(monetaryCell(files, 'E12').value, '0.000');
  assert.equal(monetaryCell(files, 'E12').format, '#,##0.000;[Red](#,##0.000)');
});
