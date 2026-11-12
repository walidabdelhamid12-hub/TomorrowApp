import type { ExpensesStatementResult } from './expensesStatementReconciliation';
import { buildVerifiedOperatingStatementRows, type StatementExportNames } from './operatingStatementCsv';

/** Small dependency-free XLSX writer: ZIP stored entries and OOXML inline strings. */
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
function zip(files: { name: string; content: string }[]): Uint8Array {
  const entries = files.map(file => ({ name: utf8(file.name), data: utf8(file.content) }));
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
function cell(col: string, row: number, value: string, numeric = false): string {
  if (numeric) {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('Invalid numeric export value');
    return `<c r="${col}${row}"><v>${value}</v></c>`;
  }
  return `<c r="${col}${row}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
export function buildExpensesXlsx(
  statement: ExpensesStatementResult,
  period: { from: string; to: string },
  names: StatementExportNames,
): Uint8Array {
  const rows = buildVerifiedOperatingStatementRows(statement, names);
  const header = ['Date', 'Account', 'Category', 'Description', 'Amount', 'Currency'];
  const lines = [
    `<row r="1">${['A','B','C','D','E','F'].map((col, i) => cell(col, 1, header[i])).join('')}</row>`,
    ...rows.map((row, index) => {
      const r = index + 2;
      return `<row r="${r}">${cell('A', r, row.date)}${cell('B', r, row.account)}${cell('C', r, row.category)}${cell('D', r, row.note)}${cell('E', r, row.amount, true)}${cell('F', r, row.currency)}</row>`;
    }),
  ];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="4" width="24" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/><col min="6" max="6" width="12" customWidth="1"/></cols><sheetData>${lines.join('')}</sheetData><autoFilter ref="A1:F${Math.max(1, rows.length + 1)}"/></worksheet>`;
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Expenses" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const bookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  // Period is retained as document metadata in the filename chosen by the caller.
  void period;
  return zip([
    { name: '[Content_Types].xml', content: types },
    { name: '_rels/.rels', content: rels },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: bookRels },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ]);
}
