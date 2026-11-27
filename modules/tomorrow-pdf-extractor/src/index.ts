import { requireOptionalNativeModule } from 'expo';
export type TomorrowPdfExtractor = { extractReaderLayout(uri: string): Promise<unknown> };
/** Expo Go / unsupported platforms must not crash or pretend extraction is available. */
export function getTomorrowPdfExtractor(): TomorrowPdfExtractor | null {
  const native = requireOptionalNativeModule<TomorrowPdfExtractor>('TomorrowPdfExtractor');
  return native && typeof native.extractReaderLayout === 'function' ? native : null;
}
