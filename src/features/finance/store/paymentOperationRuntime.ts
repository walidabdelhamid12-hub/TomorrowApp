import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateCreator } from 'zustand/vanilla';
import { persist, createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware';
import { createOrderedFinancePersistence } from './financePersistence';
import { createPaymentOperationStore, PAYMENT_OPERATION_STORAGE_KEY } from './usePaymentOperationStore';
import { freezeEvidence } from '../types/paymentRecovery';

export const PAYMENT_PERSISTENCE_KEYS = Object.freeze([
  'tomorrow:finance', 'tomorrow:ledger', PAYMENT_OPERATION_STORAGE_KEY,
] as const);
export type PaymentPersistenceKey = typeof PAYMENT_PERSISTENCE_KEYS[number];
type AccountingKey = Exclude<PaymentPersistenceKey, typeof PAYMENT_OPERATION_STORAGE_KEY>;
type Tracked = ReturnType<typeof createOrderedFinancePersistence>;
const instances = new WeakMap<object, PaymentOperationRuntime>();
const legacyBindings = new Set<string>();
let installed: PaymentOperationRuntime | undefined;

/** Dormant until explicitly constructed; owns no accounting-store imports. */
export class PaymentOperationRuntime {
  readonly persistence: Tracked;
  readonly journal: ReturnType<typeof createPaymentOperationStore>;
  private readonly closeJournal: () => Promise<void>;
  private phase: 'open' | 'closing' | 'closed' = 'open';
  private bindings = new Set<AccountingKey>();
  private gateTail = Promise.resolve();
  private closing?: Promise<void>;
  private hydrations = new Map<AccountingKey, { promise: Promise<void>; finish: () => void }>();
  private acknowledgements = new Map<string, Promise<void>>();
  private snapshotReading = false;
  private hydrationAdmissionClosed = false;
  private interference = 0;

  assertMutationAllowed(): void {
    if (this.snapshotReading) { this.interference++; throw new Error('Recovery snapshot excludes mutations.'); }
    if (this.phase !== 'open') throw new Error('Payment persistence runtime is closed or closing.');
  }

  assertHydrationAllowed(): void {
    if (this.hydrationAdmissionClosed) { this.interference++; throw new Error('Recovery snapshot excludes hydration.'); }
    this.assertMutationAllowed();
  }

  constructor(readonly backend: StateStorage) {
    const tracked = createOrderedFinancePersistence(backend);
    const depths = new Map<string, number>();
    const knownKey = (key: string) => {
      if (!PAYMENT_PERSISTENCE_KEYS.includes(key as PaymentPersistenceKey)) throw new Error('Unsupported payment persistence key.');
    };
    const open = (key: string) => {
      knownKey(key);
      if (this.phase !== 'open') throw new Error('Payment persistence runtime is closed or closing.');
    };
    this.persistence = {
      ...tracked,
      assertMutationAllowed: () => this.assertMutationAllowed(),
      flush: key => {
        try {
          knownKey(key);
          const mutation = this.acknowledgements.get(key);
          const queuedPrefix = tracked.flush(key);
          // Capture both now: the mutation can still be notifying subscribers,
          // while the adapter may already contain additional same-key writes.
          // Never re-read the queue after awaiting and include later deliveries.
          return mutation ? Promise.all([mutation, queuedPrefix]).then(() => {}) : queuedPrefix;
        }
        catch (error) { return Promise.reject(error); }
      },
      storage: {
        getItem: async key => { open(key); await this.persistence.flush(key); return tracked.storage.getItem(key); },
        setItem: (key, value) => { this.assertMutationAllowed(); open(key); return tracked.storage.setItem(key, value); },
        removeItem: key => { this.assertMutationAllowed(); open(key); return tracked.storage.removeItem(key); },
      },
      runMutation: (key, change) => {
        this.assertMutationAllowed();
        open(key);
        const depth = depths.get(key) ?? 0;
        let resolve: (() => void) | undefined, reject: ((error: unknown) => void) | undefined;
        let acknowledgement: Promise<void> | undefined;
        if (!depth) {
          acknowledgement = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
          this.acknowledgements.set(key, acknowledgement);
          const remove = () => { if (this.acknowledgements.get(key) === acknowledgement) this.acknowledgements.delete(key); };
          void acknowledgement.then(remove, remove);
        }
        depths.set(key, depth + 1);
        let failure: unknown;
        try { return tracked.runMutation(key, change); }
        catch (error) { failure = error; throw error; }
        finally {
          depths.set(key, depth);
          if (!depth) {
            // Reserve before subscribers run, then bind to the actual queued
            // prefix only after the complete persisted mutation has returned.
            if (failure !== undefined) reject!(failure);
            else void tracked.flush(key).then(resolve!, reject!);
          }
        }
      },
    };
    // The raw backend identity is shared with normal journal factory callers;
    // an already-owned journal with a different adapter is rejected, not reused.
    this.journal = createPaymentOperationStore(backend, backend, this.persistence);
    this.closeJournal = this.journal.close;
    this.journal.close = () => Promise.reject(new Error('Close the owning payment persistence runtime, not its journal independently.'));
  }

  getStatus() {
    return { phase: this.phase, boundKeys: [...this.bindings], hydratingKeys: [...this.hydrations.keys()], postingAllowed: false as const,
      productionActivation: 'blocked' as const,
      failures: PAYMENT_PERSISTENCE_KEYS.filter(key => this.persistence.getFailure(key)).map(key => ({ key, error: this.persistence.getFailure(key) })) };
  }

  bind(key: AccountingKey): void {
    if (this.phase !== 'open' || this.bindings.has(key)) throw new Error('Accounting persistence key already bound or runtime closed.');
    this.bindings.add(key);
  }

  beginHydration(key: AccountingKey): () => void {
    this.assertHydrationAllowed();
    if (this.phase !== 'open') throw new Error('Payment persistence runtime is closed or closing.');
    // Zustand supersedes older overlapping hydration attempts without invoking
    // their finish callback. Only the current attempt can apply state/migrate.
    this.hydrations.get(key)?.finish();
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    const finish = () => {
      if (this.hydrations.get(key)?.promise === promise) this.hydrations.delete(key);
      resolve();
    };
    this.hydrations.set(key, { promise, finish });
    return finish;
  }

  exclusive<T>(change: () => Promise<T> | T): Promise<T> {
    if (this.phase !== 'open') return Promise.reject(new Error('Payment persistence runtime is closed or closing.'));
    const result = this.gateTail.then(async () => {
      if (this.phase !== 'open') throw new Error('Payment persistence runtime is closed or closing.');
      for (const key of PAYMENT_PERSISTENCE_KEYS) await this.persistence.flush(key);
      const value = await change();
      for (const key of PAYMENT_PERSISTENCE_KEYS) await this.persistence.flush(key);
      return value;
    });
    this.gateTail = result.then(() => {}, () => {});
    void result.catch(() => {});
    return result;
  }

  /** Explicit dormant read lease. No hydration, posting, repair, or journal transition. */
  readRecoverySnapshot(): Promise<Readonly<Record<PaymentPersistenceKey, string | null>>> {
    return this.exclusive(async () => {
      if (this.bindings.size !== 2) throw new Error('Both accounting stores must be bound for a coherent snapshot.');
      const counter = this.interference;
      this.hydrationAdmissionClosed = true;
      try {
        await Promise.all([...this.hydrations.values()].map(h => h.promise));
        await this.journal.drain();
        this.assertMutationAllowed();
        this.snapshotReading = true;
        for (const key of PAYMENT_PERSISTENCE_KEYS) await this.persistence.flush(key);
        const read = async () => Object.fromEntries(await Promise.all(PAYMENT_PERSISTENCE_KEYS.map(async key =>
          [key, await this.persistence.storage.getItem(key)] as const))) as Record<PaymentPersistenceKey, string | null>;
        const first = await read(), second = await read();
        if (this.phase !== 'open' || this.interference !== counter
          || PAYMENT_PERSISTENCE_KEYS.some(key => first[key] !== second[key])) throw new Error('Recovery snapshot was interrupted or inconsistent.');
        return Object.freeze(first);
      } finally { this.snapshotReading = false; this.hydrationAdmissionClosed = false; }
    });
  }

  /** Fences new mutations/jobs; drains issued storage writes, including failures. */
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.phase = 'closing';
    this.closing = (async () => {
      await this.gateTail;
      await this.closeJournal();
      await Promise.allSettled([...this.hydrations.values()].map(item => item.promise));
      await Promise.allSettled([...this.acknowledgements.values()]);
      await Promise.allSettled(PAYMENT_PERSISTENCE_KEYS.map(key => this.persistence.flush(key)));
      this.phase = 'closed';
      if (instances.get(this.backend) === this) instances.delete(this.backend);
      // Never switch mounted stores back to untracked persistence. A bound
      // session must be torn down before creating/rebinding a fresh runtime.
    })();
    return this.closing;
  }
}

export function createPaymentOperationRuntime(backend: StateStorage = AsyncStorage): PaymentOperationRuntime {
  const existing = instances.get(backend);
  if (existing) return existing;
  const runtime = new PaymentOperationRuntime(backend);
  instances.set(backend, runtime);
  return runtime;
}

/**
 * Infrastructure-session binding ONLY. No application caller enables it.
 * Must precede creation/hydration of BOTH accounting stores; cannot retrofit
 * live stores or replace the legacy synchronous compensation path safely.
 */
export function installPaymentRuntimeBeforeStores(runtime: PaymentOperationRuntime): void {
  if (installed === runtime) return;
  if (installed || legacyBindings.size || runtime.getStatus().phase !== 'open') throw new Error('Runtime must be installed before accounting stores initialize.');
  installed = runtime;
}

/**
 * Middleware inside Zustand persist: guards the complete persisted set, not
 * merely the underlying state update. Default production mode returns the
 * original persist middleware unchanged, preserving existing sync behavior.
 */
export function paymentRuntimePersist<T, P = T>(
  initializer: StateCreator<T, [['zustand/persist', unknown]], []>,
  options: PersistOptions<T, P>,
): StateCreator<T, [], [['zustand/persist', P]]> {
  const key = options.name as AccountingKey;
  if (key !== 'tomorrow:finance' && key !== 'tomorrow:ledger') throw new Error('Unsupported accounting persistence binding.');
  const runtime = installed;
  if (!runtime) {
    legacyBindings.add(key);
    return persist(initializer, options);
  }
  runtime.bind(key);
  const tracked = runtime.persistence;
  const json = createJSONStorage<P>(() => tracked.storage)!;
  const storage: NonNullable<PersistOptions<T, P>['storage']> = {
    getItem: name => json.getItem(name),
    setItem: (name, value) => tracked.runMutation(key, () => json.setItem(name, value)),
    removeItem: name => tracked.storage.removeItem(name),
  };
  const creator = persist<T, [], [], P>((set, get, api) => {
    const mutate = <R>(change: () => R): R => {
      runtime.assertMutationAllowed();
      // Replacing persist configuration is not a supported write path. Detect
      // it before a state mutation could silently bypass the tracked adapter.
      if ('persist' in api && (api.persist.getOptions().storage !== storage || api.persist.getOptions().name !== key)) throw new Error('Tracked persistence configuration cannot be replaced.');
      return tracked.runMutation(key, change);
    };
    const original = api.setState;
    api.setState = ((...args: unknown[]) => mutate(() => Reflect.apply(original, api, args))) as typeof api.setState;
    const guardedSet = ((...args: unknown[]) => mutate(() => Reflect.apply(set, undefined, args))) as typeof set;
    return initializer(guardedSet, get, api);
  }, {
    ...options, storage,
    partialize: state => tracked.runMutation(key, () => options.partialize ? options.partialize(state) : state as unknown as P),
    migrate: options.migrate ? (state, version) => tracked.runMutation(key, () => options.migrate!(state, version)) : undefined,
    onRehydrateStorage: state => {
      const end = runtime.beginHydration(key);
      let finish: ReturnType<NonNullable<typeof options.onRehydrateStorage>>;
      try { finish = options.onRehydrateStorage?.(state); }
      catch (error) { tracked.recordFailure(key, 'read', error); end(); throw error; }
      return (restored, error) => {
        if (error !== undefined) tracked.recordFailure(key, 'read', error);
        try { finish?.(restored, error); }
        catch (cause) { tracked.recordFailure(key, 'read', cause); throw cause; }
        finally { end(); }
      };
    },
  });
  return (set, get, api) => {
    // Below persist: hydration uses this raw setter, bypassing the inner wrapper.
    const protect = (setter: typeof set): typeof set => ((...args: unknown[]) => {
      runtime.assertMutationAllowed();
      const [partial, replace] = args;
      const previous = get();
      const next = typeof partial === 'function' ? partial(previous) : partial;
      if (Object.is(next, previous)) return;
      const value = (replace ?? (typeof next !== 'object' || next === null)) ? next : Object.assign({}, previous, next);
      freezeEvidence(value);
      return Reflect.apply(setter, undefined, [value, true]);
    }) as typeof set;
    api.setState = protect(api.setState);
    const state = creator(protect(set), get, api);
    freezeEvidence(state);
    // Metadata-bearing stores cannot change their key/adapter or erase storage
    // behind the runtime. Existing domain reset actions remain supported.
    const controls = (api as unknown as { persist: { setOptions: (options: unknown) => void; clearStorage: () => void;
      rehydrate: () => Promise<void>; getOptions: () => object } }).persist;
    const rehydrate = controls.rehydrate;
    controls.rehydrate = () => { runtime.assertHydrationAllowed(); return rehydrate(); };
    Object.freeze(controls.getOptions());
    Object.freeze(storage);
    controls.setOptions = () => { runtime.assertMutationAllowed(); throw new Error('Tracked persistence configuration cannot be replaced.'); };
    controls.clearStorage = () => { runtime.assertMutationAllowed(); throw new Error('Use guarded domain reset actions; do not delete generation markers.'); };
    return state;
  };
}
