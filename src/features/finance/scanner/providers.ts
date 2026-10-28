import { isValidISODate } from '@/utils/input';
import { parseDocumentText } from './parseDocumentText';
import type { ScanInput, ScanProvider, ScanResult } from './types';

/**
 * Your own backend that does the actual OCR. It receives
 *   { mimeType, name, data }  (data = base64)
 * and answers with raw text and/or fields:
 *   { text?, amount?, date?, currencyCode?, merchant? }
 * Keep any API key on that server. Never put secrets in EXPO_PUBLIC_* variables.
 */
const ENDPOINT = process.env.EXPO_PUBLIC_OCR_ENDPOINT;

const TIMEOUT_MS = 30000;

function normalizeRemote(json: unknown): ScanResult {
  if (typeof json !== 'object' || json === null) {
    throw new Error('The scanner service returned an unexpected answer.');
  }
  const data = json as Record<string, unknown>;

  const fromText =
    typeof data.text === 'string' ? parseDocumentText(data.text) : {};
  const result: ScanResult = { ...fromText };

  if (typeof data.amount === 'number' && data.amount > 0) {
    result.amount = data.amount;
  }
  if (typeof data.date === 'string' && isValidISODate(data.date)) {
    result.date = data.date;
  }
  if (typeof data.currencyCode === 'string') {
    result.currencyCode = data.currencyCode.toUpperCase();
  }
  if (typeof data.merchant === 'string') result.merchant = data.merchant;
  return result;
}

function createRemoteProvider(url: string): ScanProvider {
  return {
    name: 'remote',
    async extract(input: ScanInput): Promise<ScanResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mimeType: input.mimeType,
            name: input.name,
            data: input.base64,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Scanner service error (HTTP ${response.status}).`);
        }
        return normalizeRemote(await response.json());
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('The scanner took too long. Try again.');
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Returns null until an OCR endpoint is configured. */
export function getScanProvider(): ScanProvider | null {
  return ENDPOINT ? createRemoteProvider(ENDPOINT) : null;
}