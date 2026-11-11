import type { StateStorage } from 'zustand/middleware';

export class FinancePersistenceError extends Error {
  constructor(
    readonly key: string,
    readonly operation: 'read' | 'write' | 'remove' | 'mutation',
    readonly originalError: unknown,
  ) {
    super(`Finance persistence ${operation} failed for ${key}. Reload and inspect saved state before retrying.`);
    this.name = 'FinancePersistenceError';
  }

  // A rejected write may have reached storage before acknowledgement failed.
  get uncertain(): boolean { return this.operation !== 'read'; }
}

/**
 * Opt-in adapter for createJSONStorage. No existing store uses this in Phase 1.
 * Each key is ordered independently; callers must await barriers to order keys.
 * A barrier covers writes queued at its invocation, not later writes. Success
 * acknowledges the storage API only, not power-loss durability or atomicity.
 */
export function createOrderedFinancePersistence(backend: StateStorage) {
  type Queue = { tail: Promise<void>; failure?: FinancePersistenceError };
  const queues = new Map<string, Queue>();
  const queueFor = (key: string): Queue => {
    let queue = queues.get(key);
    if (!queue) {
      queue = { tail: Promise.resolve() };
      queues.set(key, queue);
    }
    return queue;
  };
  const recordFailure = (key: string, operation: FinancePersistenceError['operation'], error: unknown) => {
    const queue = queueFor(key);
    queue.failure ??= new FinancePersistenceError(key, operation, error);
    return queue.failure;
  };
  const enqueue = (key: string, operation: 'write' | 'remove', write: () => unknown): Promise<void> => {
    const queue = queueFor(key);
    const result = queue.tail.then(async () => {
      if (queue.failure) throw queue.failure;
      try { await write(); }
      catch (error) {
        queue.failure ??= new FinancePersistenceError(key, operation, error);
        throw queue.failure;
      }
    });
    queue.tail = result;
    // Zustand actions often ignore the middleware's returned promise. Retain
    // rejection for awaiters/barriers without an unhandled rejection event.
    void result.catch(() => {});
    return result;
  };
  const flush = (key: string): Promise<void> => {
    const queue = queueFor(key);
    return queue.failure ? Promise.reject(queue.failure) : queue.tail;
  };
  // Wrap synchronous Zustand mutations as well as storage. Subscribers,
  // partialize and JSON.stringify can throw before setItem reaches this adapter.
  const runMutation = <T>(key: string, change: () => T): T => {
    const queue = queueFor(key);
    if (queue.failure) throw queue.failure;
    try { return change(); }
    catch (error) {
      queue.failure ??= new FinancePersistenceError(key, 'mutation', error);
      throw queue.failure;
    }
  };
  const storage: StateStorage<Promise<void>> = {
    getItem: async key => {
      const queue = queueFor(key);
      await flush(key);
      try { return await backend.getItem(key); }
      catch (error) {
        queue.failure ??= new FinancePersistenceError(key, 'read', error);
        throw queue.failure;
      }
    },
    setItem: (key, value) => enqueue(key, 'write', () => backend.setItem(key, value)),
    removeItem: key => enqueue(key, 'remove', () => backend.removeItem(key)),
  };
  // Forensic draining must wait for issued I/O even when flush rejects a sticky failure.
  const settle = (key: string): Promise<void> => queueFor(key).tail.then(() => {}, () => {});
  return { storage, flush, settle, runMutation, recordFailure, assertMutationAllowed: () => {}, getFailure: (key: string) => queues.get(key)?.failure };
}
