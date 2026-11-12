import type { ExpensesStatementResult } from './expensesStatementReconciliation';
export function selectExpenseCurrency(statement: ExpensesStatementResult, currencyCode: string): ExpensesStatementResult {
  if (!currencyCode) return statement;
  return { ...statement, rows: statement.rows.filter(row => row.currencyCode === currencyCode),
    report: { ...statement.report, currencies: statement.report.currencies.filter(row => row.currencyCode === currencyCode),
      expenseCategories: statement.report.expenseCategories.filter(row => row.currencyCode === currencyCode) } };
}
export function expenseMonthPeriod(month: string) {
  const [year, number] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${new Date(year, number, 0).getDate()}`,
    label: new Date(year, number - 1, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' }) };
}
export function shiftExpenseMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number); const date = new Date(year, number - 1 + offset, 1);
  if (date.getFullYear() < 100 || date.getFullYear() > 9999 || (date.getFullYear() === 100 && date.getMonth() === 0)) return month;
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
