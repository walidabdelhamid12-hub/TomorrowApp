import type { DocumentRecord, ExtractionResult } from '../domain/types';

export type ExtractionGate =
  | { readonly ready: false; readonly reason: 'unsupported_file' | 'not_extracted' | 'extraction_failed' | 'needs_review' }
  | { readonly ready: true; readonly result: ExtractionResult };

/**
 * Fail closed: a category or a stored PDF alone never authorizes financial suggestions.
 * Only an explicit, matching, successful extraction with candidates can reach review.
 * This function does not read the PDF, save a draft or post a transaction.
 */
export function evaluateExtractionGate(
  document: DocumentRecord,
  extraction: ExtractionResult | null,
): ExtractionGate {
  if (document.mimeType !== 'application/pdf' || document.status === 'extracting') {
    return { ready: false, reason: 'unsupported_file' };
  }
  if (extraction === null) return { ready: false, reason: 'not_extracted' };
  if (extraction.documentId !== document.id || extraction.outcome === 'failed') {
    return { ready: false, reason: 'extraction_failed' };
  }
  if (extraction.outcome !== 'ok' || extraction.candidates.length === 0) {
    return { ready: false, reason: 'needs_review' };
  }
  if (extraction.candidates.some(candidate =>
    candidate.documentId !== document.id ||
    candidate.paymentStatus !== 'unconfirmed' ||
    candidate.state !== 'pending'
  )) {
    return { ready: false, reason: 'needs_review' };
  }
  return { ready: true, result: extraction };
}
