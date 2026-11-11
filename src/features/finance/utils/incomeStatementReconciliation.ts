import { aggregateOperatingReport, reportAmountToUnits, type OperatingReportFilters, type ReportPeriod } from './reportAggregation';
import { classifyReportTransactions, type ReportClassificationContext } from './reportTransactionClassifier';

export interface IncomeStatementRow {
  id: string;
  date: string;
  note?: string;
  accountId: string;
  categoryId: string;
  currencyCode: string;
  amount: number;
}
export interface IncomeStatementResult {
  report: ReturnType<typeof aggregateOperatingReport>;
  rows: IncomeStatementRow[];
  reconciled: boolean;
}

/** Read-only, fail-closed statement. Never include report-rejected transactions. */
export function buildIncomeStatement(
  context: ReportClassificationContext,
  period: ReportPeriod,
  filters: OperatingReportFilters = {},
): IncomeStatementResult {
  const report = aggregateOperatingReport(context, period, filters);
  const rejected = new Set(report.unknown.map(item => item.id));
  const classified = classifyReportTransactions(context);
  const rows: IncomeStatementRow[] = [];
  const sums = new Map<string, number>();
  let safe = true;
  for (let index = 0; index < classified.length; index++) {
    const item = classified[index];
    const tx = context.ledger.transactions[index];
    if (item.kind !== 'income' || rejected.has(tx.id)
      || tx.date < period.from || tx.date > period.to
      || (filters.accountId !== undefined && tx.accountId !== filters.accountId)
      || (filters.categoryId !== undefined && (item.categoryId ?? 'uncategorized') !== filters.categoryId)) continue;
    const units = reportAmountToUnits(item.incomeAmount, item.currencyCode);
    if (units === null) { safe = false; continue; }
    const next = (sums.get(item.currencyCode) ?? 0) + units;
    if (!Number.isSafeInteger(next)) {
      safe = false;
      continue;
    }
    sums.set(item.currencyCode, next);
    rows.push({
      id: tx.id, date: tx.date, note: tx.note, accountId: tx.accountId,
      categoryId: item.categoryId ?? 'uncategorized',
      currencyCode: item.currencyCode, amount: item.incomeAmount,
    });
  }
  for (const total of report.currencies) {
    if (total.minorUnits === undefined
      || (sums.get(total.currencyCode) ?? 0) !== total.minorUnits.income) safe = false;
  }
  for (const [currency, units] of sums) {
    if (!report.currencies.some(total => total.currencyCode === currency
      && total.minorUnits?.income === units)) safe = false;
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { report, rows: safe ? rows : [], reconciled: safe };
}
