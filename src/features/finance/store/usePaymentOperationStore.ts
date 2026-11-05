import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  isPaymentOperationReceipt, paymentOperationRequestsMatch, readPaymentOperationJournal,
  type PaymentOperationJournalData, type PaymentOperationOutcome, type PaymentOperationReceipt, type PreparedPaymentOperation,
} from '@/features/finance/types/paymentOperations';
import { createOrderedFinancePersistence } from './financePersistence';

export const PAYMENT_OPERATION_STORAGE_KEY = 'tomorrow:payment-operations';
const VERSION = 1;
type JournalPhase = 'unhydrated' | 'hydrating' | 'ready' | 'blocked' | 'closed';
interface PaymentOperationStore {
  getState: () => PaymentOperationJournalData;
  subscribe: (listener: (state: PaymentOperationJournalData, previous: PaymentOperationJournalData) => void) => () => void;
  getStatus: () => { phase: JournalPhase; error: unknown };
  hydrate: () => Promise<void>;
  close: () => Promise<void>;
  prepare: (input: PreparedPaymentOperation) => Promise<PaymentOperationReceipt>;
  complete: (operationId: string, outcome: PaymentOperationOutcome) => Promise<PaymentOperationReceipt>;
}
const owners = new WeakMap<object, PaymentOperationStore>();

/**
 * Dormant Phase 1 infrastructure: no automatic creation, hydration or posting.
 * A completed receipt records a caller's outcome; it does not verify accounting.
 * One live owner per backend/namespace identity. Wrappers of the same backend
 * must share ownerIdentity. Await close() before fresh-instance recovery.
 * Hydration readiness
 * does not authorize posting or reconcile prepared/reversal/review receipts.
 */
export function createPaymentOperationStore(backend: StateStorage = AsyncStorage, ownerIdentity: object = backend): PaymentOperationStore {
  const owner = owners.get(ownerIdentity);
  if (owner) return owner;
  const persistence = createOrderedFinancePersistence(backend);
  let phase: JournalPhase = 'unhydrated';
  let failure: unknown;
  let hydration: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let closed = false;
  let transitionTail = Promise.resolve();
  const pending = new Map<string, { receipt: PaymentOperationReceipt; result: Promise<PaymentOperationReceipt> }>();
  const storage = createJSONStorage<PaymentOperationJournalData>(() => ({
    ...persistence.storage,
    getItem: async key => {
      const raw = await persistence.storage.getItem(key);
      if (raw === null) return null; // New installation only; JSON null is invalid.
      const envelope: unknown = JSON.parse(raw);
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
        || Object.keys(envelope).some(key => key !== 'state' && key !== 'version')
        || !('version' in envelope) || envelope.version !== VERSION || !('state' in envelope)) {
        throw new Error('Invalid or unsupported payment operation journal envelope.');
      }
      readPaymentOperationJournal(envelope.state);
      return raw;
    },
    // Tombstones must not be erased via persist.clearStorage().
    removeItem: async () => { throw new Error('Payment operation journal deletion is not supported.'); },
  }));
  const store = createStore<PaymentOperationJournalData>()(persist(() => readPaymentOperationJournal({ receipts: [] }), {
    name: PAYMENT_OPERATION_STORAGE_KEY, version: VERSION, storage, skipHydration: true,
    merge: (saved, current) => saved === undefined ? current : readPaymentOperationJournal(saved),
    onRehydrateStorage: () => (_state, error) => {
      if (error !== undefined) { phase = 'blocked'; failure = error; }
    },
  }));
  const ready = () => {
    if (closed) throw new Error('Payment operation journal is closed.');
    const storageError = persistence.getFailure(PAYMENT_OPERATION_STORAGE_KEY);
    if (storageError) { phase = 'blocked'; failure = storageError; }
    if (phase !== 'ready') throw failure ?? new Error('Payment operation journal is not hydrated.');
  };
  const flush = async () => {
    try { await persistence.flush(PAYMENT_OPERATION_STORAGE_KEY); }
    catch (error) { phase = 'blocked'; failure = error; throw error; }
  };
  const save = async (data: PaymentOperationJournalData) => {
    const validated = readPaymentOperationJournal(data);
    try {
      persistence.runMutation(PAYMENT_OPERATION_STORAGE_KEY, () => store.setState(validated, true));
      await flush();
    } catch (error) {
      // A subscriber can throw after the in-memory update but before persist
      // queues its write. Never acknowledge that optimistic receipt on retry.
      phase = 'blocked'; failure = error; throw error;
    }
  };
  const matching = (a: PaymentOperationReceipt, b: PaymentOperationReceipt) =>
    paymentOperationRequestsMatch(a.request, b.request) && a.paymentId === b.paymentId
    && a.ledgerTransactionId === b.ledgerTransactionId;
  const transition = (kind: 'prepare' | 'complete', receipt: PaymentOperationReceipt,
    change: () => Promise<PaymentOperationReceipt>): Promise<PaymentOperationReceipt> => {
    const key = kind + ':' + receipt.operationId;
    const active = pending.get(key);
    if (active) {
      if (!matching(active.receipt, receipt)) return Promise.reject(new Error('Operation ID already belongs to a different immutable request or reserved outcome.'));
      return active.result;
    }
    // Register before change can notify any synchronous subscriber. Serialize
    // journal transitions so receipts returned to callers are acknowledged
    // snapshots, never a later optimistic state from getState().
    const result = transitionTail.then(() => { ready(); return change(); });
    pending.set(key, { receipt, result });
    transitionTail = result.then(() => {}, () => {});
    const remove = () => { if (pending.get(key)?.result === result) pending.delete(key); };
    void result.then(remove, remove);
    return result;
  };
  const api: PaymentOperationStore = {
    getState: store.getState,
    subscribe: store.subscribe,
    getStatus: () => ({ phase: closed ? 'closed' : phase, error: failure }),
    hydrate: (): Promise<void> => {
      if (closed) return Promise.reject(new Error('Payment operation journal is closed.'));
      if (phase === 'blocked') return Promise.reject(failure);
      if (hydration) return hydration;
      phase = 'hydrating';
      hydration = (async () => {
        try {
          await store.persist.rehydrate();
          if (closed) throw new Error('Payment operation journal is closed.');
          if (!store.persist.hasHydrated()) throw failure ?? new Error('Journal hydration failed.');
          phase = 'ready';
        } catch (error) { phase = 'blocked'; failure = error; throw error; }
      })();
      return hydration;
    },
    close: () => {
      if (closing) return closing;
      closed = true; // Reject new work while accepted writes drain.
      closing = (async () => {
        await Promise.allSettled([hydration, transitionTail]);
        await persistence.flush(PAYMENT_OPERATION_STORAGE_KEY).catch(() => {});
        if (owners.get(ownerIdentity) === api) owners.delete(ownerIdentity);
      })();
      return closing;
    },
    prepare: (input: PreparedPaymentOperation) => {
      try {
        ready();
        const candidate = { ...input, status: 'prepared' as const };
        if (!isPaymentOperationReceipt(candidate)) throw new Error('Invalid prepared payment operation.');
        const receipt = readPaymentOperationJournal({ receipts: [candidate] }).receipts[0];
        return transition('prepare', receipt, async () => {
          const existing = store.getState().receipts.find(r => r.operationId === receipt.operationId);
          if (existing) {
            if (!matching(existing, receipt)) throw new Error('Operation ID already belongs to a different immutable request or reserved outcome.');
            await flush();
            return existing;
          }
          await save({ receipts: [...store.getState().receipts, receipt] });
          return receipt;
        });
      } catch (error) { return Promise.reject(error); }
    },
    complete: (operationId: string, outcome: PaymentOperationOutcome) => {
      try {
        ready();
        const original = store.getState().receipts.find(r => r.operationId === operationId)
          ?? pending.get('prepare:' + operationId)?.receipt;
        if (!original || (original.status !== 'prepared' && original.status !== 'completed')) throw new Error('Operation cannot be completed.');
        const candidate = { ...original, status: 'completed' as const, outcome };
        if (!isPaymentOperationReceipt(candidate)) throw new Error('Outcome does not match reserved payment identifiers.');
        const completed = readPaymentOperationJournal({ receipts: [candidate] }).receipts[0];
        return transition('complete', completed, async () => {
          const existing = store.getState().receipts.find(r => r.operationId === operationId);
          if (!existing || (existing.status !== 'prepared' && existing.status !== 'completed')) throw new Error('Operation cannot be completed.');
          if (existing.status !== 'completed') await save({ receipts: store.getState().receipts.map(r => r === existing ? completed : r) });
          else await flush();
          return completed;
        });
      } catch (error) { return Promise.reject(error); }
    },
  };
  owners.set(ownerIdentity, api);
  return api;
}
