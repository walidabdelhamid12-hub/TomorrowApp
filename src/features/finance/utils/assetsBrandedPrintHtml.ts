import { type ReportTable, validateReportTable, reportTableNumber } from './reportTableExport';

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const display = (value: string): string => value === 'g' ? 'Gr' : value;
const formatDate = (date: string): string => {
  const [year, month, day] = date.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[Number(month) - 1]} ${year}`;
};
/** Read-only Assets print presentation. Uses the approved Expenses statement visual geometry. */
export function buildAssetsBrandedPrintHtml(table: ReportTable): string {
  validateReportTable(table);
  const assetCount = table.rows.length;
  const unitIndex = table.columns.findIndex(name => name.toLowerCase() === 'unit');
  const units = [...new Set(table.rows.map(row => unitIndex >= 0 ? display(String(row[unitIndex])) : ''))].filter(Boolean);
  const typeIndex = table.columns.findIndex(name => name.toLowerCase() === 'type');
  const cell = (row: ReportTable['rows'][number], index: number) => {
    const value = row[index];
    const text = esc(typeof value === 'number' ? reportTableNumber(table, row, index, value) : display(String(value)));
    if (index === typeIndex && value === 'Gold') return `<strong class="metal-gold">${text}</strong>`;
    if (index === typeIndex && value === 'Silver') return `<strong class="metal-silver">${text}</strong>`;
    return text;
  };
  const headers = table.columns.map(name => `<th>${esc(name)}</th>`).join('');
  const body = table.rows.map((row, index) => `<tr class="${index % 2 ? 'alternate' : ''}">${row.map((_, i) => `<td>${cell(row, i)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{width:190mm;max-width:100%;margin:0;padding:0;direction:ltr;text-align:left}
body{font-family:Arial,Helvetica,sans-serif;color:#203149;font-size:11pt;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:#142b49;color:white;border-radius:8px;padding:18px 20px;page-break-inside:avoid}
.brand-row,.heading-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.brand{font-weight:800;letter-spacing:1.2px;font-size:16px}.brand span{color:#83d9d0}.eyebrow{font-size:11px;letter-spacing:1.4px;color:#dce8f5}
.rule{height:1px;background:#506783;margin:12px 0}h1{font-size:24pt;line-height:1.2;color:#65d6a3;margin:0 0 6px}.subtitle{color:#dce8f5;font-size:13px}
.period{text-align:right;max-width:45%;padding-left:12px}.period .value{font-size:10pt;font-weight:bold;color:white;margin-top:7px}
.summary{display:flex;direction:ltr;gap:9px;margin:14px 0 18px;page-break-inside:avoid}.summary-card{direction:ltr;text-align:left;background:#f1f5f9;border:1px solid #e2e9f0;border-radius:7px;padding:11px 12px;flex:1;min-width:0}
.summary-label{font-size:10pt;color:#64748b;margin-bottom:7px}.summary-value{font-size:20pt;font-weight:bold;color:#142b49;overflow-wrap:anywhere}.summary-value.accent{color:#167b57}.summary-value.units{font-size:10pt;line-height:1.6}
.section{font-size:14pt;font-weight:bold;color:#142b49;margin:0 0 10px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;line-height:1.35}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
th{background:#e9f0f7;color:#142b49;text-align:left;padding:9px 3px;border-bottom:2px solid #b9cadb;overflow-wrap:anywhere}td{padding:9px 3px;border-bottom:1px solid #e2e9f0;vertical-align:top;overflow-wrap:anywhere}tr.alternate{background:#f7f9fc}
.metal-gold{color:#A97808;font-weight:800}.metal-silver{color:#697586;font-weight:800}
.footer{margin-top:18px;padding-top:10px;border-top:1px solid #e2e9f0;display:flex;justify-content:space-between;gap:12px;color:#64748b;font-size:9pt}.notice{font-size:9pt;color:#64748b;margin-top:12px}
</style></head><body><section class="header"><div class="brand-row"><div class="brand">TOMORROW <span>FINANCE</span></div><div class="eyebrow">FINANCIAL STATEMENT</div></div><div class="rule"></div><div class="heading-row"><div><h1>Assets</h1><div class="subtitle">Financial activity report</div></div><div class="period"><div class="eyebrow">REPORT PERIOD</div><div class="value">${esc(formatDate(table.period.from))} – ${esc(formatDate(table.period.to))}</div></div></div></section>
<section class="summary"><div class="summary-card"><div class="summary-label">Report Type</div><div class="summary-value accent">Assets</div></div><div class="summary-card"><div class="summary-label">Assets</div><div class="summary-value">${assetCount}</div></div><div class="summary-card"><div class="summary-label">Units (${units.length})</div><div class="summary-value units">${esc(units.join(' · ') || '—')}</div></div></section>
<h2 class="section">Assets</h2><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table><div class="notice">${esc(table.notice)}</div><div class="footer"><span>Generated by Tomorrow Finance</span><span>Verified quantity statement · No historical market valuation</span></div></body></html>`;
}
