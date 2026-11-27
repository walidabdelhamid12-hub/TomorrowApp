import { allowsLegacyDebtFx, buildDebtPaymentFx, type DebtPaymentFx } from '../utils/debtPaymentFx';
import { assertAccountingHydration } from './accountingHydration';
import { categoriesForTransferFee, attachTransferSettlement, canFundEnhancedSettlement, isEnhancedSettlement, validSettlementOptions, transferSettlementProblem, assertTransferSettlementEvidence } from '../utils/transferSettlement';
import { isValidHistoricalFx } from '@/features/finance/utils/historicalFx';
import { isValidCrossCurrencyMetadata } from '@/features/finance/utils/crossCurrencyMetadata';
import { getCurrencyDecimals, isSupportedCurrency } from '@/features/finance/constants/currencies';
import { isPaymentOperationReceipt, type PaymentOperationReceipt } from '@/features/finance/types/paymentOperations';
import { reservedPaymentMatches } from '@/features/finance/utils/reservedPayments';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { assertAccountingStorageVersion, paymentJournalMetadata } from '@/features/finance/types/paymentJournalInstallation';
import { useSyncExternalStore } from 'react';
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
import { validateAccountOpeningDate } from '@/features/finance/utils/accountOpeningDate';

/* -------------------------------------------------------------------------- */
/* Store contract                                                             */
/* -------------------------------------------------------------------------- */

interface LedgerActions {
  /** Caller must acknowledge the prepared journal and hold the accounting gate. */
  addReservedPaymentTransaction: (receipt: PaymentOperationReceipt) => EntityId | null;
  // Accounts
  addAccount: (input: NewAccountInput, openingDate?: string) => EntityId;
  updateAccount: (id: EntityId, patch: AccountPatch) => void;
  /** Explicit metadata-only verification; never edits financial balances. */
  verifyAccountOpeningBalanceDate: (id: EntityId, date: string) => boolean;
  setAccountArchived: (id: EntityId, archived: boolean) => void;
  deleteAccount: (id: EntityId) => boolean;
  clearAccountsAndTransactions: () => boolean;

  // Categories
  addCategory: (input: NewCategoryInput) => EntityId;
  updateCategory: (id: EntityId, patch: CategoryPatch) => void;
  archiveCategory: (id: EntityId, archived?: boolean) => boolean;
  deleteCategory: (
    id: EntityId,
    replacementCategoryId?: EntityId
  ) => boolean;

  // Transactions
  addTransaction: (input: NewTransactionInput, submissionId?: EntityId) => EntityId | null;
  /** Dedicated posting derives cash and ownership from an existing, unlinked payment. */
  addPaymentTransaction: (ref: PaymentRef, categoryId: string) => EntityId | null;
  addCrossCurrencyDebtPaymentTransaction: (ref: PaymentRef, categoryId: string, fx: DebtPaymentFx) => EntityId | null;
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
  assertAccountingHydration(persistedState, 'ledger');
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

  return total;
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

  const originals = transactions.filter(transaction => transaction.id === input.relatedTransactionId);
  if (originals.length !== 1) return false;
  const [original] = originals;

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

  if (!account || original.currencyCode !== account.currencyCode
    || input.date < original.date || !isValidCrossCurrencyMetadata(original)) {
    return false;
  }

  const currency = original.originalCurrencyCode ?? original.currencyCode;
  const related = transactions.filter(item => item.entryType === 'refund'
    && item.relatedTransactionId === original.id);
  if (input.originalCurrencyCode !== original.originalCurrencyCode
    || !isValidCrossCurrencyMetadata({ ...input, currencyCode: account.currencyCode })) return false;
  if (related.some(item => item.accountId !== original.accountId
    || item.categoryId !== original.categoryId || item.currencyCode !== account.currencyCode
    || item.originalCurrencyCode !== original.originalCurrencyCode
    || !isValidCrossCurrencyMetadata(item))) return false;

  const decimals = getCurrencyDecimals(currency);
  const factor = 10 ** decimals;
  const toUnits = (value: number) => {
    const units = Math.round(value * factor);
    return Number.isSafeInteger(units) && units > 0 && units / factor === value ? units : NaN;
  };
  let remaining = toUnits(original.originalAmount ?? original.amount);
  for (const item of related) remaining -= toUnits(item.originalAmount ?? item.amount);
  return toUnits(input.originalAmount ?? input.amount) <= remaining;
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
    | 'actualReceivedConfirmed'
    | 'feeAmount'
    | 'feeCategoryId'
  >,
  fromAccount: Account,
  toAccount: Account
): boolean {
  if (!validSettlementOptions(input, fromAccount, toAccount)) return false;
  if (isEnhancedSettlement(input)) return true;
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
  const fromAmount = isEnhancedSettlement(input) ? input.fromAmount : roundMoney(input.fromAmount);
  const toAmount = isEnhancedSettlement(input) ? input.toAmount : roundMoney(input.toAmount);

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
      const pendingSubmissions = new Set<EntityId>();
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
        // Preserve the existing two-decimal behavior for linked posting.
        const usesAccountPrecision = !!account &&
          (input.originalAmount !== undefined ||
            (!input.linkedEntityType && (input.purpose === undefined || input.purpose === 'normal')));
        const amount = roundMoney(input.amount,
          usesAccountPrecision ? getCurrencyDecimals(account.currencyCode) : 2);

        const valid =
          !!account &&
          !account.archived &&
          !!category &&
          category.kind === input.type &&
          (!category.archived || input.entryType === 'refund' || !!input.linkedEntityType) &&
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

        if (input.entryType === 'refund' && amount !== input.amount) return null;

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
      const addPaymentTransaction = (ref: PaymentRef, categoryId: string, reservedId?: string, fx?: DebtPaymentFx): EntityId | null => {
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
        const crossDebt = !isLoan && account.length === 1 && account[0].currencyCode !== parent.currencyCode;
        const fxFields = crossDebt && fx && !reservedId && allowsLegacyDebtFx(finance, get()) ? buildDebtPaymentFx(payment.amount, parent.currencyCode, account[0].currencyCode, payment.date, fx) : null;
        if ((crossDebt && !fxFields) || (!crossDebt && fx !== undefined)) return null;
        if (payment.ledgerTransactionId || !isValidISODate(payment.date)
          || !Number.isFinite(payment.amount) || payment.amount <= 0 || !Number.isFinite(fee) || fee < 0
          || account.length !== 1 || account[0].archived || (!crossDebt && account[0].currencyCode !== parent.currencyCode)
          || (isLoan && (account[0].type === 'credit_card' || (payment as LoanPayment).paymentMode !== 'simple'))
          || (debt && debt.direction !== 'receivable' && debt.direction !== 'payable')
          || get().transactions.some(t => !(isLoan && isVerifiedLoanReceipt(t, parent as Loan, finance, get()))
            && (t.linkedPaymentId === payment.id
              || (t.linkedEntityId === parent.id && (!t.linkedPaymentId || t.linkedEntityType !== ref.entityType))))) return null;
        const type = debt?.direction === 'receivable' ? 'income' : 'expense';
        return createTransaction({ accountId: account[0].id, categoryId, amount: roundMoney(payment.amount + fee),
          type, date: payment.date, note: payment.note,
          purpose: isLoan ? 'loan_payment' : type === 'income' ? 'debt_collection' : 'debt_payment',
          linkedEntityType: ref.entityType, linkedEntityId: parent.id, linkedPaymentId: payment.id, ...(fxFields ?? {}) }, reservedId);
      };
      return ({
      ...initialData,

      /* ------------------------------ Accounts ----------------------------- */

      addAccount: (input, openingDate) => {
        // Reject runtime attempts to bypass the dedicated historical-date verification.
        // TypeScript's Omit is not a runtime guard against persisted metadata injection.
        if (Object.prototype.hasOwnProperty.call(input, 'openingBalanceDate')) return '';
        if (!isFiniteMoneyInput(input.initialBalance)
          || (input.creditLimit !== undefined && (!isFiniteMoneyInput(input.creditLimit)))) return '';
        const currencyCode = input.currencyCode ?? useCurrencyStore.getState().baseCurrency;
        if (typeof currencyCode !== 'string' || !isSupportedCurrency(currencyCode)) return '';
        const normalizedCurrency = currencyCode.trim().toUpperCase();
        const decimals = getCurrencyDecimals(normalizedCurrency);
        const initialBalance = roundMoney(input.initialBalance, decimals);
        const creditLimit =
          input.creditLimit === undefined
            ? undefined
            : roundMoney(input.creditLimit, decimals);

        if (
          !Number.isFinite(initialBalance) || initialBalance !== input.initialBalance ||
          creditLimit !== input.creditLimit ||
          (creditLimit !== undefined &&
            (!Number.isFinite(creditLimit) || creditLimit < 0))
        ) {
          return '';
        }

        const timestamp = now();

        const account: Account = {
          ...input,
          ...(creditLimit === undefined ? {} : { creditLimit }),
          currencyCode: normalizedCurrency,
          initialBalance,
          archived: input.archived ?? false,
          id: generateId('acc'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        const state = get();
        if (openingDate !== undefined) {
          if (!useLedgerStore.persist.hasHydrated()
            || !validateAccountOpeningDate({ ...state, accounts: [...state.accounts, account] }, account.id, openingDate).valid) return '';
          account.openingBalanceDate = openingDate;
        }
        set({ accounts: [...state.accounts, account] });

        return account.id;
      },

      verifyAccountOpeningBalanceDate: (id, date) => {
        if (!useLedgerStore.persist.hasHydrated()) return false;
        const state = get();
        if (!validateAccountOpeningDate(state, id, date).valid) return false;
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

          if (clean.currencyCode !== undefined) {
            if (typeof clean.currencyCode !== 'string' || !isSupportedCurrency(clean.currencyCode)) return state;
            clean.currencyCode = clean.currencyCode.trim().toUpperCase();
          }

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

          const decimals = getCurrencyDecimals(safePatch.currencyCode ?? currentAccount.currencyCode);
          const nextBalance = safePatch.initialBalance ?? currentAccount.initialBalance;
          const nextLimit = safePatch.creditLimit ?? currentAccount.creditLimit;
          if ((safePatch.initialBalance !== undefined || safePatch.currencyCode !== undefined)
            && roundMoney(nextBalance, decimals) !== nextBalance) return state;
          if ((safePatch.creditLimit !== undefined || safePatch.currencyCode !== undefined)
            && nextLimit !== undefined
            && (nextLimit < 0 || roundMoney(nextLimit, decimals) !== nextLimit)) return state;

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

      archiveCategory: (id, archived = true) => {
        if (!useLedgerStore.persist.hasHydrated()) return false;
        const { categories } = get();
        if (typeof archived !== 'boolean'
          || categories.filter(category => category.id === id).length !== 1) return false;
        set({ categories: categories.map(category => category.id === id
          ? { ...category, archived } : category) });
        return true;
      },

      deleteCategory: (id, replacementCategoryId) => {
        const { categories, transactions } = get();

        const category = categories.find((item) => item.id === id);

        if (!category || category.archived) {
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
            !replacementCategory || replacementCategory.archived ||
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

      addTransaction: (input, submissionId) => {
        if (!isValidISODate(input.date)) return null;
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
        if (submissionId === undefined) return createTransaction(input);
        if (!useLedgerStore.persist.hasHydrated() || typeof submissionId !== 'string'
          || !/^(?:trx_submit_[a-z0-9]+|submission-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+)$/.test(submissionId)
          || pendingSubmissions.has(submissionId)
          || get().transactions.some(transaction => transaction.id === submissionId)) return null;

        pendingSubmissions.add(submissionId);
        try {
          return createTransaction(input, submissionId);
        } finally {
          pendingSubmissions.delete(submissionId);
        }
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
      addCrossCurrencyDebtPaymentTransaction: (ref, categoryId, fx) => ref.entityType === 'debt' && fx ? addPaymentTransaction(ref, categoryId, undefined, fx) : null,
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

        const explicitManualRepresentation =
          patch.directHistoricalFx?.source === 'manual' &&
          Object.prototype.hasOwnProperty.call(patch, 'accountFxSnapshot') &&
          patch.accountFxSnapshot === undefined &&
          Object.prototype.hasOwnProperty.call(patch, 'historicalFx') &&
          patch.historicalFx === undefined &&
          explicitlyClearedKeys.length === 1;

        const switchingToAnchors =
          current.directHistoricalFx?.source === 'manual' &&
          Object.prototype.hasOwnProperty.call(patch, 'directHistoricalFx') &&
          patch.directHistoricalFx === undefined &&
          patch.accountFxSnapshot !== undefined &&
          patch.historicalFx !== undefined;

        if (
          explicitlyClearedKeys.length > 0 &&
          !clearCrossCurrency &&
          !explicitManualRepresentation
        ) {
          return false;
        }

        if (clearCrossCurrency) {
          for (const key of crossCurrencyKeys) {
            delete next[key];
          }
          delete next.directHistoricalFx;
        } else if (explicitManualRepresentation) {
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

        if (!isValidISODate(next.date)) return false;
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
          (!category.archived || next.categoryId === current.categoryId) &&
          Number.isFinite(amount) &&
          amount > 0 &&
          next.entryType !== 'refund' &&
          !next.relatedTransactionId;

        if (!valid || !account) {
          return false;
        }

        if (hasLinkedRefunds && (current.originalAmount !== undefined || next.originalAmount !== undefined)
          && (current.originalAmount !== next.originalAmount || current.originalCurrencyCode !== next.originalCurrencyCode
            || current.amount !== amount || current.date !== next.date)) return false;

        if (current.originalAmount === undefined
          && roundMoney(linkedRefunds, getCurrencyDecimals(account.currencyCode)) > amount) {
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
        if (!useLedgerStore.persist.hasHydrated() || !useFinanceStore.persist.hasHydrated()) return null;
        const { accounts, categories, transactions, transfers } = get();

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

        if (isEnhancedSettlement(input) ? !isValidISODate(input.date) || !canFundEnhancedSettlement(input, fromAccount, transactions, transfers)
          : roundMoney(availableBalance) < roundMoney(input.fromAmount)) {
          return null;
        }

        const timestamp = now();

        const transfer = buildTransfer(
          input,
          generateId('trf'),
          timestamp
        );

        if ([...accounts, ...categories, ...transactions, ...transfers].some(row => row.id === transfer.id)) return null;
        const nextCategories = categoriesForTransferFee(input, get());
        const paired = attachTransferSettlement(transfer, input, { ...get(), categories: nextCategories }, timestamp);
        if (!paired) return null;
        const nextTransfers = [paired.transfer, ...transfers];
        const nextTransactions = paired.fee ? [paired.fee, ...transactions] : transactions;
        try { assertTransferSettlementEvidence({ accounts, categories: nextCategories, transfers: nextTransfers, transactions: nextTransactions }); }
        catch { return null; }
        set({ categories: nextCategories, transfers: nextTransfers, transactions: nextTransactions });
        return transfer.id;
      },

      updateTransfer: (id, patch) => {
        if (!useLedgerStore.persist.hasHydrated() || !useFinanceStore.persist.hasHydrated()) return false;
        const { accounts, categories, transactions, transfers } = get();

        const matching = transfers.filter(item => item.id === id);
        const current = matching[0];
        if (matching.length !== 1 || !current || transferSettlementProblem(get(), current)) return false;
        const previousFee = current.feeTransactionId ? transactions.find(tx => tx.id === current.feeTransactionId) : undefined;
        const patchValues = definedOnly(patch);
        if (patchValues.actualReceivedConfirmed !== undefined && patchValues.actualReceivedConfirmed !== true) return false;
        if (patchValues.feeAmount !== undefined && (typeof patchValues.feeAmount !== 'number' || !Number.isFinite(patchValues.feeAmount) || patchValues.feeAmount < 0)) return false;
        if (patchValues.feeCategoryId !== undefined && (typeof patchValues.feeCategoryId !== 'string' || !patchValues.feeCategoryId || patchValues.feeAmount === 0)) return false;
        // Changing an already-confirmed bank leg requires fresh explicit confirmation.
        const changesLeg = ['fromAccountId', 'toAccountId', 'fromAmount', 'toAmount', 'fromCurrencyCode', 'toCurrencyCode', 'date', 'exchangeRate'].some(key => {
          const v = patchValues[key as keyof TransferPatch];
          const original = key === 'exchangeRate' ? current.quotedExchangeRate ?? current.exchangeRate : current[key as keyof Transfer];
          return v !== undefined && v !== original;
        });
        if (current.actualReceivedConfirmed && changesLeg && (patchValues.actualReceivedConfirmed !== true || patchValues.toAmount === undefined)) return false;
        if (patchValues.actualReceivedConfirmed === true && !current.actualReceivedConfirmed && patchValues.toAmount === undefined) return false;
        if (previousFee && patchValues.fromAccountId !== undefined && patchValues.fromAccountId !== current.fromAccountId && patchValues.feeAmount === undefined) return false;

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
            current.quotedExchangeRate ?? current.exchangeRate ??
            (
              legacyFromAmount > 0
                ? legacyToAmount / legacyFromAmount
                : 1
            ),
          date: patchValues.date ?? current.date,
          type: patchValues.type ?? current.type,
          note: patchValues.note ?? current.note,
          actualReceivedConfirmed: patchValues.actualReceivedConfirmed ?? current.actualReceivedConfirmed,
          feeAmount: patchValues.feeAmount ?? current.feeAmount,
          feeCategoryId: patchValues.feeAmount === 0 ? undefined : patchValues.feeCategoryId ?? previousFee?.categoryId,
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
          transactions.filter(tx => tx !== previousFee),
          transfersWithoutCurrent
        );

        if (isEnhancedSettlement(nextInput) ? !isValidISODate(nextInput.date) || !canFundEnhancedSettlement(nextInput, nextFromAccount, transactions.filter(tx => tx !== previousFee), transfersWithoutCurrent)
          : roundMoney(availableBalance) < roundMoney(nextInput.fromAmount)) {
          return false;
        }

        const updated = buildTransfer(
          nextInput,
          current.id,
          current.createdAt
        );

        const timestamp = now();
        const nextCategories = categoriesForTransferFee(nextInput, get());
        const paired = attachTransferSettlement({ ...updated, updatedAt: timestamp }, nextInput, { ...get(), categories: nextCategories }, timestamp, previousFee);
        if (!paired) return false;
        const nextTransfers = transfers.map(item => item.id === id ? paired.transfer : item);
        const nextTransactions = previousFee ? (paired.fee ? transactions.map(tx => tx === previousFee ? paired.fee! : tx) : transactions.filter(tx => tx !== previousFee))
          : paired.fee ? [paired.fee, ...transactions] : transactions;
        try { assertTransferSettlementEvidence({ accounts, categories: nextCategories, transfers: nextTransfers, transactions: nextTransactions }); }
        catch { return false; }
        set({ categories: nextCategories, transfers: nextTransfers, transactions: nextTransactions });
        return true;
      },

      removeTransfer: (id) => {
        if (!useLedgerStore.persist.hasHydrated() || !useFinanceStore.persist.hasHydrated()) return;
        const state = get(), matches = state.transfers.filter(transfer => transfer.id === id);
        if (matches.length !== 1 || transferSettlementProblem(state, matches[0])) return;
        const feeId = matches[0].feeTransactionId;
        const transfers = state.transfers.filter(transfer => transfer.id !== id);
        const transactions = feeId ? state.transactions.filter(tx => tx.id !== feeId) : state.transactions;
        try { assertTransferSettlementEvidence({ ...state, transfers, transactions }); }
        catch { return; }
        set({ transfers, transactions });
      },

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

      merge: (persistedState, currentState) => {
        const restored = migrateLedgerData(persistedState);
        const merged = { ...currentState, ...restored };
        if (!Object.hasOwn(restored, 'paymentAccounting')) delete merged.paymentAccounting;
        return merged;
      },

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
const subscribeLedgerHydration = (notify: () => void) => {
  const begin = useLedgerStore.persist.onHydrate(notify);
  const finish = useLedgerStore.persist.onFinishHydration(notify);
  return () => { begin(); finish(); };
};

export function useLedgerHydrated(): boolean {
  return useSyncExternalStore(subscribeLedgerHydration, useLedgerStore.persist.hasHydrated, () => false);
}
