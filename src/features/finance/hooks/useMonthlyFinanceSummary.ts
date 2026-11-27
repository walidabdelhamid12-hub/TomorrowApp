import { useMemo } from 'react';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { todayISO } from '@/features/finance/utils/finance';
import { getMonthKey } from '@/features/finance/utils/ledger';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { getClassifiedMonthlyFinanceSummary } from '@/features/finance/utils/monthlySummary';

export function useMonthlyFinanceSummary() {
  const transactions = useLedgerStore((s) => s.transactions);
  const accounts = useLedgerStore(s => s.accounts);
  const categories = useLedgerStore(s => s.categories);
  const transfers = useLedgerStore(s => s.transfers);
  const loans = useFinanceStore(s => s.loans);
  const debts = useFinanceStore(s => s.debts);
  const assets = useFinanceStore(s => s.assets);
  const cheques = useFinanceStore(s => s.cheques);
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const verifiedCurrencies = useCurrencyStore((s) => s.verifiedCurrencies);
  const monthKey = getMonthKey(todayISO());
  const totals = useMemo(
    () => getClassifiedMonthlyFinanceSummary({ledger: {accounts, categories, transactions, transfers}, finance: {loans, debts, assets, cheques}}, monthKey, baseCurrency, rates, verifiedCurrencies),
    [transactions, accounts, categories, transfers, loans, debts, assets, cheques, monthKey, baseCurrency, rates, verifiedCurrencies],
  );
  return { ...totals, baseCurrency, monthKey };
}
