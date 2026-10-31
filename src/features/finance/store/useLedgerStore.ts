
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
  NewTransferInput,
  Transaction,
  TransactionPatch,
  Transfer,
  TransferPatch,
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
  clearAccountsAndTransactions: () => void;

  // Categories
  addCategory: (input: NewCategoryInput) => EntityId;
  updateCategory: (id: EntityId, patch: CategoryPatch) => void;
  deleteCategory: (
    id: EntityId,
    replacementCategoryId?: EntityId
  ) => boolean;

  // Transactions
  addTransaction: (input: NewTransactionInput) => EntityId | null;
  updateTransaction: (id: EntityId, patch: TransactionPatch) => boolean;
  removeTransaction: (id: EntityId) => void;

  // Transfers
  addTransfer: (input: NewTransferInput) => EntityId | null;
  updateTransfer: (id: EntityId, patch: TransferPatch) => boolean;
  removeTransfer: (id: EntityId) => void;

  resetLedger: () => void;
}

export type LedgerStore = LedgerData & LedgerActions;

const STORAGE_VERSION = 2;

const initialData: LedgerData = {
  accounts: [],
  categories: DEFAULT_CATEGORIES,
  transactions: [],
  transfers: [],
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
  const transfers = normalizeRecords<Transfer>(saved.transfers);

  return {
    accounts,
    transactions,
    transfers,

    // Preserve an intentionally empty category list.
    // Defaults are used only when the saved data has no categories field.
    categories: Array.isArray(saved.categories)
      ? savedCategories
      : DEFAULT_CATEGORIES,
  };
}

/* -------------------------------------------------------------------------- */
/* Refund validation                                                          */
/* -------------------------------------------------------------------------- */

function getRefundedAmount(
  transactions: Transaction[],
  originalTransactionId: EntityId,
  excludeTransactionId?: EntityId
): number {
  const total = transactions
    .filter(
      (transaction) =>
        transaction.entryType === 'refund' &&
        transaction.relatedTransactionId === originalTransactionId &&
        transaction.id !== excludeTransactionId
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return roundMoney(total);
}

function isValidRefund(
  input: NewTransactionInput,
  transactions: Transaction[],
  accounts: Account[]
): boolean {
  if (
    input.entryType !== 'refund' ||
    input.type !== 'expense' ||
    !input.relatedTransactionId
  ) {
    return false;
  }

  const original = transactions.find(
    (transaction) => transaction.id === input.relatedTransactionId
  );

  if (
    !original ||
    original.type !== 'expense' ||
    original.entryType === 'refund' ||
    original.accountId !== input.accountId ||
    original.categoryId !== input.categoryId
  ) {
    return false;
  }

  const account = accounts.find(
    (item) => item.id === input.accountId
  );

  if (!account || original.currencyCode !== account.currencyCode) {
    return false;
  }

  const alreadyRefunded = getRefundedAmount(
    transactions,
    original.id
  );

  return (
    roundMoney(alreadyRefunded + input.amount) <=
    roundMoney(original.amount)
  );
}

/* -------------------------------------------------------------------------- */
/* Transfer validation                                                        */
/* -------------------------------------------------------------------------- */

function isValidPositiveAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function getTransferSourceAmount(transfer: Transfer): number {
  return transfer.fromAmount ?? transfer.amount;
}

function getTransferSourceCurrency(transfer: Transfer): string {
  return transfer.fromCurrencyCode ?? transfer.currencyCode;
}

function getTransferDestinationAmount(transfer: Transfer): number {
  return transfer.toAmount ?? transfer.amount;
}

function getTransferDestinationCurrency(transfer: Transfer): string {
  return transfer.toCurrencyCode ?? transfer.currencyCode;
}

function isValidTransferAccounts(
  fromAccount: Account | undefined,
  toAccount: Account | undefined,
  type: NewTransferInput['type']
): boolean {
  if (!fromAccount || !toAccount) {
    return false;
  }

  if (
    fromAccount.id === toAccount.id ||
    fromAccount.archived ||
    toAccount.archived
  ) {
    return false;
  }

  if (type === 'credit_card_payment') {
    return (
      fromAccount.type !== 'credit_card' &&
      toAccount.type === 'credit_card' &&
      fromAccount.currencyCode === toAccount.currencyCode
    );
  }

  return (
    type === 'internal' &&
    fromAccount.type !== 'credit_card' &&
    toAccount.type !== 'credit_card'
  );
}

function isValidTransferAmounts(
  input: Pick<
    NewTransferInput,
    | 'fromAmount'
    | 'fromCurrencyCode'
    | 'toAmount'
    | 'toCurrencyCode'
    | 'exchangeRate'
  >,
  fromAccount: Account,
  toAccount: Account
): boolean {
  const fromAmount = roundMoney(input.fromAmount);
  const toAmount = roundMoney(input.toAmount);
  const exchangeRate = input.exchangeRate;

  if (
    !isValidPositiveAmount(fromAmount) ||
    !isValidPositiveAmount(toAmount) ||
    !isValidPositiveAmount(exchangeRate)
  ) {
    return false;
  }

  if (
    input.fromCurrencyCode !== fromAccount.currencyCode ||
    input.toCurrencyCode !== toAccount.currencyCode
  ) {
    return false;
  }

  if (fromAccount.currencyCode === toAccount.currencyCode) {
    return (
      input.fromCurrencyCode === input.toCurrencyCode &&
      Math.abs(fromAmount - toAmount) <= 0.01 &&
      Math.abs(exchangeRate - 1) <= 0.000001
    );
  }

  if (input.fromCurrencyCode === input.toCurrencyCode) {
    return false;
  }

  const expectedRate = toAmount / fromAmount;
  const rateDifference = Math.abs(exchangeRate - expectedRate);

  return rateDifference <= Math.max(0.000001, expectedRate * 0.0001);
}

function buildTransfer(
  input: NewTransferInput,
  id: EntityId,
  timestamp: string
): Transfer {
  const fromAmount = roundMoney(input.fromAmount);
  const toAmount = roundMoney(input.toAmount);

  return {
    id,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,

    // Compatibility fields for older code and persisted records.
    amount: fromAmount,
    currencyCode: input.fromCurrencyCode,

    fromAmount,
    fromCurrencyCode: input.fromCurrencyCode,
    toAmount,
    toCurrencyCode: input.toCurrencyCode,
    exchangeRate: input.exchangeRate,

    date: input.date,
    type: input.type,
    note: input.note,

    createdAt: timestamp,
    updatedAt: timestamp,
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

          if (typeof clean.creditLimit === 'number') {
            clean.creditLimit = roundMoney(clean.creditLimit);
          }

          const currentAccount = state.accounts.find(
            (account) => account.id === id
          );

          if (!currentAccount) {
            return state;
          }

          const hasTransactions = state.transactions.some(
            (transaction) => transaction.accountId === id
          );

          const hasTransfers = state.transfers.some(
            (transfer) =>
              transfer.fromAccountId === id ||
              transfer.toAccountId === id
          );

          const currencyChanged =
            typeof clean.currencyCode === 'string' &&
            clean.currencyCode !== currentAccount.currencyCode;

          const safePatch =
            (hasTransactions || hasTransfers) && currencyChanged
              ? {
                  ...clean,
                  currencyCode: currentAccount.currencyCode,
                }
              : clean;

          return {
            accounts: state.accounts.map((account) =>
              account.id === id
                ? { ...account, ...safePatch, updatedAt: now() }
                : account
            ),
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
          transfers: state.transfers.filter(
            (transfer) =>
              transfer.fromAccountId !== id &&
              transfer.toAccountId !== id
          ),
        })),

      clearAccountsAndTransactions: () =>
        set({
          accounts: [],
          transactions: [],
          transfers: [],
        }),

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

      deleteCategory: (id, replacementCategoryId) => {
        const { categories, transactions } = get();

        const category = categories.find((item) => item.id === id);

        if (!category) {
          return false;
        }

        const hasTransactions = transactions.some(
          (transaction) => transaction.categoryId === id
        );

        // A category with linked transactions requires a replacement.
        if (hasTransactions && !replacementCategoryId) {
          return false;
        }

        let replacementCategory: Category | undefined;

        if (replacementCategoryId) {
          replacementCategory = categories.find(
            (item) => item.id === replacementCategoryId
          );

          // Replacement must exist, be different, and have the same kind.
          if (
            !replacementCategory ||
            replacementCategory.id === category.id ||
            replacementCategory.kind !== category.kind
          ) {
            return false;
          }
        }

        set((state) => ({
          categories: state.categories.filter(
            (item) => item.id !== id
          ),

          // Reassign every linked transaction before removing the category.
          // This includes refund records, preserving their link to the
          // original purchase while keeping both on the same category.
          transactions: replacementCategory
            ? state.transactions.map((transaction) =>
                transaction.categoryId === id
                  ? {
                      ...transaction,
                      categoryId: replacementCategory.id,
                      updatedAt: now(),
                    }
                  : transaction
              )
            : state.transactions,
        }));

        return true;
      },

      /* ---------------------------- Transactions --------------------------- */

      addTransaction: (input) => {
        const { accounts, categories, transactions } = get();

        const account = accounts.find(
          (item) => item.id === input.accountId
        );

        const category = categories.find(
          (item) => item.id === input.categoryId
        );

        const amount = roundMoney(input.amount);

        const valid =
          !!account &&
          !account.archived &&
          !!category &&
          category.kind === input.type &&
          Number.isFinite(amount) &&
          amount > 0;

        if (!valid || !account) {
          return null;
        }

        const normalizedInput = {
          ...input,
          amount,
          entryType: input.entryType ?? 'normal',
        };

        if (
          normalizedInput.entryType === 'refund' &&
          !isValidRefund(
            normalizedInput,
            transactions,
            accounts
          )
        ) {
          return null;
        }

        if (
          normalizedInput.entryType === 'normal' &&
          normalizedInput.relatedTransactionId
        ) {
          return null;
        }

        const timestamp = now();

        const transaction: Transaction = {
          ...normalizedInput,
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

        if (!current || current.entryType === 'refund') {
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

        const linkedRefunds = getRefundedAmount(
          transactions,
          current.id
        );

        const hasLinkedRefunds = linkedRefunds > 0;

        if (
          hasLinkedRefunds &&
          (
            next.type !== current.type ||
            next.accountId !== current.accountId ||
            next.categoryId !== current.categoryId
          )
        ) {
          return false;
        }

        const valid =
          !!account &&
          !account.archived &&
          !!category &&
          category.kind === next.type &&
          Number.isFinite(amount) &&
          amount > 0 &&
          next.entryType !== 'refund' &&
          !next.relatedTransactionId;

        if (!valid || !account) {
          return false;
        }

        if (linkedRefunds > amount) {
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

      removeTransaction: (id) => {
        const { transactions } = get();

        const current = transactions.find(
          (transaction) => transaction.id === id
        );

        if (!current) {
          return;
        }

        const hasRefunds = transactions.some(
          (transaction) =>
            transaction.entryType === 'refund' &&
            transaction.relatedTransactionId === id
        );

        if (hasRefunds) {
          return;
        }

        set((state) => ({
          transactions: state.transactions.filter(
            (transaction) => transaction.id !== id
          ),
        }));
      },

      /* ------------------------------ Transfers ---------------------------- */

      addTransfer: (input) => {
        const { accounts } = get();

        const fromAccount = accounts.find(
          (account) => account.id === input.fromAccountId
        );

        const toAccount = accounts.find(
          (account) => account.id === input.toAccountId
        );

        if (
          !fromAccount ||
          !toAccount ||
          !isValidTransferAccounts(
            fromAccount,
            toAccount,
            input.type
          ) ||
          !isValidTransferAmounts(
            input,
            fromAccount,
            toAccount
          )
        ) {
          return null;
        }

        const timestamp = now();

        const transfer = buildTransfer(
          input,
          generateId('trf'),
          timestamp
        );

        set((state) => ({
          transfers: [transfer, ...state.transfers],
        }));

        return transfer.id;
      },

      updateTransfer: (id, patch) => {
        const { accounts, transfers } = get();

        const current = transfers.find((item) => item.id === id);

        if (!current) {
          return false;
        }

        const patchValues = definedOnly(patch);

        const nextFromAccountId =
          patchValues.fromAccountId ?? current.fromAccountId;

        const nextToAccountId =
          patchValues.toAccountId ?? current.toAccountId;

        const nextFromAccount = accounts.find(
          (account) => account.id === nextFromAccountId
        );

        const nextToAccount = accounts.find(
          (account) => account.id === nextToAccountId
        );

        if (
          !nextFromAccount ||
          !nextToAccount ||
          !isValidTransferAccounts(
            nextFromAccount,
            nextToAccount,
            patchValues.type ?? current.type
          )
        ) {
          return false;
        }

        const legacyFromAmount = current.fromAmount ?? current.amount;
        const legacyToAmount = current.toAmount ?? current.amount;

        const nextInput: NewTransferInput = {
          fromAccountId: nextFromAccountId,
          toAccountId: nextToAccountId,
          fromAmount:
            patchValues.fromAmount ?? legacyFromAmount,
          fromCurrencyCode:
            patchValues.fromCurrencyCode ??
            current.fromCurrencyCode ??
            current.currencyCode,
          toAmount:
            patchValues.toAmount ?? legacyToAmount,
          toCurrencyCode:
            patchValues.toCurrencyCode ??
            current.toCurrencyCode ??
            current.currencyCode,
          exchangeRate:
            patchValues.exchangeRate ??
            current.exchangeRate ??
            (
              legacyFromAmount > 0
                ? legacyToAmount / legacyFromAmount
                : 1
            ),
          date: patchValues.date ?? current.date,
          type: patchValues.type ?? current.type,
          note: patchValues.note ?? current.note,
        };

        if (
          !isValidTransferAmounts(
            nextInput,
            nextFromAccount,
            nextToAccount
          )
        ) {
          return false;
        }

        const updated = buildTransfer(
          nextInput,
          current.id,
          current.createdAt
        );

        set((state) => ({
          transfers: state.transfers.map((transfer) =>
            transfer.id === id
              ? {
                  ...updated,
                  updatedAt: now(),
                }
              : transfer
          ),
        }));

        return true;
      },

      removeTransfer: (id) =>
        set((state) => ({
          transfers: state.transfers.filter(
            (transfer) => transfer.id !== id
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
        transfers: state.transfers,
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
