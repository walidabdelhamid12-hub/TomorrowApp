/** A verified vault object is NOT a registered DocumentRecord. */
export type VaultErrorCode =
  | 'invalid_input' | 'source_missing' | 'source_empty' | 'size_exceeded'
  | 'copy_failed' | 'size_mismatch' | 'hash_failed' | 'hash_mismatch'
  | 'integrity_conflict' | 'promote_failed' | 'verify_failed';

export type VaultStoreResult =
  | { readonly ok: true; readonly outcome: 'stored' | 'duplicate'; readonly verified: true;
      readonly sha256: string; readonly byteSize: number; readonly objectRelPath: string;
      readonly leftoverStageRelPath?: string }
  | { readonly ok: false; readonly code: VaultErrorCode; readonly stagedRelPath?: string };

export interface VaultStoreInput {
  readonly sourceUri: string;
  /** Allowed values: application/pdf, image/jpeg, image/png, image/webp. */
  readonly declaredMime: string;
}
