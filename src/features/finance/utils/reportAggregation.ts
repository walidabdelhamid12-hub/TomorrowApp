import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import type { ReportClassificationContext } from './reportTransactionClassifier';
import { classifyReportTransactions } from './reportTransactionClassifier';

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface ReportCurrencyTotal {
  currencyCode: string;
  income: number;
  expenses: number;
  net: number;
}

export interface ReportCategoryTotal {
  currencyCode: string;
  categoryId: string;
  amount: number;
}

export interface ReportUnknownTransaction {
  id: string;
  date: string;
  reason: string;
}

export interface OperatingReport {
  period: ReportPeriod;
  currencies: ReportCurrencyTotal[];
  incomeCategories: ReportCategoryTotal[];
  expenseCategories: ReportCategoryTotal[];
  unknown: ReportUnknownTransaction[];
  includedTransactions: number;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function toUnits(amount: number, currencyCode: string): number | null {
  if (!isSupportedCurrency(currencyCode)) return null;
  const factor = 10 ** getCurrencyDecimals(currencyCode);
  const scaled = amount * factor;
  const units = Math.round(scaled);

  if (!Number.isFinite(amount) || !Number.isSafeInteger(units)
    || Math.abs(scaled - units) > 0.000000001) {
    return null;
  }

  return units;
}

function addUnits(
  map: Map<string, number>,
  key: string,
  units: number,
): boolean {
  const next = (map.get(key) ?? 0) + units;
  if (!Number.isSafeInteger(next)) return false;
  map.set(key, next);
  return true;
}

/**
 * Pure, read-only operating P&L aggregation.
 * All amounts remain in their actual account currency.
 * No FX conversion, posting or store mutation.
 */
export function aggregateOperatingReport(
  ctx: ReportClassificationContext,
  period: ReportPeriod,
): OperatingReport {
  if (!validDate(period.from) || !validDate(period.to)
    || period.from > period.to) {
    throw new Error('Invalid report period');
  }

  const classified = classifyReportTransactions(ctx);
  const currencyTotals = new Map<
    string, { income: number; expenses: number }
  >();

  const incomeCategories = new Map<string, number>();
  const expenseCategories = new Map<string, number>();
  const unknown: ReportUnknownTransaction[] = [];

  let includedTransactions = 0;

  classified.forEach((item, index) => {
    const tx = ctx.ledger.transactions[index];

    if (!validDate(tx.date)) {
      unknown.push({
        id: tx.id,
        date: tx.date,
        reason: 'Invalid transaction date',
      });
      return;
    }

    if (tx.date < period.from || tx.date > period.to) return;

    if (item.kind === 'unknown') {
      unknown.push({
        id: tx.id,
        date: tx.date,
        reason: item.reason,
      });
      return;
    }

    if (item.kind !== 'income'
      && item.kind !== 'expense'
      && item.kind !== 'refund') {
      return;
    }

    if (!Number.isFinite(item.incomeAmount)
      || !Number.isFinite(item.expenseAmount)) {
      unknown.push({
        id: tx.id,
        date: tx.date,
        reason: 'Invalid classified amount',
      });
      return;
    }

    const currency = item.currencyCode;
    const incomeUnits = toUnits(item.incomeAmount, currency);
    const expenseUnits = toUnits(item.expenseAmount, currency);

    if (incomeUnits === null || expenseUnits === null) {
      unknown.push({
        id: tx.id,
        date: tx.date,
        reason: 'Invalid monetary precision or unsafe amount',
      });
      return;
    }

    const current = currencyTotals.get(currency)
      ?? { income: 0, expenses: 0 };

    const nextIncome = current.income + incomeUnits;
    const nextExpenses = current.expenses + expenseUnits;

    if (!Number.isSafeInteger(nextIncome)
      || !Number.isSafeInteger(nextExpenses)
      || !Number.isSafeInteger(nextIncome - nextExpenses)) {
      unknown.push({
        id: tx.id,
        date: tx.date,
        reason: 'Unsafe report total',
      });
      return;
    }

    const categoryId = item.categoryId ?? 'uncategorized';
    const key = JSON.stringify([currency, categoryId]);
    const categoryMap = item.kind === 'income'
      ? incomeCategories : expenseCategories;
    const categoryUnits = item.kind === 'income'
      ? incomeUnits : expenseUnits;

    const nextCategory = (categoryMap.get(key) ?? 0) + categoryUnits;

    if (!Number.isSafeInteger(nextCategory)) {
      unknown.push({
        id: tx.id,
        date: tx.date,
        reason: 'Unsafe category total',
      });
      return;
    }

    currencyTotals.set(currency, {
      income: nextIncome,
      expenses: nextExpenses,
    });
    addUnits(categoryMap, key, categoryUnits);

    includedTransactions += 1;
  });

  const categoriesToArray = (
    map: Map<string, number>,
  ): ReportCategoryTotal[] =>
    [...map.entries()].map(([key, amount]) => {
      const [currencyCode, categoryId] =
        JSON.parse(key) as [string, string];

      return { currencyCode, categoryId, amount: amount / (10 ** getCurrencyDecimals(currencyCode)) };
    }).sort((a, b) =>
      a.currencyCode.localeCompare(b.currencyCode)
      || a.categoryId.localeCompare(b.categoryId)
    );

  return {
    period: { ...period },
    currencies: [...currencyTotals.entries()]
      .map(([currencyCode, totals]) => ({
        currencyCode,
        income: totals.income / (10 ** getCurrencyDecimals(currencyCode)),
        expenses: totals.expenses / (10 ** getCurrencyDecimals(currencyCode)),
        net: (totals.income - totals.expenses) / (10 ** getCurrencyDecimals(currencyCode)),
      }))
      .sort((a, b) =>
        a.currencyCode.localeCompare(b.currencyCode)
      ),
    incomeCategories: categoriesToArray(incomeCategories),
    expenseCategories: categoriesToArray(expenseCategories),
    unknown,
    includedTransactions,
  };
}