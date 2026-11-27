import { classifyReportTransaction, type ReportClassificationContext } from './reportTransactionClassifier';
import type { Transaction } from '@/features/finance/types/ledger';
import { roundMoney } from '@/features/finance/utils/finance';
import { filterByMonth } from '@/features/finance/utils/ledger';
import { convertAmountUnrounded, type RateMap } from '@/features/finance/utils/money';

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
      const converted = convertAmountUnrounded(
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

/** Production totals use the same verified classification as the reports. */
export function getClassifiedMonthlyFinanceSummary(
  context: ReportClassificationContext, monthKey: string, baseCurrency: string,
  rates: RateMap, verifiedCurrencies: readonly string[],
) {
  let income = 0, expense = 0, missing = 0;
  for (const tx of filterByMonth(context.ledger.transactions, monthKey)) {
    const item = classifyReportTransaction(tx, context);
    if (item.kind === 'unknown') { missing++; continue; }
    if (item.incomeAmount === 0 && item.expenseAmount === 0) continue;
    const amount = item.incomeAmount || item.expenseAmount;
    const converted = convertAmountUnrounded(Math.abs(amount), item.currencyCode, baseCurrency, rates, verifiedCurrencies);
    if (converted === null) { missing++; continue; }
    if (item.incomeAmount !== 0) income += converted;
    else expense += amount < 0 ? -converted : converted;
  }
  return { income: roundMoney(income), expense: roundMoney(expense), missing };
}
