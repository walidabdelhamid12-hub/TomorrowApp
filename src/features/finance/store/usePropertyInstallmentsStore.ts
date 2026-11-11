import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { EntityId } from '@/features/finance/types/finance';
import type { PropertyContract, PropertyInstallment, PropertyInstallmentPayment, RegularInstallmentPlan } from '@/features/finance/types/propertyInstallments';
import { generateRegularInstallments, getPropertyInstallmentBalance } from '@/features/finance/types/propertyInstallments';
import { generateId, roundMoney } from '@/features/finance/utils/finance';

type NewContract = Omit<PropertyContract, 'id'>;
type NewInstallment = Omit<PropertyInstallment, 'id'>;
type PropertyData = {
  contracts: PropertyContract[];
  installments: PropertyInstallment[];
  payments: PropertyInstallmentPayment[];
};
interface PropertyActions {
  addContract: (input: NewContract) => EntityId | null;
  updateContract: (id: EntityId, patch: Partial<NewContract>) => boolean;
  deleteContract: (id: EntityId) => boolean;
  addInstallment: (input: NewInstallment) => EntityId | null;
  replaceDraftSchedule: (plan: RegularInstallmentPlan) => boolean;
  updateInstallment: (id: EntityId, patch: Partial<Pick<PropertyInstallment, 'kind' | 'dueDate' | 'amount' | 'note'>>) => boolean;
  deleteInstallment: (id: EntityId) => boolean;
}
export type PropertyInstallmentsStore = PropertyData & PropertyActions;
const empty: PropertyData = { contracts: [], installments: [], payments: [] };
const kinds = new Set(['down_payment', 'regular', 'handover', 'maintenance', 'other']);
const money = (n: number) => Number.isFinite(n) && n > 0 && roundMoney(n) === n && Number.isSafeInteger(Math.round(n * 1000));
const date = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  return value.getUTCFullYear() === y && value.getUTCMonth() + 1 === m && value.getUTCDate() === d;
};
const nonempty = (s: string) => typeof s === 'string' && s.trim().length > 0;
const unique = (list: { id: string }[], id: string) => list.filter(x => x.id === id).length === 1;
const validContract = (c: NewContract) =>
  nonempty(c.developerName) && nonempty(c.projectName) && nonempty(c.unitReference) &&
  nonempty(c.currencyCode) && money(c.contractPrice) && date(c.contractDate);
const validInstallment = (i: NewInstallment) =>
  nonempty(i.contractId) && kinds.has(i.kind) && date(i.dueDate) && money(i.amount);
const contractScheduled = (rows: PropertyInstallment[], id: string) =>
  rows.filter(x => x.contractId === id).reduce((sum, x) => sum + Math.round(x.amount * 1000), 0);
const hasRoom = (rows: PropertyInstallment[], c: PropertyContract) =>
  contractScheduled(rows, c.id) <= Math.round(c.contractPrice * 1000);

function readData(saved: unknown): PropertyData {
  if (!saved || typeof saved !== 'object') return { ...empty };
  const obj = saved as Partial<PropertyData>;
  // Invalid stored data is never silently upgraded into valid payment evidence.
  return {
    contracts: Array.isArray(obj.contracts) ? obj.contracts : [],
    installments: Array.isArray(obj.installments) ? obj.installments : [],
    payments: Array.isArray(obj.payments) ? obj.payments : [],
  };
}

/**
 * Draft-only store: payments deliberately have no mutation API until a
 * transaction-safe ledger operation is implemented and verified.
 */
export const usePropertyInstallmentsStore = create<PropertyInstallmentsStore>()(
  persist((set, get) => ({
    ...empty,
    addContract: input => {
      if (!validContract(input)) return null;
      const id = generateId('property');
      set(s => ({ contracts: [...s.contracts, { ...input, id }] }));
      return id;
    },
    updateContract: (id, patch) => {
      const s = get();
      if (!unique(s.contracts, id)) return false;
      const original = s.contracts.find(c => c.id === id)!;
      // Once a schedule exists, currency and identity of the contract remain fixed.
      if (s.installments.some(i => i.contractId === id) &&
          (patch.currencyCode !== undefined && patch.currencyCode !== original.currencyCode)) return false;
      const updated = { ...original, ...patch, id };
      if (!validContract(updated) || !hasRoom(s.installments, updated)) return false;
      set(state => ({ contracts: state.contracts.map(c => c.id === id ? updated : c) }));
      return true;
    },
    deleteContract: id => {
      const s = get();
      if (!unique(s.contracts, id) || s.installments.some(i => i.contractId === id) ||
          s.payments.some(p => p.contractId === id)) return false;
      set(state => ({ contracts: state.contracts.filter(c => c.id !== id) }));
      return true;
    },
    addInstallment: input => {
      const s = get();
      const c = s.contracts.find(c => c.id === input.contractId);
      if (!c || !unique(s.contracts, c.id) || !validInstallment(input)) return null;
      const id = generateId('property_due');
      const next = [...s.installments, { ...input, id }];
      if (!hasRoom(next, c)) return null;
      set({ installments: next });
      return id;
    },
    replaceDraftSchedule: plan => {
      const s = get();
      const c = s.contracts.find(c => c.id === plan.contractId);
      if (!c || !unique(s.contracts, c.id) || s.payments.some(p => p.contractId === c.id)) return false;
      let draft: PropertyInstallment[];
      try { draft = generateRegularInstallments(plan); } catch { return false; }
      const other = s.installments.filter(i => i.contractId !== c.id);
      const next = [...other, ...draft.map(i => ({ ...i, id: generateId('property_due') }))];
      if (!hasRoom(next, c)) return false;
      set({ installments: next });
      return true;
    },
    updateInstallment: (id, patch) => {
      const s = get();
      if (!unique(s.installments, id) || s.payments.some(p => p.installmentId === id)) return false;
      const current = s.installments.find(i => i.id === id)!;
      const c = s.contracts.find(c => c.id === current.contractId);
      if (!c || !unique(s.contracts, c.id)) return false;
      const nextItem = { ...current, ...patch, id, contractId: current.contractId };
      if (!validInstallment(nextItem)) return false;
      const next = s.installments.map(i => i.id === id ? nextItem : i);
      if (!hasRoom(next, c)) return false;
      set({ installments: next });
      return true;
    },
    deleteInstallment: id => {
      const s = get();
      if (!unique(s.installments, id) || s.payments.some(p => p.installmentId === id)) return false;
      set({ installments: s.installments.filter(i => i.id !== id) });
      return true;
    },
  }), {
    name: 'tomorrow:property-installments',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    partialize: state => ({ contracts: state.contracts, installments: state.installments, payments: state.payments }),
    merge: (saved, current) => ({ ...current, ...readData(saved) }),
  }),
);
