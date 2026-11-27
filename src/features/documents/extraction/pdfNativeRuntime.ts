import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getTomorrowPdfExtractor } from '../../../../modules/tomorrow-pdf-extractor/src';
import { createPdfTextAdapter, type PdfTextExtractionResult } from './pdfTextAdapter';
import { readNativePdf, type NativePdfPort, type NativeReview, type PdfIdentity } from './pdfNativeEvidence';

const MAX_BYTES = 1024 * 1024;
const ENGINE = 'PDFBox native layout (unverified)';
export type NativePdfReadResult = Extract<PdfTextExtractionResult, { ok: false }> |
  (Extract<PdfTextExtractionResult, { ok: true }> & { review: NativeReview });

/** Bounded fallback for Android devices that deny the arrayBuffer read path. */
function decodeCachedBase64(value: string, size: number): Uint8Array {
  if (value.length !== Math.ceil(size / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid cached PDF base64');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const pad = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  if (value.length / 4 * 3 - pad !== size) throw new Error('Cached PDF base64 size mismatch');
  const out = new Uint8Array(size);
  let offset = 0;
  for (let i = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value[i]);
    const b = alphabet.indexOf(value[i + 1]);
    const c = value[i + 2] === '=' ? 0 : alphabet.indexOf(value[i + 2]);
    const d = value[i + 3] === '=' ? 0 : alphabet.indexOf(value[i + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('Invalid cached PDF encoding');
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < size) out[offset++] = (bits >>> 16) & 255;
    if (offset < size) out[offset++] = (bits >>> 8) & 255;
    if (offset < size) out[offset++] = bits & 255;
  }
  return out;
}

/** Stage only a fresh private cache directory; never delete or modify the vault original. */
export async function stagePdfForReader(uri: string): ReturnType<NativePdfPort['stage']> {
  if (!/^file:\/\/\//.test(uri)) throw new Error('Local PDF required');
  const source = new File(uri);
  const size = source.size;
  if (!source.exists || !Number.isSafeInteger(size) || size < 5 || size > MAX_BYTES) throw new Error('Missing or over-limit PDF');
  const directory = new Directory(Paths.cache, `tomorrow-pdf-reader-${Crypto.randomUUID()}`);
  if (directory.exists) throw new Error('PDF cache collision');
  directory.create({ idempotent: false, intermediates: false });
  const dispose = async () => { if (directory.exists) directory.delete(); };
  try {
    const destination = new File(directory, 'document.pdf');
    await source.copy(destination, { overwrite: false });
    if (!destination.exists || destination.size !== size) throw new Error('Cached PDF size mismatch');
    const bytes = await (async () => {
      try { return new Uint8Array(await destination.arrayBuffer()); }
      catch { return decodeCachedBase64(await destination.base64(), size); }
    })();
    if (bytes.byteLength !== size || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) throw new Error('Invalid cached PDF bytes');
    // Copy the exact validated byte range into an owned ArrayBuffer (TS 6 BufferSource).
    const digestInput = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(digestInput).set(bytes);
    const digest = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, digestInput));
    if (digest.length !== 32) throw new Error('Invalid SHA-256 digest');
    return { uri: destination.uri, identity: { bytes: size, sha256: Array.from(digest, b => b.toString(16).padStart(2, '0')).join('') }, dispose };
  } catch (error) { await dispose(); throw error; }
}

export function resolveNativePdfPort(): NativePdfPort | null {
  if (Platform.OS !== 'android') return null;
  const native = getTomorrowPdfExtractor();
  return native ? { stage: stagePdfForReader, extractReaderLayout: uri => native.extractReaderLayout(uri) } : null;
}

/** Reuses the existing adapter; the evidence is read-only and remains in memory. */
export async function readPdfWithNativeRuntime(uri: string, expected: PdfIdentity, suppliedPort?: NativePdfPort | null): Promise<NativePdfReadResult> {
  try {
    const port = suppliedPort === undefined ? resolveNativePdfPort() : suppliedPort;
    const adapter = createPdfTextAdapter(port ? {
      id: ENGINE,
      supports: async input => /^file:\/\/\//.test(input),
      extract: async input => {
        const review = await readNativePdf(input, expected, port);
        return { ok: true, engine: ENGINE, text: review.text, pageCount: review.evidence.pageCount, review };
      },
    } : null);
    const result = await adapter.extract(uri);
    if (!result.ok) return result;
    if (!('review' in result)) return { ok: false, reason: 'engine_error' };
    return result as Extract<NativePdfReadResult, { ok: true }>;
  } catch { return { ok: false, reason: 'engine_error' }; }
}
