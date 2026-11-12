import type { DocumentRecord } from '../domain/types';
import { validateDocument, validId } from '../domain/invariants';

export const DOCUMENTS_NAMESPACE = 'tomorrow:documents:v1:';
const key = (id: string) => `${DOCUMENTS_NAMESPACE}record:${id}`;
const indexKey = `${DOCUMENTS_NAMESPACE}index`;
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
    try { validateDocument(input); } catch { return { ok: false, error: 'invalid_data' }; }
    return exclusive(backend, async () => {
      try {
        const ids = parseIndex(await backend.getItem(indexKey));
        if (ids.includes(input.id) || await backend.getItem(key(input.id)) !== null) return { ok: false, error: 'duplicate' } as const;
        // Record first: index is written only after the record has been read-back verified.
        const serialized = JSON.stringify(input);
        await backend.setItem(key(input.id), serialized);
        if (await backend.getItem(key(input.id)) !== serialized) return { ok: false, error: 'storage_error' } as const;
        await backend.setItem(indexKey, JSON.stringify([...ids, input.id]));
        if (await backend.getItem(indexKey) !== JSON.stringify([...ids, input.id])) return { ok: false, error: 'storage_error' } as const;
        return { ok: true, value: input } as const;
      } catch { return { ok: false, error: 'storage_error' } as const; }
    });
  }
  async function update(input: DocumentRecord, expectedUpdatedAt: string): Promise<DocumentStorageResult<DocumentRecord>> {
    try { validateDocument(input); } catch { return { ok: false, error: 'invalid_data' }; }
    return exclusive(backend, async () => {
      try {
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
  return { read, list, create, update };
}
