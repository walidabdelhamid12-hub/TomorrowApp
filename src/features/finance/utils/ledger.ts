import type { CurrencyCode, ISODate } from '@/features/finance/types/finance';
import type { Account, Transaction } from '@/features/finance/types/ledger';
import { roundMoney } from '@/features/finance/utils/finance';

/** Initial balance + income - expenses for the account. */
export function getAccountBalance(
  account: Account,
  transactions: Transaction[]
): number {
  const delta = transactions
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  return roundMoney(account.initialBalance + delta);
}

/** "2026-10" for a "2026-10-28" date. */
export function getMonthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function filterByMonth(
  transactions: Transaction[],
  monthKey: string
): Transaction[] {
  return transactions.filter((t) => getMonthKey(t.date) === monthKey);
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
}

/** Totals for ONE currency. Never sum different currencies together. */
export function getTotals(
  transactions: Transaction[],
  currencyCode: CurrencyCode
): Totals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.currencyCode !== currencyCode) continue;
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    net: roundMoney(income - expense),
  };
}

/** Expense (or income) totals per category id, for charts. */
export function getTotalsByCategory(
  transactions: Transaction[],
  type: Transaction['type'],
  currencyCode: CurrencyCode
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== type || t.currencyCode !== currencyCode) continue;
    result[t.categoryId] = roundMoney((result[t.categoryId] ?? 0) + t.amount);
  }
  return result;
}

/** Newest first. Ties are broken by creation time. */
export function sortTransactionsDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) =>
    a.date === b.date
      ? b.createdAt.localeCompare(a.createdAt)
      : b.date.localeCompare(a.date)
  );
}