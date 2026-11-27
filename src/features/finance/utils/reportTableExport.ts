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
  const unitIndex = table.columns.findIndex(label => /^(currency|unit|العملة|الوحدة)$/i.test(label));
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
export function buildReportTableHtml(table: ReportTable, language?: 'en' | 'ar'): string {
  validateReportTable(table);
  const cells = (row: readonly (string | number | null)[], tag: string) => row.map((cell, index) => `<${tag} dir="auto">${escape(tag === 'td' && typeof cell === 'number' ? reportTableNumber(table, row, index, cell) : String(cell))}</${tag}>`).join('');
  const arabic = language ? language === 'ar' : /[\u0600-\u06FF]/u.test([table.title, table.notice, ...table.columns].join(' '));
  const label = (english: string, translated: string) => arabic ? translated : english;
  return `<!doctype html><html lang="${arabic ? 'ar' : 'en'}" dir="${arabic ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#142b49;margin:0}.masthead{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #142b49;padding-bottom:12px}.brand{font-size:15pt;font-weight:800;letter-spacing:1px}.doc-type{font-size:9pt;font-weight:700;letter-spacing:1.4px;color:#51647c}.report-title{font-size:18pt;font-weight:800;margin:20px 0 10px}.meta{display:flex;gap:20px;flex-wrap:wrap;background:#f1f5f9;padding:10px 12px;margin-bottom:14px}.notice{font-size:9pt;color:#475569;margin-bottom:12px}table{width:100%;border-collapse:collapse}th,td{padding:8px 7px;border-bottom:1px solid #dde3eb;text-align:${arabic ? 'right' : 'left'};overflow-wrap:anywhere}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#142b49;color:white;font-weight:700}tbody tr:nth-child(even){background:#f6f8fc}.footer{border-top:1px solid #dde3eb;margin-top:20px;padding-top:8px;font-size:8pt;color:#64748b}</style></head><body><header class="masthead"><span class="brand">TOMORROW FINANCE</span><span class="doc-type">${label('FINANCIAL STATEMENT', 'تقرير مالي')}</span></header><h1 class="report-title">${escape(table.title)}</h1><section class="meta"><span><b>${label('From:', 'من:')}</b> ${escape(table.period.from)}</span><span><b>${label('To:', 'إلى:')}</b> ${escape(table.period.to)}</span><span><b>${label('Records:', 'السجلات:')}</b> ${table.rows.length}</span></section><p class="notice">${escape(table.notice)}</p><table><thead><tr>${cells(table.columns, 'th')}</tr></thead><tbody>${table.rows.map(row => `<tr>${cells(row, 'td')}</tr>`).join('')}</tbody></table><footer class="footer">TOMORROW FINANCE · ${label('Verified report export', 'تصدير تقرير متحقق منه')} · ${escape(table.period.from)} – ${escape(table.period.to)}</footer></body></html>`;
}
