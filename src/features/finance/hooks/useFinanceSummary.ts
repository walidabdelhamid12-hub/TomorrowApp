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

/** All totals for the Finance screen, in the base currency. */
export function useFinanceSummary() {
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const gold24PerGram = useCurrencyStore((s) => s.metals.gold24PerGram);
  const accounts = useLedgerStore((s) => s.accounts);
  const transactions = useLedgerStore((s) => s.transactions);
  const assets = useFinanceStore((s) => s.assets);

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts]
  );

  const totals = useMemo(() => {
    let accountsTotal = 0;
    let assetsTotal = 0;
    let missing = 0;

    for (const account of activeAccounts) {
      const converted = convertAmount(
        getAccountBalance(account, transactions),
        account.currencyCode,
        baseCurrency,
        rates
      );
      if (converted === null) missing += 1;
      else accountsTotal += converted;
    }

    for (const asset of assets) {
      const value = getAssetValueInBase(
        asset,
        baseCurrency,
        rates,
        gold24PerGram
      );
      if (value === null) missing += 1;
      else assetsTotal += value;
    }

    return { accountsTotal, assetsTotal, missing };
  }, [activeAccounts, assets, transactions, baseCurrency, rates, gold24PerGram]);

  const month = useMemo(() => {
    let income = 0;
    let expense = 0;
    const key = getMonthKey(todayISO());
    for (const tx of filterByMonth(transactions, key)) {
      const converted = convertAmount(
        tx.amount,
        tx.currencyCode,
        baseCurrency,
        rates
      );
      if (converted === null) continue;
      if (tx.type === 'income') income += converted;
      else expense += converted;
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
    total: totals.accountsTotal + totals.assetsTotal,
    missing: totals.missing,
    income: month.income,
    expense: month.expense,
  };
}