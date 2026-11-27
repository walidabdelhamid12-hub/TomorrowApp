import type { PdfTextExtractionResult } from '../extraction/pdfTextAdapter';

/** One visual contract for both images and PDFs. No native dependencies here. */
export const DOCUMENT_COMMANDS = [
  { id: 'edit', icon: 'pencil-outline', color: '#15803D', en: 'Edit', ar: 'تعديل' },
  { id: 'preview', icon: 'eye-outline', color: '#365575', en: 'Preview', ar: 'معاينة' },
  { id: 'read', icon: 'book-outline', color: '#B28B46', en: 'Read', ar: 'قراءة' },
  { id: 'open', icon: 'folder-open-outline', color: '#365575', en: 'Open', ar: 'فتح' },
  { id: 'share', icon: 'share-social-outline', color: '#365575', en: 'Share', ar: 'مشاركة' },
  { id: 'delete', icon: 'trash-outline', color: '#B91C1C', en: 'Delete', ar: 'حذف' },
] as const;
export type DocumentCommand = typeof DOCUMENT_COMMANDS[number]['id'];
export type FileCommand = Exclude<DocumentCommand, 'delete'>;
export type CommandRoute = 'image-edit' | 'image-preview' | 'category-edit' | 'pdf-preview-unavailable' | 'pdf-read' | 'image-read-unavailable' | 'native-open' | 'share';
export function commandRoute(command: FileCommand, mime: string): CommandRoute {
  const image = mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
  if (!image && mime !== 'application/pdf') throw new Error('Unsupported document type.');
  switch (command) {
    case 'edit': return image ? 'image-edit' : 'category-edit';
    case 'preview': return image ? 'image-preview' : 'pdf-preview-unavailable';
    case 'read': return image ? 'image-read-unavailable' : 'pdf-read';
    case 'open': return 'native-open';
    case 'share': return 'share';
  }
}

export interface NativeViewer {
  canPreview(options: { mimeType: string }): Promise<boolean>;
  preview(options: { mimeType: string; title: string }): Promise<void>;
}
/** Uses the already-installed SDK 58 File preview API, never the share sheet. */
export async function openInNativeViewer(file: NativeViewer, mimeType: string, title: string): Promise<void> {
  if (typeof file.canPreview !== 'function' || typeof file.preview !== 'function') {
    throw new Error('Native file viewer is unavailable in this runtime.');
  }
  if (!(await file.canPreview({ mimeType }))) throw new Error('No installed viewer supports this document.');
  await file.preview({ mimeType, title });
}

export type ReadResult = PdfTextExtractionResult | { readonly ok: false; readonly reason: 'image_ocr_unavailable' };
export async function readDocumentText(route: 'pdf-read' | 'image-read-unavailable', uri: string,
  pdfAdapter: { extract(uri: string): Promise<PdfTextExtractionResult> }): Promise<ReadResult> {
  return route === 'pdf-read' ? await pdfAdapter.extract(uri) : { ok: false, reason: 'image_ocr_unavailable' };
}
