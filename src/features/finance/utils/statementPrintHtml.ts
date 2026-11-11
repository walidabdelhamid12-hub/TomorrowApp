/**
 * Offline, read-only HTML document for PDF printing. This function does not
 * print, write a file, or imply that a PDF was generated.
 */
import { serializeStatementCsv, type StatementCsvRow } from './statementCsv';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildStatementPrintHtml(
  rows: readonly StatementCsvRow[],
  options: { title: string; from: string; to: string },
): string {
  // Reuse the CSV calendar, currency, and amount checks for both formats.
  // No file is written; this is validation only.
  serializeStatementCsv(rows, options);
  const body = rows.map(row => {
    return '<tr>' + [row.date, row.account, row.category, row.note ?? '', row.amount, row.currency]
      .map(value => '<td>' + escapeHtml(value) + '</td>').join('') + '</tr>';
  }).join('');
  const heading = escapeHtml(options.title);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + '<style>body{font-family:Arial,sans-serif;color:#222;margin:24px}h1{font-size:22px}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #aaa;padding:7px;text-align:left;overflow-wrap:anywhere}'
    + 'thead{display:table-header-group}tr{break-inside:avoid}th{background:#eee}</style></head><body>'
    + '<h1>' + heading + '</h1><p>' + escapeHtml(options.from) + ' — ' + escapeHtml(options.to) + '</p>'
    + '<table><thead><tr>' + ['Date', 'Account', 'Category', 'Note', 'Amount', 'Currency']
      .map(value => '<th>' + value + '</th>').join('')
    + '</tr></thead><tbody>' + body + '</tbody></table></body></html>';
}
