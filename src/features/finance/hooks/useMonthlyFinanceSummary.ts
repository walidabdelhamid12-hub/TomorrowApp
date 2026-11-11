import { useMemo } from 'react';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { todayISO } from '@/features/finance/utils/finance';
import { getMonthKey } from '@/features/finance/utils/ledger';
import { getMonthlyFinanceSummary } from '@/features/finance/utils/monthlySummary';

export function useMonthlyFinanceSummary() {
  const transactions = useLedgerStore((s) => s.transactions);
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const verifiedCurrencies = useCurrencyStore((s) => s.verifiedCurrencies);
  const monthKey = getMonthKey(todayISO());
  const totals = useMemo(
    () => getMonthlyFinanceSummary(transactions, monthKey, baseCurrency, rates, verifiedCurrencies),
    [transactions, monthKey, baseCurrency, rates, verifiedCurrencies],
  );
  return { ...totals, baseCurrency, monthKey };
}
