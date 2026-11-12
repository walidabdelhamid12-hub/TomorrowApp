export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STAGE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

const MIME_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

export function extensionForMime(mime: string): string | null {
  return Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS, mime) ? MIME_EXTENSIONS[mime] : null;
}

export function stagingPath(id: string): string {
  if (!STAGE_ID_PATTERN.test(id)) throw new Error('Invalid staging identifier');
  return `vault/staging/${id}.part`;
}

export function objectPath(sha256: string, mime: string): string {
  if (!SHA256_PATTERN.test(sha256)) throw new Error('Invalid SHA-256');
  const ext = extensionForMime(mime);
  if (!ext) throw new Error('Unsupported MIME type');
  return `vault/objects/${sha256.slice(0, 2)}/${sha256}.${ext}`;
}

export function isSafeVaultRelativePath(path: string): boolean {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('%') || path.includes('\0')) return false;
  return /^vault\/staging\/[a-f0-9-]+\.part$/.test(path) && (() => {
    try { return stagingPath(path.slice('vault/staging/'.length, -'.part'.length)) === path; }
    catch { return false; }
  })() || /^vault\/objects\/[a-f0-9]{2}\/[a-f0-9]{64}\.(pdf|jpg|png|webp)$/.test(path) && (() => {
    const match = /^vault\/objects\/([a-f0-9]{2})\/([a-f0-9]{64})\.(pdf|jpg|png|webp)$/.exec(path);
    return !!match && match[1] === match[2].slice(0, 2);
  })();
}
