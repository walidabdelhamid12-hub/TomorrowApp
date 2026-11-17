import { zip, cell } from './expensesXlsx';
import { validateReportTable, reportTableDecimals, reportTableNumber, type ReportTable } from './reportTableExport';

const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const pkg = 'http://schemas.openxmlformats.org/package/2006/relationships';
const chartNs = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/main';
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
      const striped = data && (r - 9) % 2 === 1;
      const style = isNumeric
        ? (striped ? 10 : 6) + (table.integerColumns?.includes(i) ? 0 : decimals)
        : r === 1 ? 1 : r === 2 ? 2 : r === 8 ? 3 : r === 4 || r === 5 ? 4 : striped ? 5 : 0;
      return cell(column(i), r, isNumeric ? numeric(typeof value === 'number' ? reportTableNumber(table, values, i, value) : value!) : String(value ?? ''), !!isNumeric, style);
    }).join('')}</row>`;
    const data = [
      rowXml(1, ['TOMORROW FINANCE', 'FINANCIAL STATEMENT']),
      rowXml(2, [table.title]),
      rowXml(3, ['From', table.period.from, 'To', table.period.to]),
      rowXml(4, ['Currency / unit', currency]),
      rowXml(5, ['Verified records', rows.length]),
      rowXml(6, [table.notice]),
      rowXml(8, table.columns),
      ...rows.map((row, i) => rowXml(i + 9, row, true)),
      rowXml(rows.length + 10, ['TOMORROW FINANCE · Verified report export']),
    ].join('');
    const last = column(table.columns.length - 1);
    // Chart the first numeric measure against a text label, within one verified unit only.
    // The chart references existing cells; no derived or cross-currency amounts are introduced.
    const unitIndex = currencyIndex;
    const labelIndex = table.columns.findIndex((_, i) => i !== unitIndex && !table.numericColumns?.includes(i) && !rows.some(row => typeof row[i] === 'number'));
    const measureIndex = table.columns.findIndex((_, i) => i !== unitIndex && (table.numericColumns?.includes(i) || rows.every(row => typeof row[i] === 'number')));
    const hasChart = rows.length > 0 && rows.length <= 500 && labelIndex >= 0 && measureIndex >= 0
      && rows.every(row => typeof row[measureIndex] === 'number' || (table.numericColumns?.includes(measureIndex) && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(row[measureIndex]))));
    const drawing = hasChart ? `<drawing xmlns:r="${rel}" r:id="rId1"/>` : '';
    if (hasChart) {
      const number = index + 1;
      const sheetName = `'${name.replace(/'/g, "''")}'`;
      const catRef = `${sheetName}!$${column(labelIndex)}$9:$${column(labelIndex)}$${rows.length + 8}`;
      const valRef = `${sheetName}!$${column(measureIndex)}$9:$${column(measureIndex)}$${rows.length + 8}`;
      const chart = `${doc}<c:chartSpace xmlns:c="${chartNs}" xmlns:a="${drawingNs}"><c:chart><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${escape(table.columns[measureIndex])}</c:v></c:tx><c:cat><c:strRef><c:f>${escape(catRef)}</c:f><c:strCache><c:ptCount val="${rows.length}"/>${rows.map((r,i)=>`<c:pt idx="${i}"><c:v>${escape(String(r[labelIndex]))}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${escape(valRef)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${rows.length}"/>${rows.map((r,i)=>`<c:pt idx="${i}"><c:v>${numeric(typeof r[measureIndex] === 'number' ? reportTableNumber(table,r,measureIndex,r[measureIndex]) : String(r[measureIndex]))}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="80"/><c:axId val="100"/><c:axId val="200"/></c:barChart><c:catAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="200"/><c:crosses val="autoZero"/></c:catAx><c:valAx><c:axId val="200"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="100"/><c:crosses val="autoZero"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
      files.push({ name: `xl/charts/chart${number}.xml`, content: chart });
      files.push({ name: `xl/drawings/drawing${number}.xml`, content: `${doc}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${drawingNs}"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rows.length + 12}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rows.length + 30}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Verified ${escape(table.title)} chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${chartNs}"><c:chart xmlns:c="${chartNs}" xmlns:r="${rel}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>` });
      files.push({ name: `xl/drawings/_rels/drawing${number}.xml.rels`, content: `${doc}<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/chart" Target="../charts/chart${number}.xml"/></Relationships>` });
      files.push({ name: `xl/worksheets/_rels/sheet${number}.xml.rels`, content: `${doc}<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/drawing" Target="../drawings/drawing${number}.xml"/></Relationships>` });
    }
    files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, content: `${doc}<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${rows.length + 10}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="${table.columns.length}" width="24" customWidth="1"/></cols><sheetData>${data}</sheetData><autoFilter ref="A8:${last}${rows.length + 8}"/><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${table.columns.length > 7 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="${rows.length <= 20 ? 1 : 0}"/>${drawing}</worksheet>` });
    return `<sheet name="${escape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
  }).join('');
  const formats = [0, 1, 2, 3].map(d => `<numFmt numFmtId="${164 + d}" formatCode="#,##0${d ? '.' + '0'.repeat(d) : ''}"/>`).join('');
  const xfs = [0, 1, 2, 3].map(d => `<xf numFmtId="${164 + d}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('');
  const stripedXfs = [0, 1, 2, 3].map(d => `<xf numFmtId="${164 + d}" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyNumberFormat="1"/>`).join('');
  files.push(
    { name: '[Content_Types].xml', content: `${doc}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}${files.filter(f => f.name.startsWith("xl/charts/")).map(f => `<Override PartName="/${f.name}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')}${files.filter(f => /^xl\/drawings\/drawing\d+\.xml$/.test(f.name)).map(f => `<Override PartName="/${f.name}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', content: `${doc}<Relationships xmlns="${pkg}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `${doc}<workbook xmlns="${ns}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `${doc}<Relationships xmlns="${pkg}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdStyles" Type="${rel}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: `${doc}<styleSheet xmlns="${ns}"><numFmts count="4">${formats}</numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF142B49"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF142B49"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5EDF5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F8FC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>${xfs}${stripedXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
  );
  return zip(files);
}
