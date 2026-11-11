import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import type { ReportClassificationContext } from './reportTransactionClassifier';
import { classifyReportTransactions } from './reportTransactionClassifier';

export interface ReportPeriod {
  from: string;
  to: string;
}

/** Exact, case-sensitive IDs; no trimming, coercion, or unfiltered fallback. */
export interface OperatingReportFilters {
  readonly accountId?: string;
  readonly categoryId?: string;
}

export interface ReportCurrencyTotal {
  currencyCode: string;
  income: number;
  expenses: number;
  net: number;
  /**
   * Transient exact minor-unit totals for direct in-memory comparison.
   * Not serialized or preserved by spread/structuredClone.
   */
  readonly minorUnits?: Readonly<{
    income: number;
    expenses: number;
    net: number;
  }>;
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
  /** Present only for active filters. Totals are known subtotals when incomplete.
   * Completeness is relative to the supplied ledger, not verified history. */
  status?: 'complete' | 'incomplete';
}

function validateFilters(filters: OperatingReportFilters | undefined): OperatingReportFilters {
  if (filters === undefined) return {};
  if (filters === null || typeof filters !== 'object' || Array.isArray(filters)
    || (Object.getPrototypeOf(filters) !== Object.prototype
      && Object.getPrototypeOf(filters) !== null)) {
    throw new Error('Invalid report filters');
  }
  const selected: { accountId?: string; categoryId?: string } = {};
  for (const key of Reflect.ownKeys(filters)) {
    if (key !== 'accountId' && key !== 'categoryId') {
      throw new Error('Invalid report filter key');
    }
    const value = filters[key];
    if (typeof value !== 'string' || value.length === 0 || /[\s\u0000-\u001f\u007f]/u.test(value)) {
      throw new Error('Invalid report filter identifier');
    }
    selected[key] = value;
  }
  return selected;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

export function reportAmountToUnits(amount: number, currencyCode: string): number | null {
  if (!isSupportedCurrency(currencyCode) || !Number.isFinite(amount)) return null;

  const decimals = getCurrencyDecimals(currencyCode);
  const factor = 10 ** decimals;

  // Integers can be converted without fractional precision loss.
  if (Number.isSafeInteger(amount)) {
    const units = BigInt(amount) * BigInt(factor);
    return units <= BigInt(Number.MAX_SAFE_INTEGER)
      && units >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(units) : null;
  }

  // Reject fractional values whose binary spacing cannot preserve
  // the smallest currency unit reliably.
  const magnitude = Math.abs(amount);
  // Correct Math.log2 rounding near exact powers of two.
  // Subnormal values use the fixed IEEE-754 minimum spacing.
  const estimatedExponent = Math.floor(Math.log2(magnitude));
  const binaryExponent =
    magnitude < 2 ** estimatedExponent
      ? estimatedExponent - 1
      : estimatedExponent;
  const ulp = binaryExponent < -1022
    ? Number.MIN_VALUE
    : 2 ** (binaryExponent - 52);

  // A fractional value is ambiguous only when adjacent binary numbers
  // are spaced wider than the smallest monetary unit.
  if (ulp > 1 / factor) return null;

  const [coefficient, exponent = '0'] = Math.abs(amount).toString().toLowerCase().split('e');
  const fraction = coefficient.split('.')[1]?.length ?? 0;
  const shift = Number(exponent) - fraction + decimals;
  let units = BigInt(coefficient.replace('.', ''));

  if (shift >= 0) {
    units *= 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    if (units % divisor !== 0n) return null;
    units /= divisor;
  }

  if (amount < 0) units = -units;
  return units <= BigInt(Number.MAX_SAFE_INTEGER)
    && units >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(units) : null;
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
  filters?: OperatingReportFilters,
): OperatingReport {
  if (!validDate(period.from) || !validDate(period.to)
    || period.from > period.to) {
    throw new Error('Invalid report period');
  }

  const selected = validateFilters(filters);
  const hasFilters = selected.accountId !== undefined || selected.categoryId !== undefined;
  // Classification must retain originals and financing evidence outside the selection.
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

    if (hasFilters) {
      const invalidType = tx.type !== 'income' && tx.type !== 'expense';
      const unresolvedAccount = selected.accountId !== undefined
        && tx.accountId !== selected.accountId;
      // Only a unique, existing account can establish an unrelated account scope.
      if (unresolvedAccount && typeof tx.accountId === 'string'
        && ctx.ledger.accounts.filter(account => account.id === tx.accountId).length === 1) return;
      if (invalidType || unresolvedAccount) {
        // A valid out-of-period date safely excludes the record. Invalid dates
        // and raw categories cannot prove that malformed records are irrelevant.
        if (validDate(tx.date) && (tx.date < period.from || tx.date > period.to)) return;
        unknown.push({
          id: tx.id,
          date: tx.date,
          reason: invalidType ? 'Invalid or unsupported transaction type'
            : 'Transaction account identity unavailable or ambiguous',
        });
        return;
      }
    }

    if (selected.accountId !== undefined && tx.accountId !== selected.accountId) return;
    // UNKNOWN raw categories are not reliable (especially orphan/protected refunds).
    // Retain every such diagnostic within the account/date scope for category filters.
    if (selected.categoryId !== undefined && item.kind !== 'unknown'
      && (item.categoryId ?? 'uncategorized') !== selected.categoryId) return;

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
    const incomeUnits = reportAmountToUnits(item.incomeAmount, currency);
    const expenseUnits = reportAmountToUnits(item.expenseAmount, currency);

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
      .map(([currencyCode, totals]) => {
        const factor = 10 ** getCurrencyDecimals(currencyCode);
        const row: ReportCurrencyTotal = {
          currencyCode,
          income: totals.income / factor,
          expenses: totals.expenses / factor,
          net: (totals.income - totals.expenses) / factor,
        };
        Object.defineProperty(row, 'minorUnits', {
          value: Object.freeze({
            income: totals.income,
            expenses: totals.expenses,
            net: totals.income - totals.expenses,
          }),
          enumerable: false,
          writable: false,
          configurable: false,
        });
        return row;
      })
      .sort((a, b) =>
        a.currencyCode.localeCompare(b.currencyCode)
      ),
    incomeCategories: categoriesToArray(incomeCategories),
    expenseCategories: categoriesToArray(expenseCategories),
    unknown,
    includedTransactions,
    ...(hasFilters ? { status: unknown.length > 0 ? 'incomplete' as const : 'complete' as const } : {}),
  };
}