import { useAppLanguage } from '@/localization/LanguageProvider';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ReportExportActions } from './ReportPrimitives';
import { ReportDashboardActions } from './ReportDashboardActions';
import { buildReportTableHtml, type ReportTable } from '../../utils/reportTableExport';
import { shareStatementPdf } from '../../utils/shareStatementPdf';
import { shareStatementXlsx } from '../../utils/shareStatementXlsx';
import { buildAssetsBrandedPrintHtml } from '../../utils/assetsBrandedPrintHtml';
import { buildBrandedReportTablePrintHtml } from '../../utils/brandedReportTablePrintHtml';
import { buildReportTableXlsx } from '../../utils/reportTableXlsx';

/** Snapshot export only. Never infers missing financial history or posts records. */
export function ReportTableActions({ table, statement, presentation, pdfLandscape = false }: { table: ReportTable; statement?: () => void; presentation?: 'assets' | 'obligations'; pdfLandscape?: boolean }) {
  const { t, language } = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disabled = !table.verified || !table.rows.length || table.rows.some(row => row.some(value => value === null));
  const run = async (format: 'pdf' | 'xlsx') => {
    if (lock.current) return; if (disabled) { Alert.alert(t('Export unavailable', 'التصدير غير متاح'), t('Account history is incomplete or this selection cannot be safely exported. Select one currency and ensure all included accounts have verified balances.', 'سجل الحسابات غير مكتمل أو لا يمكن تصدير هذا الاختيار بأمان. اختر عملة واحدة وتأكد من توثيق أرصدة جميع الحسابات.')); return; }
    lock.current = true; setBusy(true);
    try {
      if (format === 'pdf') await shareStatementPdf(presentation === 'assets' ? buildAssetsBrandedPrintHtml(table) : presentation === 'obligations' ? buildBrandedReportTablePrintHtml(table, pdfLandscape, language) : buildReportTableHtml(table, language), presentation === 'obligations' && pdfLandscape ? { width: 842, height: 595, textZoom: 100 } : presentation === 'assets' || presentation === 'obligations' ? { width: 595, height: 842, textZoom: 100 } : { width: 842, height: 595, textZoom: 100 });
      else await shareStatementXlsx(buildReportTableXlsx(table, language), { title: table.title, filePrefix: table.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    } catch (error) { Alert.alert(t('Export failed', 'فشل التصدير'), error instanceof Error ? error.message : t('Unable to export report.', 'تعذر تصدير التقرير.')); }
    finally { lock.current = false; setBusy(false); }
  };
  return (statement ? <ReportDashboardActions statement={statement} busy={busy} disabled={disabled} pdf={() => { void run('pdf'); }} excel={() => { void run('xlsx'); }} share={() => { if (disabled) Alert.alert(t('Export unavailable', 'التصدير غير متاح'), t('Account history is incomplete or this selection cannot be safely exported. Select one currency and ensure all included accounts have verified balances.', 'سجل الحسابات غير مكتمل أو لا يمكن تصدير هذا الاختيار بأمان. اختر عملة واحدة وتأكد من توثيق أرصدة جميع الحسابات.')); else Alert.alert(t('Share', 'مشاركة') + ' ' + table.title, t('Choose a format', 'اختر صيغة الملف'), [{ text: 'PDF', onPress: () => { void run('pdf'); } }, { text: 'Excel XLSX', onPress: () => { void run('xlsx'); } }, { text: t('Cancel', 'إلغاء'), style: 'cancel' }]); }} /> : <ReportExportActions excelLabel="Excel XLSX" busy={busy} disabled={disabled} pdf={() => { void run('pdf'); }} excel={() => { void run('xlsx'); }} share={() => {
    if (disabled) Alert.alert(t('Export unavailable', 'التصدير غير متاح'), t('Account history is incomplete or this selection cannot be safely exported. Select one currency and ensure all included accounts have verified balances.', 'سجل الحسابات غير مكتمل أو لا يمكن تصدير هذا الاختيار بأمان. اختر عملة واحدة وتأكد من توثيق أرصدة جميع الحسابات.')); else Alert.alert(t('Share', 'مشاركة') + ' ' + table.title, t('Choose a format', 'اختر صيغة الملف'), [{ text: 'PDF', onPress: () => { void run('pdf'); } }, { text: 'Excel XLSX', onPress: () => { void run('xlsx'); } }, { text: t('Cancel', 'إلغاء'), style: 'cancel' }]);
  }} />);
}
