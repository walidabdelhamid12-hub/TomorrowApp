/**
 * Read-only, spreadsheet-compatible CSV serialization for reconciled statement
 * rows. CSV is not an XLSX workbook; callers must label the format accurately.
 */
export interface StatementCsvRow {
  date: string;
  account: string;
  category: string;
  note?: string;
  amount: string;
  currency: string;
}
function csvCell(value: string, numeric = false): string {
  // Spreadsheet applications interpret these prefixes as formulas. Quote alone
  // is not sufficient; force text interpretation before CSV escaping.
  const safe = !numeric && /^[\s\u0000-\u001f]*[=+@\-]/u.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function serializeStatementCsv(
  rows: readonly StatementCsvRow[],
  options: { from: string; to: string; title: string },
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from)
    || !/^\d{4}-\d{2}-\d{2}$/.test(options.to) || options.from > options.to
    || !options.title.trim()) throw new Error('Invalid statement export metadata');
  const header = ['Date', 'Account', 'Category', 'Note', 'Amount', 'Currency'];
  const data = rows.map(row => {
    if (row.date < options.from || row.date > options.to
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !/^-?\d+(?:\.\d+)?$/.test(row.amount)
      || !/^[A-Z]{3}$/.test(row.currency)) throw new Error('Invalid statement export row');
    return [row.date, row.account, row.category, row.note ?? '', row.amount, row.currency]
      .map((value, index) => csvCell(value, index === 4)).join(',');
  });
  return '\uFEFF' + [header.map(csvCell).join(','), ...data].join('\r\n') + '\r\n';
}
