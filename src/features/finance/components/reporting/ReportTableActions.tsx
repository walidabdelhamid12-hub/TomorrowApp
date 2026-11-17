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
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disabled = !table.verified || !table.rows.length || table.rows.some(row => row.some(value => value === null));
  const run = async (format: 'pdf' | 'xlsx') => {
    if (lock.current) return; if (disabled) { Alert.alert('Export unavailable', 'Account history is incomplete or this selection cannot be safely exported. Select one currency and ensure all included accounts have verified balances.'); return; }
    lock.current = true; setBusy(true);
    try {
      if (format === 'pdf') await shareStatementPdf(presentation === 'assets' ? buildAssetsBrandedPrintHtml(table) : presentation === 'obligations' ? buildBrandedReportTablePrintHtml(table, pdfLandscape) : buildReportTableHtml(table), presentation === 'obligations' && pdfLandscape ? { width: 842, height: 595, textZoom: 100 } : presentation === 'assets' || presentation === 'obligations' ? { width: 595, height: 842, textZoom: 100 } : { width: 842, height: 595, textZoom: 100 });
      else await shareStatementXlsx(buildReportTableXlsx(table), { title: table.title, filePrefix: table.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    } catch (error) { Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to export report.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return (statement ? <ReportDashboardActions statement={statement} busy={busy} disabled={disabled} pdf={() => { void run('pdf'); }} excel={() => { void run('xlsx'); }} share={() => { if (disabled) Alert.alert('Export unavailable', 'Account history is incomplete or this selection cannot be safely exported. Select one currency and ensure all included accounts have verified balances.'); else Alert.alert(`Share ${table.title}`, 'Choose a format', [{ text: 'PDF', onPress: () => { void run('pdf'); } }, { text: 'Excel XLSX', onPress: () => { void run('xlsx'); } }, { text: 'Cancel', style: 'cancel' }]); }} /> : <ReportExportActions excelLabel="Excel XLSX" busy={busy} disabled={disabled} pdf={() => { void run('pdf'); }} excel={() => { void run('xlsx'); }} share={() => {
    if (disabled) Alert.alert('Export unavailable', 'Account history is incomplete or this selection cannot be safely exported. Select one currency and ensure all included accounts have verified balances.'); else Alert.alert(`Share ${table.title}`, 'Choose a format', [{ text: 'PDF', onPress: () => { void run('pdf'); } }, { text: 'Excel XLSX', onPress: () => { void run('xlsx'); } }, { text: 'Cancel', style: 'cancel' }]);
  }} />);
}
