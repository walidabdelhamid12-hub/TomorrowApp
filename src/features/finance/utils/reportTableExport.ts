import { reportRoutePeriod } from './reportRoutePeriod';
import { formatAmount } from './amountFormat';
import { getCurrencyDecimals } from '../constants/currencies';

export interface ReportTable {
  title: string;
  period: { from: string; to: string };
  columns: readonly string[];
  rows: readonly (readonly (string | number | null)[])[];
  numericColumns?: readonly number[];
  integerColumns?: readonly number[];
  decimalPlaces?: 2 | 3;
  verified: boolean;
  notice: string;
}
export function reportTableDecimals(table: ReportTable, currency: string): number {
  return table.decimalPlaces ?? (currency === 'g' ? 3 : getCurrencyDecimals(currency));
}
export function reportTableNumber(table: ReportTable, row: ReportTable['rows'][number], index: number, value: number): string {
  if (table.integerColumns?.includes(index)) {
    if (!Number.isSafeInteger(value)) throw new Error('Invalid integer report value.');
    return String(value);
  }
  const unitIndex = table.columns.findIndex(label => /^(currency|unit)$/i.test(label));
  const currency = unitIndex < 0 ? '' : String(row[unitIndex]);
  return formatAmount(value, reportTableDecimals(table, currency) === 3 ? 'OMR' : 'EGP').replace(/,/g, '');
}
export function validateReportTable(table: ReportTable) {
  if (!table.verified || !table.title.trim() || !reportRoutePeriod(table.period.from, table.period.to) || !table.columns.length || !table.rows.length
    || table.rows.some(row => row.length !== table.columns.length || row.some(cell => cell === null || (typeof cell === 'number' && !Number.isFinite(cell))))) {
    throw new Error('Report export requires complete, verified data.');
  }
}
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function buildReportTableCsv(table: ReportTable): string {
  validateReportTable(table);
  const cell = (value: string | number | null) => {
    const text = String(value);
    return '"' + (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
  };
  // Include scope and accounting caveats in the file, not just on screen.
  return '\uFEFF' + [[table.title], [table.period.from, table.period.to], [table.notice], table.columns, ...table.rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function buildReportTableHtml(table: ReportTable): string {
  validateReportTable(table);
  const cells = (row: readonly (string | number | null)[], tag: string) => row.map((cell, index) => `<${tag} dir="auto">${escape(tag === 'td' && typeof cell === 'number' ? reportTableNumber(table, row, index, cell) : String(cell))}</${tag}>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{font:10pt sans-serif;color:#0f172a}h1{font-size:16pt}table{width:100%;border-collapse:collapse}th,td{padding:5px;border-bottom:1px solid #dde3eb;text-align:start;overflow-wrap:anywhere}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#142b49;color:white}</style></head><body><h1>TOMORROW · ${escape(table.title)}</h1><p>${escape(table.period.from)} – ${escape(table.period.to)}</p><p>${escape(table.notice)}</p><table><thead><tr>${cells(table.columns, 'th')}</tr></thead><tbody>${table.rows.map(row => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table></body></html>`;
}
