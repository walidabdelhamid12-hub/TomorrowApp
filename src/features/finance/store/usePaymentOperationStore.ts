import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  isPaymentOperationReceipt, paymentOperationRequestsMatch, readPaymentOperationJournal,
  type PaymentOperationJournalData, type PaymentOperationOutcome, type PreparedPaymentOperation,
} from '@/features/finance/types/paymentOperations';
import { createOrderedFinancePersistence } from './financePersistence';

export const PAYMENT_OPERATION_STORAGE_KEY = 'tomorrow:payment-operations';
const VERSION = 1;

/**
 * Dormant Phase 1 infrastructure: no singleton, automatic hydration or posting.
 * A completed receipt records a caller's outcome; it does not verify accounting.
 * Only create a fresh instance after inspecting an uncertain/blocked instance.
 * Integration must use one live owner for this storage key. Hydration readiness
 * does not authorize posting or reconcile prepared/reversal/review receipts.
 */
export function createPaymentOperationStore(backend: StateStorage = AsyncStorage) {
  const persistence = createOrderedFinancePersistence(backend);
  let phase: 'unhydrated' | 'hydrating' | 'ready' | 'blocked' = 'unhydrated';
  let failure: unknown;
  let hydration: Promise<void> | undefined;
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
      store.setState(validated, true);
      await flush();
    } catch (error) {
      // A subscriber can throw after the in-memory update but before persist
      // queues its write. Never acknowledge that optimistic receipt on retry.
      phase = 'blocked'; failure = error; throw error;
    }
  };
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    getStatus: () => ({ phase, error: failure }),
    hydrate: (): Promise<void> => {
      if (phase === 'blocked') return Promise.reject(failure);
      if (hydration) return hydration;
      phase = 'hydrating';
      hydration = (async () => {
        try {
          await store.persist.rehydrate();
          if (!store.persist.hasHydrated()) throw failure ?? new Error('Journal hydration failed.');
          phase = 'ready';
        } catch (error) { phase = 'blocked'; failure = error; throw error; }
      })();
      return hydration;
    },
    prepare: async (input: PreparedPaymentOperation) => {
      ready();
      const receipt = { ...input, status: 'prepared' as const };
      if (!isPaymentOperationReceipt(receipt)) throw new Error('Invalid prepared payment operation.');
      const existing = store.getState().receipts.find(r => r.operationId === input.operationId);
      if (existing) {
        if (!paymentOperationRequestsMatch(existing.request, input.request)
          || existing.paymentId !== input.paymentId || existing.ledgerTransactionId !== input.ledgerTransactionId) {
          throw new Error('Operation ID already belongs to a different immutable request or reserved outcome.');
        }
        await flush();
        return existing;
      }
      await save({ receipts: [...store.getState().receipts, receipt] });
      return store.getState().receipts.find(r => r.operationId === input.operationId)!;
    },
    complete: async (operationId: string, outcome: PaymentOperationOutcome) => {
      ready();
      const existing = store.getState().receipts.find(r => r.operationId === operationId);
      if (!existing || (existing.status !== 'prepared' && existing.status !== 'completed')) throw new Error('Operation cannot be completed.');
      const completed = { ...existing, status: 'completed' as const, outcome };
      if (!isPaymentOperationReceipt(completed)) throw new Error('Outcome does not match reserved payment identifiers.');
      if (existing.status !== 'completed') await save({ receipts: store.getState().receipts.map(r => r === existing ? completed : r) });
      else await flush();
      return store.getState().receipts.find(r => r.operationId === operationId)!;
    },
  };
}
