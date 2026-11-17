import { buildConvertedComparison, convertComparisonAmount } from './comparisonConverted';
import { getCurrencyDecimals } from '../constants/currencies';
import { reportAmountToUnits } from './reportAggregation';
import type { OperatingComparison } from './comparisonAggregation';
import type { IncomeStatementResult } from './incomeStatementReconciliation';
import type { ExpensesStatementResult } from './expensesStatementReconciliation';
import type { ReportTable } from './reportTableExport';

export interface ComparisonStatementRow {
  readonly kind: 'Income' | 'Expenses';
  readonly id: string;
  readonly date: string;
  readonly accountId: string;
  readonly categoryId: string;
  readonly note?: string;
  readonly amount: number;
  readonly currencyCode: string;
}

/** Fail-closed: reconciles both statement streams to exact comparison minor units. */
export function buildComparisonStatement(
  comparison: OperatingComparison,
  income: IncomeStatementResult,
  expenses: ExpensesStatementResult,
  currencyCode: string,
): ComparisonStatementRow[] {
  if (!comparison.verified || comparison.unknown.length || !income.reconciled || !expenses.reconciled
    || income.report.unknown.length || expenses.report.unknown.length
    || income.report.period.from !== comparison.period.from || income.report.period.to !== comparison.period.to
    || expenses.report.period.from !== comparison.period.from || expenses.report.period.to !== comparison.period.to) {
    throw new Error('Comparison statement is not verified');
  }
  const selected = comparison.currencies.find(row => row.currencyCode === currencyCode);
  if (!selected || !selected.minorUnits) throw new Error('Comparison currency is unavailable');
  const rows: ComparisonStatementRow[] = [];
  let incomeUnits = 0;
  let expenseUnits = 0;
  const seen = new Set<string>();
  for (const [kind, source] of [['Income', income.rows], ['Expenses', expenses.rows]] as const) {
    for (const row of source) {
      if (row.currencyCode !== currencyCode) continue;
      if (!row.id || !row.accountId || !row.categoryId || !row.date
        || row.date < comparison.period.from || row.date > comparison.period.to || seen.has(row.id)) {
        throw new Error('Invalid or duplicate comparison statement row');
      }
      seen.add(row.id);
      const units = reportAmountToUnits(row.amount, currencyCode);
      if (units === null) throw new Error('Unsafe comparison statement amount');
      if (kind === 'Income') incomeUnits += units; else expenseUnits += units;
      if (!Number.isSafeInteger(incomeUnits) || !Number.isSafeInteger(expenseUnits)) {
        throw new Error('Unsafe comparison statement total');
      }
      rows.push({ kind, id: row.id, date: row.date, accountId: row.accountId,
        categoryId: row.categoryId, note: row.note, amount: row.amount, currencyCode });
    }
  }
  if (incomeUnits !== selected.minorUnits.income || expenseUnits !== selected.minorUnits.expenses
    || incomeUnits - expenseUnits !== selected.minorUnits.netDifference) {
    throw new Error('Comparison statement does not reconcile');
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** Uses existing verified ReportTable PDF/XLSX pipeline, one selected currency only. */
export function buildComparisonExportTable(
  comparison: OperatingComparison,
  income: IncomeStatementResult,
  expenses: ExpensesStatementResult,
  currencyCode: string,
  names: { accounts: ReadonlyMap<string, string>; categories: ReadonlyMap<string, string> },
): ReportTable {
  const rows = buildComparisonStatement(comparison, income, expenses, currencyCode);
  const selected = comparison.currencies.find(item => item.currencyCode === currencyCode);
  if (!selected) throw new Error('Missing comparison totals');
  const decimalPlaces = getCurrencyDecimals(currencyCode);
  if (decimalPlaces !== 2 && decimalPlaces !== 3) {
    throw new Error('Unsupported comparison export currency precision');
  }
  const tableRows = rows.map(row => {
    const account = names.accounts.get(row.accountId);
    const category = names.categories.get(row.categoryId)
      ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : undefined);
    if (!account || !category) throw new Error('Missing comparison statement names');
    return [row.date, row.kind, account, category, row.note ?? '', row.amount, currencyCode] as const;
  });
  return {
    title: 'Income vs Expenses Comparison', period: comparison.period,
    notice: `Verified ordinary income and net expenses (including refunds). Selected currency: ${currencyCode}. Total income: ${selected.income}; total expenses: ${selected.expenses}; net difference: ${selected.netDifference}. No cross-currency conversion or posting.`,
    columns: ['Date', 'Type', 'Account', 'Category', 'Description', 'Amount', 'Currency'],
    rows: tableRows, numericColumns: [5], decimalPlaces,
    verified: comparison.verified && rows.length > 0,
  };
}

/** Verified multi-currency statement export, valued using Total Balance's trusted FX rates.
 * Original amounts/currencies remain visible; converted values are display-only. */
export function buildConvertedComparisonExportTable(
  comparison: OperatingComparison,
  income: IncomeStatementResult,
  expenses: ExpensesStatementResult,
  currencyCode: string,
  fx: import('./comparisonConverted').ComparisonFx,
  names: { accounts: ReadonlyMap<string, string>; categories: ReadonlyMap<string, string> },
): ReportTable {
  const converted = buildConvertedComparison(comparison, currencyCode, fx);
  if (!converted) throw new Error('Verified FX rates or transaction totals unavailable');
  const decimalPlaces = getCurrencyDecimals(currencyCode);
  if (decimalPlaces !== 2 && decimalPlaces !== 3) throw new Error('Unsupported comparison export precision');
  const rows = comparison.currencies.flatMap(item => buildComparisonStatement(comparison, income, expenses, item.currencyCode));
  const tableRows = rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).map(row => {
    const account = names.accounts.get(row.accountId);
    const category = names.categories.get(row.categoryId) ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : undefined);
    const value = convertComparisonAmount(row.amount, row.currencyCode, currencyCode, fx);
    if (!account || !category || value === null) throw new Error('Unverified comparison export row');
    return [row.date, row.kind, account, category, row.note ?? '', row.amount.toString(), row.currencyCode, value, currencyCode] as const;
  });
  return {
    title: 'Income vs Expenses Comparison', period: comparison.period,
    notice: `Verified income ${converted.income}, expenses ${converted.expenses}, net ${converted.netDifference} ${currencyCode}. Original amounts preserved. Conversion uses current verified Total Balance rates; per-row displayed rounding may differ from rounded aggregate totals. No financial posting.`,
    columns: ['Date', 'Type', 'Account', 'Category', 'Description', 'Original Amount', 'Original Currency', 'Converted Amount', 'Display Currency'],
    rows: tableRows, numericColumns: [7], decimalPlaces,
    verified: comparison.verified && rows.length > 0,
  };
}
