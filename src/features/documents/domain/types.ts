export type DocumentCategory = 'receipt' | 'invoice' | 'bank_statement' | 'contract' | 'handwritten_note' | 'other';
export type DocumentStatus = 'stored' | 'extracting' | 'extracted' | 'extraction_failed' | 'in_review' | 'resolved';
export type DocumentSource = 'camera' | 'gallery' | 'picker' | 'share';
export interface DocumentRecord {
  readonly id: string;
  readonly category: DocumentCategory;
  readonly status: DocumentStatus;
  readonly source: DocumentSource;
  readonly name: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly vaultPath: string;
  readonly sha256: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ExtractedField<T> {
  readonly value: T | null;
  readonly confidence: number;
  readonly needsReview: boolean;
  readonly raw?: string;
  readonly userOverride?: T;
}
export interface ImportCandidate {
  readonly id: string;
  readonly documentId: string;
  readonly date: ExtractedField<string>;
  readonly amountRaw: ExtractedField<string>;
  readonly currencyCode: ExtractedField<string>;
  readonly merchant: ExtractedField<string>;
  readonly description: ExtractedField<string>;
  readonly paymentStatus: 'unconfirmed';
  readonly state: 'pending' | 'approved_for_draft' | 'rejected' | 'link_only';
}
export interface ExtractionResult {
  readonly documentId: string;
  readonly engine: string;
  readonly outcome: 'ok' | 'partial' | 'failed';
  readonly candidates: readonly ImportCandidate[];
  readonly errorCode?: string;
}
export interface DocumentLink {
  readonly id: string;
  readonly documentId: string;
  readonly candidateId?: string;
  readonly financeTransactionId: string;
  readonly createdAt: string;
  readonly createdBy: 'user';
}
export interface TransactionDraft {
  readonly postingAllowed: false;
  readonly paymentStatus: 'unconfirmed';
  readonly sourceDocumentId: string;
  readonly sourceCandidateId: string;
}
