import { useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateDebtsReport } from '@/features/finance/utils/reportDebts';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportDetails, ReportCurrencyAnalysis, ReportNotice, ReportKeyValues, ReportStatementLink } from './reporting/ReportLayout';
import { ReportSummaryCards, ReportTransactionRows, currencyLabel } from './reporting/ReportPrimitives';
import { ReportTableActions } from './reporting/ReportTableActions';
import { ReportChart } from './reporting/ReportChart';

type Direction = 'receivable' | 'payable';
export function DebtReportScreen({ direction }: { direction: Direction }) {
  const router = useRouter();
  const hydrated = useFinanceHydrated();
  const debts = useFinanceStore(state => state.debts);
  const [period, setPeriod] = useReportPeriod();
  const [currency, setCurrency] = useState('');
  const month = period.from.slice(0, 7);
  const rows = useMemo(() => {
    if (!hydrated) return null;
    try { return aggregateDebtsReport(debts, period, direction); } catch { return null; }
  }, [hydrated, debts, period, direction]);
  const summaries = useMemo(() => {
    if (!rows) return [];
    const byCurrency = new Map<string, { total: number; periodPaid: number; remaining: number; count: number; unavailable: boolean }>();
    for (const row of rows) {
      const previous = byCurrency.get(row.currencyCode) ?? { total: 0, periodPaid: 0, remaining: 0, count: 0, unavailable: false };
      previous.count++;
      if (row.totalAmount === null || row.periodPaid === null || row.currentRemaining === null) {
        previous.unavailable = true;
      } else {
        const scale = 10 ** getCurrencyDecimals(row.currencyCode);
        const next = [previous.total + Math.round(row.totalAmount * scale),
          previous.periodPaid + Math.round(row.periodPaid * scale),
          previous.remaining + Math.round(row.currentRemaining * scale)];
        if (!next.every(Number.isSafeInteger)) previous.unavailable = true;
        else [previous.total, previous.periodPaid, previous.remaining] = next;
      }
      byCurrency.set(row.currencyCode, previous);
    }
    return [...byCurrency].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const activeCurrency = summaries.some(([code]) => code === currency) ? currency : summaries[0]?.[0] ?? '';
  const summary = summaries.find(([code]) => code === activeCurrency)?.[1];
  const selected = rows?.filter(row => row.currencyCode === activeCurrency) ?? [];
  const safeHistory = selected.every(row => row.status === 'available' && row.periodPaid !== null);
  const money = (value: number | null, code: string) => value === null ? 'Unavailable' : formatAmount(value, code) + ' ' + code;
  const payments = safeHistory ? debts.filter(debt => debt.direction === direction && debt.currencyCode === activeCurrency).flatMap(debt => debt.payments.filter(payment => payment.date >= period.from && payment.date <= period.to).map(payment => ({ id: debt.id + ':' + payment.id, date: payment.date, category: debt.personName, description: [payment.note, payment.accountId ? 'Account: ' + payment.accountId : undefined].filter(Boolean).join(' · '), amount: payment.amount, currency: debt.currencyCode }))) : [];
  const title = direction === 'receivable' ? 'Debts Receivable' : 'Debts Payable';
  return <Screen scroll>
    <ReportTitle active={direction} title={title + ' Report'} />
    <ReportDates period={period} onChange={setPeriod} />
    {!hydrated ? <ActivityIndicator accessibilityLabel="Loading debt report" color={moduleColors.finance} /> : rows === null ? <ReportStatus warning>Debt report could not be validated.</ReportStatus> : rows.length === 0 ? <ReportStatus>No matching debts saved.</ReportStatus> : <>
      <ReportCurrencyAnalysis currencies={summaries.map(([code]) => code)} value={activeCurrency} onSelect={setCurrency} />
      {summary && !summary.unavailable ? <ReportSummaryCards currency={activeCurrency} cards={[
        { label: direction === 'receivable' ? 'Total receivable' : 'Total payable', value: summary.total / 10 ** getCurrencyDecimals(activeCurrency) },
        { label: direction === 'receivable' ? 'Collected in period' : 'Paid in period', value: summary.periodPaid / 10 ** getCurrencyDecimals(activeCurrency) },
        { label: direction === 'receivable' ? 'Current receivable' : 'Current payable', value: summary.remaining / 10 ** getCurrencyDecimals(activeCurrency) },
      ]} /> : <ReportStatus warning>Summary unavailable — incomplete debt evidence.</ReportStatus>}
      {!safeHistory && <ReportStatus warning>Period-end balances unavailable — incomplete history.</ReportStatus>}
      <ReportChart currency={activeCurrency} title={direction === 'receivable' ? 'Debtor analysis' : 'Creditor analysis'} description="Current remaining amounts." empty="No positive verified remaining amounts." data={selected.filter(row => row.status === 'available' && row.currentRemaining !== null).map(row => ({ id: row.debtId, label: row.personName, amount: row.currentRemaining! }))} />
      <ReportDetails title={direction === 'receivable' ? 'Debtor details (' + selected.length + ')' : 'Creditor details (' + selected.length + ')'} actionLabel="Details">
        {selected.map(row => <ReportDetails key={row.debtId} title={row.personName + ' · ' + currencyLabel(row.currencyCode)} actionLabel="Details">
          <ReportKeyValues items={[{ label: 'Total debt', value: money(row.totalAmount, row.currencyCode) }, { label: direction === 'receivable' ? 'Collected in period' : 'Paid in period', value: money(row.periodPaid, row.currencyCode) }, { label: 'Current remaining', value: money(row.currentRemaining, row.currencyCode) }, { label: 'Remaining at period end', value: money(row.remainingAtPeriodEnd, row.currencyCode) }]} />
          {row.reason ? <AppText variant="caption" accessibilityRole="alert">{row.reason}</AppText> : null}
        </ReportDetails>)}
      </ReportDetails>
      {safeHistory ? <ReportDetails title={direction === 'receivable' ? 'Collection history' : 'Payment history'}>{payments.length > 0 ? <ReportTransactionRows rows={payments} /> : <AppText variant="caption">No recorded payments in this period.</AppText>}</ReportDetails> : <AppText variant="caption" accessibilityRole="alert">Unverified history; payment details are withheld.</AppText>}
      <ReportNotice summary="Recorded payments are not independent proof of posting." warning={!safeHistory}>Read-only debt records. Recorded collections and payments are not independent proof of bank posting. Historical balances may be unavailable after edits. Current remaining reflects the latest records, not the selected period end. Currencies are never combined.</ReportNotice>
      <ReportStatementLink period={period} onPress={() => router.push({ pathname: '/finance/statement-debts', params: { direction, month, from: period.from, to: period.to, currencyCode: activeCurrency } })} />
      <ReportTableActions table={{ title, period, notice: 'Recorded collections and payments do not prove bank posting. Current remaining is not the period-end balance. Selected currency: ' + activeCurrency, verified: safeHistory, columns: ['Person', 'Currency', 'Total debt', direction === 'receivable' ? 'Collected in period' : 'Paid in period', 'Current remaining', 'Remaining at period end'], rows: selected.map(row => [row.personName, row.currencyCode, row.totalAmount, row.periodPaid, row.currentRemaining, row.remainingAtPeriodEnd]) }} />
    </>}
  </Screen>;
}
