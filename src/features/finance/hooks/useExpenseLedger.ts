import { useMemo } from 'react';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
/** Full read-only context; classification must retain originals and ownership evidence. */
export function useExpenseLedger() {
  const ledgerReady = useLedgerHydrated(); const financeReady = useFinanceHydrated();
  const accounts = useLedgerStore(s => s.accounts); const categories = useLedgerStore(s => s.categories);
  const transactions = useLedgerStore(s => s.transactions); const transfers = useLedgerStore(s => s.transfers);
  const assets = useFinanceStore(s => s.assets); const debts = useFinanceStore(s => s.debts);
  const loans = useFinanceStore(s => s.loans); const cheques = useFinanceStore(s => s.cheques);
  const context = useMemo(() => ({ ledger: { accounts, categories, transactions, transfers }, finance: { assets, debts, loans, cheques } }),
    [accounts, categories, transactions, transfers, assets, debts, loans, cheques]);
  return { ready: ledgerReady && financeReady, context, accounts, categories };
}
