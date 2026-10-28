import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CATEGORIES } from '@/features/finance/constants/defaultCategories';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import type { EntityId } from '@/features/finance/types/finance';
import type {
    Account,
    AccountPatch,
    Category,
    CategoryPatch,
    LedgerData,
    NewAccountInput,
    NewCategoryInput,
    NewTransactionInput,
    Transaction,
    TransactionPatch,
} from '@/features/finance/types/ledger';
import {
    definedOnly,
    generateId,
    roundMoney,
} from '@/features/finance/utils/finance';

/* -------------------------------------------------------------------------- */
/* Store contract                                                             */
/* -------------------------------------------------------------------------- */

interface LedgerActions {
  // Accounts
  addAccount: (input: NewAccountInput) => EntityId;
  updateAccount: (id: EntityId, patch: AccountPatch) => void;
  /** Hide/show an account without losing its history. */
  setAccountArchived: (id: EntityId, archived: boolean) => void;
  /** Deletes the account AND all of its transactions. Prefer archiving. */
  deleteAccount: (id: EntityId) => void;

  // Categories
  addCategory: (input: NewCategoryInput) => EntityId;
  updateCategory: (id: EntityId, patch: CategoryPatch) => void;
  /** Returns false if the category is a default or still has transactions. */
  deleteCategory: (id: EntityId) => boolean;

  // Transactions
  /** Returns the new id, or null when the input is invalid. */
  addTransaction: (input: NewTransactionInput) => EntityId | null;
  /** Returns false when the transaction doesn't exist or the result is invalid. */
  updateTransaction: (id: EntityId, patch: TransactionPatch) => boolean;
  removeTransaction: (id: EntityId) => void;

  /** Clears accounts and transactions, and restores default categories. */
  resetLedger: () => void;
}

export type LedgerStore = LedgerData & LedgerActions;

const initialData: LedgerData = {
  accounts: [],
  categories: DEFAULT_CATEGORIES,
  transactions: [],
};

const now = (): string => new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const useLedgerStore = create<LedgerStore>()(
  persist(
    (set, get) => ({
      ...initialData,

      /* ------------------------------ Accounts ----------------------------- */

      addAccount: (input) => {
        const timestamp = now();
        const account: Account = {
          ...input,
          // Fall back to the finance module's base currency.
          currencyCode:
            input.currencyCode || useFinanceStore.getState().baseCurrency,
          initialBalance: roundMoney(input.initialBalance),
          archived: input.archived ?? false,
          id: generateId('acc'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((s) => ({ accounts: [...s.accounts, account] }));
        return account.id;
      },

      updateAccount: (id, patch) =>
        set((s) => {
          const clean = definedOnly(patch);
          if (typeof clean.initialBalance === 'number') {
            clean.initialBalance = roundMoney(clean.initialBalance);
          }
          return {
            accounts: s.accounts.map((a) =>
              a.id === id ? { ...a, ...clean, updatedAt: now() } : a
            ),
            // Keep each transaction's currency in sync with its account.
            transactions: clean.currencyCode
              ? s.transactions.map((t) =>
                  t.accountId === id
                    ? { ...t, currencyCode: clean.currencyCode as string }
                    : t
                )
              : s.transactions,
          };
        }),

      setAccountArchived: (id, archived) =>
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === id ? { ...a, archived, updatedAt: now() } : a
          ),
        })),

      deleteAccount: (id) =>
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          transactions: s.transactions.filter((t) => t.accountId !== id),
        })),

      /* ----------------------------- Categories ---------------------------- */

      addCategory: (input) => {
        const category: Category = {
          ...input,
          id: generateId('cat'),
          isDefault: false,
        };
        set((s) => ({ categories: [...s.categories, category] }));
        return category.id;
      },

      updateCategory: (id, patch) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, ...definedOnly(patch) } : c
          ),
        })),

      deleteCategory: (id) => {
        const { categories, transactions } = get();
        const category = categories.find((c) => c.id === id);
        if (!category || category.isDefault) return false;
        if (transactions.some((t) => t.categoryId === id)) return false;
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
        return true;
      },

      /* ---------------------------- Transactions --------------------------- */

      addTransaction: (input) => {
        const { accounts, categories } = get();
        const account = accounts.find((a) => a.id === input.accountId);
        const category = categories.find((c) => c.id === input.categoryId);
        const amount = roundMoney(input.amount);

        const valid =
          !!account &&
          !!category &&
          category.kind === input.type &&
          Number.isFinite(amount) &&
          amount > 0;
        if (!valid || !account) return null;

        const timestamp = now();
        const transaction: Transaction = {
          ...input,
          amount,
          currencyCode: account.currencyCode,
          id: generateId('trx'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((s) => ({ transactions: [transaction, ...s.transactions] }));
        return transaction.id;
      },

      updateTransaction: (id, patch) => {
        const { accounts, categories, transactions } = get();
        const current = transactions.find((t) => t.id === id);
        if (!current) return false;

        const next = { ...current, ...definedOnly(patch) };
        const account = accounts.find((a) => a.id === next.accountId);
        const category = categories.find((c) => c.id === next.categoryId);
        const amount = roundMoney(next.amount);

        const valid =
          !!account &&
          !!category &&
          category.kind === next.type &&
          Number.isFinite(amount) &&
          amount > 0;
        if (!valid || !account) return false;

        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...next,
                  amount,
                  currencyCode: account.currencyCode,
                  updatedAt: now(),
                }
              : t
          ),
        }));
        return true;
      },

      removeTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      /* -------------------------------- Reset ------------------------------ */

      resetLedger: () => set({ ...initialData }),
    }),
    {
      name: 'tomorrow:ledger',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist data only, never the action functions.
      partialize: (state): LedgerData => ({
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
      }),
      // Handle old shapes here when `version` is bumped.
      migrate: (persistedState) => persistedState as LedgerData,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[ledger] failed to restore saved data', error);
      },
    }
  )
);

/* -------------------------------------------------------------------------- */
/* Hydration hook                                                             */
/* -------------------------------------------------------------------------- */

/** True once AsyncStorage data has been loaded into the store. */
export function useLedgerHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useLedgerStore.persist.hasHydrated()
  );

  useEffect(() => {
    const unsubscribe = useLedgerStore.persist.onFinishHydration(() =>
      setHydrated(true)
    );
    setHydrated(useLedgerStore.persist.hasHydrated());
    return unsubscribe;
  }, []);

  return hydrated;
}