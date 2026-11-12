import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { aggregateSavedInstallmentsReport, summarizeSavedInstallmentsByCurrency } from '@/features/finance/utils/reportSavedInstallments';
import { buildScheduledInstallmentsStatement } from '@/features/finance/utils/statementScheduledInstallments';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportValueCards, ReportDetails, ReportCurrencyAnalysis, ReportNotice, ReportKeyValues, ReportStatementLink } from '@/features/finance/components/reporting/ReportLayout';
import { ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';

export default function InstallmentsReportScreen() {
  const router = useRouter();
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  const [dates, setPeriod] = useReportPeriod();
  const [currency, setCurrency] = useState('');
  const month = dates.from.slice(0, 7);
  useEffect(() => { if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate(); }, []);
  const rows = useMemo(() => {
    if (saved.hydration !== 'ready') return null;
    try { return aggregateSavedInstallmentsReport(saved.contracts, dates.from, dates.to); } catch { return null; }
  }, [saved, dates]);
  const schedule = useMemo(() => { if (!rows) return null; try { return buildScheduledInstallmentsStatement(saved.contracts, dates.from, dates.to); } catch { return null; } }, [rows, saved.contracts, dates]);
  const summary = useMemo(() => rows === null ? [] : summarizeSavedInstallmentsByCurrency(rows), [rows]);
  const activeCurrency = summary.some(item => item.currencyCode === currency) ? currency : summary[0]?.currencyCode ?? '';
  const total = summary.find(item => item.currencyCode === activeCurrency);
  const selected = rows?.filter(row => row.currencyCode === activeCurrency) ?? [];
  const chartSafe = selected.every(row => Number.isSafeInteger(Number(row.dueInPeriod) * 10 ** getCurrencyDecimals(row.currencyCode)));
  const entries = schedule?.reconciled ? schedule.entries.filter(entry => entry.currency === activeCurrency) : [];
  const ownership = { standalone: 'Standalone contract', linked_loan: 'Linked loan', linked_debt: 'Linked debt' };
  return <Screen scroll>
    <ReportTitle active="installments" title="Installments Report" />
    <ReportDates period={dates} onChange={setPeriod} />
    {saved.hydration === 'blocked' ? <ReportStatus warning>Saved installment data is unavailable.</ReportStatus> : saved.hydration !== 'ready' ? <ReportStatus>Loading contracts...</ReportStatus> : rows === null ? <ReportStatus warning>Report data could not be validated.</ReportStatus> : rows.length === 0 ? <ReportStatus>No installment contracts yet.</ReportStatus> : <>
      <ReportCurrencyAnalysis currencies={summary.map(item => item.currencyCode)} value={activeCurrency} onSelect={setCurrency} />
      {total && <ReportValueCards cards={[{ label: 'All scheduled contracts', value: total.totalScheduled, unit: currencyLabel(activeCurrency) }, { label: 'Due in period', value: total.dueInPeriod, unit: currencyLabel(activeCurrency) }, { label: 'Due installments', value: String(total.dueCount), unit: 'installments' }]} />}
      {chartSafe ? <ReportChart currency={activeCurrency} title="Scheduled amounts" description="Due in the selected period." empty="No amounts scheduled in this period." data={selected.map(row => ({ id: row.id, label: row.name, amount: Number(row.dueInPeriod) }))} /> : <ReportStatus>Chart unavailable at this amount precision. Exact schedule values remain below.</ReportStatus>}
      <ReportDetails title={'Contracts (' + selected.length + ')'} actionLabel="Details">
        {selected.map(row => <ReportDetails key={row.id} title={row.name} actionLabel="Details">
          <ReportKeyValues items={[{ label: 'Ownership', value: ownership[row.ownership] }, { label: 'Contract total (all scheduled)', value: row.totalScheduled + ' ' + row.currencyCode }, { label: 'Due in period', value: row.dueInPeriod + ' ' + row.currencyCode }, { label: 'Installments scheduled in period', value: row.dueCount + ' of ' + row.scheduledCount + ' total' }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={"Open installment contract " + row.name} onPress={() => router.push({ pathname: '/finance/installment-contract', params: { id: row.id, mode: 'details' } })} style={{ minHeight: 44, justifyContent: 'center' }}><AppText variant="caption" color="primary">View contract details ›</AppText></Pressable>
        </ReportDetails>)}
      </ReportDetails>
      {schedule?.reconciled ? <ReportDetails title="Scheduled due dates">{entries.length > 0 ? <ReportTransactionRows rows={entries.map(entry => ({ id: entry.id, date: entry.date, category: entry.name, description: 'Scheduled · confirmation required', amount: 0, formattedAmount: entry.amount, currency: entry.currency }))} /> : <AppText variant="caption">No installments due in this period.</AppText>}</ReportDetails> : <ReportStatus warning>Schedule totals cannot be reconciled. Details and exports are unavailable.</ReportStatus>}
      <ReportNotice summary="Scheduled amounts only — payments are not confirmed here.">Scheduled amounts only. Payment confirmations are not stored here; paid and outstanding balances are unavailable. No account balances change. Due dates never trigger deductions. Contract totals cover all scheduled dates; due amounts cover only the selected period.</ReportNotice>
      <ReportStatementLink period={dates} label="View Schedule Statement" accessibilityLabel="View Statement" onPress={() => router.push({ pathname: '/finance/statement-installments', params: { month, from: dates.from, to: dates.to, currencyCode: activeCurrency } })} />
      <ReportTableActions table={{ title: 'Installments Schedule Report', period: dates, notice: 'Scheduled amounts only. Paid and outstanding balances are unavailable. Due dates never trigger deductions. Contract totals are all scheduled dates; due amounts are only the selected period.', verified: !!schedule?.reconciled, numericColumns: [3, 4, 5, 6], integerColumns: [5, 6], columns: ['Contract', 'Currency', 'Ownership', 'All scheduled', 'Due in period', 'Due count', 'Schedule count'], rows: selected.map(row => [row.name, row.currencyCode, ownership[row.ownership], row.totalScheduled, row.dueInPeriod, row.dueCount, row.scheduledCount]) }} />
    </>}
  </Screen>;
}
