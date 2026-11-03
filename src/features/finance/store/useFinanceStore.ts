
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type {
  Asset,
  AssetEntry,
  AssetEntryPatch,
  AssetPatch,
  Cheque,
  ChequePatch,
  ChequeStatus,
  Debt,
  DebtPatch,
  DebtPayment,
  DebtPaymentPatch,
  EntityId,
  FinanceData,
  ISODate,
  Loan,
  LoanPatch,
  LoanPayment,
  LoanPaymentPatch,
  NewAssetEntryInput,
  NewAssetInput,
  NewChequeInput,
  NewDebtInput,
  NewDebtPaymentInput,
  NewLoanInput,
  NewLoanPaymentInput,
} from '@/features/finance/types/finance';

import {
  definedOnly,
  generateId,
  getDebtPaid,
  getDebtRemaining,
  getLoanPaidAmount,
  getLoanTotal,
  roundMoney,
  todayISO,
} from '@/features/finance/utils/finance';

/* -------------------------------------------------------------------------- */
/* Store contract                                                             */
/* -------------------------------------------------------------------------- */

interface FinanceActions {
  addAsset: (input: NewAssetInput) => EntityId;
  updateAsset: (id: EntityId, patch: AssetPatch) => void;
  deleteAsset: (id: EntityId) => void;
  clearAssets: () => void;
  addAssetEntry: (
    assetId: EntityId,
    input: NewAssetEntryInput
  ) => EntityId | null;
  updateAssetEntry: (
    assetId: EntityId,
    entryId: EntityId,
    patch: AssetEntryPatch
  ) => void;
  deleteAssetEntry: (assetId: EntityId, entryId: EntityId) => void;

  addDebt: (input: NewDebtInput) => EntityId | null;
  updateDebt: (id: EntityId, patch: DebtPatch) => void;
  deleteDebt: (id: EntityId) => void;
  addDebtPayment: (
    debtId: EntityId,
    input: NewDebtPaymentInput
  ) => EntityId | null;
  linkDebtPaymentTransaction: (
    debtId: EntityId,
    paymentId: EntityId,
    transactionId: EntityId
  ) => boolean;
  updateDebtPayment: (
    debtId: EntityId,
    paymentId: EntityId,
    patch: DebtPaymentPatch
  ) => boolean;
  deleteDebtPayment: (
    debtId: EntityId,
    paymentId: EntityId,
    expectedLedgerTransactionId?: EntityId
  ) => boolean;

  addLoan: (input: NewLoanInput) => EntityId | null;
  updateLoan: (id: EntityId, patch: LoanPatch) => void;
  deleteLoan: (id: EntityId) => void;
  addLoanPayment: (
    loanId: EntityId,
    input: NewLoanPaymentInput
  ) => EntityId | null;
  updateLoanPayment: (
    loanId: EntityId,
    paymentId: EntityId,
    patch: LoanPaymentPatch
  ) => void;
  deleteLoanPayment: (loanId: EntityId, paymentId: EntityId) => void;

  addCheque: (input: NewChequeInput) => EntityId;
  updateCheque: (id: EntityId, patch: ChequePatch) => void;
  deleteCheque: (id: EntityId) => void;
  setChequeStatus: (
    id: EntityId,
    status: ChequeStatus,
    paidDate?: ISODate
  ) => void;

  resetFinanceData: () => void;
}

export type FinanceStore = FinanceData & FinanceActions;

const STORAGE_VERSION = 2;

const initialData: FinanceData = {
  assets: [],
  debts: [],
  loans: [],
  cheques: [],
};

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

const now = (): string => new Date().toISOString();

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Preserve existing arrays during migration while rejecting entries that
 * cannot even represent a record with an ID. Detailed entity validation
 * remains the responsibility of the finance domain types and operations.
 */
function normalizeRecords<T>(
  value: unknown
): T[] {
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

/**
 * Migrate persisted data without resetting valid finance records.
 * Zustand merges the migrated data with the current store, preserving actions.
 */
function migrateFinanceData(
  persistedState: unknown
): FinanceData {
  const saved = isRecord(persistedState) ? persistedState : {};

  return {
    assets: normalizeRecords<Asset>(saved.assets),
    debts: normalizeRecords<Debt>(saved.debts),
    loans: normalizeRecords<Loan>(saved.loans).map((loan) => ({
      ...loan,
      payments: Array.isArray(loan.payments) ? loan.payments : [],
    })),
    cheques: normalizeRecords<Cheque>(saved.cheques),
  };
}

function patchParent<T extends { id: EntityId; updatedAt: string }>(
  list: T[],
  id: EntityId,
  fn: (item: T) => T
): T[] {
  return list.map((item) =>
    item.id === id ? { ...fn(item), updatedAt: now() } : item
  );
}

function withRounded<T extends object>(
  obj: T,
  fields: (keyof T)[]
): T {
  const next = { ...obj };

  fields.forEach((field) => {
    const value = next[field];

    if (typeof value === 'number') {
      (next as Record<keyof T, unknown>)[field] = roundMoney(value);
    }
  });

  return next;
}

/**
 * Applies only the fields that belong to the asset's category.
 * Silver assets have no currencyCode or karat.
 */
function applyAssetPatch(asset: Asset, patch: AssetPatch): Asset {
  const next: Asset = { ...asset };

  if (patch.name !== undefined) {
    next.name = patch.name;
  }

  if (patch.notes !== undefined) {
    next.notes = patch.notes;
  }

  if (
    next.category === 'local_currency' ||
    next.category === 'foreign_currency'
  ) {
    if (patch.currencyCode !== undefined) {
      next.currencyCode = patch.currencyCode;
    }
  } else if (next.category === 'gold') {
    if (patch.karat !== undefined) {
      next.karat = patch.karat;
    }
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set, get) => ({
      ...initialData,

      /* Assets */
      addAsset: (input) => {
        const timestamp = now();

        const asset: Asset = {
          ...input,
          id: generateId('ast'),
          entries: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        } as Asset;

        set((state) => ({
          assets: [asset, ...state.assets],
        }));

        return asset.id;
      },

      updateAsset: (id, patch) =>
        set((state) => ({
          assets: patchParent(state.assets, id, (asset) =>
            applyAssetPatch(asset, patch)
          ),
        })),

      deleteAsset: (id) =>
        set((state) => ({
          assets: state.assets.filter((asset) => asset.id !== id),
        })),

      clearAssets: () => set({ assets: [] }),

      addAssetEntry: (assetId, input) => {
        const amount = roundMoney(input.amount);
        if (
          !get().assets.some((asset) => asset.id === assetId) ||
          !Number.isFinite(amount)
        ) {
          return null;
        }

        const entry: AssetEntry = {
          ...input,
          amount,
          id: generateId('ent'),
          createdAt: now(),
        };

        set((state) => ({
          assets: patchParent(state.assets, assetId, (asset) => ({
            ...asset,
            entries: [...asset.entries, entry],
          })),
        }));

        return entry.id;
      },

      updateAssetEntry: (assetId, entryId, patch) => {
        const cleanPatch = withRounded(definedOnly(patch), ['amount']);
        if (
          typeof cleanPatch.amount === 'number' &&
          !Number.isFinite(cleanPatch.amount)
        ) {
          return;
        }

        set((state) => ({
          assets: patchParent(state.assets, assetId, (asset) => ({
            ...asset,
            entries: asset.entries.map((entry) =>
              entry.id === entryId
                ? { ...entry, ...cleanPatch }
                : entry
            ),
          })),
        }));
      },

      deleteAssetEntry: (assetId, entryId) =>
        set((state) => ({
          assets: patchParent(state.assets, assetId, (asset) => ({
            ...asset,
            entries: asset.entries.filter((entry) => entry.id !== entryId),
          })),
        })),

      /* Debts */
      addDebt: (input) => {
        const amount = roundMoney(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const timestamp = now();

        const debt: Debt = {
          ...input,
          amount,
          id: generateId('dbt'),
          payments: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          debts: [debt, ...state.debts],
        }));

        return debt.id;
      },

      updateDebt: (id, patch) => {
        const debt = get().debts.find((item) => item.id === id);
        if (!debt) return;

        const cleanPatch = withRounded(definedOnly(patch), ['amount']);
        if (typeof cleanPatch.amount === 'number') {
          const alreadyPaid = getDebtPaid(debt);
          if (
            !Number.isFinite(cleanPatch.amount) ||
            cleanPatch.amount <= 0 ||
            cleanPatch.amount < alreadyPaid
          ) {
            return;
          }
        }

        set((state) => ({
          debts: patchParent(state.debts, id, (currentDebt) => ({
            ...currentDebt,
            ...cleanPatch,
          })),
        }));
      },

      deleteDebt: (id) => {
        const debt = get().debts.find((item) => item.id === id);
        // Keep the debt record whenever it has payment history. Its payments
        // may already be reflected in the ledger and must never be orphaned.
        if (!debt || (debt.payments ?? []).length > 0) return;

        set((state) => ({
          debts: state.debts.filter((item) => item.id !== id),
        }));
      },

      addDebtPayment: (debtId, input) => {
        const debt = get().debts.find((item) => item.id === debtId);
        if (!debt) return null;

        const amount = roundMoney(input.amount);
        const alreadyPaid = getDebtPaid(debt);
        const remaining = getDebtRemaining(debt);

        if (
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !Number.isFinite(remaining) ||
          amount > remaining
        ) {
          return null;
        }

        const payment: DebtPayment = {
          ...input,
          amount,
          id: generateId('dpy'),
        };

        set((state) => ({
          debts: patchParent(state.debts, debtId, (debt) => ({
            ...debt,
            payments: [...debt.payments, payment],
          })),
        }));

        return payment.id;
      },

      // Attach a newly created ledger transaction to an unlinked payment.
      // This is deliberately separate from editing an already-posted payment.
      linkDebtPaymentTransaction: (debtId, paymentId, transactionId) => {
        if (!transactionId) return false;

        const debt = get().debts.find((item) => item.id === debtId);
        const payment = debt?.payments.find((item) => item.id === paymentId);

        if (!debt || !payment || payment.ledgerTransactionId) {
          return false;
        }

        const alreadyLinked = get().debts.some((item) =>
          item.payments.some(
            (candidate) =>
              candidate.id !== paymentId &&
              candidate.ledgerTransactionId === transactionId
          )
        );

        if (alreadyLinked) return false;

        set((state) => ({
          debts: patchParent(state.debts, debtId, (currentDebt) => ({
            ...currentDebt,
            payments: currentDebt.payments.map((candidate) =>
              candidate.id === paymentId
                ? { ...candidate, ledgerTransactionId: transactionId }
                : candidate
            ),
          })),
        }));

        return true;
      },

      updateDebtPayment: (debtId, paymentId, patch) => {
        const debt = get().debts.find((item) => item.id === debtId);
        const currentPayment = debt?.payments.find((item) => item.id === paymentId);
        // Older payment records without a verified ledger link are read-only:
        // editing them could change debt totals without changing the account.
        if (!debt || !currentPayment || !currentPayment.ledgerTransactionId) {
          return false;
        }

        const cleanPatch = withRounded(definedOnly(patch), ['amount']);
        const nextAmount =
          typeof cleanPatch.amount === 'number'
            ? cleanPatch.amount
            : currentPayment.amount;
        const otherPayments = getDebtPaid({
          ...debt,
          payments: debt.payments.filter((payment) => payment.id !== paymentId),
        });
        const remainingForPayment = getDebtRemaining({
          ...debt,
          payments: debt.payments.filter((payment) => payment.id !== paymentId),
        });

        if (
          !Number.isFinite(nextAmount) ||
          nextAmount <= 0 ||
          !Number.isFinite(remainingForPayment) ||
          nextAmount > remainingForPayment
        ) {
          return false;
        }

        set((state) => ({
          debts: patchParent(state.debts, debtId, (currentDebt) => ({
            ...currentDebt,
            payments: currentDebt.payments.map((payment) =>
              payment.id === paymentId
                ? { ...payment, ...cleanPatch }
                : payment
            ),
          })),
        }));
        return true;
      },

      // A posted payment can be deleted only after its matching ledger entry
      // has been removed by the caller and its exact ID is supplied here.
      deleteDebtPayment: (debtId, paymentId, expectedLedgerTransactionId) => {
        const debt = get().debts.find((item) => item.id === debtId);
        const payment = debt?.payments.find((item) => item.id === paymentId);
        if (!debt || !payment) return false;

        if (
          payment.ledgerTransactionId &&
          payment.ledgerTransactionId !== expectedLedgerTransactionId
        ) {
          return false;
        }

        if (!payment.ledgerTransactionId && expectedLedgerTransactionId) {
          return false;
        }

        set((state) => ({
          debts: patchParent(state.debts, debtId, (currentDebt) => ({
            ...currentDebt,
            payments: currentDebt.payments.filter(
              (item) => item.id !== paymentId
            ),
          })),
        }));
        return true;
      },

      /* Loans */
      addLoan: (input) => {
        const principalAmount = input.principalAmount === undefined
          ? undefined
          : roundMoney(input.principalAmount);
        const totalRepaymentAmount = roundMoney(
          input.totalRepaymentAmount ??
          input.monthlyInstallment * input.numberOfInstallments
        );
        const monthlyInstallment = roundMoney(input.monthlyInstallment);
        if (
          (principalAmount !== undefined &&
            (!Number.isFinite(principalAmount) || principalAmount <= 0)) ||
          !Number.isFinite(totalRepaymentAmount) ||
          totalRepaymentAmount <= 0 ||
          (principalAmount !== undefined && totalRepaymentAmount < principalAmount) ||
          !Number.isFinite(monthlyInstallment) ||
          monthlyInstallment <= 0 ||
          !Number.isInteger(input.numberOfInstallments) ||
          input.numberOfInstallments < 1
        ) return null;

        const timestamp = now();

        const loan: Loan = {
          ...input,
          principalAmount,
          totalRepaymentAmount,
          status: input.status ?? 'active',
          monthlyInstallment,
          id: generateId('lon'),
          payments: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          loans: [loan, ...state.loans],
        }));

        return loan.id;
      },

      updateLoan: (id, patch) => {
        const loan = get().loans.find((item) => item.id === id);
        if (!loan) return;

        const cleanPatch = withRounded(definedOnly(patch), [
          'principalAmount',
          'totalRepaymentAmount',
          'receivedAmount',
          'settlementAmount',
          'monthlyInstallment',
        ]);
        const nextPrincipal = cleanPatch.principalAmount ?? loan.principalAmount;
        const nextTotal = getLoanTotal({ ...loan, ...cleanPatch });
        const nextInstallment = cleanPatch.monthlyInstallment ?? loan.monthlyInstallment;
        const paidTotal = getLoanPaidAmount(loan);
        const paidPrincipal = roundMoney(
          loan.payments.reduce(
            (sum, payment) => sum + (
              payment.paymentMode === 'simple'
                ? 0
                : payment.principalAmount ?? payment.amount
            ),
            0
          )
        );
        const nextReceivedAmount = cleanPatch.receivedAmount ?? loan.receivedAmount ?? nextPrincipal ?? 0;
        const principalLimit = roundMoney(nextReceivedAmount);

        if (
          (nextPrincipal !== undefined &&
            (!Number.isFinite(nextPrincipal) || nextPrincipal <= 0 || paidPrincipal > nextPrincipal)) ||
          !Number.isFinite(nextTotal) || nextTotal <= 0 ||
          !Number.isFinite(paidTotal) ||
          !Number.isFinite(paidPrincipal) ||
          (nextPrincipal !== undefined && nextTotal < nextPrincipal) ||
          paidTotal > nextTotal ||
          !Number.isFinite(nextInstallment) || nextInstallment <= 0 ||
          !Number.isInteger(loan.numberOfInstallments) || loan.numberOfInstallments < 1 ||
          !Number.isFinite(principalLimit) ||
          principalLimit < 0 ||
          paidPrincipal > principalLimit ||
          (nextPrincipal !== undefined && principalLimit > nextPrincipal) ||
          (cleanPatch.settlementAmount !== undefined &&
            (!Number.isFinite(cleanPatch.settlementAmount) || cleanPatch.settlementAmount <= 0)) ||
          (cleanPatch.receivedAmount !== undefined &&
            (!Number.isFinite(cleanPatch.receivedAmount) ||
              cleanPatch.receivedAmount <= 0 ||
              (nextPrincipal !== undefined &&
                cleanPatch.receivedAmount > nextPrincipal)))
        ) return;

        set((state) => ({
          loans: patchParent(state.loans, id, (currentLoan) => ({
            ...currentLoan,
            ...cleanPatch,
          })),
        }));
      },

      deleteLoan: (id) =>
        set((state) => ({
          loans: state.loans.filter((loan) => loan.id !== id),
        })),

      addLoanPayment: (loanId, input) => {
        const loan = get().loans.find((item) => item.id === loanId);
        if (!loan || loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed') return null;

        const amount = roundMoney(input.amount);
        const latePaymentFee = roundMoney(input.latePaymentFee ?? 0);
        const paymentMode = input.paymentMode ?? 'split';
        const principalAmount = paymentMode === 'simple'
          ? undefined
          : roundMoney(input.principalAmount ?? amount);
        const interestAmount = paymentMode === 'simple'
          ? undefined
          : roundMoney(input.interestAmount ?? amount - (principalAmount ?? amount));
        const principalLimit = roundMoney(loan.receivedAmount ?? loan.principalAmount ?? 0);
        const principalAlreadyPaid = roundMoney(
          loan.payments.reduce(
            (sum, payment) => sum + (
              payment.paymentMode === 'simple'
                ? 0
                : payment.principalAmount ?? payment.amount
            ),
            0
          )
        );
        const totalLimit = getLoanTotal(loan);
        const totalAlreadyPaid = getLoanPaidAmount(loan);

        if (
          !Number.isFinite(amount) || amount <= 0 ||
          !Number.isFinite(latePaymentFee) || latePaymentFee < 0 ||
          !Number.isFinite(totalLimit) || totalLimit <= 0 ||
          !Number.isFinite(totalAlreadyPaid) ||
          roundMoney(amount + totalAlreadyPaid) > totalLimit ||
          (paymentMode !== 'simple' && (
            principalAmount === undefined || !Number.isFinite(principalAmount) || principalAmount < 0 ||
            interestAmount === undefined || !Number.isFinite(interestAmount) || interestAmount < 0 ||
            roundMoney(principalAmount + interestAmount) !== amount ||
            !Number.isFinite(principalAlreadyPaid) ||
            !Number.isFinite(principalLimit) ||
            roundMoney(principalAmount + principalAlreadyPaid) > principalLimit
          ))
        ) {
          return null;
        }

        const payment: LoanPayment = {
          ...input,
          amount,
          latePaymentFee,
          paymentMode,
          ...(paymentMode === 'simple' ? {} : { principalAmount, interestAmount }),
          id: generateId('lpy'),
        };

        set((state) => ({
          loans: patchParent(state.loans, loanId, (currentLoan) => ({
            ...currentLoan,
            payments: [...currentLoan.payments, payment],
          })),
        }));

        return payment.id;
      },

      updateLoanPayment: (loanId, paymentId, patch) => {
        const loan = get().loans.find((item) => item.id === loanId);
        const currentPayment = loan?.payments.find((item) => item.id === paymentId);
        if (!loan || !currentPayment) return;

        const cleanPatch = withRounded(definedOnly(patch), [
          'amount',
          'latePaymentFee',
          'principalAmount',
          'interestAmount',
        ]);
        const nextAmount = cleanPatch.amount ?? currentPayment.amount;
        const nextLatePaymentFee = cleanPatch.latePaymentFee ?? currentPayment.latePaymentFee ?? 0;
        const nextMode = cleanPatch.paymentMode ?? currentPayment.paymentMode ?? 'split';
        const nextPrincipal = cleanPatch.principalAmount ??
          currentPayment.principalAmount ??
          (cleanPatch.amount !== undefined ? nextAmount : currentPayment.amount);
        const nextInterest = cleanPatch.interestAmount ??
          currentPayment.interestAmount ??
          (cleanPatch.amount !== undefined ? 0 : currentPayment.amount - nextPrincipal);
        const principalLimit = roundMoney(loan.receivedAmount ?? loan.principalAmount ?? 0);
        const otherPrincipalPaid = roundMoney(
          loan.payments
            .filter((payment) => payment.id !== paymentId)
            .reduce((sum, payment) => sum + (
              payment.paymentMode === 'simple'
                ? 0
                : payment.principalAmount ?? payment.amount
            ), 0)
        );
        const totalLimit = getLoanTotal(loan);
        const otherTotalPaid = getLoanPaidAmount({
          ...loan,
          payments: loan.payments.filter((payment) => payment.id !== paymentId),
        });

        if (
          !Number.isFinite(nextAmount) || nextAmount <= 0 ||
          !Number.isFinite(nextLatePaymentFee) || nextLatePaymentFee < 0 ||
          !Number.isFinite(totalLimit) || totalLimit <= 0 ||
          !Number.isFinite(otherTotalPaid) ||
          roundMoney(nextAmount + otherTotalPaid) > totalLimit ||
          (nextMode !== 'simple' && (
            !Number.isFinite(nextPrincipal) || nextPrincipal < 0 ||
            !Number.isFinite(nextInterest) || nextInterest < 0 ||
            roundMoney(nextPrincipal + nextInterest) !== nextAmount ||
            !Number.isFinite(otherPrincipalPaid) ||
            !Number.isFinite(principalLimit) ||
            roundMoney(nextPrincipal + otherPrincipalPaid) > principalLimit
          ))
        ) {
          return;
        }

        set((state) => ({
          loans: patchParent(state.loans, loanId, (currentLoan) => ({
            ...currentLoan,
            payments: currentLoan.payments.map((payment) =>
              payment.id === paymentId
                ? {
                    ...payment,
                    ...cleanPatch,
                    amount: nextAmount,
                    latePaymentFee: nextLatePaymentFee,
                    paymentMode: nextMode,
                    ...(nextMode === 'simple'
                      ? {}
                      : { principalAmount: nextPrincipal, interestAmount: nextInterest }),
                  }
                : payment
            ),
          })),
        }));
      },

      deleteLoanPayment: (loanId, paymentId) =>
        set((state) => ({
          loans: patchParent(state.loans, loanId, (loan) => ({
            ...loan,
            payments: loan.payments.filter(
              (payment) => payment.id !== paymentId
            ),
          })),
        })),

      /* Cheques */
      addCheque: (input) => {
        const amount = roundMoney(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return '';
        }

        const timestamp = now();
        const status = input.status ?? 'pending';

        const cheque: Cheque = {
          ...input,
          amount,
          status,
          paidDate: status === 'paid' ? todayISO() : undefined,
          id: generateId('chq'),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        set((state) => ({
          cheques: [cheque, ...state.cheques],
        }));

        return cheque.id;
      },

      updateCheque: (id, patch) => {
        const cleanPatch = withRounded(definedOnly(patch), ['amount']);
        if (
          typeof cleanPatch.amount === 'number' &&
          (!Number.isFinite(cleanPatch.amount) || cleanPatch.amount <= 0)
        ) {
          return;
        }

        set((state) => ({
          cheques: patchParent(state.cheques, id, (cheque) => ({
            ...cheque,
            ...cleanPatch,
          })),
        }));
      },

      deleteCheque: (id) =>
        set((state) => ({
          cheques: state.cheques.filter((cheque) => cheque.id !== id),
        })),

      setChequeStatus: (id, status, paidDate) =>
        set((state) => ({
          cheques: patchParent(state.cheques, id, (cheque) => ({
            ...cheque,
            status,
            paidDate:
              status === 'paid' ? paidDate ?? todayISO() : undefined,
          })),
        })),

      /* Reset */
      resetFinanceData: () => set({ ...initialData }),
    }),
    {
      name: 'tomorrow:finance',
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),

      partialize: (state): FinanceData => ({
        assets: state.assets,
        debts: state.debts,
        loans: state.loans,
        cheques: state.cheques,
      }),

      migrate: (persistedState, _persistedVersion): FinanceData =>
        migrateFinanceData(persistedState),

      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateFinanceData(persistedState),
      }),

      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn(
            '[finance] Failed to restore saved finance data:',
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

export function useFinanceHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useFinanceStore.persist.hasHydrated()
  );

  useEffect(() => {
    const unsubscribe = useFinanceStore.persist.onFinishHydration(() =>
      setHydrated(true)
    );

    setHydrated(useFinanceStore.persist.hasHydrated());

    return unsubscribe;
  }, []);

  return hydrated;
}
