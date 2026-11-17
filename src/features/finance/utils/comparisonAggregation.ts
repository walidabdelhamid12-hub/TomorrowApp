import { getCurrencyDecimals } from '../constants/currencies';
import type {
  OperatingReport,
  ReportCategoryTotal,
  ReportPeriod,
} from './reportAggregation';

export interface ComparisonCurrencyTotal {
  currencyCode: string;
  income: number;
  expenses: number;
  netDifference: number;
  spendingRatio: number | null;
  minorUnits: Readonly<{ income: number; expenses: number; netDifference: number }>;
}
export interface ComparisonCategoryTotal extends ReportCategoryTotal {
  kind: 'income' | 'expense';
}
export interface OperatingComparison {
  period: ReportPeriod;
  currencies: ComparisonCurrencyTotal[];
  categories: ComparisonCategoryTotal[];
  includedTransactions: number;
  unknown: OperatingReport['unknown'];
  verified: boolean;
}

/** Read-only adapter over aggregateOperatingReport(); no FX conversion or writes. */
export function buildOperatingComparison(report: OperatingReport): OperatingComparison {
  if (!report || !report.period || !Array.isArray(report.currencies)
    || !Array.isArray(report.incomeCategories) || !Array.isArray(report.expenseCategories)
    || !Array.isArray(report.unknown) || !Number.isSafeInteger(report.includedTransactions)
    || report.includedTransactions < 0) throw new Error('Invalid operating report');

  const seen = new Set<string>();
  const currencies = report.currencies.map(row => {
    if (!row.currencyCode || seen.has(row.currencyCode)) {
      throw new Error('Invalid or duplicate report currency');
    }
    seen.add(row.currencyCode);
    const units = row.minorUnits;
    if (!units || !Number.isSafeInteger(units.income)
      || !Number.isSafeInteger(units.expenses) || !Number.isSafeInteger(units.net)
      || units.net !== units.income - units.expenses) {
      throw new Error(`Exact minor-unit totals unavailable or inconsistent: ${row.currencyCode}`);
    }
    const factor = 10 ** getCurrencyDecimals(row.currencyCode);
    if (!Number.isFinite(factor) || factor <= 0
      || row.income !== units.income / factor
      || row.expenses !== units.expenses / factor
      || row.net !== units.net / factor) {
      throw new Error(`Displayed totals do not match exact totals: ${row.currencyCode}`);
    }
    return {
      currencyCode: row.currencyCode,
      income: row.income,
      expenses: row.expenses,
      netDifference: units.net / factor,
      spendingRatio: units.income === 0 ? null : units.expenses / units.income * 100,
      minorUnits: Object.freeze({
        income: units.income, expenses: units.expenses, netDifference: units.net,
      }),
    };
  });

  const categories: ComparisonCategoryTotal[] = [
    ...report.incomeCategories.map(item => ({ ...item, kind: 'income' as const })),
    ...report.expenseCategories.map(item => ({ ...item, kind: 'expense' as const })),
  ].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)
    || a.kind.localeCompare(b.kind) || a.categoryId.localeCompare(b.categoryId));

  return {
    period: { ...report.period }, currencies, categories,
    includedTransactions: report.includedTransactions,
    unknown: [...report.unknown], verified: report.unknown.length === 0,
  };
}
