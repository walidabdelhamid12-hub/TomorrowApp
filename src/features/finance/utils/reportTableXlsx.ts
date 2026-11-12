import { zip, cell } from './expensesXlsx';
import { validateReportTable, reportTableDecimals, reportTableNumber, type ReportTable } from './reportTableExport';

const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function column(index: number): string {
  let value = index + 1, result = '';
  while (value) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26); }
  return result;
}
function numeric(value: string | number): string {
  const text = String(value);
  // Excel stores only 15 significant digits. Do not silently round exact schedules.
  const significant = text.replace(/^-/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text)) || significant.length > 15) {
    throw new Error('Amount exceeds safe Excel numeric precision. Use the PDF to retain the exact value.');
  }
  return text;
}

/** One sheet per currency or quantity unit; no cross-currency sums or invented values. */
export function buildReportTableXlsx(table: ReportTable): Uint8Array {
  validateReportTable(table);
  if (table.columns.length > 16384 || table.rows.length > 1048570) throw new Error('Report exceeds Excel worksheet limits.');
  const currencyIndex = table.columns.findIndex(label => /^(currency|unit)$/i.test(label));
  const groups = new Map<string, typeof table.rows[number][]>();
  for (const row of table.rows) {
    const key = currencyIndex < 0 ? 'Report' : String(row[currencyIndex]);
    const rows = groups.get(key) ?? []; rows.push(row); groups.set(key, rows);
  }
  const sheets = [...groups].sort(([a], [b]) => a.localeCompare(b));
  const files: { name: string; content: string }[] = [];
  const sheetNames = new Set<string>();
  const workbookSheets = sheets.map(([currency, rows], index) => {
    const name = currency.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || 'Report';
    if (sheetNames.has(name)) throw new Error('Ambiguous worksheet unit.');
    sheetNames.add(name);
    const decimals = reportTableDecimals(table, currency);
    const rowXml = (r: number, values: readonly (string | number | null)[], data = false) => `<row r="${r}">${values.map((value, i) => {
      const isNumeric = data && (typeof value === 'number' || table.numericColumns?.includes(i));
      const style = isNumeric ? table.integerColumns?.includes(i) ? 0 : decimals + 2 : r === 5 ? 1 : 0;
      return cell(column(i), r, isNumeric ? numeric(typeof value === 'number' ? reportTableNumber(table, values, i, value) : value!) : String(value ?? ''), !!isNumeric, style);
    }).join('')}</row>`;
    const data = [rowXml(1, [table.title]), rowXml(2, ['From', table.period.from, 'To', table.period.to]), rowXml(3, [table.notice]), rowXml(5, table.columns), ...rows.map((row, i) => rowXml(i + 6, row, true))].join('');
    const last = column(table.columns.length - 1);
    files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, content: `${doc}<worksheet xmlns="${ns}"><dimension ref="A1:${last}${rows.length + 5}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${table.columns.length}" width="24" customWidth="1"/></cols><sheetData>${data}</sheetData><autoFilter ref="A5:${last}${rows.length + 5}"/></worksheet>` });
    return `<sheet name="${escape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
  }).join('');
  const formats = [0, 1, 2, 3].map(d => `<numFmt numFmtId="${164 + d}" formatCode="#,##0${d ? '.' + '0'.repeat(d) : ''}"/>`).join('');
  const xfs = [0, 1, 2, 3].map(d => `<xf numFmtId="${164 + d}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('');
  files.push(
    { name: '[Content_Types].xml', content: `${doc}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', content: `${doc}<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `${doc}<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `${doc}<Relationships xmlns="${pkg}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdStyles" Type="${rel}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: `${doc}<styleSheet xmlns="${ns}"><numFmts count="4">${formats}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
  );
  return zip(files);
}
