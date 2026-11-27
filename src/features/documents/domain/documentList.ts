import type { DocumentCategory, DocumentRecord } from './types';
export const categoryLabels: Record<DocumentCategory, readonly [string, string]> = {
  receipt: ['Receipt', 'إيصال'], invoice: ['Invoice', 'فاتورة'], contract: ['Contract', 'عقد'],
  bank_statement: ['Bank Statement', 'كشف حساب بنكي'], handwritten_note: ['Handwritten Note', 'ملاحظة بخط اليد'], other: ['Other', 'أخرى'],
};
export type DocumentSort = 'newest' | 'oldest' | 'name';
export function normalizeDocumentSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660))).trim();
}
export function selectDocuments(records: readonly DocumentRecord[], query: string, category: DocumentCategory | 'all', sort: DocumentSort): DocumentRecord[] {
  const terms = normalizeDocumentSearch(query).split(/\s+/).filter(Boolean);
  return records.filter(record => {
    if (category !== 'all' && record.category !== category) return false;
    const haystack = normalizeDocumentSearch([record.name, ...categoryLabels[record.category], record.createdAt.slice(0, 10)].join(' '));
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => {
    const date = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'oldest' ? -date : date) || a.id.localeCompare(b.id);
  });
}
