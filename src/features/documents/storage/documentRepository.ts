import type { DocumentRecord } from '../domain/types';
import { validateDocument, validId } from '../domain/invariants';

export const DOCUMENTS_NAMESPACE = 'tomorrow:documents:v1:';
const key = (id: string) => `${DOCUMENTS_NAMESPACE}record:${id}`;
const indexKey = `${DOCUMENTS_NAMESPACE}index`;
const pendingKey = DOCUMENTS_NAMESPACE + 'pending-import';
interface PendingImport {
  readonly version: 1;
  readonly mode: 'create' | 'hash';
  readonly record: DocumentRecord;
  readonly saveIndependentCopy: boolean;
}
function parsePending(raw: string | null): PendingImport | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid pending import');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'mode,record,saveIndependentCopy,version' ||
      v.version !== 1 || !['create', 'hash'].includes(String(v.mode)) ||
      typeof v.saveIndependentCopy !== 'boolean') throw new Error('Invalid pending import');
  validateDocument(v.record);
  if ((v.mode === 'hash' && !v.record.sha256) || (v.mode === 'create' && v.saveIndependentCopy))
    throw new Error('Invalid pending intent');
  return value as PendingImport;
}
function sameRecord(a: DocumentRecord, b: DocumentRecord): boolean {
  const fields = ['id', 'category', 'status', 'source', 'name', 'mimeType', 'byteSize', 'vaultPath', 'sha256', 'createdAt', 'updatedAt'] as const;
  return fields.every(field => a[field] === b[field]);
}
export interface DocumentStorageBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export type DocumentStorageResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: 'invalid_data' | 'duplicate' | 'not_found' | 'conflict' | 'storage_error'; };
const queues = new WeakMap<DocumentStorageBackend, Promise<unknown>>();
function exclusive<T>(backend: DocumentStorageBackend, operation: () => Promise<T>): Promise<T> {
  const task = (queues.get(backend) ?? Promise.resolve()).then(operation);
  queues.set(backend, task.catch(() => undefined));
  return task;
}
function parseIndex(raw: string | null): string[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(x => !validId(x)) || new Set(value).size !== value.length) throw new Error('Invalid index');
  return value;
}
function parseRecord(raw: string | null): DocumentRecord | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  validateDocument(value);
  return value;
}
/** Lazy, document-only metadata store. Never touches Finance keys or writes on construction. */
export function createDocumentRepository(backend: DocumentStorageBackend) {
  async function verifiedWrite(storageKey: string, serialized: string): Promise<void> {
    // A throw may follow a committed write. Leave durable evidence for explicit recovery.
    await backend.setItem(storageKey, serialized);
    if (await backend.getItem(storageKey) !== serialized) throw new Error('Write verification failed');
  }
  async function persist(input: DocumentRecord, ids: string[], mode: PendingImport['mode'], saveIndependentCopy: boolean): Promise<void> {
    await verifiedWrite(pendingKey, JSON.stringify({ version: 1, mode, record: input, saveIndependentCopy }));
    await verifiedWrite(key(input.id), JSON.stringify(input));
    await verifiedWrite(indexKey, JSON.stringify([...ids, input.id]));
    await verifiedWrite(pendingKey, 'null');
  }
  async function read(id: string): Promise<DocumentStorageResult<DocumentRecord | null>> {
    if (!validId(id)) return { ok: false, error: 'invalid_data' };
    try { return { ok: true, value: parseRecord(await backend.getItem(key(id))) }; }
    catch { return { ok: false, error: 'storage_error' }; }
  }
  async function list(): Promise<DocumentStorageResult<readonly DocumentRecord[]>> {
    try {
      const ids = parseIndex(await backend.getItem(indexKey));
      const records: DocumentRecord[] = [];
      for (const id of ids) {
        const record = parseRecord(await backend.getItem(key(id)));
        if (!record || record.id !== id) throw new Error('Inconsistent document index');
        records.push(record);
      }
      return { ok: true, value: records };
    } catch { return { ok: false, error: 'storage_error' }; }
  }
  async function create(input: DocumentRecord): Promise<DocumentStorageResult<DocumentRecord>> {
    try { validateDocument(input); input = JSON.parse(JSON.stringify(input)); validateDocument(input); } catch { return { ok: false, error: 'invalid_data' }; }
    return exclusive(backend, async () => {
      try {
        if (parsePending(await backend.getItem(pendingKey))) return { ok: false, error: 'storage_error' } as const;
        const ids = parseIndex(await backend.getItem(indexKey));
        if (ids.includes(input.id) || await backend.getItem(key(input.id)) !== null) return { ok: false, error: 'duplicate' } as const;
        await persist(input, ids, 'create', false);
        return { ok: true, value: input } as const;
      } catch { return { ok: false, error: 'storage_error' } as const; }
    });
  }
  async function update(input: DocumentRecord, expectedUpdatedAt: string): Promise<DocumentStorageResult<DocumentRecord>> {
    try { validateDocument(input); input = JSON.parse(JSON.stringify(input)); validateDocument(input); } catch { return { ok: false, error: 'invalid_data' }; }
    return exclusive(backend, async () => {
      try {
        if (parsePending(await backend.getItem(pendingKey))) return { ok: false, error: 'storage_error' } as const;
        const ids = parseIndex(await backend.getItem(indexKey));
        if (!ids.includes(input.id)) return { ok: false, error: 'not_found' } as const;
        const previous = parseRecord(await backend.getItem(key(input.id)));
        if (!previous) return { ok: false, error: 'not_found' } as const;
        if (previous.updatedAt !== expectedUpdatedAt || input.updatedAt <= previous.updatedAt) return { ok: false, error: 'conflict' } as const;
        if (previous.vaultPath !== input.vaultPath || previous.sha256 !== input.sha256 || previous.createdAt !== input.createdAt || previous.byteSize !== input.byteSize || previous.mimeType !== input.mimeType) return { ok: false, error: 'invalid_data' } as const;
        const serialized = JSON.stringify(input);
        await backend.setItem(key(input.id), serialized);
        if (await backend.getItem(key(input.id)) !== serialized) return { ok: false, error: 'storage_error' } as const;
        return { ok: true, value: input } as const;
      } catch { return { ok: false, error: 'storage_error' } as const; }
    });
  }
  /** Atomically checks known hashes and creates metadata within the shared backend queue. */
  async function createIfHashAbsent(input: DocumentRecord, saveIndependentCopy = false): Promise<
    DocumentStorageResult<{ readonly kind: 'created'; readonly record: DocumentRecord } | { readonly kind: 'duplicate'; readonly record: DocumentRecord }>
  > {
    try {
      validateDocument(input);
      input = JSON.parse(JSON.stringify(input));
      validateDocument(input);
      if (typeof saveIndependentCopy !== 'boolean' || !input.sha256 || !/^[a-f0-9]{64}$/.test(input.sha256))
        return { ok: false, error: 'invalid_data' };
    } catch { return { ok: false, error: 'invalid_data' }; }
    return exclusive(backend, async () => {
      try {
        if (parsePending(await backend.getItem(pendingKey))) return { ok: false, error: 'storage_error' } as const;
        const ids = parseIndex(await backend.getItem(indexKey));
        const records: DocumentRecord[] = [];
        for (const id of ids) {
          const record = parseRecord(await backend.getItem(key(id)));
          if (!record || record.id !== id || !record.sha256 || !/^[a-f0-9]{64}$/.test(record.sha256))
            return { ok: false, error: 'storage_error' } as const;
          records.push(record);
        }
        const match = records.find(record => record.sha256 === input.sha256);
        if (match && !saveIndependentCopy)
          return { ok: true, value: { kind: 'duplicate', record: match } } as const;
        if (ids.includes(input.id) || await backend.getItem(key(input.id)) !== null)
          return { ok: false, error: 'duplicate' } as const;
        await persist(input, ids, 'hash', saveIndependentCopy);
        return { ok: true, value: { kind: 'created', record: input } } as const;
      } catch { return { ok: false, error: 'storage_error' } as const; }
    });
  }
  /** Explicit, ID-scoped recovery only. Never scans or deletes unrelated metadata. */
  async function recoverUnindexed(id: string): Promise<DocumentStorageResult<DocumentRecord>> {
    if (!validId(id)) return { ok: false, error: 'invalid_data' };
    return exclusive(backend, async () => {
      try {
        const pending = parsePending(await backend.getItem(pendingKey));
        if (pending && pending.record.id !== id) return { ok: false, error: 'conflict' } as const;
        const ids = parseIndex(await backend.getItem(indexKey));
        const record = parseRecord(await backend.getItem(key(id)));
        if (!record) return { ok: false, error: pending ? 'storage_error' : 'not_found' } as const;
        if (record.id !== id || (pending && !sameRecord(record, pending.record)))
          return { ok: false, error: 'storage_error' } as const;
        // Ordinary create preserves its existing nullable-hash and ID-only semantics.
        const hashChecked = pending ? pending.mode === 'hash' : !ids.includes(id);
        if (hashChecked && !record.sha256) return { ok: false, error: 'storage_error' } as const;
        for (const indexedId of ids) {
          const indexed = parseRecord(await backend.getItem(key(indexedId)));
          if (!indexed || indexed.id !== indexedId || (hashChecked && !indexed.sha256))
            return { ok: false, error: 'storage_error' } as const;
          if (indexedId !== id && hashChecked && indexed.sha256 === record.sha256 && !pending?.saveIndependentCopy)
            return { ok: false, error: 'duplicate' } as const;
        }
        if (!ids.includes(id)) await verifiedWrite(indexKey, JSON.stringify([...ids, id]));
        // Already indexed is a verified, idempotent completion (including clear-then-throw).
        if (pending) await verifiedWrite(pendingKey, 'null');
        return { ok: true, value: record } as const;
      } catch { return { ok: false, error: 'storage_error' } as const; }
    });
  }
  return { read, list, create, update, createIfHashAbsent, recoverUnindexed };
}
