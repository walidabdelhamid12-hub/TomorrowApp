import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from 'zustand/vanilla';

import type { InstallmentContract } from '@/features/finance/types/installments';
import { validateInstallmentContract } from '@/features/finance/utils/installments';

export const INSTALLMENTS_STORAGE_KEY = 'tomorrow:installments';
export const INSTALLMENTS_SCHEMA_VERSION = 1;

export interface StoredInstallmentContract {
  readonly name: string;
  readonly contract: InstallmentContract;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export type InstallmentContractStorageInput = Pick<StoredInstallmentContract, 'name' | 'contract'>;
export interface InstallmentsStorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export type InstallmentsStorageErrorCode =
  | 'not_hydrated' | 'invalid_data' | 'unsupported_version' | 'invalid_input'
  | 'storage_read_failed' | 'storage_write_failed' | 'storage_verification_failed'
  | 'conflict' | 'duplicate_id' | 'not_found';
export interface InstallmentsStorageError {
  readonly code: InstallmentsStorageErrorCode;
  readonly message: string;
}
export type InstallmentsStorageResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: InstallmentsStorageError };
export interface InstallmentsStorageState {
  readonly contracts: readonly StoredInstallmentContract[];
  readonly hydration: 'idle' | 'loading' | 'ready' | 'blocked';
  readonly writeStatus: 'idle' | 'writing' | 'error';
  readonly error: InstallmentsStorageError | null;
  readonly postingAllowed: false;
  readonly readiness: 'blocked';
}

class StorageFailure extends Error {
  constructor(readonly code: InstallmentsStorageErrorCode, message: string) { super(message); }
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
}
function keys(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  object(value);
  check(Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), 'Unexpected or missing fields');
}
function timestamp(value: unknown): asserts value is string {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Invalid timestamp');
}
function validateInput(value: unknown): asserts value is InstallmentContractStorageInput {
  keys(value, ['name', 'contract']);
  check(typeof value.name === 'string' && value.name === value.name.trim() && value.name.length > 0 && value.name.length <= 120, 'Invalid contract name');
  const contract = value.contract;
  keys(contract, ['id', 'currencyCode', 'totalAmount', 'accountingOwnership', 'schedule']);
  object(contract.accountingOwnership);
  const kind = contract.accountingOwnership.kind;
  keys(contract.accountingOwnership, kind === 'linked_loan' ? ['kind', 'liabilityOwner', 'loanId'] :
    kind === 'linked_debt' ? ['kind', 'liabilityOwner', 'debtId'] : ['kind', 'liabilityOwner']);
  check(Array.isArray(contract.schedule), 'Invalid schedule');
  for (const row of contract.schedule) keys(row, ['id', 'contractId', 'kind', 'dueDate', 'amount']);
  validateInstallmentContract(contract as unknown as InstallmentContract);
}
function validateRecords(value: unknown): asserts value is StoredInstallmentContract[] {
  check(Array.isArray(value), 'Invalid contracts collection');
  const ids = new Set<string>();
  for (const record of value) {
    keys(record, ['name', 'contract', 'createdAt', 'updatedAt']);
    validateInput({ name: record.name, contract: record.contract });
    timestamp(record.createdAt);
    timestamp(record.updatedAt);
    check(record.updatedAt >= record.createdAt, 'Update precedes creation');
    const id = (record.contract as InstallmentContract).id;
    check(!ids.has(id), 'Duplicate contract ID');
    ids.add(id);
  }
}
function decode(raw: string | null): StoredInstallmentContract[] {
  if (raw === null) return [];
  try {
    const envelope: unknown = JSON.parse(raw);
    object(envelope);
    if (envelope.version !== INSTALLMENTS_SCHEMA_VERSION) throw new StorageFailure('unsupported_version', 'Unsupported installment schema version');
    keys(envelope, ['version', 'state']);
    keys(envelope.state, ['contracts']);
    validateRecords(envelope.state.contracts);
    return envelope.state.contracts;
  } catch (error) {
    if (error instanceof StorageFailure) throw error;
    throw new StorageFailure('invalid_data', error instanceof Error ? error.message : 'Invalid stored installment data');
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function ownershipKey(contract: InstallmentContract): string {
  const owner = contract.accountingOwnership;
  return JSON.stringify([owner.kind, owner.liabilityOwner, owner.kind === 'linked_loan' ? owner.loanId : owner.kind === 'linked_debt' ? owner.debtId : null]);
}
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function failure(error: unknown, fallback: InstallmentsStorageErrorCode): InstallmentsStorageResult<never> & { ok: false } {
  return { ok: false, error: freeze({ code: error instanceof StorageFailure ? error.code : fallback,
    message: error instanceof Error ? error.message : 'Installment storage operation failed' }) };
}

// One queue per backend object, shared by all factory instances in this JS runtime.
// AsyncStorage has no cross-process compare-and-swap; read-before-write also detects
// stale snapshots. This foundation does not claim a distributed transaction lock.
const queues = new WeakMap<InstallmentsStorageBackend, Promise<unknown>>();
function exclusive<T>(storage: InstallmentsStorageBackend, work: () => Promise<T>): Promise<T> {
  const operation = (queues.get(storage) ?? Promise.resolve()).then(work);
  queues.set(storage, operation.catch(() => undefined));
  return operation;
}

/**
 * Isolated, lazy foundation. No I/O at import/construction and no automatic writes.
 * Only the acknowledged, read-back-verified snapshot is exposed by Zustand.
 * Any uncertain I/O blocks mutations until explicit, read-only hydrate() succeeds.
 * No UI, payment, posting, migration, repair or adoption API is provided.
 */
export function createInstallmentsStorage(
  storage: InstallmentsStorageBackend = AsyncStorage,
  now: () => string = () => new Date().toISOString(),
) {
  const store = createStore<InstallmentsStorageState>(() => freeze({ contracts: [], hydration: 'idle', writeStatus: 'idle',
    error: null, postingAllowed: false, readiness: 'blocked' }));
  let acknowledgedRaw: string | null = null;
  let hydrationRequest: Promise<InstallmentsStorageResult<void>> | null = null;
  function publish(patch: Partial<InstallmentsStorageState>) {
    store.setState(freeze({ ...store.getState(), ...patch }), true);
  }
  async function read(): Promise<string | null> {
    try {
      const raw = await storage.getItem(INSTALLMENTS_STORAGE_KEY);
      if (raw !== null && typeof raw !== 'string') throw new Error('Storage did not return text');
      return raw;
    } catch (error) { throw new StorageFailure('storage_read_failed', error instanceof Error ? error.message : 'Storage read failed'); }
  }
  function hydrate(): Promise<InstallmentsStorageResult<void>> {
    if (hydrationRequest) return hydrationRequest;
    // Set this before queueing, so a mutation cannot slip behind a pending hydration.
    hydrationRequest = exclusive(storage, async () => {
      publish({ hydration: 'loading', error: null });
      try {
        const raw = await read();
        const contracts = decode(raw);
        acknowledgedRaw = raw;
        publish({ contracts, hydration: 'ready', writeStatus: 'idle', error: null });
        return { ok: true, value: undefined } as const;
      } catch (error) {
        const result = failure(error, 'invalid_data');
        publish({ hydration: 'blocked', error: result.error });
        return result;
      }
    }).finally(() => { hydrationRequest = null; });
    return hydrationRequest;
  }

  function write(input: InstallmentContractStorageInput, expectedUpdatedAt?: string): Promise<InstallmentsStorageResult<StoredInstallmentContract>> {
    if (hydrationRequest || store.getState().hydration !== 'ready') {
      return Promise.resolve(failure(new StorageFailure('not_hydrated', 'Successful hydration is required before writing'), 'not_hydrated'));
    }
    // Capture validated input now, not when the asynchronous queue eventually runs.
    let captured: InstallmentContractStorageInput;
    try {
      validateInput(input);
      captured = copy(input);
      validateInput(captured);
      if (expectedUpdatedAt !== undefined) timestamp(expectedUpdatedAt);
    } catch (error) { return Promise.resolve(failure(error, 'invalid_input')); }
    return exclusive(storage, async () => {
      if (store.getState().hydration !== 'ready') return failure(new StorageFailure('not_hydrated', 'Storage is blocked; hydrate before retrying'), 'not_hydrated');
      const records = store.getState().contracts;
      const previous = records.find(record => record.contract.id === captured.contract.id);
      if (expectedUpdatedAt === undefined && previous) return failure(new StorageFailure('duplicate_id', 'Contract ID already exists'), 'duplicate_id');
      if (expectedUpdatedAt !== undefined && !previous) return failure(new StorageFailure('not_found', 'Contract not found'), 'not_found');
      if (previous && expectedUpdatedAt !== previous.updatedAt) return failure(new StorageFailure('conflict', 'Contract changed since it was read'), 'conflict');
      if (previous && ownershipKey(previous.contract) !== ownershipKey(captured.contract)) {
        return failure(new StorageFailure('invalid_input', 'Accounting ownership cannot be changed'), 'invalid_input');
      }
      try {
        const raw = await read();
        if (raw !== acknowledgedRaw) throw new StorageFailure('conflict', 'Stored snapshot changed; hydrate before retrying');
        const clock = now();
        timestamp(clock);
        // A distinct monotonic update timestamp doubles as an optimistic revision.
        const updatedAt = previous && clock <= previous.updatedAt ? new Date(Date.parse(previous.updatedAt) + 1).toISOString() : clock;
        const record = { ...captured, createdAt: previous?.createdAt ?? updatedAt, updatedAt };
        const next = previous ? records.map(item => item.contract.id === captured.contract.id ? record : item) : [...records, record];
        validateRecords(next);
        const encoded = JSON.stringify({ state: { contracts: next }, version: INSTALLMENTS_SCHEMA_VERSION });
        publish({ writeStatus: 'writing', error: null });
        try { await storage.setItem(INSTALLMENTS_STORAGE_KEY, encoded); }
        catch (error) { throw new StorageFailure('storage_write_failed', error instanceof Error ? error.message : 'Storage write failed'); }
        if (await read() !== encoded) throw new StorageFailure('storage_verification_failed', 'Written snapshot could not be verified');
        acknowledgedRaw = encoded;
        publish({ contracts: next, writeStatus: 'idle', error: null });
        return { ok: true, value: record } as const;
      } catch (error) {
        const result = failure(error, 'invalid_input');
        publish({ hydration: 'blocked', writeStatus: 'error', error: result.error });
        return result;
      }
    });
  }

  function deleteContract(id: string, expectedUpdatedAt: string): Promise<InstallmentsStorageResult<void>> {
    if (hydrationRequest || store.getState().hydration !== 'ready') {
      return Promise.resolve(failure(new StorageFailure('not_hydrated', 'Successful hydration is required before deleting'), 'not_hydrated'));
    }
    if (typeof id !== 'string' || !id.trim() || typeof expectedUpdatedAt !== 'string') {
      return Promise.resolve(failure(new StorageFailure('invalid_input', 'Contract ID and revision are required'), 'invalid_input'));
    }
    try { timestamp(expectedUpdatedAt); }
    catch (error) { return Promise.resolve(failure(error, 'invalid_input')); }
    return exclusive(storage, async () => {
      if (store.getState().hydration !== 'ready') {
        return failure(new StorageFailure('not_hydrated', 'Storage is blocked; hydrate before retrying'), 'not_hydrated');
      }
      const records = store.getState().contracts;
      const previous = records.find(record => record.contract.id === id);
      if (!previous) return failure(new StorageFailure('not_found', 'Contract not found'), 'not_found');
      if (previous.contract.accountingOwnership.kind !== 'standalone') {
        return failure(new StorageFailure('invalid_input', 'Only standalone contracts may be deleted'), 'invalid_input');
      }
      if (previous.updatedAt !== expectedUpdatedAt) {
        return failure(new StorageFailure('conflict', 'Contract changed since deletion was requested'), 'conflict');
      }
      try {
        const raw = await read();
        if (raw !== acknowledgedRaw) throw new StorageFailure('conflict', 'Stored snapshot changed; hydrate before retrying');
        const next = records.filter(record => record.contract.id !== id);
        validateRecords(next);
        const encoded = JSON.stringify({ state: { contracts: next }, version: INSTALLMENTS_SCHEMA_VERSION });
        publish({ writeStatus: 'writing', error: null });
        try { await storage.setItem(INSTALLMENTS_STORAGE_KEY, encoded); }
        catch (error) { throw new StorageFailure('storage_write_failed', error instanceof Error ? error.message : 'Storage write failed'); }
        if (await read() !== encoded) throw new StorageFailure('storage_verification_failed', 'Deleted snapshot could not be verified');
        acknowledgedRaw = encoded;
        publish({ contracts: next, writeStatus: 'idle', error: null });
        return { ok: true, value: undefined } as const;
      } catch (error) {
        const result = failure(error, 'invalid_input');
        publish({ hydration: 'blocked', writeStatus: 'error', error: result.error });
        return result;
      }
    });
  }

  // Do not expose Zustand setState: callers cannot bypass validation or persistence.
  return {
    getState: store.getState,
    subscribe: (listener: (state: InstallmentsStorageState, previous: InstallmentsStorageState) => void) =>
      store.subscribe((state, previous) => { try { listener(state, previous); } catch { /* Observers cannot turn an acknowledged write into a failed save. */ } }),
    hydrate,
    createContract: (input: InstallmentContractStorageInput) => write(input),
    deleteContract,
    updateContract: (input: InstallmentContractStorageInput, expectedUpdatedAt: string) => {
      if (typeof expectedUpdatedAt !== 'string') return Promise.resolve(failure(new Error('Update revision is required'), 'invalid_input'));
      return write(input, expectedUpdatedAt);
    },
  };
}

export const installmentsStorage = createInstallmentsStorage();
