import type { StateStorage } from 'zustand/middleware';
import { financeRequest, readReceipt } from './durableFinanceOperations';

export const FINANCE_SUBMISSIONS_KEY = 'tomorrow:finance-submissions:v1';
const ARCHIVE = 'tomorrow:finance-submission-history:v1:';
const RECEIPT = 'tomorrow:finance-save-receipt:v1:';
const INTENT = 'tomorrow:finance-save-intent:v1';
// Only errors created by a verified, non-mutating admission check get local UI treatment.
const admissionRejections = new WeakSet<Error>();
export const isFinanceAdmissionRejection = (error: unknown): error is Error =>
  error instanceof Error && admissionRejections.has(error);
type Slot = Readonly<{scope: string; operationId: string; request: string | null; state: 'new' | 'open' | 'completed' | 'unchanged'; result: unknown}>;
type Registry = {schemaVersion: 1; slots: Slot[]};
type Dependencies = {
  run: <T>(id: string, request: unknown, change: () => T) => Promise<T>;
  assertIdle: () => void;
  fence: (error: unknown) => void;
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,180}$/.test(v);
function read(raw: string | null): Registry {
  if (raw === null) return {schemaVersion: 1, slots: []};
  const v: unknown = JSON.parse(raw);
  if (!record(v) || v.schemaVersion !== 1 || Object.keys(v).length !== 2 || !Array.isArray(v.slots)) throw new Error('Invalid retained Finance submission registry.');
  const scopes = new Set(), ids = new Set();
  for (const row of v.slots) {
    if (!record(row) || Object.keys(row).length !== 5 || Object.keys(row).some(k => !['scope','operationId','request','state','result'].includes(k))
      || typeof row.scope !== 'string' || !row.scope.trim() || row.scope.length > 500 || !id(row.operationId)
      || (row.request !== null && typeof row.request !== 'string')
      || !['new','open','completed','unchanged'].includes(row.state as string)
      || (row.state === 'new' ? row.request !== null : typeof row.request !== 'string')
      || scopes.has(row.scope) || ids.has(row.operationId)) throw new Error('Conflicting or invalid retained Finance submission.');
    scopes.add(row.scope); ids.add(row.operationId);
  }
  return v as Registry;
}

/** Persisted UI submission identity; rotating it requires an explicit new-operation action. */
export function createFinanceSubmissions(backend: StateStorage, dependencies: Dependencies) {
  let snapshot: Readonly<{phase: 'loading' | 'ready' | 'blocked'; slots: readonly Slot[]; reason?: string}> = Object.freeze({phase:'loading',slots:[]});
  const listeners = new Set<() => void>();
  let flight: {scope: string; request: string; promise: Promise<unknown>} | undefined;
  let rotating = false, sequence = 0;
  const publish = (registry: Registry) => {
    snapshot = Object.freeze({phase:'ready', slots:Object.freeze(registry.slots.map(s=>Object.freeze({...s})))});
    for (const notify of listeners) { try { notify(); } catch { /* observer cannot interrupt persistence */ } }
  };
  const block = (error: unknown) => {
    dependencies.fence(error);
    snapshot = Object.freeze({...snapshot,phase:'blocked',reason:error instanceof Error ? error.message : 'Finance submission persistence is uncertain.'});
    for (const notify of listeners) { try { notify(); } catch { /* observer */ } }
  };
  const verifiedWrite = async (key: string, value: string) => {
    await backend.setItem(key,value);
    if (await backend.getItem(key) !== value) throw new Error('Finance submission acknowledgement/readback failed.');
  };
  const persist = async (registry: Registry) => { await verifiedWrite(FINANCE_SUBMISSIONS_KEY,JSON.stringify(registry)); publish(registry); };
  const fresh = (scope: string, request: string | null): Slot => ({
    scope, operationId:'submission-'+Date.now().toString(36)+'-'+(++sequence).toString(36)+'-'+Math.random().toString(36).slice(2),
    request, state:request === null ? 'new' : 'open',result:null,
  });
  const allocate = async (scope:string, request:string|null, registry:Registry):Promise<Slot> => {
    for(let attempt=0;attempt<100;attempt++) {
      const slot=fresh(scope,request);
      if(registry.slots.some(s=>s.operationId===slot.operationId))continue;
      if(await backend.getItem(RECEIPT+slot.operationId)!==null || await backend.getItem(ARCHIVE+slot.operationId)!==null)continue;
      return slot;
    }
    throw new Error('Cannot allocate an unused Finance submission identity.');
  };
  const load = async () => { const registry=read(await backend.getItem(FINANCE_SUBMISSIONS_KEY));publish(registry);return registry; };
  const initialize = async () => {
    if (flight || rotating) return;
    try { await load(); } catch(error) { block(error); throw error; }
  };
  const run = <T>(scope: string, payload: unknown, change: (operationId: string) => T): Promise<T> => {
    let request: string;
    try {
      if (!scope.trim() || scope.length > 500) throw new Error('Invalid Finance submission scope.');
      request=financeRequest(payload);
      if (snapshot.phase === 'blocked') throw new Error(snapshot.reason);
      if (rotating) throw new Error('A new Finance submission is being prepared.');
      if (flight) {
        if (flight.scope === scope && flight.request === request) return flight.promise as Promise<T>;
        throw new Error('A different Finance submission is pending; conflicting payloads cannot share identity.');
      }
      dependencies.assertIdle();
    } catch(error) { return Promise.reject(error); }
    let admissionRejection: Error | undefined;
    const promise=Promise.resolve().then(async()=>{
      const registry=await load();
      let slot=registry.slots.find(s=>s.scope===scope);
      if (slot && (slot.state === 'new' || slot.state === 'unchanged')
        && await backend.getItem(RECEIPT+slot.operationId) !== null) {
        throw new Error('Submission state conflicts with retained receipt evidence.');
      }
      if (slot?.state === 'unchanged') slot=undefined; // previous callback produced no financial write/receipt
      if (!slot) {
        const previous=registry.slots.find(s=>s.scope===scope);
        if(previous) {
          const key=ARCHIVE+previous.operationId,raw=JSON.stringify(previous),old=await backend.getItem(key);
          if(old!==null&&old!==raw)throw new Error('Conflicting submission history.');
          await verifiedWrite(key,raw);
        }
        slot=await allocate(scope,request,registry);
        registry.slots=registry.slots.filter(s=>s.scope!==scope).concat(slot);
        await persist(registry); // durable identity precedes the callback, including in-memory financial changes
      } else if (slot.request === null) {
        slot={...slot,request,state:'open'};
        registry.slots=registry.slots.map(s=>s.scope===scope?slot!:s);await persist(registry);
      } else if (slot.request !== request) {
        // Reject the new payload without entering the accounting protocol, but first
        // validate evidence for the retained request. Contradictions/read failures
        // remain global uncertainty and must never be downgraded to a form error.
        const existing = await backend.getItem(RECEIPT+slot.operationId);
        if (existing === null && slot.state === 'completed') {
          throw new Error('Completed submission receipt is missing; no financial callback may run.');
        }
        if (existing !== null) {
          const receipt = readReceipt(existing,slot.operationId,slot.request);
          if (slot.state === 'completed' && (receipt.outcome !== 'completed'
            || financeRequest(receipt.result) !== financeRequest(slot.result))) {
            throw new Error('Completed submission receipt conflicts with retained evidence.');
          }
        }
        if (await backend.getItem(INTENT) !== null) {
          throw new Error('Retained accounting intent requires review before rejecting a conflicting submission.');
        }
        admissionRejection = new Error('Submission payload conflicts with its retained identity. Review the existing result or explicitly start a new independent operation.');
        admissionRejection.name = 'FinanceSubmissionAdmissionError';
        admissionRejections.add(admissionRejection);
        throw admissionRejection;
      }
      if (slot.state==='completed') {
        const existing=await backend.getItem(RECEIPT+slot.operationId);
        if(existing===null)throw new Error('Completed submission receipt is missing; no financial callback may run.');
        const receipt=readReceipt(existing,slot.operationId,request);
        if(receipt.outcome!=='completed'||financeRequest(receipt.result)!==financeRequest(slot.result)) {
          throw new Error('Completed submission receipt conflicts with retained evidence.');
        }
      }
      const value=await dependencies.run(slot.operationId,payload,()=>change(slot!.operationId));
      const receiptRaw=await backend.getItem(RECEIPT+slot.operationId);
      if (receiptRaw !== null) {
        const receipt=readReceipt(receiptRaw,slot.operationId,request);
        if (receipt.outcome!=='completed' || financeRequest(receipt.result)!==financeRequest(value)) throw new Error('Submission result conflicts with its completion receipt.');
      }
      const updated:Slot={...slot,state:receiptRaw===null?'unchanged':'completed',result:value===undefined?null:value};
      registry.slots=registry.slots.map(s=>s.scope===scope?updated:s);await persist(registry);
      return value;
    }).catch(error=>{if (!admissionRejection || error !== admissionRejection) block(error);throw error;}).finally(()=>{flight=undefined;});
    flight={scope,request,promise};return promise;
  };
  const startNew = async (scope:string, expectedCompletedId?: string) => {
    if (!scope.trim() || scope.length > 500) throw new Error('Invalid Finance submission scope.');
    if (flight || rotating) throw new Error('Wait for the pending Finance submission.');
    if (snapshot.phase==='blocked') throw new Error(snapshot.reason);
    dependencies.assertIdle();rotating=true;
    let staleSelection: Error | undefined;
    try {
      const registry=await load(), previous=registry.slots.find(s=>s.scope===scope);
      if (await backend.getItem(INTENT)!==null) throw new Error('Retained accounting intent requires review before a new submission.');
      // A delayed UI confirmation must not rotate a different or already prepared identity.
      if (expectedCompletedId !== undefined && (previous?.operationId !== expectedCompletedId || previous.state !== 'completed')) {
        staleSelection = new Error('The selected saved operation has changed. Review the current form before continuing.');
        throw staleSelection;
      }
      if (previous && (previous.state === 'new' || previous.state === 'unchanged')
        && await backend.getItem(RECEIPT+previous.operationId) !== null) {
        throw new Error('Submission state conflicts with retained receipt evidence.');
      }
      if (previous?.state==='open') {
        const raw=await backend.getItem(RECEIPT+previous.operationId);
        const receipt=raw===null?null:readReceipt(raw,previous.operationId,previous.request!);
        if(receipt?.outcome!=='abandoned') {
          throw new Error('Unresolved submission must be reviewed before starting another.');
        }
      }
      if (previous) {
        if (previous.state==='completed') {
          const raw=await backend.getItem(RECEIPT+previous.operationId);
          if(raw===null)throw new Error('Completed submission receipt is missing.');
          const r=readReceipt(raw,previous.operationId,previous.request!);
          if(r.operationId!==previous.operationId || r.request!==previous.request || r.outcome!=='completed'
            ||financeRequest(r.result)!==financeRequest(previous.result))throw new Error('Completed submission receipt conflicts with retained evidence.');
        }
        const key=ARCHIVE+previous.operationId, raw=JSON.stringify(previous),old=await backend.getItem(key);
        if(old!==null && old!==raw)throw new Error('Conflicting submission history.');
        await verifiedWrite(key,raw);
      }
      const next=await allocate(scope,null,registry);
      registry.slots=registry.slots.filter(s=>s.scope!==scope).concat(next);
      await persist(registry);return next.operationId;
    } catch(error){if (!staleSelection || error !== staleSelection) block(error);throw error;}finally{rotating=false;}
  };
  return {run,startNew,initialize,getSnapshot:()=>snapshot,subscribe:(notify:()=>void)=>{listeners.add(notify);return()=>{listeners.delete(notify);};}};
}

