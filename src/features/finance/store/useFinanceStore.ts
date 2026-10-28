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

  // Assets
  addAsset: (input: NewAssetInput) => EntityId;
  updateAsset: (id: EntityId, patch: AssetPatch) => void;
  deleteAsset: (id: EntityId) => void;
  addAssetEntry: (assetId: EntityId, input: NewAssetEntryInput) => EntityId | null;
  updateAssetEntry: (assetId: EntityId, entryId: EntityId, patch: AssetEntryPatch) => void;
  deleteAssetEntry: (assetId: EntityId, entryId: EntityId) => void;

  // Debts (receivable / payable)
  addDebt: (input: NewDebtInput) => EntityId;
  updateDebt: (id: EntityId, patch: DebtPatch) => void;
  deleteDebt: (id: EntityId) => void;
  addDebtPayment: (debtId: EntityId, input: NewDebtPaymentInput) => EntityId | null;
  updateDebtPayment: (debtId: EntityId, paymentId: EntityId, patch: DebtPaymentPatch) => void;
  deleteDebtPayment: (debtId: EntityId, paymentId: EntityId) => void;

  // Loans
  addLoan: (input: NewLoanInput) => EntityId;
  updateLoan: (id: EntityId, patch: LoanPatch) => void;
  deleteLoan: (id: EntityId) => void;
  addLoanPayment: (loanId: EntityId, input: NewLoanPaymentInput) => EntityId | null;
  updateLoanPayment: (loanId: EntityId, paymentId: EntityId, patch: LoanPaymentPatch) => void;
  deleteLoanPayment: (loanId: EntityId, paymentId: EntityId) => void;

  // Cheques
  addCheque: (input: NewChequeInput) => EntityId;
  updateCheque: (id: EntityId, patch: ChequePatch) => void;
  deleteCheque: (id: EntityId) => void;
  /** Sets the status; paidDate is set (or defaulted to today) only for 'paid'. */
  setChequeStatus: (id: EntityId, status: ChequeStatus, paidDate?: ISODate) => void;

  /** Wipes all finance data (keeps nothing). */
  resetFinanceData: () => void;
}

export type FinanceStore = FinanceData & FinanceActions;

const initialData: FinanceData = {
  baseCurrency: 'OMR',
  assets: [],
  debts: [],
  loans: [],
  cheques: [],
};

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

const now = (): string => new Date().toISOString();

/** Applies `fn` to the item with `id` and bumps its updatedAt. */
function patchParent<T extends { id: EntityId; updatedAt: string }>(
  list: T[],
  id: EntityId,
  fn: (item: T) => T
): T[] {
  return list.map((item) =>
    item.id === id ? { ...fn(item), updatedAt: now() } : item
  );
}

/** Rounds the money fields that are present in a partial object. */
function withRounded<T extends object>(obj: T, fields: (keyof T)[]): T {
  const next = { ...obj };
  fields.forEach((field) => {
    const value = next[field];
    if (typeof value === 'number') {
      (next as Record<keyof T, unknown>)[field] = roundMoney(value);
    }
  });
  return next;
}

/** Category-aware patch: ignores fields that don't apply to the asset type. */
function applyAssetPatch(asset: Asset, patch: AssetPatch): Asset {
  const next: Asset = { ...asset };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.notes !== undefined) next.notes = patch.notes;

  if (next.category === 'gold') {
    if (patch.karat !== undefined) next.karat = patch.karat;
  } else if (patch.currencyCode !== undefined) {
    next.currencyCode = patch.currencyCode;
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

      /* ------------------------------- Assets ------------------------------ */

      addAsset: (input) => {
        const timestamp = now();
        const asset = {
          ...input,
          id: generateId('ast'),
          entries: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        } as Asset;
        set((s) => ({ assets: [asset, ...s.assets] }));
        return asset.id;
      },

      updateAsset: (id, patch) =>
        set((s) => ({
          assets: patchParent(s.assets, id, (a) => applyAssetPatch(a, patch)),
        })),

      deleteAsset: (id) =>
        set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

      addAssetEntry: (assetId, input) => {
        if (!get().assets.some((a) => a.id === assetId)) return null;
        const entry: AssetEntry = {
          ...input,
          amount: roundMoney(input.amount),
          id: generateId('ent'),
          createdAt: now(),
        };
        set((s) => ({
          assets: patchParent(s.assets, assetId, (a) => ({
            ...a,
            entries: [...a.entries, entry],
          })),
        }));
        return entry.id;
      },

      updateAssetEntry: (assetId, entryId, patch) =>
        set((s) => ({
          assets: patchParent(s.assets, assetId, (a) => ({
            ...a,
            entries: a.entries.map((e) =>
              e.id === entryId
                ? { ...e, ...withRounded(definedOnly(patch), ['amount']) }
                : e
            ),
          })),
        })),

      deleteAssetEntry: (assetId, entryId) =>
        set((s) => ({
          assets: patchParent(s.assets, assetId, (a) => ({
            ...a,
            entries: a.entries.filter((e) => e.id !== entryId),
          })),
        })),

      /* -------------------------------- Debts ------------------------------ */

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
        set((s) => ({ debts: [debt, ...s.debts] }));
        return debt.id;
      },

      updateDebt: (id, patch) =>
        set((s) => ({
          debts: patchParent(s.debts, id, (d) => ({
            ...d,
            ...withRounded(definedOnly(patch), ['amount']),
          })),
        })),

      deleteDebt: (id) =>
        set((s) => ({ debts: s.debts.filter((d) => d.id !== id) })),

      addDebtPayment: (debtId, input) => {
        if (!get().debts.some((d) => d.id === debtId)) return null;
        const payment: DebtPayment = {
          ...input,
          amount: roundMoney(input.amount),
          id: generateId('dpy'),
        };
        set((s) => ({
          debts: patchParent(s.debts, debtId, (d) => ({
            ...d,
            payments: [...d.payments, payment],
          })),
        }));
        return payment.id;
      },

      updateDebtPayment: (debtId, paymentId, patch) =>
        set((s) => ({
          debts: patchParent(s.debts, debtId, (d) => ({
            ...d,
            payments: d.payments.map((p) =>
              p.id === paymentId
                ? { ...p, ...withRounded(definedOnly(patch), ['amount']) }
                : p
            ),
          })),
        })),

      deleteDebtPayment: (debtId, paymentId) =>
        set((s) => ({
          debts: patchParent(s.debts, debtId, (d) => ({
            ...d,
            payments: d.payments.filter((p) => p.id !== paymentId),
          })),
        })),

      /* -------------------------------- Loans ------------------------------ */

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
        set((s) => ({ loans: [loan, ...s.loans] }));
        return loan.id;
      },

      updateLoan: (id, patch) =>
        set((s) => ({
          loans: patchParent(s.loans, id, (l) => ({
            ...l,
            ...withRounded(definedOnly(patch), ['monthlyInstallment']),
          })),
        })),

      deleteLoan: (id) =>
        set((s) => ({ loans: s.loans.filter((l) => l.id !== id) })),

      addLoanPayment: (loanId, input) => {
        if (!get().loans.some((l) => l.id === loanId)) return null;
        const payment: LoanPayment = {
          ...input,
          amount: roundMoney(input.amount),
          id: generateId('lpy'),
        };
        set((s) => ({
          loans: patchParent(s.loans, loanId, (l) => ({
            ...l,
            payments: [...l.payments, payment],
          })),
        }));
        return payment.id;
      },

      updateLoanPayment: (loanId, paymentId, patch) =>
        set((s) => ({
          loans: patchParent(s.loans, loanId, (l) => ({
            ...l,
            payments: l.payments.map((p) =>
              p.id === paymentId
                ? { ...p, ...withRounded(definedOnly(patch), ['amount']) }
                : p
            ),
          })),
        })),

      deleteLoanPayment: (loanId, paymentId) =>
        set((s) => ({
          loans: patchParent(s.loans, loanId, (l) => ({
            ...l,
            payments: l.payments.filter((p) => p.id !== paymentId),
          })),
        })),

      /* ------------------------------- Cheques ----------------------------- */

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
        set((s) => ({ cheques: [cheque, ...s.cheques] }));
        return cheque.id;
      },

      updateCheque: (id, patch) =>
        set((s) => ({
          cheques: patchParent(s.cheques, id, (c) => ({
            ...c,
            ...withRounded(definedOnly(patch), ['amount']),
          })),
        })),

      deleteCheque: (id) =>
        set((s) => ({ cheques: s.cheques.filter((c) => c.id !== id) })),

      setChequeStatus: (id, status, paidDate) =>
        set((s) => ({
          cheques: patchParent(s.cheques, id, (c) => ({
            ...c,
            status,
            paidDate: status === 'paid' ? (paidDate ?? todayISO()) : undefined,
          })),
        })),

      /* -------------------------------- Reset ------------------------------ */

      resetFinanceData: () => set({ ...initialData }),
    }),
    {
      name: 'tomorrow:finance',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist data only, never the action functions.
      partialize: (state): FinanceData => ({
        baseCurrency: state.baseCurrency,
        assets: state.assets,
        debts: state.debts,
        loans: state.loans,
        cheques: state.cheques,
      }),
      // Bump `version` and handle old shapes here when the schema changes.
      migrate: (persistedState) => persistedState as FinanceData,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[finance] failed to restore saved data', error);
      },
    }
  )
);

/* -------------------------------------------------------------------------- */
/* Hydration hook                                                             */
/* -------------------------------------------------------------------------- */

/**
 * AsyncStorage is async, so the store starts empty and fills in a moment later.
 * Use this to show a loader (or avoid an empty-state flash) until data is ready.
 */
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