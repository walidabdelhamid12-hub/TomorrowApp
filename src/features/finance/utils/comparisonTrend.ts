import { getCurrencyDecimals } from '../constants/currencies';
import { aggregateOperatingReport, type OperatingReport, type OperatingReportFilters, type ReportPeriod } from './reportAggregation';
import type { ReportClassificationContext } from './reportTransactionClassifier';

export interface ComparisonTrendPoint {
  period: ReportPeriod;
  label: string;
  income: number;
  expenses: number;
}
export interface ComparisonTrend { verified: boolean; points: ComparisonTrendPoint[] }

/** Read-only, exact monthly bucket reconciliation; no estimated or cross-currency totals. */
export function buildComparisonTrend(
  context: ReportClassificationContext,
  period: ReportPeriod,
  filters: OperatingReportFilters,
  overall: OperatingReport,
  currencyCode: string,
): ComparisonTrend {
  const invalid: ComparisonTrend = { verified: false, points: [] };
  if (overall.unknown.length || overall.period.from !== period.from || overall.period.to !== period.to) return invalid;
  const expected = overall.currencies.find(row => row.currencyCode === currencyCode);
  if (expected && !expected.minorUnits) return invalid;
  const points: ComparisonTrendPoint[] = [];
  let incomeUnits = 0;
  let expenseUnits = 0;
  let cursor = period.from.slice(0, 7);
  const last = period.to.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(cursor) || !/^\d{4}-\d{2}$/.test(last) || cursor > last) return invalid;
  // Limit report recomputations and fail closed for very large date ranges.
  for (let index = 0; cursor <= last; index++) {
    if (index >= 60) return invalid;
    const [year, month] = cursor.split('-').map(Number);
    if (month < 1 || month > 12 || year < 100 || year > 9999) return invalid;
    const monthEnd = `${cursor}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
    const slice = { from: index === 0 ? period.from : `${cursor}-01`, to: monthEnd < period.to ? monthEnd : period.to };
    if (slice.from > slice.to) return invalid;
    const bucket = aggregateOperatingReport(context, slice, filters);
    if (bucket.unknown.length) return invalid;
    const row = bucket.currencies.find(item => item.currencyCode === currencyCode);
    const units = row?.minorUnits;
    if (row && !units) return invalid;
    incomeUnits += units?.income ?? 0;
    expenseUnits += units?.expenses ?? 0;
    if (!Number.isSafeInteger(incomeUnits) || !Number.isSafeInteger(expenseUnits)) return invalid;
    points.push({ period: slice, label: cursor, income: (units?.income ?? 0) / 10 ** getCurrencyDecimals(currencyCode), expenses: (units?.expenses ?? 0) / 10 ** getCurrencyDecimals(currencyCode) });
    const next = month === 12 ? [year + 1, 1] : [year, month + 1];
    cursor = `${String(next[0]).padStart(4, '0')}-${String(next[1]).padStart(2, '0')}`;
  }
  if (incomeUnits !== (expected?.minorUnits?.income ?? 0) || expenseUnits !== (expected?.minorUnits?.expenses ?? 0)) return invalid;
  return { verified: true, points };
}
