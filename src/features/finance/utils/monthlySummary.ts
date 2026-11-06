import type { Transaction } from '@/features/finance/types/ledger';
import { roundMoney } from '@/features/finance/utils/finance';
import { filterByMonth } from '@/features/finance/utils/ledger';
import { convertAmount, type RateMap } from '@/features/finance/utils/money';

/** Shared Finance Home rules: verified FX, refunds reduce expenses, then round. */
export function getMonthlyFinanceSummary(
  transactions: Transaction[],
  monthKey: string,
  baseCurrency: string,
  rates: RateMap,
  verifiedCurrencies: readonly string[],
) {
    let income = 0;
    let expense = 0;
    let missing = 0;

    for (const transaction of filterByMonth(transactions, monthKey)) {
      const converted = convertAmount(
        transaction.amount,
        transaction.currencyCode,
        baseCurrency,
        rates,
        verifiedCurrencies
      );

      if (converted === null) {
        missing += 1;
        continue;
      }

      if (transaction.entryType === 'refund') {
        expense -= converted;
      } else if (transaction.type === 'income') {
        income += converted;
      } else {
        expense += converted;
      }
    }

    return {
      income: roundMoney(income),
      expense: roundMoney(Math.max(expense, 0)),
      missing,
    };
}
