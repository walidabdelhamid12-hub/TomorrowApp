import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import { aggregateOperatingReport } from './reportAggregation';
import type { OperatingReport, ReportPeriod } from './reportAggregation';
import type { ReportClassificationContext } from './reportTransactionClassifier';

type Metric = 'income' | 'expenses' | 'net';
type Amounts = Record<Metric, number | null>;

export interface MonthlyOperatingReport {
  month: string;
  status: 'available' | 'no_transactions' | 'incomplete';
  /** Approved aggregation, including known subtotals and all diagnostics.
   * These subtotals are partial when status is incomplete. */
  report: OperatingReport;
}

export interface MonthlyMetricComparison {
  current: number | null;
  previous: number | null;
  /** Signed monetary difference: current minus previous, never FX converted. */
  difference: number | null;
  percentageChange: number | null;
  reason: 'incomplete_data' | 'unsafe_amount' | 'unsafe_difference'
    | 'zero_baseline' | 'negative_baseline' | null;
}

export interface MonthlyCurrencyComparison {
  currencyCode: string;
  currentStatus: 'available' | 'no_operating_activity' | 'incomplete';
  previousStatus: 'available' | 'no_operating_activity' | 'incomplete';
  income: MonthlyMetricComparison;
  expenses: MonthlyMetricComparison;
  net: MonthlyMetricComparison;
}

export interface MonthlyOperatingComparison {
  current: MonthlyOperatingReport;
  previous: MonthlyOperatingReport;
  currencies: MonthlyCurrencyComparison[];
}

function monthPeriod(month: string): ReportPeriod {
  const [year, number] = month.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return { from: month + '-01', to: month + '-' + days[number - 1] };
}

function compareMetric(
  current: number | null,
  previous: number | null,
  currentUnits: number | null,
  previousUnits: number | null,
  factor: number,
): MonthlyMetricComparison {
  const unavailable = (
    reason: MonthlyMetricComparison['reason'],
  ): MonthlyMetricComparison => ({
    current, previous, difference: null, percentageChange: null, reason,
  });

  if (current === null || previous === null) {
    return unavailable('incomplete_data');
  }

  if (currentUnits === null || previousUnits === null
    || !Number.isSafeInteger(currentUnits)
    || !Number.isSafeInteger(previousUnits)) {
    return unavailable('unsafe_amount');
  }

  const differenceUnits = currentUnits - previousUnits;

  if (!Number.isSafeInteger(differenceUnits)) {
    return unavailable('unsafe_difference');
  }

  const reason = previousUnits === 0 ? 'zero_baseline'
    : previousUnits < 0 ? 'negative_baseline' : null;

  return {
    current: currentUnits / factor,
    previous: previousUnits / factor,
    difference: differenceUnits / factor,
    percentageChange: reason
      ? null : (differenceUnits / previousUnits) * 100,
    reason,
  };
}

/** Pure report over the supplied ledger, not proof of complete imported history.
 * Unknowns conservatively invalidate every currency in that month: diagnostics
 * lack reliable currency attribution. Unplaceable dates are retained in BOTH
 * months by the approved aggregator and therefore make both incomplete.
 * Supported calendar range is 0100-02 through 9999-12, matching the existing
 * aggregator's Date.UTC validation and allowing a representable previous month.
 */
export function aggregateMonthlyOperatingComparison(
  ctx: ReportClassificationContext,
  month: string,
): MonthlyOperatingComparison {
  if (typeof month !== 'string' || month.length !== 7 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    || month < '0100-02') {
    throw new Error('Invalid report month: expected YYYY-MM in range 0100-02 through 9999-12');
  }
  const [year, number] = month.split('-').map(Number);
  const previousMonth = number === 1
    ? String(year - 1).padStart(4, '0') + '-12'
    : String(year).padStart(4, '0') + '-' + String(number - 1).padStart(2, '0');
  const buildMonth = (key: string): MonthlyOperatingReport => {
    const period = monthPeriod(key);
    const report = aggregateOperatingReport(ctx, period);
    const hasTransactions = ctx.ledger.transactions.some(tx =>
      tx.date >= period.from && tx.date <= period.to);
    return { month: key, report, status: report.unknown.length > 0
      ? 'incomplete' : hasTransactions ? 'available' : 'no_transactions' };
  };
  const current = buildMonth(month);
  const previous = buildMonth(previousMonth);
  const codes = new Set([
    ...ctx.ledger.accounts.map(account => account.currencyCode).filter(isSupportedCurrency),
    ...current.report.currencies.map(total => total.currencyCode),
    ...previous.report.currencies.map(total => total.currencyCode),
  ]);
  const periodAmounts = (report: MonthlyOperatingReport, currency: string): {
    amounts: Amounts;
    units?: { income: number; expenses: number; net: number };
    status: MonthlyCurrencyComparison['currentStatus'];
  } => {
    if (report.status === 'incomplete') return {
      amounts: { income: null, expenses: null, net: null }, status: 'incomplete',
    };
    const total = report.report.currencies.find(row => row.currencyCode === currency);
    return {
      amounts: total ?? { income: 0, expenses: 0, net: 0 },
      units: total?.minorUnits,
      status: total ? 'available' : 'no_operating_activity',
    };
  };
  const currencies = [...codes].sort().map(currencyCode => {
    const now = periodAmounts(current, currencyCode);
    const before = periodAmounts(previous, currencyCode);
    const factor = 10 ** getCurrencyDecimals(currencyCode);
    return { currencyCode, currentStatus: now.status, previousStatus: before.status,
      income: compareMetric(
        now.amounts.income, before.amounts.income,
        now.units?.income ?? (now.status === 'no_operating_activity' ? 0 : null),
        before.units?.income ?? (before.status === 'no_operating_activity' ? 0 : null),
        factor,
      ),
      expenses: compareMetric(
        now.amounts.expenses, before.amounts.expenses,
        now.units?.expenses ?? (now.status === 'no_operating_activity' ? 0 : null),
        before.units?.expenses ?? (before.status === 'no_operating_activity' ? 0 : null),
        factor,
      ),
      net: compareMetric(
        now.amounts.net, before.amounts.net,
        now.units?.net ?? (now.status === 'no_operating_activity' ? 0 : null),
        before.units?.net ?? (before.status === 'no_operating_activity' ? 0 : null),
        factor,
      ) };
  });
  return { current, previous, currencies };
}
