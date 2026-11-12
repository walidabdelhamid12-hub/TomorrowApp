import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ReportExportActions } from './ReportPrimitives';
import { buildReportTableHtml, type ReportTable } from '../../utils/reportTableExport';
import { shareStatementPdf } from '../../utils/shareStatementPdf';
import { shareStatementXlsx } from '../../utils/shareStatementXlsx';
import { buildReportTableXlsx } from '../../utils/reportTableXlsx';

/** Snapshot export only. Never infers missing financial history or posts records. */
export function ReportTableActions({ table }: { table: ReportTable }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const disabled = !table.verified || !table.rows.length || table.rows.some(row => row.some(value => value === null));
  const run = async (format: 'pdf' | 'xlsx') => {
    if (disabled || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (format === 'pdf') await shareStatementPdf(buildReportTableHtml(table), { width: 842, height: 595, textZoom: 100 });
      else await shareStatementXlsx(buildReportTableXlsx(table), { title: table.title, filePrefix: table.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    } catch (error) { Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to export report.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ReportExportActions excelLabel="Excel XLSX" busy={busy} disabled={disabled} pdf={() => { void run('pdf'); }} excel={() => { void run('xlsx'); }} share={() => {
    if (!disabled) Alert.alert(`Share ${table.title}`, 'Choose a format', [{ text: 'PDF', onPress: () => { void run('pdf'); } }, { text: 'Excel XLSX', onPress: () => { void run('xlsx'); } }, { text: 'Cancel', style: 'cancel' }]);
  }} />;
}
