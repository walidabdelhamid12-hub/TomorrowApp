
import type { CurrencyCode, ISODate } from '@/features/finance/types/finance';
import type {
  Account,
  Transaction,
  Transfer,
} from '@/features/finance/types/ledger';
import { roundMoney } from '@/features/finance/utils/finance';

/**
 * Account balance:
 * Initial balance + income - expenses + refunds
 * - outgoing transfers + incoming transfers.
 *
 * New transfers use separate source and destination amounts.
 * Legacy transfers fall back to amount for both sides.
 * A credit-card negative balance represents outstanding debt.
 */
export function getAccountBalance(
  account: Account,
  transactions: Transaction[],
  transfers: Transfer[] = []
): number {
  const transactionDelta = transactions
    .filter((transaction) => transaction.accountId === account.id)
    .reduce((sum, transaction) => {
      if (transaction.entryType === 'refund') {
        return sum + transaction.amount;
      }

      return (
        sum +
        (transaction.type === 'income'
          ? transaction.amount
          : -transaction.amount)
      );
    }, 0);

  const transferDelta = transfers
    .filter(
      (transfer) =>
        transfer.fromAccountId === account.id ||
        transfer.toAccountId === account.id
    )
    .reduce((sum, transfer) => {
      if (transfer.fromAccountId === account.id) {
        const sourceAmount = transfer.fromAmount ?? transfer.amount;
        return sum - sourceAmount;
      }

      if (transfer.toAccountId === account.id) {
        const destinationAmount = transfer.toAmount ?? transfer.amount;
        return sum + destinationAmount;
      }

      return sum;
    }, 0);

  return roundMoney(
    account.initialBalance + transactionDelta + transferDelta
  );
}

/** "2026-10" for a "2026-10-28" date. */
export function getMonthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function filterByMonth(
  transactions: Transaction[],
  monthKey: string
): Transaction[] {
  return transactions.filter(
    (transaction) => getMonthKey(transaction.date) === monthKey
  );
}

export interface Totals {
  income: number;
  expense: number;
  net: number;
}

/** Totals for ONE currency. Refunds reduce expenses, never income. */
export function getTotals(
  transactions: Transaction[],
  currencyCode: CurrencyCode
): Totals {
  let income = 0;
  let expense = 0;

  for (const transaction of transactions) {
    if (transaction.currencyCode !== currencyCode) continue;

    if (transaction.entryType === 'refund') {
      expense -= transaction.amount;
    } else if (transaction.type === 'income') {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
  }

  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    net: roundMoney(income - expense),
  };
}

/**
 * Expense or income totals per category.
 * Refunds are deducted from the original purchase category.
 */
export function getTotalsByCategory(
  transactions: Transaction[],
  type: Transaction['type'],
  currencyCode: CurrencyCode
): Record<string, number> {
  const result: Record<string, number> = {};

  const originalTransactions = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );

  for (const transaction of transactions) {
    if (transaction.currencyCode !== currencyCode) {
      continue;
    }

    if (transaction.entryType === 'refund') {
      if (type !== 'expense' || !transaction.relatedTransactionId) {
        continue;
      }

      const original = originalTransactions.get(
        transaction.relatedTransactionId
      );

      if (
        !original ||
        original.type !== 'expense' ||
        original.entryType === 'refund'
      ) {
        continue;
      }

      result[original.categoryId] = roundMoney(
        (result[original.categoryId] ?? 0) - transaction.amount
      );

      continue;
    }

    if (transaction.type !== type) {
      continue;
    }

    result[transaction.categoryId] = roundMoney(
      (result[transaction.categoryId] ?? 0) + transaction.amount
    );
  }

  return result;
}

/** Newest first. Ties are broken by creation time. */
export function sortTransactionsDesc(
  transactions: Transaction[]
): Transaction[] {
  return [...transactions].sort((a, b) =>
    a.date === b.date
      ? b.createdAt.localeCompare(a.createdAt)
      : b.date.localeCompare(a.date)
  );
}
