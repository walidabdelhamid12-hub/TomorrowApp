import type { DocumentCategory, DocumentRecord, DocumentSource } from '../domain/types';
import { validId, validateDocument } from '../domain/invariants';
import { extensionForMime, objectPath, SHA256_PATTERN } from '../vault/vaultPaths';
import type { VaultStoreInput, VaultStoreResult } from '../vault/vaultTypes';
import type { DocumentStorageResult } from '../storage/documentRepository';

type RepositoryOutcome = { readonly kind: 'created' | 'duplicate'; readonly record: DocumentRecord };
export interface ImportDocumentDependencies {
  readonly vault: { store(input: VaultStoreInput): Promise<VaultStoreResult> };
  readonly repository: {
    createIfHashAbsent(record: DocumentRecord, saveIndependentCopy?: boolean): Promise<DocumentStorageResult<RepositoryOutcome>>;
  };
}
export interface ImportDocumentInput {
  readonly id: string;
  readonly sourceUri: string;
  readonly category: DocumentCategory;
  readonly source: DocumentSource;
  readonly name: string;
  readonly declaredMime: string;
  readonly createdAt: string;
  readonly saveIndependentCopy?: boolean;
}
export type ImportDocumentResult =
  | { readonly ok: true; readonly kind: 'created' | 'duplicate'; readonly record: DocumentRecord;
      readonly vaultOutcome: 'stored' | 'duplicate'; readonly leftoverStageRelPath?: string }
  | { readonly ok: false; readonly code: 'invalid_input' | 'vault_failed' | 'repository_failed';
      readonly detail?: string; readonly evidence?: {
        readonly sha256: string; readonly byteSize: number; readonly objectRelPath: string;
        readonly leftoverStageRelPath?: string; readonly attemptedRecordId: string;
      } };

const categories: readonly string[] = ['receipt', 'invoice', 'bank_statement', 'contract', 'handwritten_note', 'other'];
const sources: readonly string[] = ['camera', 'gallery', 'picker', 'share'];
function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function validInput(input: ImportDocumentInput): boolean {
  return !!input && validId(input.id) && categories.includes(input.category) && sources.includes(input.source) &&
    typeof input.sourceUri === 'string' && /^(file|content):\/\//.test(input.sourceUri) &&
    typeof input.name === 'string' && !!input.name.trim() && input.name.length <= 255 &&
    typeof input.declaredMime === 'string' && extensionForMime(input.declaredMime) !== null &&
    validTimestamp(input.createdAt) &&
    (input.saveIndependentCopy === undefined || typeof input.saveIndependentCopy === 'boolean');
}

/** Does not delete staged files, recover pending metadata, or post Finance transactions. */
export function createDocumentImporter(deps: ImportDocumentDependencies) {
  return {
    async importDocument(input: ImportDocumentInput): Promise<ImportDocumentResult> {
      if (!validInput(input)) return { ok: false, code: 'invalid_input' };
      let result: VaultStoreResult;
      try { result = await deps.vault.store({ sourceUri: input.sourceUri, declaredMime: input.declaredMime }); }
      catch { return { ok: false, code: 'vault_failed', detail: 'exception' }; }
      if (!result.ok) return { ok: false, code: 'vault_failed', detail: result.code };
      const evidence = {
        sha256: result.sha256, byteSize: result.byteSize, objectRelPath: result.objectRelPath,
        leftoverStageRelPath: result.leftoverStageRelPath, attemptedRecordId: input.id,
      };
      // Fail closed even if a custom vault implementation returns an inconsistent success result.
      if (!result.verified || !SHA256_PATTERN.test(result.sha256) ||
          !Number.isSafeInteger(result.byteSize) || result.byteSize <= 0 ||
          result.objectRelPath !== objectPath(result.sha256, input.declaredMime)) {
        return { ok: false, code: 'vault_failed', detail: 'invalid_vault_result' };
      }
      const record: DocumentRecord = {
        id: input.id, category: input.category, status: 'stored', source: input.source,
        name: input.name, mimeType: input.declaredMime, byteSize: result.byteSize,
        vaultPath: result.objectRelPath, sha256: result.sha256,
        createdAt: input.createdAt, updatedAt: input.createdAt,
      };
      try { validateDocument(record); }
      catch { return { ok: false, code: 'repository_failed', detail: 'invalid_record', evidence }; }
      let stored: DocumentStorageResult<RepositoryOutcome>;
      try { stored = await deps.repository.createIfHashAbsent(record, input.saveIndependentCopy ?? false); }
      catch { return { ok: false, code: 'repository_failed', detail: 'exception', evidence }; }
      if (!stored.ok) return { ok: false, code: 'repository_failed', detail: stored.error, evidence };
      if (stored.value.kind !== 'created' && stored.value.kind !== 'duplicate')
        return { ok: false, code: 'repository_failed', detail: 'invalid_result', evidence };
      try {
        validateDocument(stored.value.record);
        if (stored.value.record.sha256 !== result.sha256 || stored.value.record.vaultPath !== result.objectRelPath ||
            stored.value.record.byteSize !== result.byteSize || stored.value.record.mimeType !== input.declaredMime ||
            (stored.value.kind === 'created' && stored.value.record.id !== input.id))
          throw new Error('Inconsistent repository result');
      } catch { return { ok: false, code: 'repository_failed', detail: 'invalid_result', evidence }; }
      return { ok: true, kind: stored.value.kind, record: stored.value.record,
        vaultOutcome: result.outcome, leftoverStageRelPath: result.leftoverStageRelPath };
    },
  };
}
