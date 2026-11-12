import type { VaultFileSystemPort } from './vaultFileSystem';
import { extensionForMime, objectPath, SHA256_PATTERN, stagingPath } from './vaultPaths';
import type { VaultStoreInput, VaultStoreResult } from './vaultTypes';

export interface LocalFileVaultOptions {
  readonly maxBytes: number;
  /** Supply a UUID v4 or equivalent UUID. Production adapter must use a secure generator. */
  readonly nextStageId: () => string;
}

/** Serializes operations sharing this loaded JS module, not other runtimes/processes. */
let pending: Promise<void> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const operation = pending.then(work, work);
  pending = operation.then(() => undefined, () => undefined);
  return operation;
}

export function createLocalFileVault(fs: VaultFileSystemPort, options: LocalFileVaultOptions) {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) throw new Error('Invalid maxBytes');
  return {
    store(input: VaultStoreInput): Promise<VaultStoreResult> {
      return serialized(async () => {
        if (!input || typeof input.sourceUri !== 'string' || !input.sourceUri.trim() ||
            !/^(file|content):\/\//.test(input.sourceUri) ||
            typeof input.declaredMime !== 'string' || !extensionForMime(input.declaredMime)) {
          return { ok: false, code: 'invalid_input' };
        }
        let stage: string;
        try { stage = stagingPath(options.nextStageId()); }
        catch { return { ok: false, code: 'invalid_input' }; }
        let expectedSize: number;
        try {
          if (!(await fs.sourceExists(input.sourceUri))) return { ok: false, code: 'source_missing' };
          expectedSize = await fs.sourceSize(input.sourceUri);
        } catch { return { ok: false, code: 'source_missing' }; }
        if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) return { ok: false, code: 'source_empty' };
        if (expectedSize > options.maxBytes) return { ok: false, code: 'size_exceeded' };
        try {
          await fs.ensureParentDirectory(stage);
          await fs.copySourceNoOverwrite(input.sourceUri, stage);
        } catch { return { ok: false, code: 'copy_failed', stagedRelPath: stage }; }
        try {
          if (!(await fs.exists(stage)) || await fs.size(stage) !== expectedSize)
            return { ok: false, code: 'size_mismatch', stagedRelPath: stage };
        } catch { return { ok: false, code: 'size_mismatch', stagedRelPath: stage }; }
        let hash: string;
        try { hash = await fs.digestSha256(stage); }
        catch { return { ok: false, code: 'hash_failed', stagedRelPath: stage }; }
        if (!SHA256_PATTERN.test(hash)) return { ok: false, code: 'hash_failed', stagedRelPath: stage };
        const target = objectPath(hash, input.declaredMime);
        // A pre-check is only a hint; the adapter must enforce no-overwrite itself.
        let targetExists: boolean;
        try { targetExists = await fs.exists(target); }
        catch { return { ok: false, code: 'verify_failed', stagedRelPath: stage }; }
        if (targetExists) {
          try {
            const actualSize = await fs.size(target);
            const actualHash = await fs.digestSha256(target);
            if (actualSize !== expectedSize || actualHash !== hash)
              return { ok: false, code: 'integrity_conflict', stagedRelPath: stage };
            return { ok: true, outcome: 'duplicate', verified: true, sha256: hash,
              byteSize: expectedSize, objectRelPath: target, leftoverStageRelPath: stage };
          } catch { return { ok: false, code: 'verify_failed', stagedRelPath: stage }; }
        }
        try {
          await fs.ensureParentDirectory(target);
          await fs.moveNoOverwrite(stage, target);
          if (await fs.exists(stage)) return { ok: false, code: 'promote_failed', stagedRelPath: stage };
        } catch { return { ok: false, code: 'promote_failed', stagedRelPath: stage }; }
        try {
          if (!(await fs.exists(target)) || await fs.size(target) !== expectedSize ||
              await fs.digestSha256(target) !== hash)
            return { ok: false, code: 'verify_failed', stagedRelPath: stage };
        } catch { return { ok: false, code: 'verify_failed', stagedRelPath: stage }; }
        return { ok: true, outcome: 'stored', verified: true, sha256: hash,
          byteSize: expectedSize, objectRelPath: target };
      });
    },
  };
}
