
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
  CurrencyCode,
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
  roundMoney,
  todayISO,
} from '@/features/finance/utils/finance';

/* -------------------------------------------------------------------------- */
/* Store contract                                                             */
/* -------------------------------------------------------------------------- */

interface FinanceActions {
  setBaseCurrency: (code: CurrencyCode) => void;

  addAsset: (input: NewAssetInput) => EntityId;
  updateAsset: (id: EntityId, patch: AssetPatch) => void;
  deleteAsset: (id: EntityId) => void;
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

  addDebt: (input: NewDebtInput) => EntityId;
  updateDebt: (id: EntityId, patch: DebtPatch) => void;
  deleteDebt: (id: EntityId) => void;
  addDebtPayment: (
    debtId: EntityId,
    input: NewDebtPaymentInput
  ) => EntityId | null;
  updateDebtPayment: (
    debtId: EntityId,
    paymentId: EntityId,
    patch: DebtPaymentPatch
  ) => void;
  deleteDebtPayment: (debtId: EntityId, paymentId: EntityId) => void;

  addLoan: (input: NewLoanInput) => EntityId;
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
  baseCurrency: 'USD',
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

  const baseCurrency =
    typeof saved.baseCurrency === 'string' &&
    saved.baseCurrency.trim().length > 0
      ? saved.baseCurrency.trim().toUpperCase()
      : initialData.baseCurrency;

  return {
    baseCurrency: baseCurrency as CurrencyCode,
    assets: normalizeRecords<Asset>(saved.assets),
    debts: normalizeRecords<Debt>(saved.debts),
    loans: normalizeRecords<Loan>(saved.loans),
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

      setBaseCurrency: (code) => set({ baseCurrency: code }),

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

      addAssetEntry: (assetId, input) => {
        if (!get().assets.some((asset) => asset.id === assetId)) {
          return null;
        }

        const entry: AssetEntry = {
          ...input,
          amount: roundMoney(input.amount),
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

      updateAssetEntry: (assetId, entryId, patch) =>
        set((state) => ({
          assets: patchParent(state.assets, assetId, (asset) => ({
            ...asset,
            entries: asset.entries.map((entry) =>
              entry.id === entryId
                ? {
                    ...entry,
                    ...withRounded(definedOnly(patch), ['amount']),
                  }
                : entry
            ),
          })),
        })),

      deleteAssetEntry: (assetId, entryId) =>
        set((state) => ({
          assets: patchParent(state.assets, assetId, (asset) => ({
            ...asset,
            entries: asset.entries.filter((entry) => entry.id !== entryId),
          })),
        })),

      /* Debts */
      addDebt: (input) => {
        const timestamp = now();

        const debt: Debt = {
          ...input,
          amount: roundMoney(input.amount),
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

      updateDebt: (id, patch) =>
        set((state) => ({
          debts: patchParent(state.debts, id, (debt) => ({
            ...debt,
            ...withRounded(definedOnly(patch), ['amount']),
          })),
        })),

      deleteDebt: (id) =>
        set((state) => ({
          debts: state.debts.filter((debt) => debt.id !== id),
        })),

      addDebtPayment: (debtId, input) => {
        if (!get().debts.some((debt) => debt.id === debtId)) {
          return null;
        }

        const payment: DebtPayment = {
          ...input,
          amount: roundMoney(input.amount),
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

      updateDebtPayment: (debtId, paymentId, patch) =>
        set((state) => ({
          debts: patchParent(state.debts, debtId, (debt) => ({
            ...debt,
            payments: debt.payments.map((payment) =>
              payment.id === paymentId
                ? {
                    ...payment,
                    ...withRounded(definedOnly(patch), ['amount']),
                  }
                : payment
            ),
          })),
        })),

      deleteDebtPayment: (debtId, paymentId) =>
        set((state) => ({
          debts: patchParent(state.debts, debtId, (debt) => ({
            ...debt,
            payments: debt.payments.filter(
              (payment) => payment.id !== paymentId
            ),
          })),
        })),

      /* Loans */
      addLoan: (input) => {
        const timestamp = now();

        const loan: Loan = {
          ...input,
          monthlyInstallment: roundMoney(input.monthlyInstallment),
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

      updateLoan: (id, patch) =>
        set((state) => ({
          loans: patchParent(state.loans, id, (loan) => ({
            ...loan,
            ...withRounded(definedOnly(patch), ['monthlyInstallment']),
          })),
        })),

      deleteLoan: (id) =>
        set((state) => ({
          loans: state.loans.filter((loan) => loan.id !== id),
        })),

      addLoanPayment: (loanId, input) => {
        if (!get().loans.some((loan) => loan.id === loanId)) {
          return null;
        }

        const payment: LoanPayment = {
          ...input,
          amount: roundMoney(input.amount),
          id: generateId('lpy'),
        };

        set((state) => ({
          loans: patchParent(state.loans, loanId, (loan) => ({
            ...loan,
            payments: [...loan.payments, payment],
          })),
        }));

        return payment.id;
      },

      updateLoanPayment: (loanId, paymentId, patch) =>
        set((state) => ({
          loans: patchParent(state.loans, loanId, (loan) => ({
            ...loan,
            payments: loan.payments.map((payment) =>
              payment.id === paymentId
                ? {
                    ...payment,
                    ...withRounded(definedOnly(patch), ['amount']),
                  }
                : payment
            ),
          })),
        })),

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
        const timestamp = now();
        const status = input.status ?? 'pending';

        const cheque: Cheque = {
          ...input,
          amount: roundMoney(input.amount),
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

      updateCheque: (id, patch) =>
        set((state) => ({
          cheques: patchParent(state.cheques, id, (cheque) => ({
            ...cheque,
            ...withRounded(definedOnly(patch), ['amount']),
          })),
        })),

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
        baseCurrency: state.baseCurrency,
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
