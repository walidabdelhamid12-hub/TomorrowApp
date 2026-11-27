import type { StateStorage } from 'zustand/middleware';

export const FINANCE_INTENT_KEY = 'tomorrow:finance-save-intent:v1';
const RECEIPT_PREFIX = 'tomorrow:finance-save-receipt:v1:';
const EVIDENCE_PREFIX = 'tomorrow:finance-save-evidence:v1:';
export const FINANCE_KEYS = ['tomorrow:finance', 'tomorrow:ledger'] as const;
export type FinanceKey = typeof FINANCE_KEYS[number];
type Images = Partial<Record<FinanceKey, string | null>>;
type Intent = { schemaVersion: 1; operationId: string; request: string; before: Images; after: Images; result: unknown };
type Receipt = { schemaVersion: 1; operationId: string; request: string; outcome: 'completed' | 'abandoned'; result: unknown };
type Port = { ready: () => boolean; snapshot: () => unknown; restore: (state: unknown) => void; persisted?: () => string; allowMissing?: () => boolean; committed?: () => void };
type Status = Readonly<{ phase: 'loading' | 'ready' | 'saving' | 'blocked'; reason?: string; operationId?: string; postingAllowed: false }>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identity = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,180}$/.test(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
function images(v: unknown): asserts v is Images {
  if (!object(v) || !Object.keys(v).length || Object.keys(v).some(k => !(FINANCE_KEYS as readonly string[]).includes(k)
    || (v[k] !== null && typeof v[k] !== 'string'))) throw new Error('Invalid retained accounting images.');
}
function readIntent(raw: string): Intent {
  const v: unknown = JSON.parse(raw);
  if (!object(v) || !exact(v, ['schemaVersion', 'operationId', 'request', 'before', 'after', 'result'])
    || v.schemaVersion !== 1 || !identity(v.operationId) || typeof v.request !== 'string') throw new Error('Invalid retained Finance write intent.');
  images(v.before); images(v.after);
  if (JSON.stringify(Object.keys(v.before).sort()) !== JSON.stringify(Object.keys(v.after).sort())
    || Object.values(v.after).some(x => x === null)) throw new Error('Incompatible retained Finance images.');
  return v as Intent;
}
export function readReceipt(raw: string, id: string, request: string): Receipt {
  const v: unknown = JSON.parse(raw);
  if (!object(v) || !exact(v, ['schemaVersion', 'operationId', 'request', 'outcome', 'result'])
    || v.schemaVersion !== 1 || v.operationId !== id || v.request !== request
    || !['completed', 'abandoned'].includes(v.outcome as string)) throw new Error('Conflicting Finance operation identity or receipt.');
  return v as Receipt;
}
export function financeRequest(value: unknown): string {
  const visit = (v: unknown): unknown => {
    if (v === undefined) return null;
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (Array.isArray(v)) return v.map(visit);
    if (object(v)) return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, visit(v[k])]));
    throw new Error('Finance save request must contain serializable data.');
  };
  return JSON.stringify(visit(value));
}

/** Native ACK + exact readback. Single loaded JS runtime; no power-loss or cross-process atomicity claim. */
export function createDurableFinanceOperations(backend: StateStorage, drain: () => Promise<void>) {
  const ports = new Map<FinanceKey, Port>();
  const listeners = new Set<() => void>();
  let status: Status = Object.freeze({ phase: 'loading', postingAllowed: false });
  let loaded = false, loading: Promise<void> | undefined;
  let active: Intent | undefined;
  let activeRaw: string | undefined;
  let capturing: Map<FinanceKey, string> | undefined;
  let restoring = false;
  let reading = false;
  let resolving = false;
  let readBlocked = false;
  const failedReads = new Set<FinanceKey>();
  let flight: { id: string; request: string; promise: Promise<unknown> } | undefined;
  const publish = (next: Omit<Status, 'postingAllowed'>) => {
    status = Object.freeze({ ...next, postingAllowed: false });
    // Observers cannot interrupt the durable protocol.
    for (const listener of listeners) { try { listener(); } catch { /* read-only observer */ } }
  };
  const fence = (error: unknown) => publish({ phase: 'blocked', operationId: active?.operationId,
    reason: error instanceof Error ? error.message : 'Finance save is uncertain; inspect retained evidence.' });
  const acceptInitial = (raw: string | null) => {
    if (raw !== null) { active = readIntent(raw); activeRaw = raw; fence(new Error('An interrupted Finance save requires review.')); }
    else publish({ phase: 'ready' });
    loaded = true;
  };
  const initialize = (): void | Promise<void> => {
    if (loaded) return;
    if (loading) return loading;
    try {
      const raw = backend.getItem(FINANCE_INTENT_KEY);
      if (raw instanceof Promise) {
        loading = raw.then(acceptInitial).catch(error => { fence(error); throw error; });
        void loading.catch(() => {});
        return loading;
      }
      acceptInitial(raw);
    } catch (error) { fence(error); throw error; }
  };
  const verifiedWrite = async (key: string, raw: string | null) => {
    if (raw === null) await backend.removeItem(key);
    else await backend.setItem(key, raw);
    if (await backend.getItem(key) !== raw) throw new Error('Finance persistence readback mismatch for ' + key);
  };
  const assertWritable = () => {
    if (reading) throw new Error('Finance evidence inspection excludes mutations.');
    if (!loaded || status.phase === 'loading') throw new Error('Finance save recovery is not hydrated.');
    if (status.phase === 'blocked') throw new Error('Finance persistence is blocked: ' + status.reason);
    if ((flight || status.phase === 'saving') && !capturing && !restoring) throw new Error('A Finance save is awaiting acknowledgement.');
  };
  const withEvidenceRead = async <T>(read: () => Promise<T>): Promise<T> => {
    if (reading || flight) throw new Error('Finance evidence inspection requires an idle save runtime.');
    reading = true;
    try { return await read(); }
    catch (error) { fence(error); throw error; }
    finally { reading = false; }
  };
  const inspect = () => withEvidenceRead(async () => {
    await initialize();
    if (flight) throw new Error('Wait for the active Finance save before inspecting recovery.');
    await drain();
    const raw = await backend.getItem(FINANCE_INTENT_KEY);
    if (raw === null) {
      if (active) { fence(new Error('Retained Finance intent disappeared.')); throw new Error(status.reason); }
      return Object.freeze({ classification: status.phase === 'blocked' ? 'conflict' : 'clean', postingAllowed: false, raw });
    }
    const intent = readIntent(raw);
    const current: Images = {};
    for (const key of FINANCE_KEYS) if (key in intent.before) current[key] = await backend.getItem(key);
    const before = Object.keys(intent.before).every(key => current[key as FinanceKey] === intent.before[key as FinanceKey]);
    const after = Object.keys(intent.after).every(key => current[key as FinanceKey] === intent.after[key as FinanceKey]);
    const known = Object.keys(current).every(key => current[key as FinanceKey] === intent.before[key as FinanceKey]
      || current[key as FinanceKey] === intent.after[key as FinanceKey]);
    const classification = after ? 'applied-unconfirmed' : before ? 'unapplied' : known ? 'partial' : 'conflict';
    return Object.freeze({ classification, postingAllowed: false, raw, intent, current,
      receiptRaw: await backend.getItem(RECEIPT_PREFIX + intent.operationId) });
  });
  const run = <T>(id: string, requestValue: unknown, change: () => T): Promise<T> => {
    let request: string;
    try {
      if (reading || resolving) throw new Error('Finance evidence review excludes new saves.');
      if (!identity(id)) throw new Error('Invalid Finance submission identity.');
      request = financeRequest(requestValue);
      if (flight) {
        if (flight.id === id && flight.request === request) return flight.promise as Promise<T>;
        throw new Error('Another Finance save is pending.');
      }
    } catch (error) { return Promise.reject(error); }
    // Reserve synchronously before initialization/receipt reads: rapid taps cannot run twice.
    const promise = Promise.resolve().then(async () => {
      await initialize();
      if (!loaded || status.phase !== 'ready') throw new Error(status.reason ?? 'Finance recovery is not ready.');
      if (ports.size !== 2 || [...ports.values()].some(p => !p.ready())) throw new Error('Both Finance stores must hydrate before saving.');
      publish({ phase: 'saving', operationId: id });
      await drain();
      const receiptRaw = await backend.getItem(RECEIPT_PREFIX + id);
      if (receiptRaw !== null) {
        const receipt = readReceipt(receiptRaw, id, request);
        if (receipt.outcome !== 'completed') throw new Error('This Finance submission was abandoned; review before creating a new submission.');
        publish({ phase: 'ready' });
        return receipt.result as T;
      }
      // Re-read persisted intent on every admission; do not trust a cached absence.
      if (await backend.getItem(FINANCE_INTENT_KEY) !== null) throw new Error('Another retained Finance intent requires review.');
      for (const [key, port] of ports) {
        if (!port.persisted) continue;
        const stored = await backend.getItem(key);
        if (stored === null ? !port.allowMissing?.() : financeRequest(JSON.parse(stored)) !== financeRequest(JSON.parse(port.persisted()))) {
          throw new Error('Saved Finance state changed since hydration; reload and review before saving.');
        }
      }
      const snapshots = new Map([...ports].map(([key, port]) => [key, port.snapshot()]));
      const staged = new Map<FinanceKey, string>();
      let result: T;
      capturing = staged;
      try {
        result = change();
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          void Promise.resolve(result).catch(() => {});
          throw new Error('Finance save callbacks must be synchronous.');
        }
        financeRequest(result);
      } catch (error) {
        restoring = true;
        try { for (const [key, snapshot] of snapshots) ports.get(key)!.restore(snapshot); }
        catch (restoreError) { fence(restoreError); }
        finally { restoring = false; capturing = undefined; }
        throw error;
      }
      capturing = undefined;
      if (!staged.size) { publish({ phase: 'ready' }); return result; }
      const before: Images = {}, after: Images = {};
      for (const key of FINANCE_KEYS) if (staged.has(key)) { before[key] = await backend.getItem(key); after[key] = staged.get(key)!; }
      const intent: Intent = { schemaVersion: 1, operationId: id, request, before, after, result: result === undefined ? null : result };
      active = intent; activeRaw = JSON.stringify(intent);
      await verifiedWrite(FINANCE_INTENT_KEY, activeRaw);
      for (const key of FINANCE_KEYS) if (key in after) await verifiedWrite(key, after[key]!);
      const receipt: Receipt = { schemaVersion: 1, operationId: id, request, outcome: 'completed', result: intent.result };
      await verifiedWrite(RECEIPT_PREFIX + id, JSON.stringify(receipt));
      await verifiedWrite(FINANCE_INTENT_KEY, null);
      for (const key of FINANCE_KEYS) if (key in after) ports.get(key)?.committed?.();
      active = undefined; activeRaw = undefined;
      publish({ phase: 'ready' });
      return result;
    }).catch(error => {
      // Once preparing native I/O, uncertainty closes both stores for this session.
      if (active || status.phase === 'saving') fence(error);
      throw error;
    }).finally(() => { flight = undefined; });
    flight = { id, request, promise };
    return promise;
  };
  const resolve = async (operationId: string, decision: 'accept-applied' | 'dismiss-unapplied') => {
    if (!['accept-applied', 'dismiss-unapplied'].includes(decision)) throw new Error('Unsupported Finance recovery decision.');
    if (resolving || flight || status.phase === 'saving') throw new Error('A Finance save or recovery is active.');
    resolving = true;
    try {
    const evidence = await inspect();
    if (!('intent' in evidence) || evidence.intent.operationId !== operationId || evidence.raw !== activeRaw) throw new Error('Recovery evidence changed.');
    const expected = decision === 'accept-applied' ? 'applied-unconfirmed' : 'unapplied';
    if (evidence.classification !== expected) throw new Error('Partial/conflicting Finance evidence requires manual review; no replay is permitted.');
    if (evidence.receiptRaw !== null) {
      const old = readReceipt(evidence.receiptRaw, operationId, evidence.intent.request);
      if (decision !== 'accept-applied' || old.outcome !== 'completed'
        || financeRequest(old.result) !== financeRequest(evidence.intent.result)) throw new Error('Conflicting retained Finance receipt.');
    }
    publish({ phase: 'saving', operationId });
    try {
      // Write-once archive retains original interrupted evidence before metadata resolution.
      const archiveKey = EVIDENCE_PREFIX + operationId;
      const existing = await backend.getItem(archiveKey);
      if (existing !== null && existing !== evidence.raw) throw new Error('Conflicting retained Finance recovery archive.');
      await verifiedWrite(archiveKey, evidence.raw);
      const receipt: Receipt = { schemaVersion: 1, operationId, request: evidence.intent.request,
        outcome: decision === 'accept-applied' ? 'completed' : 'abandoned', result: evidence.intent.result };
      await verifiedWrite(RECEIPT_PREFIX + operationId, JSON.stringify(receipt));
      await verifiedWrite(FINANCE_INTENT_KEY, null);
      active = undefined; activeRaw = undefined;
      // A fresh hydration is required; never expose stale partial in-memory accounting.
      fence(new Error('Recovery metadata verified. Restart Finance to reload the reviewed saved records.'));
    } catch (error) { fence(error); throw error; }
    } finally { resolving = false; }
  };
  return {
    initialize, run, inspect, resolve, withEvidenceRead,
    block: fence,
    assertHydrationAllowed: () => {
      if (flight || reading || resolving) throw new Error('Finance save/evidence inspection excludes hydration.');
    },
    getStatus: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    register: (key: FinanceKey, port: Port) => { if (ports.has(key)) throw new Error('Duplicate production Finance store.'); ports.set(key, port); },
    assertWritable,
    reportHydration: (key: FinanceKey, error?: unknown) => {
      if (error !== undefined) {
        failedReads.add(key);
        if (status.phase !== 'blocked') { readBlocked = true; fence(error); }
      } else {
        failedReads.delete(key);
        if (readBlocked && !failedReads.size && !active && !flight) {
          readBlocked = false; publish({ phase: 'ready' });
        }
      }
    },
    stage: (key: FinanceKey, raw: string): boolean => {
      if (restoring) return true;
      if (!capturing) return false;
      capturing.set(key, raw); return true;
    },
  };
}

