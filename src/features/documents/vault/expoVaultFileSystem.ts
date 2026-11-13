import { File, Paths } from 'expo-file-system';
import type { VaultFileSystemPort } from './vaultFileSystem';
import { isSafeVaultRelativePath } from './vaultPaths';

function vaultFile(relativePath: string): File {
  if (!isSafeVaultRelativePath(relativePath)) {
    throw new Error('Invalid vault-relative path');
  }
  return new File(Paths.document, ...relativePath.split('/'));
}

function sourceFile(uri: string): File {
  if (typeof uri !== 'string' || !/^(file|content):\/\//.test(uri)) {
    throw new Error('Invalid source URI');
  }
  return new File(uri);
}

function readableSize(file: File): number {
  if (!file.exists) throw new Error('File missing or inaccessible');
  const size = file.size;
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error('Invalid file size');
  }
  return size;
}

/** No delete capability; destination operations explicitly reject overwrite. */
export function createExpoVaultFileSystem(): VaultFileSystemPort {
  return {
    async sourceExists(uri) {
      return sourceFile(uri).exists;
    },
    async sourceSize(uri) {
      return readableSize(sourceFile(uri));
    },
    async exists(path) {
      return vaultFile(path).exists;
    },
    async size(path) {
      return readableSize(vaultFile(path));
    },
    async digestSha256(path) {
      const file = vaultFile(path);
      if (!file.exists) throw new Error('File missing');
      return (await file.digest('SHA-256')).toLowerCase();
    },
    async ensureParentDirectory(path) {
      const parent = vaultFile(path).parentDirectory;
      parent.create({ idempotent: true, intermediates: true });
    },
    async copySourceNoOverwrite(uri, destinationPath) {
      const source = sourceFile(uri);
      const destination = vaultFile(destinationPath);
      if (destination.exists) throw new Error('Destination exists');
      await source.copy(destination, { overwrite: false });
    },
    async moveNoOverwrite(fromPath, toPath) {
      const source = vaultFile(fromPath);
      const destination = vaultFile(toPath);
      if (destination.exists) throw new Error('Destination exists');
      await source.move(destination, { overwrite: false });
    },
  };
}