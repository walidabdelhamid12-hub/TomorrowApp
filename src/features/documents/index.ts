export type { DocumentCategory, DocumentStatus, DocumentRecord, DocumentSource, ExtractedField, ImportCandidate, ExtractionResult, DocumentLink, TransactionDraft } from './domain/types';
export { createUnconfirmedDraft, transitionDocument, validateDocument, validateExtractedField } from './domain/invariants';
export { createDocumentRepository, DOCUMENTS_NAMESPACE } from './storage/documentRepository';
export type { DocumentStorageBackend, DocumentStorageResult } from './storage/documentRepository';
