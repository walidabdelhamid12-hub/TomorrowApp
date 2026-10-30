
import { useMemo } from 'react';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { todayISO } from '@/features/finance/utils/finance';
import {
  filterByMonth,
  getAccountBalance,
  getMonthKey,
} from '@/features/finance/utils/ledger';
import { convertAmount } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';

/** All totals for the Finance screen, in the selected base currency. */
export function useFinanceSummary() {
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const gold24PerGram = useCurrencyStore(
    (s) => s.metals.gold24PerGram
  );
  const silverPerGram = useCurrencyStore(
    (s) => s.metals.silverPerGram
  );

  const accounts = useLedgerStore((s) => s.accounts);
  const transactions = useLedgerStore((s) => s.transactions);
  const assets = useFinanceStore((s) => s.assets);
  const loans = useFinanceStore((s) => s.loans);
  const debts = useFinanceStore((s) => s.debts);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts]
  );

  const totals = useMemo(() => {
    let accountsTotal = 0;
    let assetsTotal = 0;
    let loansRemainingTotal = 0;
    let receivablesTotal = 0;
    let payablesTotal = 0;
    let missing = 0;

    for (const account of activeAccounts) {
      const balance = getAccountBalance(account, transactions);

      const converted = convertAmount(
        balance,
        account.currencyCode,
        baseCurrency,
        rates
      );

      if (converted === null) {
        missing += 1;
      } else {
        accountsTotal += converted;
      }
    }

    for (const asset of assets) {
      const value = getAssetValueInBase(
        asset,
        baseCurrency,
        rates,
        gold24PerGram,
        silverPerGram
      );

      if (value === null) {
        missing += 1;
      } else {
        assetsTotal += value;
      }
    }

    for (const loan of loans) {
      if (
        typeof loan.principalAmount !== 'number' ||
        !Number.isFinite(loan.principalAmount)
      ) {
        missing += 1;
        continue;
      }

      const paidAmount = loan.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );

      const remainingAmount = Math.max(
        loan.principalAmount - paidAmount,
        0
      );

      const converted = convertAmount(
        remainingAmount,
        loan.currencyCode,
        baseCurrency,
        rates
      );

      if (converted === null) {
        missing += 1;
      } else {
        loansRemainingTotal += converted;
      }
    }

    for (const debt of debts) {
      if (
        typeof debt.amount !== 'number' ||
        !Number.isFinite(debt.amount)
      ) {
        missing += 1;
        continue;
      }

      const paidAmount = (debt.payments ?? []).reduce(
        (sum, payment) => sum + payment.amount,
        0
      );

      const remainingAmount = Math.max(
        debt.amount - paidAmount,
        0
      );

      const converted = convertAmount(
        remainingAmount,
        debt.currencyCode,
        baseCurrency,
        rates
      );

      if (converted === null) {
        missing += 1;
        continue;
      }

      if (debt.direction === 'receivable') {
        receivablesTotal += converted;
      } else if (debt.direction === 'payable') {
        payablesTotal += converted;
      }
    }

    return {
      accountsTotal,
      assetsTotal,
      loansRemainingTotal,
      receivablesTotal,
      payablesTotal,
      missing,
    };
  }, [
    activeAccounts,
    assets,
    loans,
    debts,
    transactions,
    baseCurrency,
    rates,
    gold24PerGram,
    silverPerGram,
  ]);

  const netWorth =
    totals.accountsTotal +
    totals.assetsTotal +
    totals.receivablesTotal -
    totals.payablesTotal -
    totals.loansRemainingTotal;

  const month = useMemo(() => {
    let income = 0;
    let expense = 0;

    const key = getMonthKey(todayISO());

    for (const transaction of filterByMonth(transactions, key)) {
      const converted = convertAmount(
        transaction.amount,
        transaction.currencyCode,
        baseCurrency,
        rates
      );

      if (converted === null) {
        continue;
      }

      if (transaction.type === 'income') {
        income += converted;
      } else {
        expense += converted;
      }
    }

    return { income, expense };
  }, [transactions, baseCurrency, rates]);

  return {
    baseCurrency,
    rates,
    gold24PerGram,
    activeAccounts,
    accountsTotal: totals.accountsTotal,
    assetsTotal: totals.assetsTotal,
    loansRemainingTotal: totals.loansRemainingTotal,
    receivablesTotal: totals.receivablesTotal,
    payablesTotal: totals.payablesTotal,
    total: netWorth,
    netWorth,
    missing: totals.missing,
    income: month.income,
    expense: month.expense,
  };
}
