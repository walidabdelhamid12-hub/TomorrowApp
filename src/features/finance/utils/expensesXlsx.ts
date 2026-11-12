// expenses-chart-ooxml-order-8-6f: gapWidth after series; tickLblPos before crossAx.
import type { ExpensesStatementResult } from './expensesStatementReconciliation';
import { buildVerifiedOperatingStatementRows, type StatementExportNames } from './operatingStatementCsv';

/** Dependency-free, read-only OOXML XLSX exporter. */
function utf8(value: string): Uint8Array {
  const encoded = unescape(encodeURIComponent(value));
  const out = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) out[i] = encoded.charCodeAt(i);
  return out;
}
function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function write16(data: Uint8Array, at: number, n: number) { data[at] = n & 255; data[at + 1] = (n >>> 8) & 255; }
function write32(data: Uint8Array, at: number, n: number) { write16(data, at, n); write16(data, at + 2, n >>> 16); }
export function zip(files: { name: string; content: string }[]): Uint8Array {
  const entries = files.map(file => {
    const content = file.name === 'xl/worksheets/sheet1.xml'
      ? file.content.replace(/(<mergeCells\b[^>]*>[\s\S]*?<\/mergeCells>)(<autoFilter\b[^>]*\/>)/g, '$2$1')
      : file.content;
    return { name: utf8(file.name), data: utf8(content) };
  });
  const localLength = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralLength = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const result = new Uint8Array(localLength + centralLength + 22);
  let offset = 0;
  const central: { entry: typeof entries[number]; offset: number; crc: number }[] = [];
  for (const entry of entries) {
    const crc = crc32(entry.data);
    central.push({ entry, offset, crc });
    write32(result, offset, 0x04034B50); write16(result, offset + 4, 20);
    write16(result, offset + 6, 0x0800); write32(result, offset + 14, crc);
    write32(result, offset + 18, entry.data.length); write32(result, offset + 22, entry.data.length);
    write16(result, offset + 26, entry.name.length);
    result.set(entry.name, offset + 30);
    result.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  }
  const centralStart = offset;
  for (const item of central) {
    const { entry } = item;
    write32(result, offset, 0x02014B50); write16(result, offset + 4, 20); write16(result, offset + 6, 20);
    write16(result, offset + 8, 0x0800); write32(result, offset + 16, item.crc);
    write32(result, offset + 20, entry.data.length); write32(result, offset + 24, entry.data.length);
    write16(result, offset + 28, entry.name.length); write32(result, offset + 42, item.offset);
    result.set(entry.name, offset + 46); offset += 46 + entry.name.length;
  }
  write32(result, offset, 0x06054B50);
  write16(result, offset + 8, entries.length); write16(result, offset + 10, entries.length);
  write32(result, offset + 12, offset - centralStart); write32(result, offset + 16, centralStart);
  return result;
}
export function bytesToBase64(data: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i], b = data[i + 1], c = data[i + 2];
    out += alphabet[a >>> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >>> 4)]
      + (i + 1 < data.length ? alphabet[((b & 15) << 2) | ((c ?? 0) >>> 6)] : '=')
      + (i + 2 < data.length ? alphabet[c & 63] : '=');
  }
  return out;
}
export function cell(col: string, row: number, value: string, numeric = false, style = 0): string {
  const s = style ? ` s="${style}"` : '';
  if (numeric) {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Invalid numeric export value');
    return `<c r="${col}${row}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${col}${row}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkgRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const chartNs = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const styles = `${doc}<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red](#,##0.00)"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF142B49"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF142B49"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5EDF5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F8FC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** The chart is backed by numeric cells in the same worksheet; no mixed-currency sums. */
export function buildExpensesXlsx(
  statement: ExpensesStatementResult,
  period: { from: string; to: string },
  names: StatementExportNames,
): Uint8Array {
  const rows = buildVerifiedOperatingStatementRows(statement, names);
  const currencies = [...new Set(rows.map(r => r.currency))].sort();
  const categoryTotals = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) throw new Error('Invalid chart amount');
    const key = `${row.currency}\u0000${row.category}`;
    const total = (categoryTotals.get(key) ?? 0) + amount;
    if (!Number.isFinite(total)) throw new Error('Invalid chart aggregate');
    categoryTotals.set(key, total);
  }
  if (currencies.length > 20) throw new Error('Too many currencies for chart');
  const groups = [...categoryTotals].map(([key, amount]) => {
    const [currency, category] = key.split('\u0000');
    return { currency, category, amount };
  }).filter(item => item.amount > 0 && Number.isFinite(item.amount))
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount || a.category.localeCompare(b.category));
  // For a multi-currency statement, separate chart series by currency; no currency aggregation.
  const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
  const header = ['Date', 'Account', 'Category', 'Description', 'Amount', 'Currency'];
  const firstData = 11;
  const lastData = firstData + rows.length - 1;
  const chartHeader = Math.max(lastData + 4, 15);
  const chartFirst = chartHeader + 1;
  const chartLast = chartHeader + groups.length;
  const sheetRows: string[] = [];
  const add = (r: number, values: string[], style = 0) => sheetRows.push(`<row r="${r}">${values.map((v, i) => cell(columns[i], r, v, false, style)).join('')}</row>`);
  add(1, ['TOMORROW FINANCE', '', '', '', 'FINANCIAL STATEMENT', ''], 1);
  add(3, ['Expenses', '', '', '', '', ''], 2);
  add(4, ['Financial activity report', '', '', '', '', '']);
  add(5, ['REPORT PERIOD', `${period.from} – ${period.to}`, '', '', '', ''], 2);
  add(7, ['Report Type', '', 'Transactions', '', 'Currencies', ''], 2);
  add(8, ['Expenses', '', String(rows.length), '', `${currencies.length} (${currencies.join(', ') || 'None'})`, '']);
  add(10, header, 3);
  rows.forEach((row, index) => {
    const r = firstData + index;
    const style = index % 2 ? 5 : 0;
    sheetRows.push(`<row r="${r}">${cell('A', r, row.date, false, style)}${cell('B', r, row.account, false, style)}${cell('C', r, row.category, false, style)}${cell('D', r, row.note ?? '', false, style)}${cell('E', r, row.amount, true, index % 2 ? 6 : 4)}${cell('F', r, row.currency, false, style)}</row>`);
  });
  sheetRows.push(`<row r="${chartHeader}">${['Category', 'Currency', 'Net Expenses'].map((v,i)=>cell(columns[i],chartHeader,v,false,2)).join('')}${currencies.map((currency,i)=>cell(String.fromCharCode(71+i),chartHeader,currency,false,2)).join('')}</row>`);
  groups.forEach((item, index) => {
    const r = chartFirst + index;
    sheetRows.push(`<row r="${r}">${cell('A', r, `${item.category} (${item.currency})`)}${cell('B', r, item.currency)}${cell('C', r, String(item.amount), true, 4)}${currencies.map((currency, i) => cell(String.fromCharCode(71 + i), r, String(item.currency === currency ? item.amount : 0), true)).join('')}</row>`);
  });
  // Place the editable chart below category totals, within columns A:F.
  const chartStartRow = Math.max(chartLast + 2, chartHeader + 2);
  const chartEndRow = chartStartRow + 7;
  const footerRow = chartEndRow + 2;
  add(footerRow, ['Generated by Tomorrow Finance', '', '', 'Verified statement', '', '']);
  const sheet = `${doc}<worksheet xmlns="${ns}" xmlns:r="${relNs}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="10" topLeftCell="A11" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="1" width="19" customWidth="1"/><col min="2" max="3" width="23" customWidth="1"/><col min="4" max="4" width="36" customWidth="1"/><col min="5" max="5" width="21" customWidth="1"/><col min="6" max="6" width="15" customWidth="1"/><col min="7" max="26" width="12" hidden="1" customWidth="1"/></cols><sheetData>${sheetRows.join('')}</sheetData><mergeCells count="10"><mergeCell ref="A1:D1"/><mergeCell ref="E1:F1"/><mergeCell ref="A3:F3"/><mergeCell ref="A4:F4"/><mergeCell ref="B5:D5"/><mergeCell ref="A7:B7"/><mergeCell ref="C7:D7"/><mergeCell ref="E7:F7"/><mergeCell ref="A8:B8"/><mergeCell ref="E8:F8"/></mergeCells><autoFilter ref="A10:F${Math.max(10, lastData)}"/><drawing r:id="rId1"/></worksheet>`;
  const workbook = `${doc}<workbook xmlns="${ns}" xmlns:r="${relNs}"><sheets><sheet name="Expenses" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const chartEntries = groups.map((item, index) => ({ ...item, row: chartFirst + index }));
  // One series per currency, sparse points are represented by zero rather than combining currencies.
  const series = currencies.map((currency, i) => {
    const points = chartEntries.map((item, index) => ({ index, value: item.currency === currency ? item.amount : 0 }));
    const valueCol = String.fromCharCode(71 + i);
    const cats = chartEntries.map((item, index) => `<c:pt idx="${index}"><c:v>${xml(item.category)} (${xml(item.currency)})</c:v></c:pt>`).join('');
    const vals = points.map(p => `<c:pt idx="${p.index}"><c:v>${p.value}</c:v></c:pt>`).join('');
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>Expenses!$${String.fromCharCode(71 + i)}$${chartHeader}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(currency)}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>Expenses!$A$${chartFirst}:$A$${Math.max(chartFirst, chartLast)}</c:f><c:strCache><c:ptCount val="${chartEntries.length}"/>${cats}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Expenses!$${valueCol}$${chartFirst}:$${valueCol}$${Math.max(chartFirst, chartLast)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${chartEntries.length}"/>${vals}</c:numCache></c:numRef></c:val></c:ser>`;
  }).join('');
  const chart = `${doc}<c:chartSpace xmlns:c="${chartNs}" xmlns:a="${drawingNs}"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Expenses by Category</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${series}<c:axId val="101"/><c:axId val="102"/><c:gapWidth val="260"/></c:barChart><c:catAx><c:axId val="101"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="102"/></c:catAx><c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="101"/><c:crosses val="autoZero"/></c:valAx></c:plotArea>${currencies.length > 1 ? '<c:legend><c:legendPos val="b"/></c:legend>' : ''}<c:plotVisOnly val="0"/></c:chart></c:chartSpace>`;
  const drawing = `${doc}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${drawingNs}" xmlns:c="${chartNs}" xmlns:r="${relNs}"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chartStartRow - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chartEndRow - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Expenses Category Chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${chartNs}"><c:chart r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  const types = `${doc}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`;
  const rels = `${doc}<Relationships xmlns="${pkgRel}"><Relationship Id="rId1" Type="${relNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const bookRels = `${doc}<Relationships xmlns="${pkgRel}"><Relationship Id="rId1" Type="${relNs}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${relNs}/styles" Target="styles.xml"/></Relationships>`;
  const sheetRels = `${doc}<Relationships xmlns="${pkgRel}"><Relationship Id="rId1" Type="${relNs}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  const drawingRels = `${doc}<Relationships xmlns="${pkgRel}"><Relationship Id="rId1" Type="${relNs}/chart" Target="../charts/chart1.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', content: types },
    { name: '_rels/.rels', content: rels },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: bookRels },
    { name: 'xl/styles.xml', content: styles },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
    { name: 'xl/worksheets/_rels/sheet1.xml.rels', content: sheetRels },
    { name: 'xl/drawings/drawing1.xml', content: drawing },
    { name: 'xl/drawings/_rels/drawing1.xml.rels', content: drawingRels },
    { name: 'xl/charts/chart1.xml', content: chart },
  ]);
}
