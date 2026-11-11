/**
 * Offline, read-only HTML for verified statement PDF printing.
 * No file writes, ledger mutations, or cross-currency aggregation.
 */
import { serializeStatementCsv, type StatementCsvRow } from './statementCsv';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function svgIcon(paths: string, viewBox = '0 0 24 24'): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" class="inline-icon" viewBox="' + viewBox
    + '" aria-hidden="true">' + paths + '</svg>';
}
function categoryIcon(category: string): string {
  const value = category.toLowerCase();
  if (/food|grocer|restaurant|dining|meal/.test(value)) {
    return svgIcon('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
      + '<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20M18 22V2c-5 3-5 10 0 11"/></g>');
  }
  if (/transport|taxi|fuel|travel/.test(value)) {
    return svgIcon('<g fill="none" stroke="currentColor" stroke-width="2"><path d="M5 16h14l-2-7H7l-2 7ZM3 16v4m18-4v4M7 9l2-4h6l2 4"/></g>');
  }
  if (/salary|income|bonus|work/.test(value)) {
    return svgIcon('<path fill="none" stroke="currentColor" stroke-width="2" d="M12 20V4m-6 6 6-6 6 6"/>');
  }
  return svgIcon('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/>');
}
function currencyFlag(code: string): string {
  if (code === 'EGP') return svgIcon('<rect width="24" height="16" y="4" rx="1" fill="#fff"/>'
    + '<path fill="#ce1126" d="M0 4h24v5.33H0z"/><path fill="#000" d="M0 14.67h24V20H0z"/>'
    + '<path fill="#c6a348" d="M11 10h2v4h-2z"/>');
  if (code === 'USD') return svgIcon('<rect width="24" height="16" y="4" rx="1" fill="#fff"/>'
    + Array.from({ length: 7 }, (_, i) => '<rect x="0" y="' + (4 + i * 2.3)
      + '" width="24" height="1.15" fill="#b22234"/>').join('')
    + '<rect x="0" y="4" width="10" height="9" fill="#3c3b6e"/>'
    + '<g fill="#fff"><circle cx="2" cy="6" r=".6"/><circle cx="5" cy="6" r=".6"/>'
    + '<circle cx="8" cy="6" r=".6"/><circle cx="3.5" cy="9" r=".6"/>'
    + '<circle cx="6.5" cy="9" r=".6"/></g>');
  return '';
}
function currencyLabel(code: string): string {
  return currencyFlag(code) + '<span>' + escapeHtml(code) + '</span>';
}

function formatPeriod(date: string): string {
  const [year, month, day] = date.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return day + ' ' + months[Number(month) - 1] + ' ' + year;
}

export function buildStatementPrintHtml(
  rows: readonly StatementCsvRow[],
  options: { title: string; from: string; to: string },
): string {
  // Keep exactly the existing validated CSV row and period contract.
  serializeStatementCsv(rows, options);
  const expense = /expense/i.test(options.title);
  const accent = expense ? '#f28b82' : '#65d6a3';
  const accentDark = expense ? '#b54b43' : '#167b57';
  const currencies = [...new Set(rows.map(row => row.currency))].sort();
  const body = rows.map((row, index) => '<tr class="' + (index % 2 ? 'alternate' : '') + '">'
    + '<td class="date">' + escapeHtml(row.date) + '</td>'
    + '<td>' + escapeHtml(row.account) + '</td>'
    + '<td><span class="category-mark">' + categoryIcon(row.category) + '</span>'
    + escapeHtml(row.category) + '</td>'
    + '<td class="note">' + escapeHtml(row.note ?? '') + '</td>'
    + '<td class="amount">' + escapeHtml(row.amount) + '</td>'
    + '<td class="currency">' + currencyLabel(row.currency) + '</td>'
    + '</tr>').join('');
  const heading = escapeHtml(options.title);
  const period = escapeHtml(formatPeriod(options.from) + ' – ' + formatPeriod(options.to));
  const currencyLabels = currencies.length ? currencies.map(currencyLabel).join('<span class="currency-separator"> · </span>') : '—';
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{size:A4;margin:15mm 13mm 17mm}
*{box-sizing:border-box}
html,body{direction:ltr;text-align:left}
body{font-family:Arial,Helvetica,sans-serif;color:#203149;margin:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:#142b49;color:#fff;border-radius:9px;padding:19px 22px 18px;page-break-inside:avoid}
.brand-row,.heading-row{display:flex;justify-content:space-between;align-items:flex-start}
.brand{font-weight:800;letter-spacing:1.2px;font-size:12px}
.brand span{color:#83d9d0}
.eyebrow{font-size:9px;letter-spacing:1.4px;color:#dce8f5}
.rule{height:1px;background:#506783;margin:12px 0 15px}
h1{font-size:23px;line-height:1.2;color:${accent};margin:0 0 6px}
.subtitle{color:#dce8f5;font-size:10px}
.period{text-align:right;white-space:nowrap;padding-left:12px}
.period .value{font-size:11px;font-weight:bold;color:white;margin-top:7px}
.summary{display:flex;gap:10px;margin:15px 0 22px;page-break-inside:avoid}
.summary-card{background:#f1f5f9;border:1px solid #e2e9f0;border-radius:7px;padding:12px 14px;flex:1;min-width:0}
.summary-label{font-size:9px;color:#64748b;margin-bottom:7px}
.summary-value{font-size:18px;font-weight:bold;color:#142b49;overflow-wrap:anywhere}
.summary-value.accent{color:${accentDark}}
.summary-value.currencies{font-size:12px;line-height:1.6}
.section{font-size:14px;font-weight:bold;color:#142b49;margin:0 0 10px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
th{background:#e9f0f7;color:#142b49;font-size:9px;text-align:left;padding:10px 8px;border-bottom:2px solid #b9cadb}
td{padding:10px 8px;border-bottom:1px solid #e2e9f0;vertical-align:top;overflow-wrap:anywhere}
tr.alternate{background:#f7f9fc}
th:nth-child(1){width:15%}th:nth-child(2){width:17%}th:nth-child(3){width:21%}
th:nth-child(4){width:23%}th:nth-child(5){width:14%}th:nth-child(6){width:10%}
.amount{text-align:right;font-weight:bold;font-variant-numeric:tabular-nums;white-space:nowrap}
th.amount{text-align:right}
.currency{white-space:nowrap}
.category-mark{color:${accentDark};font-weight:bold;margin-right:6px}
.inline-icon{width:15px;height:15px;display:inline-block;vertical-align:-3px;margin-right:5px;color:#64748b}.category-mark .inline-icon{color:${accentDark}}.currency-separator{padding:0 4px}
.note{color:#56657a}
.empty{text-align:center;color:#64748b;padding:24px}
.footer{margin-top:22px;padding-top:10px;border-top:1px solid #e2e9f0;display:flex;justify-content:space-between;color:#64748b;font-size:9px}
</style></head><body>
<section class="header">
  <div class="brand-row"><div class="brand">TOMORROW <span>FINANCE</span></div><div class="eyebrow">FINANCIAL STATEMENT</div></div>
  <div class="rule"></div>
  <div class="heading-row"><div><h1>${heading}</h1><div class="subtitle">Financial activity report</div></div>
  <div class="period"><div class="eyebrow">REPORT PERIOD</div><div class="value">${period}</div></div></div>
</section>
<section class="summary">
  <div class="summary-card"><div class="summary-label">Report Type</div><div class="summary-value accent">${expense ? 'Expenses' : 'Income'}</div></div>
  <div class="summary-card"><div class="summary-label">Transactions</div><div class="summary-value">${rows.length}</div></div>
  <div class="summary-card"><div class="summary-label">Currencies (${currencies.length})</div><div class="summary-value currencies">${currencyLabels}</div></div>
</section>
<h2 class="section">Transactions</h2>
<table><thead><tr><th>Date</th><th>Account</th><th>Category</th><th>Note</th><th class="amount">Amount</th><th>Currency</th></tr></thead>
<tbody>${body || '<tr><td class="empty" colspan="6">No transactions for this period</td></tr>'}</tbody></table>
<div class="footer"><span>Generated by Tomorrow Finance</span><span>Verified statement · Amounts shown in original currencies</span></div>
</body></html>`;
}
