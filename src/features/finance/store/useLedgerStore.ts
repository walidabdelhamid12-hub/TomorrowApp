import { isValidHistoricalFx } from '@/features/finance/utils/historicalFx';
import { isValidCrossCurrencyMetadata } from '@/features/finance/utils/crossCurrencyMetadata';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { isPaymentOperationReceipt, type PaymentOperationReceipt } from '@/features/finance/types/paymentOperations';
import { reservedPaymentMatches } from '@/features/finance/utils/reservedPayments';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertAccountingStorageVersion, paymentJournalMetadata } from '@/features/finance/types/paymentJournalInstallation';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage } from 'zustand/middleware';
import { paymentRuntimePersist as persist } from './paymentOperationRuntime';

import { DEFAULT_CATEGORIES } from '@/features/finance/constants/defaultCategories';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { registerLedgerProtectionReader } from '@/features/finance/store/ledgerProtectionReader';
import { isFiniteMoneyInput } from '@/features/finance/utils/finance';
import { isProtectedTransaction, isVerifiedLoanReceipt } from '@/features/finance/utils/paymentTransactionOwnership';
import type { PaymentRef } from '@/features/finance/utils/paymentTransactionOwnership';
import { isValidISODate } from '@/features/finance/utils/input';
import type { EntityId, Loan, LoanPayment } from '@/features/finance/types/finance';
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
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { aggregateAccountsReport } from '@/features/finance/utils/reportAccounts';

/* -------------------------------------------------------------------------- */
/* Store contract                                                             */
/* -------------------------------------------------------------------------- */

interface LedgerActions {
  /** Caller must acknowledge the prepared journal and hold the accounting gate. */
  addReservedPaymentTransaction: (receipt: PaymentOperationReceipt) => EntityId | null;
  // Accounts
  addAccount: (input: NewAccountInput) => EntityId;
  updateAccount: (id: EntityId, patch: AccountPatch) => void;
  /** Explicit metadata-only verification; never edits financial balances. */
  verifyAccountOpeningBalanceDate: (id: EntityId, date: string) => boolean;
  setAccountArchived: (id: EntityId, archived: boolean) => void;
  deleteAccount: (id: EntityId) => boolean;
  clearAccountsAndTransactions: () => boolean;

  // Categories
  addCategory: (input: NewCategoryInput) => EntityId;
  updateCategory: (id: EntityId, patch: CategoryPatch) => void;
  deleteCategory: (
    id: EntityId,
    replacementCategoryId?: EntityId
  ) => boolean;

  // Transactions
  addTransaction: (input: NewTransactionInput) => EntityId | null;
  /** Dedicated posting derives cash and ownership from an existing, unlinked payment. */
  addPaymentTransaction: (ref: PaymentRef, categoryId: string) => EntityId | null;
  /** Dedicated property posting: generic addTransaction cannot forge this ownership. */
  addPropertyPaymentTransaction: (input: { contractId: string; paymentId: string; accountId: string; categoryId: string; amount: number; date: string }) => EntityId | null;
  addLoanReceiptTransaction: (input: {
    loanId: string; amount: number; date: string; accountId: string; categoryId: string;
  }) => EntityId | null;
  updateTransaction: (id: EntityId, patch: TransactionPatch) => boolean;
  removeTransaction: (id: EntityId) => boolean;

  // Transfers
  addTransfer: (input: NewTransferInput) => EntityId | null;
  updateTransfer: (id: EntityId, patch: TransferPatch) => boolean;
  removeTransfer: (id: EntityId) => void;

  resetLedger: () => boolean;
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
    paymentJournal: paymentJournalMetadata(saved).paymentJournal,
    ...('paymentAccounting' in saved ? { paymentAccounting: paymentJournalMetadata(saved).paymentAccounting } : {}),
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

  if (isProtectedTransaction(original, useFinanceStore.getState())) return false;

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
      fromAmount === toAmount &&
      Math.abs(exchangeRate - 1) <= 0.000001
    );
  }

  if (input.fromCurrencyCode === input.toCurrencyCode) {
    return false;
  }

  const converted = fromAmount * exchangeRate;
  const expectedLedgerAmount = roundMoney(converted);

  // Validate exactly the three-decimal amounts buildTransfer persists. Display
  // rounding must not allow a different stored credit for the entered rate.
  return isValidPositiveAmount(expectedLedgerAmount)
    && toAmount === expectedLedgerAmount;
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
    (set, get) => {
      const createTransaction = (input: NewTransactionInput, reservedId?: string): EntityId | null => {
        if (input.entryType === 'refund' &&
          (!useFinanceStore.persist.hasHydrated() || !useLedgerStore.persist.hasHydrated())) return null;
        const { accounts, categories, transactions } = get();

        const account = accounts.find(
          (item) => item.id === input.accountId
        );

        const category = categories.find(
          (item) => item.id === input.categoryId
        );

        // Reject runtime strings instead of coercing them through arithmetic.
        // A numeric-looking string can otherwise be rounded into a wrong value.
        if (!isFiniteMoneyInput(input.amount)) return null;
        // Ordinary transactions use the account currency precision even without FX metadata.
        // Preserve the existing two-decimal behavior for linked posting and refunds.
        const usesAccountPrecision = !!account && input.entryType !== 'refund' &&
          (input.originalAmount !== undefined ||
            (!input.linkedEntityType && (input.purpose === undefined || input.purpose === 'normal')));
        const amount = roundMoney(input.amount,
          usesAccountPrecision ? getCurrencyDecimals(account.currencyCode) : 2);

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

        // A debt/loan payment ID may be posted to the ledger only once.
        // This protects against rapid repeated submissions and stale UI state.
        if (
          input.linkedEntityType &&
          input.linkedEntityId &&
          input.linkedPaymentId &&
          transactions.some(
            (item) =>
              item.linkedEntityType === input.linkedEntityType &&
              item.linkedEntityId === input.linkedEntityId &&
              item.linkedPaymentId === input.linkedPaymentId
          )
        ) {
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
          id: reservedId ?? generateId('trx'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        if (!isValidCrossCurrencyMetadata(transaction)) return null;

        set((state) => ({
          transactions: [transaction, ...state.transactions],
        }));

        return transaction.id;
      };
      const addPaymentTransaction = (ref: PaymentRef, categoryId: string, reservedId?: string): EntityId | null => {
        if (!useFinanceStore.persist.hasHydrated() || !useLedgerStore.persist.hasHydrated()) return null;
        const finance = useFinanceStore.getState();
        const parents = ref.entityType === 'debt' ? finance.debts : finance.loans;
        const matches = parents.filter(p => p.id === ref.entityId);
        const payments = matches.length === 1 ? (matches[0].payments ?? []).filter(p => p.id === ref.paymentId) : [];
        if (payments.length !== 1) return null;
        const parent = matches[0], payment = payments[0];
        const isLoan = ref.entityType === 'loan';
        const debt = isLoan ? undefined : finance.debts.find(d => d.id === parent.id);
        const fee = isLoan ? (payment as LoanPayment).latePaymentFee ?? 0 : 0;
        const account = get().accounts.filter(a => a.id === payment.accountId);
        if (payment.ledgerTransactionId || !isValidISODate(payment.date)
          || !Number.isFinite(payment.amount) || payment.amount <= 0 || !Number.isFinite(fee) || fee < 0
          || account.length !== 1 || account[0].archived || account[0].currencyCode !== parent.currencyCode
          || (isLoan && (account[0].type === 'credit_card' || (payment as LoanPayment).paymentMode !== 'simple'))
          || (debt && debt.direction !== 'receivable' && debt.direction !== 'payable')
          || get().transactions.some(t => !(isLoan && isVerifiedLoanReceipt(t, parent as Loan, finance, get()))
            && (t.linkedPaymentId === payment.id
              || (t.linkedEntityId === parent.id && (!t.linkedPaymentId || t.linkedEntityType !== ref.entityType))))) return null;
        const type = debt?.direction === 'receivable' ? 'income' : 'expense';
        return createTransaction({ accountId: account[0].id, categoryId, amount: roundMoney(payment.amount + fee),
          type, date: payment.date, note: payment.note,
          purpose: isLoan ? 'loan_payment' : type === 'income' ? 'debt_collection' : 'debt_payment',
          linkedEntityType: ref.entityType, linkedEntityId: parent.id, linkedPaymentId: payment.id }, reservedId);
      };
      return ({
      ...initialData,

      /* ------------------------------ Accounts ----------------------------- */

      addAccount: (input) => {
        if (!isFiniteMoneyInput(input.initialBalance)
          || (input.creditLimit !== undefined && (!isFiniteMoneyInput(input.creditLimit)))) return '';
        const initialBalance = roundMoney(input.initialBalance);
        const creditLimit =
          input.creditLimit === undefined
            ? undefined
            : roundMoney(input.creditLimit);

        if (
          !Number.isFinite(initialBalance) ||
          (creditLimit !== undefined &&
            (!Number.isFinite(creditLimit) || creditLimit < 0))
        ) {
          return '';
        }

        const timestamp = now();

        const account: Account = {
          ...input,
          ...(creditLimit === undefined ? {} : { creditLimit }),
          currencyCode:
            input.currencyCode ||
            useCurrencyStore.getState().baseCurrency,
          initialBalance,
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

      verifyAccountOpeningBalanceDate: (id, date) => {
        if (!useLedgerStore.persist.hasHydrated() || !isValidISODate(date)) return false;
        const state = get();
        if (state.accounts.filter(account => account.id === id).length !== 1) return false;
        try {
          const rows = aggregateAccountsReport(state, { from: date, to: date },
            [{ accountId: id, openingBalanceDate: date }]);
          const verified = rows.find(row => row.accountId === id);
          if (!verified || verified.status !== 'available' || !verified.reconciled) return false;
        } catch {
          return false;
        }
        // Recheck against the latest snapshot inside the setter to avoid stale writes.
        let saved = false;
        set(current => {
          if (current !== state && (current.accounts !== state.accounts
            || current.transactions !== state.transactions || current.transfers !== state.transfers)) return current;
          saved = true;
          return { accounts: current.accounts.map(account => account.id === id
            ? { ...account, openingBalanceDate: date, updatedAt: now() } : account) };
        });
        return saved;
      },

      updateAccount: (id, patch) =>
        set((state) => {
          // Metadata is writable only through verifyAccountOpeningBalanceDate.
          if (Object.prototype.hasOwnProperty.call(patch, 'openingBalanceDate')) return state;
          const clean = definedOnly(patch);

          if (clean.initialBalance !== undefined && (!isFiniteMoneyInput(clean.initialBalance))) return state;
          if (typeof clean.creditLimit !== 'undefined' && (!isFiniteMoneyInput(clean.creditLimit))) return state;
          if (typeof clean.initialBalance === 'number') {
            clean.initialBalance = roundMoney(clean.initialBalance);
            if (!Number.isFinite(clean.initialBalance)) return state;
          }

          if (typeof clean.creditLimit === 'number') {
            clean.creditLimit = roundMoney(clean.creditLimit);
            if (
              !Number.isFinite(clean.creditLimit) ||
              clean.creditLimit < 0
            ) {
              return state;
            }
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

          const financialBasisChanged =
            (safePatch.initialBalance !== undefined
              && safePatch.initialBalance !== currentAccount.initialBalance)
            || (safePatch.currencyCode !== undefined
              && safePatch.currencyCode !== currentAccount.currencyCode);

          return {
            accounts: state.accounts.map((account) =>
              account.id === id
                ? {
                    ...account,
                    ...safePatch,
                    ...(financialBasisChanged ? { openingBalanceDate: undefined } : {}),
                    updatedAt: now(),
                  }
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

      deleteAccount: (id) => {
        const state = get(), finance = useFinanceStore.getState();
        if (!useLedgerStore.persist.hasHydrated() || !useFinanceStore.persist.hasHydrated()
          || state.accounts.filter(a => a.id === id).length !== 1
          || state.transfers.some(t => t.fromAccountId === id || t.toAccountId === id)
          || state.transactions.some(t => t.accountId === id && isProtectedTransaction(t, finance))
          || finance.debts.some(d => (d.payments ?? []).some(p => p.accountId === id))
          || finance.loans.some(l => l.depositAccountId === id || l.settlementAccountId === id
            || (l.payments ?? []).some(p => p.accountId === id))) return false;
        set((state) => ({
          accounts: state.accounts.filter((account) => account.id !== id),
          transactions: state.transactions.filter(
            (transaction) => transaction.accountId !== id
          ),
        }));
        return true;
      },

      clearAccountsAndTransactions: () => {
        const finance = useFinanceStore.getState();
        if (!useLedgerStore.persist.hasHydrated() || !useFinanceStore.persist.hasHydrated()
          || get().transfers.length || finance.loans.length || finance.debts.length
          || get().transactions.some(t => isProtectedTransaction(t, finance))) return false;
        set({
          accounts: [],
          transactions: [],
          transfers: [],
        });
        return true;
      },

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
        if (['linkedEntityType', 'linkedEntityId', 'linkedPaymentId'].some(key => key in input)
          || ('purpose' in input && input.purpose !== undefined && input.purpose !== 'normal')) return null;
        const account = get().accounts.find(item => item.id === input.accountId);
        if (!account || !isValidCrossCurrencyMetadata({
          ...input, currencyCode: account.currencyCode,
        })) return null;
        if (input.historicalFx !== undefined) {
          const account = get().accounts.find(item => item.id === input.accountId);
          if (!account || !isValidHistoricalFx(input.historicalFx, account.currencyCode, input.date)) return null;
        }
        return createTransaction(input);
      },

      addPropertyPaymentTransaction: input => {
        if (!useLedgerStore.persist.hasHydrated() || !useFinanceStore.persist.hasHydrated()
          || !isValidISODate(input.date) || !Number.isFinite(input.amount)
          || input.amount <= 0 || roundMoney(input.amount) !== input.amount
          || !input.contractId || !input.paymentId
          || get().transactions.some(t => t.linkedEntityType === 'property'
            && t.linkedEntityId === input.contractId && t.linkedPaymentId === input.paymentId)) return null;
        const account = get().accounts.filter(a => a.id === input.accountId);
        if (account.length !== 1 || account[0].archived || account[0].type === 'credit_card') return null;
        return createTransaction({
          type: 'expense', purpose: 'property_installment_payment', entryType: 'normal',
          accountId: input.accountId, categoryId: input.categoryId, amount: input.amount,
          date: input.date, linkedEntityType: 'property', linkedEntityId: input.contractId,
          linkedPaymentId: input.paymentId,
        });
      },

      addPaymentTransaction: (ref, categoryId) => addPaymentTransaction(ref, categoryId),
      addReservedPaymentTransaction: receipt => {
        if (!isPaymentOperationReceipt(receipt) || receipt.status !== 'prepared'
          || receipt.request.funding.kind !== 'account'
          || !reservedPaymentMatches(receipt, useFinanceStore.getState(), get())) return null;
        return addPaymentTransaction({ entityType: receipt.request.entityType,
          entityId: receipt.request.entityId, paymentId: receipt.paymentId }, receipt.request.funding.categoryId,
          receipt.ledgerTransactionId);
      },

      addLoanReceiptTransaction: (input) => {
        if (!useFinanceStore.persist.hasHydrated() || !useLedgerStore.persist.hasHydrated()) return null;
        const matches = useFinanceStore.getState().loans.filter(l => l.id === input.loanId);
        const loan = matches[0];
        const account = get().accounts.filter(a => a.id === input.accountId);
        if (matches.length !== 1 || loan.receivedAt || loan.receiptTransactionId
          || !Number.isFinite(input.amount) || input.amount <= 0 || !isValidISODate(input.date)
          || (loan.principalAmount !== undefined && input.amount > loan.principalAmount)
          || account.length !== 1 || account[0].archived || account[0].type === 'credit_card'
          || account[0].currencyCode !== loan.currencyCode
          || get().transactions.some(t => t.linkedEntityId === loan.id && !t.linkedPaymentId)) return null;
        return createTransaction({ accountId: input.accountId, categoryId: input.categoryId, amount: input.amount,
          type: 'income', date: input.date, note: 'Loan received: ' + loan.name,
          linkedEntityType: 'loan', linkedEntityId: loan.id });
      },

      updateTransaction: (id, patch) => {
        if (!useFinanceStore.persist.hasHydrated() || !useLedgerStore.persist.hasHydrated()) return false;
        const { accounts, categories, transactions } = get();

        const current = transactions.find((item) => item.id === id);

        if (!current || current.entryType === 'refund') {
          return false;
        }

        const editableFields = ['type', 'amount', 'accountId', 'categoryId', 'entryType',
          'relatedTransactionId', 'date', 'note', 'historicalFx',
          'originalAmount', 'originalCurrencyCode', 'accountFxRate', 'accountFxSnapshot', 'directHistoricalFx'];
        if (isProtectedTransaction(current, useFinanceStore.getState()) ||
          Object.keys(patch).some(key => !editableFields.includes(key))) return false;

        const next = {
          ...current,
          ...definedOnly(patch),
        };

        // Allow explicitly clearing all four cross-currency fields.
        const crossCurrencyKeys = [
          'originalAmount',
          'originalCurrencyCode',
          'accountFxRate',
          'accountFxSnapshot',
        ] as const;

        const explicitlyClearedKeys = crossCurrencyKeys.filter(
          key => Object.prototype.hasOwnProperty.call(patch, key) &&
            patch[key] === undefined
        );

        const clearCrossCurrency =
          explicitlyClearedKeys.length === crossCurrencyKeys.length;

        const switchingToManual =
          patch.directHistoricalFx?.source === 'manual' &&
          Object.prototype.hasOwnProperty.call(patch, 'accountFxSnapshot') &&
          patch.accountFxSnapshot === undefined &&
          Object.prototype.hasOwnProperty.call(patch, 'historicalFx') &&
          patch.historicalFx === undefined &&
          current.accountFxSnapshot !== undefined;

        const switchingToAnchors =
          current.directHistoricalFx?.source === 'manual' &&
          Object.prototype.hasOwnProperty.call(patch, 'directHistoricalFx') &&
          patch.directHistoricalFx === undefined &&
          patch.accountFxSnapshot !== undefined &&
          patch.historicalFx !== undefined;

        if (
          explicitlyClearedKeys.length > 0 &&
          !clearCrossCurrency &&
          !switchingToManual
        ) {
          return false;
        }

        if (clearCrossCurrency) {
          for (const key of crossCurrencyKeys) {
            delete next[key];
          }
          delete next.directHistoricalFx;
        } else if (switchingToManual) {
          delete next.accountFxSnapshot;
          delete next.historicalFx;
        } else if (switchingToAnchors) {
          delete next.directHistoricalFx;
        } else if (
          Object.prototype.hasOwnProperty.call(patch, 'directHistoricalFx') &&
          patch.directHistoricalFx === undefined &&
          current.directHistoricalFx !== undefined
        ) {
          return false;
        }

const account = accounts.find(
          (item) => item.id === next.accountId
        );

        const category = categories.find(
          (item) => item.id === next.categoryId
        );

        if (next.historicalFx !== undefined &&
          (!account || !isValidHistoricalFx(
            next.historicalFx,
            account.currencyCode,
            next.date
          ))) return false;

        if (!account || !isValidCrossCurrencyMetadata({
          ...next, currencyCode: account.currencyCode,
        })) return false;

        // Keep ordinary and cross-currency edits consistent with creation precision.
        const usesAccountPrecision = next.originalAmount !== undefined ||
          (!next.linkedEntityType && (next.purpose === undefined || next.purpose === 'normal'));
        const amount = roundMoney(next.amount,
          usesAccountPrecision ? getCurrencyDecimals(account.currencyCode) : 2);

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
        if (!useFinanceStore.persist.hasHydrated() || !useLedgerStore.persist.hasHydrated()) return false;
        const { transactions } = get();

        const current = transactions.find(
          (transaction) => transaction.id === id
        );

        if (!current) {
          return false;
        }

        if (isProtectedTransaction(current, useFinanceStore.getState())) return false;

        const hasRefunds = transactions.some(
          (transaction) =>
            transaction.entryType === 'refund' &&
            transaction.relatedTransactionId === id
        );

        if (hasRefunds) {
          return false;
        }

        set((state) => ({
          transactions: state.transactions.filter(
            (transaction) => transaction.id !== id
          ),
        }));
        return true;
      },

      /* ------------------------------ Transfers ---------------------------- */

      addTransfer: (input) => {
        const { accounts, transactions, transfers } = get();

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

        // Prevent transfers and card payments from exceeding the source balance.
        const availableBalance = getAccountBalance(
          fromAccount,
          transactions,
          transfers
        );

        if (
          roundMoney(availableBalance) <
          roundMoney(input.fromAmount)
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
        const { accounts, transactions, transfers } = get();

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

        // Exclude the old transfer before validating the edited amount.
        const transfersWithoutCurrent = transfers.filter(
          (transfer) => transfer.id !== id
        );

        const availableBalance = getAccountBalance(
          nextFromAccount,
          transactions,
          transfersWithoutCurrent
        );

        if (
          roundMoney(availableBalance) <
          roundMoney(nextInput.fromAmount)
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

      resetLedger: () => {
        if (!get().clearAccountsAndTransactions()) return false;
        set({ ...initialData, ...paymentJournalMetadata(get()) });
        return true;
      },
      });
    },
    {
      name: 'tomorrow:ledger',
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),

      // Persist data only, never action functions.
      partialize: (state): LedgerData => ({
        ...paymentJournalMetadata(state),
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
        transfers: state.transfers,
      }),

      migrate: (persistedState, persistedVersion): LedgerData => {
        assertAccountingStorageVersion(persistedVersion);
        return migrateLedgerData(persistedState);
      },

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

registerLedgerProtectionReader(() => ({ ...useLedgerStore.getState(), hydrated: useLedgerStore.persist.hasHydrated() }));

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
