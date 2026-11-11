import { isSupportedCurrency } from '../constants/currencies';
import { aggregateOperatingReport } from './reportAggregation';
import type { OperatingReport, OperatingReportFilters, ReportPeriod } from './reportAggregation';
import type { ReportClassificationContext } from './reportTransactionClassifier';

export type TrendStatus = 'available' | 'no_transactions' | 'incomplete';
export type TrendCurrencyStatus = 'available' | 'no_operating_activity' | 'incomplete';

export interface MonthlyTrendPeriod {
  month: string;
  status: TrendStatus;
  report: OperatingReport;
}

export interface MonthlyTrendCurrencyPoint {
  month: string;
  status: TrendCurrencyStatus;
  income: number | null;
  expenses: number | null;
  net: number | null;
}

export interface MonthlyTrendCurrency {
  currencyCode: string;
  points: MonthlyTrendCurrencyPoint[];
}

export interface MonthlyOperatingTrend {
  months: MonthlyTrendPeriod[];
  currencies: MonthlyTrendCurrency[];
}

function monthPeriod(year: number, month: number): ReportPeriod {
  const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return { from: `${key}-01`, to: `${key}-${String(days[month - 1]).padStart(2, '0')}` };
}

/** Read-only chronological operating series. Never performs FX conversion or posting. */
export function aggregateMonthlyOperatingTrend(
  ctx: ReportClassificationContext,
  startMonth: string,
  monthCount: number,
  filters?: OperatingReportFilters,
): MonthlyOperatingTrend {
  if (typeof startMonth !== 'string'
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)
    || startMonth < '0100-01'
    || !Number.isInteger(monthCount) || monthCount < 1 || monthCount > 24) {
    throw new Error('Invalid monthly trend range');
  }
  const [year, month] = startMonth.split('-').map(Number);
  if (year * 12 + month - 1 + monthCount - 1 > 9999 * 12 + 11) {
    throw new Error('Invalid monthly trend range');
  }

  const months: MonthlyTrendPeriod[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    const offset = year * 12 + month - 1 + i;
    const y = Math.floor(offset / 12);
    const m = offset % 12 + 1;
    const period = monthPeriod(y, m);
    // Delegate filter validation, classification, refunds, and monetary safety
    // to the existing approved aggregation engine.
    const report = aggregateOperatingReport(ctx, period, filters);
    const hasTransactions = ctx.ledger.transactions.some(tx =>
      typeof tx.date === 'string' && tx.date >= period.from && tx.date <= period.to);
    months.push({
      month: period.from.slice(0, 7),
      report,
      status: report.unknown.length ? 'incomplete'
        : hasTransactions ? 'available' : 'no_transactions',
    });
  }

  const codes = new Set<string>([
    ...ctx.ledger.accounts.map(account => account.currencyCode).filter(isSupportedCurrency),
    ...months.flatMap(entry => entry.report.currencies.map(row => row.currencyCode)),
  ]);
  const currencies = [...codes].sort().map(currencyCode => ({
    currencyCode,
    points: months.map(entry => {
      if (entry.status === 'incomplete') {
        return { month: entry.month, status: 'incomplete' as const,
          income: null, expenses: null, net: null };
      }
      const total = entry.report.currencies.find(row => row.currencyCode === currencyCode);
      return { month: entry.month,
        status: total ? 'available' as const : 'no_operating_activity' as const,
        income: total?.income ?? 0,
        expenses: total?.expenses ?? 0,
        net: total?.net ?? 0 };
    }),
  }));
  return { months, currencies };
}
