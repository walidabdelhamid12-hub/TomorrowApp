import type { ExpensesStatementResult } from './expensesStatementReconciliation';
import { buildVerifiedOperatingStatementRows, type StatementExportNames } from './operatingStatementCsv';
import { buildStatementPrintHtml } from './statementPrintHtml';

/** Retains the Expenses export API while reusing the approved branded template. */
export function buildCompactExpensesPrintHtml(statement: ExpensesStatementResult, period: { from: string; to: string }, names: StatementExportNames): string {
  return buildStatementPrintHtml(buildVerifiedOperatingStatementRows(statement, names), {
    ...period, title: 'Expenses Statement', presentation: 'expenses',
  });
}
