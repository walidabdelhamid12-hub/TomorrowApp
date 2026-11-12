import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { ExpensesStatementResult } from '@/features/finance/utils/expensesStatementReconciliation';
import type { StatementExportNames } from '@/features/finance/utils/operatingStatementCsv';
import { buildCompactExpensesPrintHtml } from '@/features/finance/utils/compactExpensesPrintHtml';
import { shareStatementPdf } from '@/features/finance/utils/shareStatementPdf';
import { buildExpensesXlsx } from '@/features/finance/utils/expensesXlsx';
import { shareStatementXlsx } from '@/features/finance/utils/shareStatementXlsx';
export function useExpenseExports(statement: ExpensesStatementResult | null, period: { from: string; to: string }, names: StatementExportNames) {
  const [exporting, setExporting] = useState(false); const busy = useRef(false);
  const canExport = !!statement && statement.reconciled && statement.report.unknown.length === 0;
  const run = async (format: 'pdf' | 'xlsx') => {
    if (busy.current || !statement || !canExport) return;
    busy.current = true; setExporting(true);
    try {
      if (format === 'pdf') await shareStatementPdf(buildCompactExpensesPrintHtml(statement, period, names), { width: 595, height: 842, textZoom: 100 });
      else await shareStatementXlsx(buildExpensesXlsx(statement, period, names));
    } catch (error) { Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to export statement.'); }
    finally { busy.current = false; setExporting(false); }
  };
  return { exporting, canExport, exportPdf: () => { void run('pdf'); }, exportExcel: () => { void run('xlsx'); },
    share: () => Alert.alert('Share Expenses', 'Choose a format', [{ text: 'PDF', onPress: () => { void run('pdf'); } },
      { text: 'Excel XLSX', onPress: () => { void run('xlsx'); } }, { text: 'Cancel', style: 'cancel' }]) };
}
