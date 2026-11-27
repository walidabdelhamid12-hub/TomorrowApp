import { useAppLanguage } from '@/localization/LanguageProvider';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ReportDashboardActions } from './ReportDashboardActions';
import { StatementExportActions } from './StatementExportActions';
import type { ReportTable } from '../../utils/reportTableExport';
import { buildReportTableXlsx } from '../../utils/reportTableXlsx';
import { validateReportTable } from '../../utils/reportTableExport';
import { buildComparisonBrandedPrintHtml } from '../../utils/comparisonBrandedPrintHtml';
import { shareStatementPdf } from '../../utils/shareStatementPdf';
import { shareStatementXlsx } from '../../utils/shareStatementXlsx';

/** One verified export path for the Comparison dashboard and its statement. */
export function ComparisonExportActions({ table, statement, statementMode = false }: {
  table: ReportTable; statement?: () => void; statementMode?: boolean;
}) {
  const { t } = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const disabled = !table.verified || !table.rows.length || table.rows.some(row => row.some(cell => cell === null));
  const run = async (format: 'pdf' | 'xlsx') => {
    if (locked.current) return;
    if (disabled) { Alert.alert(t('Export unavailable', 'التصدير غير متاح'), t('Statement data is incomplete or unverified.', 'بيانات كشف الحساب غير مكتملة أو غير موثقة.')); return; }
    locked.current = true; setBusy(true);
    try {
      validateReportTable(table);
      if (format === 'pdf') await shareStatementPdf(buildComparisonBrandedPrintHtml(table), { width: 842, height: 595, textZoom: 100 });
      else await shareStatementXlsx(buildReportTableXlsx(table), { title: table.title, filePrefix: 'comparison-statement' });
    } catch (error) {
      Alert.alert(t('Export failed', 'فشل التصدير'), error instanceof Error ? error.message : t('Unable to export statement.', 'تعذر تصدير كشف الحساب.'));
    } finally { locked.current = false; setBusy(false); }
  };
  const pdf = () => { void run('pdf'); };
  const excel = () => { void run('xlsx'); };
  const share = () => Alert.alert(t('Share Comparison', 'مشاركة المقارنة'), t('Choose a format', 'اختر صيغة الملف'), [
    { text: 'PDF', onPress: pdf }, { text: 'Excel XLSX', onPress: excel }, { text: t('Cancel', 'إلغاء'), style: 'cancel' },
  ]);
  if (statementMode) return <StatementExportActions busy={busy} disabled={disabled} pdf={pdf} excel={excel} share={share} />;
  if (!statement) return null;
  return <ReportDashboardActions busy={busy} disabled={disabled} statement={statement} pdf={pdf} excel={excel} share={share} />;
}
