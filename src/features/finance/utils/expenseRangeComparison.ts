import { getCurrencyDecimals } from '../constants/currencies';
import { aggregateOperatingReport } from './reportAggregation';
import type { OperatingReportFilters, ReportPeriod } from './reportAggregation';
import type { ReportClassificationContext } from './reportTransactionClassifier';
import { previousExpensePeriod } from './expenseDateRange';

export interface ExpenseRangeMetric {
  previous: number | null;
  difference: number | null;
  percentageChange: number | null;
  reason: 'incomplete_data' | 'unsafe_amount' | 'unsafe_difference' | 'zero_baseline' | 'negative_baseline' | null;
}

/** Read-only comparison using the same account/category filters and currency precision. */
export function compareExpenseRange(
  context: ReportClassificationContext,
  period: ReportPeriod,
  currencyCode: string,
  filters: OperatingReportFilters = {},
): ExpenseRangeMetric {
  const previous = previousExpensePeriod(period);
  const currentReport = aggregateOperatingReport(context, period, filters);
  const previousReport = aggregateOperatingReport(context, previous, filters);
  const unavailable = (reason: ExpenseRangeMetric['reason']): ExpenseRangeMetric =>
    ({ previous: null, difference: null, percentageChange: null, reason });
  if (currentReport.unknown.length || previousReport.unknown.length) return unavailable('incomplete_data');
  const now = currentReport.currencies.find(row => row.currencyCode === currencyCode);
  const before = previousReport.currencies.find(row => row.currencyCode === currencyCode);
  const nowUnits = now?.minorUnits?.expenses ?? (now ? null : 0);
  const beforeUnits = before?.minorUnits?.expenses ?? (before ? null : 0);
  if (nowUnits === null || beforeUnits === null || !Number.isSafeInteger(nowUnits) || !Number.isSafeInteger(beforeUnits)) return unavailable('unsafe_amount');
  const differenceUnits = nowUnits - beforeUnits;
  if (!Number.isSafeInteger(differenceUnits)) return unavailable('unsafe_difference');
  const factor = 10 ** getCurrencyDecimals(currencyCode);
  const reason = beforeUnits === 0 ? 'zero_baseline' : beforeUnits < 0 ? 'negative_baseline' : null;
  return {
    previous: beforeUnits / factor,
    difference: differenceUnits / factor,
    percentageChange: reason ? null : differenceUnits / beforeUnits * 100,
    reason,
  };
}
