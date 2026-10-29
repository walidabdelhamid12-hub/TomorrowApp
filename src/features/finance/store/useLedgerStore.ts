
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
  setAccountArchived: (id: EntityId, archived: boolean) => void;
  deleteAccount: (id: EntityId) => void;

  // Categories
  addCategory: (input: NewCategoryInput) => EntityId;
  updateCategory: (id: EntityId, patch: CategoryPatch) => void;
  deleteCategory: (id: EntityId) => boolean;

  // Transactions
  addTransaction: (input: NewTransactionInput) => EntityId | null;
  updateTransaction: (id: EntityId, patch: TransactionPatch) => boolean;
  removeTransaction: (id: EntityId) => void;

  resetLedger: () => void;
}

export type LedgerStore = LedgerData & LedgerActions;

const STORAGE_VERSION = 2;

const initialData: LedgerData = {
  accounts: [],
  categories: DEFAULT_CATEGORIES,
  transactions: [],
};

const now = (): string => new Date().toISOString();

/* -------------------------------------------------------------------------- */
/* Persistence migration helpers                                              */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeRecords<T>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is T =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      item.id.length > 0
  );
}

function migrateLedgerData(persistedState: unknown): LedgerData {
  const saved = isRecord(persistedState) ? persistedState : {};

  const accounts = normalizeRecords<Account>(saved.accounts);
  const transactions = normalizeRecords<Transaction>(saved.transactions);
  const savedCategories = normalizeRecords<Category>(saved.categories);

  return {
    accounts,
    transactions,
    categories:
      savedCategories.length > 0
        ? savedCategories
        : DEFAULT_CATEGORIES,
  };
}

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
          currencyCode:
            input.currencyCode ||
            useFinanceStore.getState().baseCurrency,
          initialBalance: roundMoney(input.initialBalance),
          archived: input.archived ?? false,
          id: generateId('acc'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          accounts: [...state.accounts, account],
        }));

        return account.id;
      },

      updateAccount: (id, patch) =>
        set((state) => {
          const clean = definedOnly(patch);

          if (typeof clean.initialBalance === 'number') {
            clean.initialBalance = roundMoney(clean.initialBalance);
          }

          return {
            accounts: state.accounts.map((account) =>
              account.id === id
                ? { ...account, ...clean, updatedAt: now() }
                : account
            ),

            // Keep transactions synchronized with their account currency.
            transactions: clean.currencyCode
              ? state.transactions.map((transaction) =>
                  transaction.accountId === id
                    ? {
                        ...transaction,
                        currencyCode: clean.currencyCode as string,
                      }
                    : transaction
                )
              : state.transactions,
          };
        }),

      setAccountArchived: (id, archived) =>
        set((state) => ({
          accounts: state.accounts.map((account) =>
            account.id === id
              ? { ...account, archived, updatedAt: now() }
              : account
          ),
        })),

      deleteAccount: (id) =>
        set((state) => ({
          accounts: state.accounts.filter((account) => account.id !== id),
          transactions: state.transactions.filter(
            (transaction) => transaction.accountId !== id
          ),
        })),

      /* ----------------------------- Categories ---------------------------- */

      addCategory: (input) => {
        const category: Category = {
          ...input,
          id: generateId('cat'),
          isDefault: false,
        };

        set((state) => ({
          categories: [...state.categories, category],
        }));

        return category.id;
      },

      updateCategory: (id, patch) =>
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id
              ? { ...category, ...definedOnly(patch) }
              : category
          ),
        })),

      deleteCategory: (id) => {
        const { categories, transactions } = get();
        const category = categories.find((item) => item.id === id);

        if (!category || category.isDefault) {
          return false;
        }

        if (transactions.some((item) => item.categoryId === id)) {
          return false;
        }

        set((state) => ({
          categories: state.categories.filter((item) => item.id !== id),
        }));

        return true;
      },

      /* ---------------------------- Transactions --------------------------- */

      addTransaction: (input) => {
        const { accounts, categories } = get();

        const account = accounts.find(
          (item) => item.id === input.accountId
        );

        const category = categories.find(
          (item) => item.id === input.categoryId
        );

        const amount = roundMoney(input.amount);

        const valid =
          !!account &&
          !!category &&
          category.kind === input.type &&
          Number.isFinite(amount) &&
          amount > 0;

        if (!valid || !account) {
          return null;
        }

        const timestamp = now();

        const transaction: Transaction = {
          ...input,
          amount,
          currencyCode: account.currencyCode,
          id: generateId('trx'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          transactions: [transaction, ...state.transactions],
        }));

        return transaction.id;
      },

      updateTransaction: (id, patch) => {
        const { accounts, categories, transactions } = get();

        const current = transactions.find((item) => item.id === id);

        if (!current) {
          return false;
        }

        const next = {
          ...current,
          ...definedOnly(patch),
        };

        const account = accounts.find(
          (item) => item.id === next.accountId
        );

        const category = categories.find(
          (item) => item.id === next.categoryId
        );

        const amount = roundMoney(next.amount);

        const valid =
          !!account &&
          !!category &&
          category.kind === next.type &&
          Number.isFinite(amount) &&
          amount > 0;

        if (!valid || !account) {
          return false;
        }

        set((state) => ({
          transactions: state.transactions.map((transaction) =>
            transaction.id === id
              ? {
                  ...next,
                  amount,
                  currencyCode: account.currencyCode,
                  updatedAt: now(),
                }
              : transaction
          ),
        }));

        return true;
      },

      removeTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.filter(
            (transaction) => transaction.id !== id
          ),
        })),

      /* -------------------------------- Reset ------------------------------ */

      resetLedger: () => set({ ...initialData }),
    }),
    {
      name: 'tomorrow:ledger',
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),

      // Persist data only, never action functions.
      partialize: (state): LedgerData => ({
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
      }),

      migrate: (persistedState, _persistedVersion): LedgerData =>
        migrateLedgerData(persistedState),

      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateLedgerData(persistedState),
      }),

      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn(
            '[ledger] Failed to restore saved ledger data:',
            error
          );
        }
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
