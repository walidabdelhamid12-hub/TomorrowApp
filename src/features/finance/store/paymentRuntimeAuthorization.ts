import type { EntityRef, RevisionHead } from '../types/paymentRecovery';

/** Internal infrastructure contracts. No production caller or posting permission. */
export type CoordinatorStage = 'journal-prepare' | 'finance-insert' | 'ledger-insert'
  | 'finance-finalize' | 'ledger-head' | 'journal-complete';
export type CoordinatorKey = 'tomorrow:finance' | 'tomorrow:ledger' | 'tomorrow:payment-operations';
export interface StageBinding {
  readonly operationId: string;
  readonly entity: EntityRef;
  readonly key: CoordinatorKey;
  readonly stage: CoordinatorStage;
  readonly predecessor: RevisionHead | null;
}
declare const capabilityBrand: unique symbol;
export type CoordinatorCapability = Readonly<{ [capabilityBrand]: true }>;
export interface CoordinatorWriteLease {
  readonly operationId: string;
  issue(binding: StageBinding): CoordinatorCapability;
  /** Plain persisted data only; no callbacks, actions, or raw storage access. */
  write(capability: CoordinatorCapability, binding: StageBinding, data: unknown): Promise<void>;
  fence(reason: string): void;
}
export class CoordinatorLeaseInterrupted extends Error {
  constructor(readonly outcome: 'rejected' | 'uncertain') {
    super(`Coordinator lease interrupted (${outcome}).`);
  }
}

/** Reject executable serialization hooks before touching state or calling JSON.stringify. */
export function copyCoordinatorData(value: unknown): unknown {
  const seen = new Set<object>();
  const copy = (v: unknown, arrayItem = false): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v === undefined && !arrayItem) return undefined;
    if (!v || typeof v !== 'object' || seen.has(v)) throw new Error('Coordinator data must be plain, finite JSON data.');
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) throw new Error('Unsupported coordinator data prototype.');
    seen.add(v);
    const entries: [string, unknown][] = [];
    for (const key of Reflect.ownKeys(v)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor) || key === 'toJSON') throw new Error('Executable/unsupported coordinator data property.');
      if (array && !/^(0|[1-9]\d*)$/.test(key)) throw new Error('Unsupported array property.');
      entries.push([key, copy(descriptor.value, array)]);
    }
    let result: unknown;
    if (array) {
      if (entries.length !== v.length) throw new Error('Sparse coordinator arrays are unsupported.');
      const items = new Array(v.length);
      for (const [key, item] of entries) {
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index >= v.length) throw new Error('Unsupported array index.');
        items[index] = item;
      }
      result = items;
    } else result = Object.fromEntries(entries);
    seen.delete(v); return result;
  };
  return copy(value);
}
