/**
 * Engine-neutral PDF text extraction boundary.
 * No native modules, network calls, storage writes, or financial posting.
 * A concrete engine must be explicitly installed and verified separately.
 */
export type PdfTextExtractionResult =
  | { readonly ok: true; readonly text: string; readonly pageCount: number; readonly engine: string }
  | { readonly ok: false; readonly reason: 'unavailable' | 'unsupported' | 'unreadable' | 'empty_text' | 'engine_error' };

export interface PdfTextEngine {
  readonly id: string;
  readonly supports: (uri: string) => Promise<boolean>;
  readonly extract: (uri: string) => Promise<PdfTextExtractionResult>;
}

export interface PdfTextAdapter {
  readonly extract: (uri: string) => Promise<PdfTextExtractionResult>;
}

const MAX_TEXT_LENGTH = 250_000;
const MAX_PAGE_COUNT = 1000;

export function createPdfTextAdapter(engine: PdfTextEngine | null): PdfTextAdapter {
  return {
    async extract(uri: string): Promise<PdfTextExtractionResult> {
      if (typeof uri !== 'string' || !uri.startsWith('file://')) {
        return { ok: false, reason: 'unsupported' };
      }
      if (!engine) return { ok: false, reason: 'unavailable' };
      try {
        if (!engine.id.trim() || !(await engine.supports(uri))) {
          return { ok: false, reason: 'unsupported' };
        }
        const result = await engine.extract(uri);
        if (!result.ok) return result;
        if (result.engine !== engine.id ||
            !Number.isSafeInteger(result.pageCount) ||
            result.pageCount < 1 || result.pageCount > MAX_PAGE_COUNT ||
            typeof result.text !== 'string' || result.text.length > MAX_TEXT_LENGTH) {
          return { ok: false, reason: 'engine_error' };
        }
        if (!result.text.trim()) return { ok: false, reason: 'empty_text' };
        return result;
      } catch {
        return { ok: false, reason: 'engine_error' };
      }
    },
  };
}
