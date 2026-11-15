import { SixReportDetails } from '@/features/finance/components/reporting/SixReportPresentation';
import { useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateLoansReport } from '@/features/finance/utils/reportLoans';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportSummaryCards, ReportKeyValues } from '@/features/finance/components/reporting/ReportUnifiedSix';
import { ReportPicker, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportUnifiedSix';

export default function LoansReportScreen() {
  const router = useRouter();
  const hydrated = useFinanceHydrated();
  const loans = useFinanceStore(state => state.loans);
  const [dates, setPeriod] = useReportPeriod();
  const [loanId, setLoanId] = useState('');
  const month = dates.from.slice(0, 7);
  const rows = useMemo(() => {
    if (!hydrated) return null;
    try { return aggregateLoansReport(loans, dates); } catch { return null; }
  }, [hydrated, loans, dates]);
  const activeId = loanId || rows?.[0]?.loanId || '';
  const matches = rows?.filter(row => row.loanId === activeId) ?? [];
  const row = matches.length === 1 ? matches[0] : null;
  const safe = row?.status === 'available';
  const money = (value: number | null, code: string) => value === null ? 'Unavailable' : formatAmount(value, code) + ' ' + code;
  const payments = row && safe ? loans.filter(loan => loan.id === row.loanId).flatMap(loan => loan.payments.filter(payment => payment.date >= dates.from && payment.date <= dates.to).map(payment => ({ id: loan.id + ':' + payment.id, date: payment.date, category: loan.name, description: [payment.note, payment.paymentMethodLabel, payment.accountId ? 'Account: ' + payment.accountId : undefined, payment.latePaymentFee ? 'Late fee: ' + payment.latePaymentFee + ' ' + loan.currencyCode : undefined].filter(Boolean).join(' · '), amount: payment.amount, currency: loan.currencyCode }))) : [];
  return <Screen scroll>
    <ReportTitle active="loans" title="Loans Report" />
    <ReportDates period={dates} onChange={setPeriod} />
    {rows !== null && rows.length > 0 && <ReportPicker label="Loan" value={activeId} onSelect={setLoanId} options={rows.map(item => ({ id: item.loanId, label: item.loanName + ' ' + currencyLabel(item.currencyCode) }))} />}
    {!hydrated ? <ActivityIndicator accessibilityLabel="Loading loans report" color={moduleColors.finance} /> : rows === null ? <ReportStatus warning>Loan report could not be validated.</ReportStatus> : rows.length === 0 ? <ReportStatus>No loans saved yet.</ReportStatus> : !row ? <ReportStatus warning>Selected loan is missing or ambiguous.</ReportStatus> : <>
      <ReportSummaryCards currency={row.currencyCode} cards={[{ label: 'Remaining Loan Balance', value: safe ? row.currentContractualRemaining : null }]} />
      {!safe && <ReportStatus warning>Historical figures unavailable — incomplete contract history.</ReportStatus>}
      <ReportChart currency={row.currencyCode} title="Contractual analysis" description="Current contractual remaining." empty="No positive verified contractual amounts." data={safe && row.currentContractualRemaining !== null ? [{ id: row.loanId, label: row.loanName, amount: row.currentContractualRemaining }] : []} />
      <SixReportDetails title={row.loanName} subtitle={money(safe ? row.currentContractualRemaining : null, row.currencyCode)}>
        <AppText variant="caption" color="textSecondary">Contractual remaining and principal remaining are separate. Only remaining principal is deducted for net-worth accounting.</AppText>
        <ReportKeyValues items={[
          { label: 'Original principal', value: money(row.originalPrincipal, row.currencyCode) },
          { label: 'Contractual total', value: money(row.contractualTotal, row.currencyCode) },
          { label: 'Current contractual remaining', value: money(safe ? row.currentContractualRemaining : null, row.currencyCode) },
          { label: 'Current principal remaining', value: money(safe ? row.currentPrincipalRemaining : null, row.currencyCode) },
          { label: 'Total recorded payments', value: money(row.totalPaid, row.currencyCode) },
          { label: 'Recorded payments in period', value: money(row.periodPaid, row.currencyCode) },
          { label: 'Late fees in period', value: money(row.periodLateFees, row.currencyCode) },
          { label: 'Remaining at period end', value: money(row.remainingAtPeriodEnd, row.currencyCode) },
        ]} />
        {row.reason ? <AppText variant="caption" accessibilityRole="alert">{row.reason}</AppText> : null}
        {safe ? <>
          <AppText variant="bodyStrong">Recorded payments in period</AppText>
          {payments.length > 0 ? <ReportTransactionRows rows={payments} /> : <AppText variant="caption">No recorded payments in this period.</AppText>}
        </> : <AppText variant="caption" accessibilityRole="alert">Unverified history; payment details are withheld.</AppText>}
      </SixReportDetails>
      <ReportTableActions table={{ title: 'Loans Report', period: dates, notice: 'Recorded payments do not prove ledger posting. Current balances differ from period-end balances. Late fees do not reduce principal. Selected loan: ' + row.loanName, verified: safe, columns: ['Loan', 'Currency', 'Original principal', 'Contractual total', 'Payments in period', 'Late fees in period', 'Current contractual remaining', 'Current principal remaining', 'Remaining at period end'], rows: [[row.loanName, row.currencyCode, row.originalPrincipal, row.contractualTotal, row.periodPaid, row.periodLateFees, row.currentContractualRemaining, row.currentPrincipalRemaining, row.remainingAtPeriodEnd]] }} statement={() => router.push({ pathname: '/finance/statement-loans', params: { month, from: dates.from, to: dates.to, loanId: row.loanId } })} />
    </>}
  </Screen>;
}
