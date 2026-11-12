import { reportRoutePeriod } from '@/features/finance/utils/reportRoutePeriod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateLoansReport } from '@/features/finance/utils/reportLoans';
import { useTheme } from '@/theme';

/** Read-only loan payment register. Amount excludes late fees; fees are displayed separately. */
export default function LoansStatementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ loanId?: string; from?: string; to?: string; month?: string }>();
  const { spacing } = useTheme();
  const hydrated = useFinanceHydrated();
  const loans = useFinanceStore(state => state.loans);
  const month = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const loanId = params.loanId === undefined ? '' : typeof params.loanId === 'string' && params.loanId.length > 0 && !/[\s\u0000-\u001f\u007f]/u.test(params.loanId) ? params.loanId : null;
  const selectionValid = loanId !== null && (!loanId || loans.filter(loan => loan.id === loanId).length === 1);
  const period = useMemo(() => {
    if (!selectionValid) return null;
    if (params.from !== undefined || params.to !== undefined) return reportRoutePeriod(params.from, params.to);
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    if (year < 100) return null;
    return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
  }, [month, params.from, params.to, selectionValid]);
  const rows = useMemo(() => {
    if (!hydrated || !period) return null;
    try { return aggregateLoansReport(loans, period).filter(row => !loanId || row.loanId === loanId); } catch { return null; }
  }, [hydrated, loans, period, loanId]);
  const entries = useMemo(() => {
    if (!rows || !period) return [];
    const safe = new Set(rows.filter(row => row.status === 'available' && row.totalPaid !== null && row.periodPaid !== null).map(row => row.loanId));
    return loans.filter(loan => safe.has(loan.id)).flatMap(loan =>
      loan.payments.filter(payment => payment.date >= period.from && payment.date <= period.to)
        .map(payment => ({ id: loan.id + ':' + payment.id, name: loan.name,
          date: payment.date, amount: payment.amount, lateFee: payment.latePaymentFee ?? 0,
          currency: loan.currencyCode, note: payment.note })))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [rows, period, loans]);
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Loans Report"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Loans Report</AppText>
    </Pressable>
    <AppText variant="h1">Loans Statement</AppText>
    <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
      {period ? period.from + ' to ' + period.to : 'Invalid period'} · Recorded payments only. Late fees are separate and do not reduce principal. No ledger posting is inferred.
    </AppText>
    {!period ? <Card><AppText>Invalid statement month.</AppText></Card> :
      !hydrated ? <Card><AppText>Loading loans...</AppText></Card> :
      rows === null ? <Card><AppText>Statement unavailable.</AppText></Card> :
      rows.some(row => row.status !== 'available') ? <Card><AppText color="textSecondary">Historical data is unverified for one or more records. Payment details are withheld to avoid misleading totals.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>No recorded payments in this period.</AppText></Card> :
      entries.map(item => <Card key={item.id} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{item.name}</AppText>
        <AppText>{item.date} · {item.amount.toFixed(getCurrencyDecimals(item.currency))} {item.currency}</AppText>
        {item.lateFee > 0 ? <AppText>Late fee: {item.lateFee.toFixed(getCurrencyDecimals(item.currency))} {item.currency}</AppText> : null}
        {item.note ? <AppText color="textSecondary">{item.note}</AppText> : null}
      </Card>)}
  </Screen>;
}
