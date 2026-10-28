export type ScanSource = 'camera' | 'gallery' | 'file';

/** A picked image or PDF, ready to send to a scanner provider. */
export interface ScanInput {
  uri: string;
  mimeType: string;
  name?: string;
  base64: string;
}

/** Whatever could be extracted. Every field is optional on purpose. */
export interface ScanResult {
  amount?: number;
  /** YYYY-MM-DD */
  date?: string;
  currencyCode?: string;
  merchant?: string;
  rawText?: string;
}

export interface ScanProvider {
  readonly name: string;
  extract(input: ScanInput): Promise<ScanResult>;
}