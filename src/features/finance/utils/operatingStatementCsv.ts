import type { IncomeStatementResult } from './incomeStatementReconciliation';
import type { ExpensesStatementResult } from './expensesStatementReconciliation';
import { formatAmount } from './amountFormat';
import { serializeStatementCsv } from './statementCsv';

export interface StatementExportNames {
  readonly accounts: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, string>;
}

/**
 * Build an Excel-compatible CSV only from reconciled, fully classified rows.
 * Unknown transactions are deliberately a hard stop for export, even when
 * known-only figures reconcile with the report.
 */
export function buildOperatingStatementCsv(
  statement: IncomeStatementResult | ExpensesStatementResult,
  kind: 'income' | 'expenses',
  period: { from: string; to: string },
  names: StatementExportNames,
): string {
  if (!statement.reconciled || statement.report.unknown.length > 0) {
    throw new Error('Statement export requires fully verified transactions');
  }
  const rows = statement.rows.map(row => {
    const account = names.accounts.get(row.accountId);
    if (!account) throw new Error('Statement export account is missing');
    const category = names.categories.get(row.categoryId)
      ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : undefined);
    if (!category) throw new Error('Statement export category is missing');
    const amount = formatAmount(row.amount, row.currencyCode).replace(/,/g, '');
    return {
      date: row.date, account, category, note: row.note,
      amount, currency: row.currencyCode,
    };
  });
  return serializeStatementCsv(rows, {
    ...period, title: kind === 'income' ? 'Income Statement' : 'Expenses Statement',
  });
}
