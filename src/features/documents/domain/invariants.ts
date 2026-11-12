import type { DocumentCategory, DocumentRecord, DocumentStatus, ExtractedField, ImportCandidate, TransactionDraft } from './types';
const categories: readonly DocumentCategory[] = ['receipt', 'invoice', 'bank_statement', 'contract', 'handwritten_note', 'other'];
const transitions: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> = {
  stored: ['extracting', 'in_review'],
  extracting: ['extracted', 'extraction_failed'],
  extracted: ['in_review'],
  extraction_failed: ['extracting', 'in_review'],
  in_review: ['resolved', 'extracting'],
  resolved: ['in_review'],
};
export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
}
export function validateDocument(value: unknown): asserts value is DocumentRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid document');
  const v = value as Record<string, unknown>;
  if (!validId(v.id) || !categories.includes(v.category as DocumentCategory) || typeof v.status !== 'string' || !(v.status in transitions)) throw new Error('Invalid document identity or state');
  if (!['camera', 'gallery', 'picker', 'share'].includes(String(v.source))) throw new Error('Invalid source');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 255 || typeof v.mimeType !== 'string' || !v.mimeType.trim()) throw new Error('Invalid file metadata');
  if (!Number.isSafeInteger(v.byteSize) || (v.byteSize as number) < 0) throw new Error('Invalid byte size');
  if (typeof v.vaultPath !== 'string' || !v.vaultPath.trim() || v.vaultPath.startsWith('/') || v.vaultPath.split(/[\\/]/).includes('..')) throw new Error('Unsafe vault path');
  if (v.sha256 !== null && (typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256))) throw new Error('Invalid fingerprint');
  for (const key of ['createdAt', 'updatedAt']) {
    const stamp = v[key];
    if (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp) throw new Error('Invalid timestamp');
  }
  if ((v.updatedAt as string) < (v.createdAt as string)) throw new Error('Invalid timestamp order');
}
export function transitionDocument(record: DocumentRecord, next: DocumentStatus, at: string): DocumentRecord {
  validateDocument(record);
  if (!transitions[record.status].includes(next)) throw new Error('Forbidden document transition');
  const changed = { ...record, status: next, updatedAt: at };
  validateDocument(changed);
  return changed;
}
export function validateExtractedField<T>(field: ExtractedField<T>): void {
  if (!field || !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1 || typeof field.needsReview !== 'boolean') throw new Error('Invalid extracted field');
}
export function createUnconfirmedDraft(candidate: ImportCandidate): TransactionDraft {
  if (!validId(candidate.id) || !validId(candidate.documentId) || candidate.paymentStatus !== 'unconfirmed' || candidate.state !== 'approved_for_draft') throw new Error('Candidate is not approved for draft');
  for (const field of [candidate.date, candidate.amountRaw, candidate.currencyCode, candidate.merchant, candidate.description]) validateExtractedField(field);
  return Object.freeze({ postingAllowed: false as const, paymentStatus: 'unconfirmed' as const, sourceDocumentId: candidate.documentId, sourceCandidateId: candidate.id });
}
