/**
 * Offline, read-only HTML document for PDF printing. This function does not
 * print, write a file, or imply that a PDF was generated.
 */
import type { StatementCsvRow } from './statementCsv';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildStatementPrintHtml(
  rows: readonly StatementCsvRow[],
  options: { title: string; from: string; to: string },
): string {
  if (!options.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(options.from)
    || !/^\d{4}-\d{2}-\d{2}$/.test(options.to) || options.from > options.to) {
    throw new Error('Invalid statement print metadata');
  }
  const body = rows.map(row => {
    if (row.date < options.from || row.date > options.to
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !/^-?\d+(?:\.\d+)?$/.test(row.amount)
      || !/^[A-Z]{3}$/.test(row.currency)) {
      throw new Error('Invalid statement print row');
    }
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
