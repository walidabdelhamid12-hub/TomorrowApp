import type { IncomeStatementResult } from './incomeStatementReconciliation';
import type { ExpensesStatementResult } from './expensesStatementReconciliation';
import { buildVerifiedOperatingStatementRows, type StatementExportNames } from './operatingStatementCsv';
import { buildStatementPrintHtml } from './statementPrintHtml';

/** Read-only printable document from the exact same verified rows as CSV. */
export function buildOperatingStatementPrintHtml(
  statement: IncomeStatementResult | ExpensesStatementResult,
  kind: 'income' | 'expenses',
  period: { from: string; to: string },
  names: StatementExportNames,
  language: 'en' | 'ar' = 'en',
): string {
  const rows = buildVerifiedOperatingStatementRows(statement, names);
  return buildStatementPrintHtml(rows, {
    ...period,
    title: kind === 'income' ? (language === 'ar' ? 'كشف الدخل' : 'Income Statement') : (language === 'ar' ? 'كشف المصروفات' : 'Expenses Statement'),
    language,
  });
}
