import { getCurrencyDecimals } from '../constants/currencies';
import { convertAmountUnrounded, type RateMap } from './money';
import type { OperatingComparison } from './comparisonAggregation';
import type { ComparisonTrendPoint } from './comparisonTrend';

export interface ComparisonFx {
  rates: RateMap;
  verifiedCurrencies: readonly string[];
}

/** Display-only conversion using the same verified, unrounded FX path as Total Balance. */
export function convertComparisonAmount(amount: number, from: string, to: string, fx: ComparisonFx): number | null {
  const result = convertAmountUnrounded(amount, from, to, fx.rates, fx.verifiedCurrencies);
  return result !== null && Number.isFinite(result) ? result : null;
}

export function buildConvertedComparison(comparison: OperatingComparison, currencyCode: string, fx: ComparisonFx) {
  if (!comparison.verified) return null;
  let income = 0;
  let expenses = 0;
  for (const item of comparison.currencies) {
    const i = convertComparisonAmount(item.income, item.currencyCode, currencyCode, fx);
    const e = convertComparisonAmount(item.expenses, item.currencyCode, currencyCode, fx);
    if (i === null || e === null) return null;
    income += i;
    expenses += e;
  }
  if (!Number.isFinite(income) || !Number.isFinite(expenses)) return null;
  const factor = 10 ** getCurrencyDecimals(currencyCode);
  const rounded = (n: number) => Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * factor) / factor;
  const incomeRounded = rounded(income);
  const expensesRounded = rounded(expenses);
  const categories = [];
  for (const item of comparison.categories) {
    const amount = convertComparisonAmount(item.amount, item.currencyCode, currencyCode, fx);
    if (amount === null) return null;
    categories.push({ ...item, currencyCode, amount });
  }
  const grouped = new Map<string, (typeof categories)[number]>();
  for (const item of categories) {
    const key = `${item.kind}:${item.categoryId}`;
    const existing = grouped.get(key);
    grouped.set(key, existing ? { ...existing, amount: existing.amount + item.amount } : item);
  }
  return { currencyCode, income: incomeRounded, expenses: expensesRounded,
    netDifference: rounded(incomeRounded - expensesRounded),
    spendingRatio: income === 0 ? null : expenses / income * 100,
    categories: [...grouped.values()].map(item => ({ ...item, amount: rounded(item.amount) })) };
}

export function convertComparisonTrend(
  series: readonly { currencyCode: string; verified: boolean; points: readonly ComparisonTrendPoint[] }[],
  currencyCode: string,
  fx: ComparisonFx,
): { verified: boolean; points: ComparisonTrendPoint[] } {
  if (series.some(s => !s.verified)) return { verified: false, points: [] };
  const first = series[0]?.points ?? [];
  const points: ComparisonTrendPoint[] = [];
  for (let i = 0; i < first.length; i++) {
    let income = 0;
    let expenses = 0;
    for (const s of series) {
      const p = s.points[i];
      if (!p || p.label !== first[i].label || p.period.from !== first[i].period.from || p.period.to !== first[i].period.to) return { verified: false, points: [] };
      const inc = convertComparisonAmount(p.income, s.currencyCode, currencyCode, fx);
      const exp = convertComparisonAmount(p.expenses, s.currencyCode, currencyCode, fx);
      if (inc === null || exp === null) return { verified: false, points: [] };
      income += inc;
      expenses += exp;
    }
    if (!Number.isFinite(income) || !Number.isFinite(expenses)) return { verified: false, points: [] };
    points.push({ ...first[i], income, expenses });
  }
  return { verified: true, points };
}
