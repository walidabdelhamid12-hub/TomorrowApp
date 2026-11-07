import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateCreator } from 'zustand/vanilla';
import { persist, createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware';
import { createOrderedFinancePersistence } from './financePersistence';
import { createPaymentOperationStore, PAYMENT_OPERATION_STORAGE_KEY } from './usePaymentOperationStore';
import { freezeEvidence, object, sameEvidence, text, type EntityRef, type RevisionHead } from '../types/paymentRecovery';
import { CoordinatorLeaseInterrupted, copyCoordinatorData, type CoordinatorCapability, type CoordinatorWriteLease, type StageBinding } from './paymentRuntimeAuthorization';
import { readRecoveryJournalDocument, verifyPersistedPaymentAccounting } from './paymentAccountingVerification';
import { readCreationAttestationV1, type CreationAttestationV1 } from '../types/creationProvenance';

export const PAYMENT_PERSISTENCE_KEYS = Object.freeze([
  'tomorrow:finance', 'tomorrow:ledger', PAYMENT_OPERATION_STORAGE_KEY,
] as const);
export type PaymentPersistenceKey = typeof PAYMENT_PERSISTENCE_KEYS[number];
type AccountingKey = Exclude<PaymentPersistenceKey, typeof PAYMENT_OPERATION_STORAGE_KEY>;
type Tracked = ReturnType<typeof createOrderedFinancePersistence>;
const instances = new WeakMap<object, PaymentOperationRuntime>();
const legacyBindings = new Set<string>();
let installed: PaymentOperationRuntime | undefined;
type LeaseRequest = Readonly<{ operationId: string; entity: EntityRef; predecessor: RevisionHead | null }>;
type StagePort = { hydrated: () => boolean; write: (binding: StageBinding, data: unknown) => Promise<void> };
type LeaseOwner = { request: LeaseRequest; active: boolean; busy: boolean; issued: number;
  pending: Set<Promise<void>>; errors: unknown[]; stages: Set<string>; interrupt: (error: Error) => void };
type PrivateRuntime = { tracked: Tracked; ports: Map<AccountingKey, StagePort>; owner?: LeaseOwner; fence?: string;
  coordinatorSession: boolean;
  capabilities: WeakMap<object, { owner: LeaseOwner; binding: StageBinding; used: boolean }>;
  checkCreationAuthority: (input: unknown) => Promise<never>;
  run: <T>(request: LeaseRequest, job: (lease: CoordinatorWriteLease) => Promise<T>) => Promise<T> };
// Neither privileged adapters nor registered store ports are reachable through runtime/state/options.
const privateRuntimes = new WeakMap<PaymentOperationRuntime, PrivateRuntime>();
const stageKey = (stage: StageBinding['stage']): PaymentPersistenceKey => {
  if (stage === 'finance-insert' || stage === 'finance-finalize') return 'tomorrow:finance';
  if (stage === 'ledger-insert' || stage === 'ledger-head') return 'tomorrow:ledger';
  if (stage === 'journal-prepare' || stage === 'journal-complete') return PAYMENT_OPERATION_STORAGE_KEY;
  throw new Error('Unsupported coordinator stage.');
};

/** Internal factory only. No application caller, posting plan, or readiness permission. */
export function createCoordinatorRuntimeAccess(runtime: PaymentOperationRuntime) {
  const owner = privateRuntimes.get(runtime);
  if (!owner) throw new Error('Unknown coordinator runtime.');
  if (runtime.getStatus().phase !== 'open') throw new Error('Coordinator runtime is closed or closing.');
  owner.coordinatorSession = true;
  return Object.freeze({
    withWriteLease: <T>(request: LeaseRequest, job: (lease: CoordinatorWriteLease) => Promise<T>) => owner.run(request, job),
    // Internal denial-only boundary. This is not an issuance or creation API.
    checkCreationAuthority: (input: unknown): Promise<never> => owner.checkCreationAuthority(input),
  });
}

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
    const internal = privateRuntimes.get(this);
    if (internal?.fence) throw new Error(`Accounting writes fenced: ${internal.fence}`);
    if (internal?.owner) throw new Error('Coordinator ownership excludes public mutations.');
    if (internal?.coordinatorSession) throw new Error('Coordinator session is write-closed to public mutations.');
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
      settle: key => { knownKey(key); return tracked.settle(key); },
      storage: {
        getItem: async key => { open(key); await this.persistence.flush(key); return tracked.storage.getItem(key); },
        setItem: (key, value) => { this.assertMutationAllowed(); open(key); return tracked.storage.setItem(key, value); },
        removeItem: key => { this.assertMutationAllowed(); open(key); return tracked.storage.removeItem(key); },
      },
      runMutation: (key, change) => { this.assertMutationAllowed(); return runTrackedMutation(key, change); },
    };
    const runTrackedMutation: Tracked['runMutation'] = (key, change) => {
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
    };
    privateRuntimes.set(this, { tracked: { ...tracked, runMutation: runTrackedMutation }, ports: new Map(), capabilities: new WeakMap(), coordinatorSession: false,
      checkCreationAuthority: input => this.checkCreationAuthority(input),
      run: (request, job) => this.runCoordinatorLease(request, job) });
    // The raw backend identity is shared with normal journal factory callers;
    // an already-owned journal with a different adapter is rejected, not reused.
    this.journal = createPaymentOperationStore(backend, backend, this.persistence);
    this.closeJournal = this.journal.close;
    this.journal.close = () => Promise.reject(new Error('Close the owning payment persistence runtime, not its journal independently.'));
  }

  getStatus() {
    return { phase: this.phase, boundKeys: [...this.bindings], hydratingKeys: [...this.hydrations.keys()], postingAllowed: false as const,
      readiness: 'blocked' as const, writeFence: privateRuntimes.get(this)?.fence,
      coordinatorSession: privateRuntimes.get(this)?.coordinatorSession ? 'write-closed' as const : 'inactive' as const,
      productionActivation: 'blocked' as const,
      failures: PAYMENT_PERSISTENCE_KEYS.filter(key => this.persistence.getFailure(key)).map(key => ({ key, error: this.persistence.getFailure(key) })) };
  }

  /**
   * Task 5 fail-closed infrastructure only. A parsed caller image is never proof
   * that this runtime created a new entity. No trusted birth witness, capability,
   * attestation, persistence continuation, or acknowledgement is issued here.
   * A future internal allocation path must supply an unforgeable session identity
   * while excluding hydration/public writers; that path does not exist in Task 5.
   */
  private checkCreationAuthority(input: unknown): Promise<never> {
    let binding: CreationAttestationV1;
    try { binding = readCreationAttestationV1(input); }
    catch (error) { return Promise.reject(error); }
    return this.runCoordinatorLease({ operationId: binding.creationId, entity: binding.entity, predecessor: null }, async () => {
      const internal = privateRuntimes.get(this)!;
      const live = () => {
        if (this.phase !== 'open' || !internal.owner?.active || internal.fence) throw new Error('Creation authority expired or revoked.');
      };
      live();
      // The same runtime/lease owns all three reads. No caller-supplied snapshot
      // or injected readiness boolean can substitute for persisted inspection.
      const documents = Object.fromEntries(await Promise.all(PAYMENT_PERSISTENCE_KEYS.map(async key =>
        [key, await this.persistence.storage.getItem(key)] as const))) as Record<PaymentPersistenceKey, string | null>;
      live();
      const raw = documents[PAYMENT_OPERATION_STORAGE_KEY];
      if (raw === null || JSON.parse(raw).version !== 3) throw new Error('Creation authority requires an existing V3 installation.');
      const journal = readRecoveryJournalDocument(raw);
      const inspection = verifyPersistedPaymentAccounting(documents);
      if (inspection.installation !== 'consistent' || inspection.globalIssues.length
        || journal.installation?.phase !== 'active' || journal.installation.generationId !== binding.generationId) {
        throw new Error('Creation authority installation or generation is unverified or stale.');
      }
      const finance = JSON.parse(documents['tomorrow:finance']!).state;
      const ledger = JSON.parse(documents['tomorrow:ledger']!).state;
      const evidence = finance.creationProvenance?.entries ?? [];
      if (evidence.some((e: { attestation: CreationAttestationV1 }) => e.attestation.creationId === binding.creationId)) {
        throw new Error('Creation identity already has retained provenance.');
      }
      const records: { id: string }[] = [...finance.assets, ...finance.debts, ...finance.loans, ...finance.cheques,
        ...ledger.accounts, ...ledger.categories, ...ledger.transactions, ...ledger.transfers,
        ...finance.debts.flatMap((p: { payments: { id: string }[] }) => p.payments),
        ...finance.loans.flatMap((p: { payments: { id: string }[] }) => p.payments)];
      if (records.some(p => p.id === binding.entity.entityId || p.id === binding.creationId)
        || evidence.some((e: { attestation: CreationAttestationV1 }) => e.attestation.entity.entityId === binding.entity.entityId)) {
        throw new Error('Existing or retained identity cannot receive new creation authority.');
      }
      live();
      // Even matching active V3 metadata plus record absence cannot prove fresh
      // creation or restore continuity. Never promote caller input to authority.
      throw new Error('Trusted creation authority unavailable: private fresh-entity allocation witness is not implemented.');
    });
  }

  private runCoordinatorLease<T>(input: LeaseRequest, job: (lease: CoordinatorWriteLease) => Promise<T>): Promise<T> {
    const internal = privateRuntimes.get(this)!;
    if (internal.owner) return Promise.reject(new Error('A coordinator lease already owns this runtime; nested acquisition is forbidden.'));
    let request: LeaseRequest;
    const admission = () => {
      if (this.phase !== 'open') throw new Error('Payment persistence runtime is closed or closing.');
      if (this.snapshotReading) throw new Error('Recovery snapshot excludes coordinator admission.');
      if (internal.fence) throw new Error(`Accounting writes fenced: ${internal.fence}`);
    };
    try {
      admission();
      request = freezeEvidence(copyCoordinatorData(input)) as LeaseRequest;
      if (!text(request.operationId) || !object(request.entity) || !['debt', 'loan'].includes(request.entity.entityType)
        || !text(request.entity.entityId) || Object.keys(request).length !== 3 || Object.keys(request.entity).length !== 2
        || (request.predecessor !== null && (!object(request.predecessor) || Object.keys(request.predecessor).length !== 2
          || !Number.isSafeInteger(request.predecessor.revision) || request.predecessor.revision < 1 || !text(request.predecessor.operationId)))) throw new Error('Invalid coordinator lease identity.');
    } catch (error) { return Promise.reject(error); }
    return this.exclusive(async () => {
      admission();
      this.hydrationAdmissionClosed = true;
      let owner: LeaseOwner | undefined;
      try {
        await Promise.all([...this.hydrations.values()].map(h => h.promise));
        await this.journal.drain();
        admission();
        if (internal.ports.size !== 2 || [...internal.ports.values()].some(p => !p.hydrated())) throw new Error('Both accounting stores must have successfully hydrated.');
        let interrupt!: (error: Error) => void;
        const interrupted = new Promise<never>((_yes, no) => { interrupt = no; });
        void interrupted.catch(() => {});
        owner = { request, active: true, busy: false, issued: 0, pending: new Set(), errors: [], stages: new Set(), interrupt };
        internal.owner = owner;
        // Capture the final accepted public prefix after establishing exclusion.
        for (const key of PAYMENT_PERSISTENCE_KEYS) await this.persistence.flush(key);
        const documents = Object.fromEntries(await Promise.all(PAYMENT_PERSISTENCE_KEYS.map(async key =>
          [key, await this.persistence.storage.getItem(key)] as const))) as Record<PaymentPersistenceKey, string | null>;
        const journalRaw = documents[PAYMENT_OPERATION_STORAGE_KEY];
        if (journalRaw === null || JSON.parse(journalRaw).version !== 3) throw new Error('Coordinator leases require an existing V3 journal; no promotion is performed.');
        const journal = readRecoveryJournalDocument(journalRaw);
        const inspection = verifyPersistedPaymentAccounting(documents);
        if (inspection.installation !== 'consistent' || inspection.globalIssues.length
          || journal.receipts.some(r => !('schemaVersion' in r) || r.state !== 'completed')
          || inspection.findings.some(f => f.operationId && !f.classification.startsWith('verified-'))) {
          internal.fence = 'Persisted coordinator evidence is unresolved or conflicting; write admission remains closed.';
          throw new Error(internal.fence);
        }
        if (this.phase !== 'open' || !owner.active) throw new CoordinatorLeaseInterrupted('rejected');
        const liveOwner = owner;
        const ensure = () => {
          if (!liveOwner.active || internal.owner !== liveOwner || this.phase !== 'open') throw new Error('Coordinator lease expired or runtime closed or closing.');
          if (internal.fence) throw new Error(`Accounting writes fenced: ${internal.fence}`);
          if (liveOwner.busy) throw new Error('Coordinator stage is busy; reentry is forbidden.');
        };
        const bindingFor = (value: StageBinding): StageBinding => {
          const binding = freezeEvidence(copyCoordinatorData(value)) as StageBinding;
          if (Object.keys(binding).length !== 5 || binding.operationId !== request.operationId || !sameEvidence(binding.entity, request.entity)
            || !sameEvidence(binding.predecessor, request.predecessor) || stageKey(binding.stage) !== binding.key) throw new Error('Wrong coordinator key/stage/operation/predecessor.');
          return binding;
        };
        const lease: CoordinatorWriteLease = Object.freeze({
          operationId: request.operationId,
          issue: (value: StageBinding) => {
            ensure(); liveOwner.busy = true;
            try {
              const binding = bindingFor(value);
              if (liveOwner.stages.has(binding.stage)) throw new Error('Coordinator stage was already issued.');
              liveOwner.stages.add(binding.stage);
              const token = Object.freeze({}) as CoordinatorCapability;
              internal.capabilities.set(token, { owner: liveOwner, binding, used: false }); return token;
            } finally { liveOwner.busy = false; }
          },
          write: (token: CoordinatorCapability, value: StageBinding, data: unknown): Promise<void> => {
            let entered = false;
            try {
              ensure();
              const capability = token && internal.capabilities.get(token);
              if (!capability || capability.owner !== liveOwner || capability.used) throw new Error('Forged, reused, or wrong-runtime coordinator capability.');
              capability.used = true;
              liveOwner.busy = true; entered = true;
              const binding = bindingFor(value);
              if (!sameEvidence(binding, capability.binding)) throw new Error('Capability binding does not match this stage.');
              const port = internal.ports.get(binding.key as AccountingKey);
              if (!port) throw new Error('No private journal posting transitions are implemented.');
              const captured = freezeEvidence(copyCoordinatorData(data));
              const task = Promise.resolve().then(async () => {
                if (!liveOwner.active || this.phase !== 'open' || internal.fence) throw new CoordinatorLeaseInterrupted(liveOwner.issued ? 'uncertain' : 'rejected');
                liveOwner.issued++;
                await port.write(binding, captured);
              }).catch(error => {
                internal.fence ??= 'An authorized stage failed; inspect retained accounting evidence.';
                liveOwner.errors.push(error); throw error;
              }).finally(() => { liveOwner.busy = false; liveOwner.pending.delete(task); });
              liveOwner.pending.add(task); void task.catch(() => {}); return task;
            } catch (error) { if (entered) liveOwner.busy = false; return Promise.reject(error); }
          },
          fence: (reason: string) => { ensure(); internal.fence = text(reason) ? reason : 'Unresolved coordinator evidence.'; },
        });
        const work = Promise.resolve().then(() => job(lease));
        void work.catch(() => {});
        try {
          const value = await Promise.race([work, interrupted]);
          liveOwner.active = false;
          await Promise.allSettled([...liveOwner.pending]);
          if (liveOwner.errors.length) throw liveOwner.errors[0];
          if (internal.fence) throw new Error(`Accounting writes fenced: ${internal.fence}`);
          return value;
        } finally { liveOwner.active = false; }
      } catch (error) {
        if (owner?.issued) internal.fence ??= 'Coordinator interrupted after an authorized stage; inspect retained evidence.';
        throw error;
      } finally {
        if (owner) { owner.active = false; await Promise.allSettled([...owner.pending]); }
        internal.owner = undefined;
        this.hydrationAdmissionClosed = false;
      }
    });
  }

  /** Forensics only: raw persisted bytes, never a readiness/snapshot certificate. */
  readForensicSnapshot() {
    if (privateRuntimes.get(this)?.owner) return Promise.reject(new Error('Release the coordinator lease before forensic inspection.'));
    const inspect = this.gateTail.then(async () => {
      const previousAdmission = this.hydrationAdmissionClosed;
      this.hydrationAdmissionClosed = true;
      try {
        await Promise.allSettled([...this.hydrations.values()].map(h => h.promise));
        await this.journal.drain().catch(() => {});
        await Promise.all(PAYMENT_PERSISTENCE_KEYS.map(key => this.persistence.settle(key)));
        this.snapshotReading = true;
        const documents = await Promise.all(PAYMENT_PERSISTENCE_KEYS.map(async key => {
          try { return { key, raw: await this.backend.getItem(key) ?? null }; }
          catch (error) { return { key, raw: null, error }; }
        }));
        return { postingAllowed: false as const, readiness: 'blocked' as const, coherent: false as const,
          writeFence: privateRuntimes.get(this)?.fence, failures: this.getStatus().failures, documents };
      } finally { this.snapshotReading = false; this.hydrationAdmissionClosed = previousAdmission; }
    });
    this.gateTail = inspect.then(() => {}, () => {}); return inspect;
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
    if (privateRuntimes.get(this)?.owner) return Promise.reject(new Error('Coordinator ownership forbids nested exclusive jobs.'));
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
    const internal = privateRuntimes.get(this)!;
    if (internal.owner) {
      if (internal.owner.issued) internal.fence ??= 'Runtime closed during a coordinator operation.';
      internal.owner.active = false;
      internal.owner.interrupt(new CoordinatorLeaseInterrupted(internal.owner.issued ? 'uncertain' : 'rejected'));
    }
    this.closing = (async () => {
      await this.gateTail;
      await this.closeJournal();
      await Promise.allSettled([...this.hydrations.values()].map(item => item.promise));
      await Promise.allSettled([...this.acknowledgements.values()]);
      await Promise.allSettled(PAYMENT_PERSISTENCE_KEYS.map(key => this.persistence.flush(key)));
      await Promise.all(PAYMENT_PERSISTENCE_KEYS.map(key => this.persistence.settle(key)));
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
  const internal = privateRuntimes.get(runtime)!;
  let frame: { next: T; phase: 'applying' | 'notifying' | 'serializing' | 'queued'; expected: unknown } | undefined;
  let privateSet: ((state: T, replace: true) => unknown) | undefined;
  let privateOptions: (() => PersistOptions<T, P>) | undefined;
  const json = createJSONStorage<P>(() => tracked.storage)!;
  const privateJSON = createJSONStorage<P>(() => internal.tracked.storage)!;
  const storage: NonNullable<PersistOptions<T, P>['storage']> = {
    getItem: name => json.getItem(name),
    setItem: (name, value) => {
      if (frame) {
        if (frame.phase !== 'serializing' || name !== key || runtime.getStatus().phase !== 'open' || internal.fence
          || !sameEvidence(copyCoordinatorData(value.state), frame.expected)) throw new Error('Invalid private persistence continuation.');
        frame.phase = 'queued'; return privateJSON.setItem(name, value);
      }
      return tracked.runMutation(key, () => json.setItem(name, value));
    },
    removeItem: name => tracked.storage.removeItem(name),
  };
  const creator = persist<T, [], [], P>((set, get, api) => {
    privateSet = set;
    const mutate = <R>(change: () => R): R => {
      runtime.assertMutationAllowed();
      // Replacing persist configuration is not a supported write path. Detect
      // it before a state mutation could silently bypass the tracked adapter.
      const configuration = privateOptions?.() ?? ('persist' in api ? api.persist.getOptions() : undefined);
      if (configuration && (configuration.storage !== storage || configuration.name !== key)) throw new Error('Tracked persistence configuration cannot be replaced.');
      return tracked.runMutation(key, change);
    };
    const original = api.setState;
    api.setState = ((...args: unknown[]) => mutate(() => Reflect.apply(original, api, args))) as typeof api.setState;
    const guardedSet = ((...args: unknown[]) => mutate(() => Reflect.apply(set, undefined, args))) as typeof set;
    return initializer(guardedSet, get, api);
  }, {
    ...options, storage,
    partialize: state => {
      const partialize = () => options.partialize ? options.partialize(state) : state as unknown as P;
      if (frame) {
        if (frame.phase !== 'serializing') throw new Error('Private persistence cannot run during subscriber notification.');
        return copyCoordinatorData(partialize()) as P;
      }
      return tracked.runMutation(key, partialize);
    },
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
      if (frame && frame.phase === 'applying' && args[0] === frame.next && args[1] === true) {
        if (runtime.getStatus().phase !== 'open' || internal.fence || !internal.owner?.active) throw new Error('Private stage is no longer admitted.');
        const current = frame; current.phase = 'notifying';
        try { return Reflect.apply(setter, undefined, args); }
        finally { current.phase = 'serializing'; }
      }
      // Already accepted hydration applies through the raw setter, without public authority.
      // Public setters encounter their independent guard before reaching this path.
      const acceptedHydration = internal.coordinatorSession && !internal.owner && !internal.fence
        && runtime.getStatus().phase === 'open' && runtime.getStatus().hydratingKeys.includes(key);
      if (!acceptedHydration) runtime.assertMutationAllowed();
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
      rehydrate: () => Promise<void>; getOptions: () => PersistOptions<T, P>; hasHydrated: () => boolean } }).persist;
    privateOptions = controls.getOptions;
    const rehydrate = controls.rehydrate;
    controls.rehydrate = () => { runtime.assertHydrationAllowed(); return rehydrate(); };
    Object.freeze(privateOptions());
    Object.freeze(storage);
    // Persist retains its private adapter; callers get a public, independently guarded facade.
    const publicStorage = Object.freeze({ getItem: (name: string) => json.getItem(name),
      setItem: (name: string, value: Parameters<typeof storage.setItem>[1]) => tracked.runMutation(key, () => json.setItem(name, value)),
      removeItem: (name: string) => tracked.storage.removeItem(name) });
    const view = Object.freeze({ ...privateOptions(), storage: publicStorage });
    controls.getOptions = () => view;
    controls.setOptions = () => { runtime.assertMutationAllowed(); throw new Error('Tracked persistence configuration cannot be replaced.'); };
    controls.clearStorage = () => { runtime.assertMutationAllowed(); throw new Error('Use guarded domain reset actions; do not delete generation markers.'); };
    internal.ports.set(key, {
      hydrated: controls.hasHydrated,
      write: async (binding, data) => {
        const arrays = key === 'tomorrow:finance' ? ['assets', 'debts', 'loans', 'cheques'] : ['accounts', 'categories', 'transactions', 'transfers'];
        if (!object(data) || Object.keys(data).some(k => ![...arrays, 'paymentJournal', 'paymentAccounting'].includes(k))
          || arrays.some(k => !Array.isArray(data[k]))) throw new Error('Private stage requires a complete persisted accounting document.');
        const current = get() as Record<string, unknown>;
        if (!sameEvidence(data.paymentJournal, current.paymentJournal)) throw new Error('Private stages cannot change the installation generation marker.');
        const metadata = current.paymentAccounting;
        const heads = object(metadata) && Array.isArray(metadata.entityHeads) ? metadata.entityHeads.filter(h => object(h)
          && sameEvidence(h.entity, binding.entity)) : [];
        if (heads.length > 1 || !sameEvidence(heads[0]?.head ?? null, binding.predecessor)) throw new Error('Private stage predecessor revision mismatch.');
        const next = freezeEvidence({ ...get(), ...Object.fromEntries([...arrays, 'paymentJournal', 'paymentAccounting'].map(k => [k, data[k]])) }) as T;
        internal.tracked.runMutation(key, () => {
          const expected = copyCoordinatorData(options.partialize ? options.partialize(next) : next);
          if (!sameEvidence(JSON.parse(JSON.stringify(expected)), JSON.parse(JSON.stringify(data)))) throw new Error('Private stage partialization changed the supplied accounting image.');
          frame = { next, expected, phase: 'applying' };
          try { privateSet!(next, true); }
          finally { frame = undefined; }
        });
        await tracked.flush(key);
      },
    });
    return state;
  };
}
