import type { DocumentRecord } from '../domain/types';

export type DuplicateDecision =
  | { readonly kind: 'new' }
  | { readonly kind: 'duplicate'; readonly existing: DocumentRecord }
  | { readonly kind: 'invalid' };

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Pure decision only. Repository locking and storage safety are handled separately. */
export function decideDocumentDuplicate(
  sha256: unknown,
  existing: readonly DocumentRecord[],
  saveIndependentCopy = false,
): DuplicateDecision {
  if (!isSha256(sha256) || !Array.isArray(existing) || typeof saveIndependentCopy !== 'boolean') {
    return { kind: 'invalid' };
  }
  if (existing.some(record => !record || !isSha256(record.sha256))) {
    return { kind: 'invalid' };
  }
  const match = existing.find(record => record.sha256 === sha256);
  if (match && !saveIndependentCopy) return { kind: 'duplicate', existing: match };
  return { kind: 'new' };
}