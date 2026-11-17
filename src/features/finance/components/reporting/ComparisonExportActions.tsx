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
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const disabled = !table.verified || !table.rows.length || table.rows.some(row => row.some(cell => cell === null));
  const run = async (format: 'pdf' | 'xlsx') => {
    if (locked.current) return;
    if (disabled) { Alert.alert('Export unavailable', 'Statement data is incomplete or unverified.'); return; }
    locked.current = true; setBusy(true);
    try {
      validateReportTable(table);
      if (format === 'pdf') await shareStatementPdf(buildComparisonBrandedPrintHtml(table), { width: 842, height: 595, textZoom: 100 });
      else await shareStatementXlsx(buildReportTableXlsx(table), { title: table.title, filePrefix: 'comparison-statement' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to export statement.');
    } finally { locked.current = false; setBusy(false); }
  };
  const pdf = () => { void run('pdf'); };
  const excel = () => { void run('xlsx'); };
  const share = () => Alert.alert('Share Comparison', 'Choose a format', [
    { text: 'PDF', onPress: pdf }, { text: 'Excel XLSX', onPress: excel }, { text: 'Cancel', style: 'cancel' },
  ]);
  if (statementMode) return <StatementExportActions busy={busy} disabled={disabled} pdf={pdf} excel={excel} share={share} />;
  if (!statement) return null;
  return <ReportDashboardActions busy={busy} disabled={disabled} statement={statement} pdf={pdf} excel={excel} share={share} />;
}
