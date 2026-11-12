/** All paths except sourceUri are vault-relative. No delete capability by design. */
export interface VaultFileSystemPort {
  sourceExists(sourceUri: string): Promise<boolean>;
  sourceSize(sourceUri: string): Promise<number>;
  exists(relativePath: string): Promise<boolean>;
  size(relativePath: string): Promise<number>;
  digestSha256(relativePath: string): Promise<string>;
  ensureParentDirectory(relativePath: string): Promise<void>;
  copySourceNoOverwrite(sourceUri: string, destinationRelativePath: string): Promise<void>;
  moveNoOverwrite(fromRelativePath: string, toRelativePath: string): Promise<void>;
}
