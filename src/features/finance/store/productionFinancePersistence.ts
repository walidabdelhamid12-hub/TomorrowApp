import { createFinanceSubmissions } from './financeSubmissionIdentity';
import * as AsyncStorageModule from '@react-native-async-storage/async-storage';
import type { StateCreator } from 'zustand/vanilla';
import { persist, createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware';
import { createDurableFinanceOperations, type FinanceKey } from './durableFinanceOperations';
import { createOrderedFinancePersistence } from './financePersistence';

// Separate from the dormant payment journal: this never enables posting/replay.
const backend = (AsyncStorageModule.default ?? AsyncStorageModule) as StateStorage;
const productionFinancePersistence = createOrderedFinancePersistence(backend);
let inspecting = false;
export const getFinancePersistenceFailure = (key: 'tomorrow:finance' | 'tomorrow:ledger') =>
  productionFinancePersistence.getFailure(key);
const acknowledgements = new Map<string, Promise<void>>();
const mutationDepths = new Map<string, number>();
export const acknowledgeFinancePersistence = (key: 'tomorrow:finance' | 'tomorrow:ledger') => {
  const pending = acknowledgements.get(key);
  const prefix = productionFinancePersistence.flush(key);
  return pending ? Promise.all([pending, prefix]).then(() => {}) : prefix;
};

export const durableFinanceOperations = createDurableFinanceOperations(backend, async () => {
  await Promise.all([...acknowledgements.values()]);
  await Promise.all(['tomorrow:finance', 'tomorrow:ledger'].map(key => productionFinancePersistence.flush(key)));
});
export const runAcknowledgedFinanceOperation = durableFinanceOperations.run;
export const financeSubmissions = createFinanceSubmissions(backend, {
  run: durableFinanceOperations.run,
  assertIdle: () => {
    const phase = durableFinanceOperations.getStatus().phase;
    if (phase === 'saving' || phase === 'blocked') throw new Error('Finance operation or recovery is pending.');
  },
  fence: durableFinanceOperations.block,
});

/** Read-only forensic view after issued I/O settles, including uncertain writes.
 * No retry, repair, journal activation or replay is performed. Native API ACK
 * does not establish power-loss durability or a cross-process transaction.
 */
export const readFinancePersistenceEvidence = () => durableFinanceOperations.withEvidenceRead(readLegacyFinanceEvidence);
async function readLegacyFinanceEvidence() {
  if (inspecting) throw new Error('Accounting evidence inspection already active.');
  inspecting = true;
  try {
    const keys = ['tomorrow:finance', 'tomorrow:ledger'] as const;
    await Promise.all([...acknowledgements.values()].map(pending => pending.catch(() => {})));
    await Promise.all(keys.map(key => productionFinancePersistence.settle(key)));
    const documents = await Promise.all(keys.map(async key => Object.freeze({
      key, raw: await backend.getItem(key), failure: productionFinancePersistence.getFailure(key),
    })));
    return Object.freeze({ postingAllowed: false as const, documents: Object.freeze(documents) });
  } finally { inspecting = false; }
}

export function productionFinancePersist<T, P = T>(
  initializer: StateCreator<T, [['zustand/persist', unknown]], []>, options: PersistOptions<T, P>,
): StateCreator<T, [], [['zustand/persist', P]]> {
  const tracked = productionFinancePersistence;
  const key = options.name;
  let hydrated = false;
  let hydrationGeneration = 0;
  let configuration: (() => PersistOptions<T, P>) | undefined;
  let firstRead = true;
  let knownStored = false;
  const validateEnvelope = (raw: string | null): string | null => {
    if (raw !== null) {
      knownStored = true;
      const envelope = JSON.parse(raw);
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
        || !Number.isInteger(envelope.version) || envelope.version < 0 || envelope.version > 2
        || !envelope.state || typeof envelope.state !== 'object' || Array.isArray(envelope.state)) {
        throw new Error('Invalid accounting storage envelope; original storage retained.');
      }
    }
    return raw;
  };
  const storage = createJSONStorage<P>(() => ({
    ...tracked.storage,
    setItem: (name, raw) => {
      if (durableFinanceOperations.stage(name as FinanceKey, raw)) return Promise.resolve();
      // An already admitted mutation must finish serialization while an inspection drains it.
      if (!(mutationDepths.get(name) ?? 0)) durableFinanceOperations.assertWritable();
      knownStored = true;
      return tracked.storage.setItem(name, raw);
    },
    getItem: name => {
      // Before the first hydration no mutation is admitted and no write exists.
      // Preserve StateStorage's synchronous contract for synchronous adapters.
      const initial = firstRead; firstRead = false;
      const read = () => {
        const raw = initial ? backend.getItem(name) : tracked.storage.getItem(name);
        return raw instanceof Promise ? raw.then(validateEnvelope) : validateEnvelope(raw);
      };
      const startup = durableFinanceOperations.initialize();
      return startup instanceof Promise ? startup.then(read) : read();
    },
  }))!;
  const creator = persist<T, [], [], P>((set, get, api) => {
    const mutate = <R>(change: () => R): R => {
      if (inspecting) throw new Error('Accounting evidence inspection excludes mutations.');
      durableFinanceOperations.assertWritable();
      if (!hydrated) throw new Error('Accounting storage is not safely hydrated.');
      if (configuration && (configuration().storage !== storage || configuration().name !== key)) {
        throw new Error('Accounting persistence configuration cannot be replaced.');
      }
      const depth = mutationDepths.get(key) ?? 0;
      if (depth) return tracked.runMutation(key, change);
      let resolve!: () => void, reject!: (error: unknown) => void;
      const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
      acknowledgements.set(key, pending);
      const remove = () => { if (acknowledgements.get(key) === pending) acknowledgements.delete(key); };
      void pending.then(remove, remove);
      mutationDepths.set(key, depth + 1);
      try {
        const result = tracked.runMutation(key, change);
        void tracked.flush(key).then(resolve, reject);
        return result;
      } catch (error) { reject(error); throw error; }
      finally { mutationDepths.set(key, depth); }
    };
    const original = api.setState;
    api.setState = ((...args: unknown[]) => mutate(() => Reflect.apply(original, api, args))) as typeof api.setState;
    return initializer(((...args: unknown[]) => mutate(() => Reflect.apply(set, undefined, args))) as typeof set, get, api);
  }, {
    ...options, storage,
    onRehydrateStorage: state => {
      if (inspecting) throw new Error('Accounting evidence inspection excludes hydration.');
      hydrated = false;
      tracked.retryRead(key);
      const generation = ++hydrationGeneration;
      const finish = options.onRehydrateStorage?.(state);
      return (restored, error) => {
        if (error !== undefined) tracked.recordFailure(key, 'read', error);
        try { finish?.(restored, error); }
        catch (cause) { tracked.recordFailure(key, 'read', cause); throw cause; }
        if (generation === hydrationGeneration) {
          hydrated = error === undefined && !tracked.getFailure(key);
          durableFinanceOperations.reportHydration(key as FinanceKey, error ?? tracked.getFailure(key));
        }
      };
    },
  });
  return (set, get, api) => {
    const state = creator(set, get, api);
    const controls = (api as unknown as { persist: {
      getOptions: () => PersistOptions<T, P>; setOptions: (value: unknown) => void; clearStorage: () => void;
      rehydrate: () => Promise<void> | void;
    } }).persist;
    const rehydrate = controls.rehydrate;
    controls.rehydrate = () => { durableFinanceOperations.assertHydrationAllowed(); return rehydrate(); };
    configuration = controls.getOptions;
    const view = Object.freeze({ ...configuration(), storage: Object.freeze({
      getItem: storage.getItem,
      setItem: () => { throw new Error('Use accounting actions to retain persistence evidence.'); },
      removeItem: () => { throw new Error('Accounting evidence cannot be erased through persist controls.'); },
    }) });
    Object.freeze(configuration());
    Object.freeze(storage);
    controls.getOptions = () => view;
    controls.setOptions = () => { throw new Error('Accounting persistence configuration cannot be replaced.'); };
    controls.clearStorage = () => { throw new Error('Accounting evidence cannot be erased through persist controls.'); };
    durableFinanceOperations.register(key as FinanceKey, {
      ready: () => hydrated,
      snapshot: () => get(),
      persisted: () => JSON.stringify({state: options.partialize ? options.partialize(get()) : get(), version: options.version ?? 0}),
      allowMissing: () => !knownStored,
      committed: () => { knownStored = true; },
      restore: state => api.setState(state as T, true),
    });
    return state;
  };
}
