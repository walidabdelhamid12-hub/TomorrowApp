import { type ReportTable, validateReportTable, reportTableNumber } from './reportTableExport';

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const formatDate = (value: string): string => {
  const [year, month, day] = value.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[Number(month) - 1]} ${year}`;
};
/** Branded, read-only PDF for the four scheduled/obligation reports only. */
export function buildBrandedReportTablePrintHtml(table: ReportTable, landscape = false): string {
  validateReportTable(table);
  const unitIndex = table.columns.findIndex(column => /^(currency|unit)$/i.test(column));
  const units = [...new Set(table.rows.map(row => unitIndex >= 0 ? String(row[unitIndex]) : '').filter(Boolean))];
  const numeric = (row: ReportTable['rows'][number], index: number, value: string | number | null) =>
    typeof value === 'number' ? reportTableNumber(table, row, index, value) : String(value);
  const columns = table.columns.map(label => `<th>${escapeHtml(label)}</th>`).join('');
  // PHASE8_FOUR_PDF_ACCENTS_V2 â€” presentation only; report data remains untouched.
  const reportAccent = /receivable/i.test(table.title) ? '#15803D'
    : /payable/i.test(table.title) ? '#DC2626'
    : /installment/i.test(table.title) ? '#2563EB'
    : /loan/i.test(table.title) ? '#7C3AED' : '#83d9d0';
  const currencyFlag = (code: string): string => {
    const normalized = code.trim().toUpperCase();
    const flags: Record<string, string> = { EGP: 'ðŸ‡ªðŸ‡¬', OMR: 'ðŸ‡´ðŸ‡²', SAR: 'ðŸ‡¸ðŸ‡¦', AED: 'ðŸ‡¦ðŸ‡ª', USD: 'ðŸ‡ºðŸ‡¸', EUR: 'ðŸ‡ªðŸ‡º', GBP: 'ðŸ‡¬ðŸ‡§', JOD: 'ðŸ‡¯ðŸ‡´', QAR: 'ðŸ‡¶ðŸ‡¦', KWD: 'ðŸ‡°ðŸ‡¼' };
    return flags[normalized] ? `${flags[normalized]} ${normalized}` : code;
  };
  const currencyColumnIndex = table.columns.findIndex(column => /^(currency|unit)$/i.test(column));
  const displayCurrencyCell = (value: string | number | null, index: number): string =>
    index === currencyColumnIndex && typeof value === 'string' ? currencyFlag(value) : String(value ?? '');
  const rows = table.rows.map(row => `<tr>${row.map((value, index) => `<td dir="auto">${escapeHtml(index === currencyColumnIndex ? displayCurrencyCell(value, index) : numeric(row, index, value))}</td>`).join('')}</tr>`).join('');
  const title = escapeHtml(table.title);
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:10mm}*{box-sizing:border-box}html,body{width:${landscape ? "277mm" : "190mm"};max-width:100%;margin:0;padding:0;direction:ltr;text-align:left}
body{font:10pt/1.35 Arial,Helvetica,sans-serif;color:#203149;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:#142b49;color:#fff;border-radius:8px;padding:18px 20px;page-break-inside:avoid}
.brand-row,.heading-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.brand{font-size:12pt;font-weight:800;letter-spacing:1px}.brand span{color:#83d9d0}
.eyebrow{font-size:8pt;letter-spacing:1px;color:#dce8f5}.rule{height:1px;background:#506783;margin:12px 0}
h1{font-size:20pt;line-height:1.2;color:${reportAccent};margin:0 0 5px}.subtitle{font-size:10pt;color:#dce8f5}.period{text-align:right;max-width:46%}.period .value{font-size:9pt;font-weight:bold;color:white;margin-top:7px}
.summary{display:flex;gap:9px;margin:14px 0 18px;page-break-inside:avoid}.summary-card{flex:1;min-width:0;background:#f1f5f9;border:1px solid #e2e9f0;border-radius:7px;padding:11px 12px}
.summary-label{font-size:9pt;color:#64748b;margin-bottom:7px}.summary-value{font-size:15pt;font-weight:bold;color:#142b49;overflow-wrap:anywhere}.summary-value.accent{color:${reportAccent}}.summary-value.units{font-size:10pt}
.section{font-size:14pt;font-weight:bold;color:#142b49;margin:0 0 10px}.notice{font-size:9pt;color:#56657a;margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;line-height:1.35}thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}
th{background:#e9f0f7;color:#142b49;font-size:8pt;text-align:left;padding:9px 4px;border-bottom:2px solid #b9cadb;overflow-wrap:anywhere}
td{padding:9px 4px;border-bottom:1px solid #e2e9f0;vertical-align:top;overflow-wrap:anywhere;word-break:normal}tbody tr:nth-child(even){background:#f7f9fc}
.footer{margin-top:18px;padding-top:10px;border-top:1px solid #e2e9f0;display:flex;justify-content:space-between;gap:12px;color:#64748b;font-size:8pt}
</style></head><body><section class="header"><div class="brand-row"><div class="brand">TOMORROW <span>FINANCE</span></div><div class="eyebrow">FINANCIAL STATEMENT</div></div><div class="rule"></div><div class="heading-row"><div><h1>${title}</h1><div class="subtitle">Financial activity report</div></div><div class="period"><div class="eyebrow">REPORT PERIOD</div><div class="value">${escapeHtml(formatDate(table.period.from))} – ${escapeHtml(formatDate(table.period.to))}</div></div></div></section>
<section class="summary"><div class="summary-card"><div class="summary-label">Report Type</div><div class="summary-value accent">${title}</div></div><div class="summary-card"><div class="summary-label">Records</div><div class="summary-value">${table.rows.length}</div></div><div class="summary-card"><div class="summary-label">Units (${units.length})</div><div class="summary-value units">${escapeHtml(units.map(currencyFlag).join(' · ') || '—')}</div></div></section>
<h2 class="section">Report Details</h2><p class="notice">${escapeHtml(table.notice)}</p><table><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table><div class="footer"><span>Generated by Tomorrow Finance</span><span>Verified report · Values remain in original units</span></div></body></html>`;
}
