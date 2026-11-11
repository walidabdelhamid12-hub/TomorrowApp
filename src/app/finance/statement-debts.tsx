import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateDebtsReport } from '@/features/finance/utils/reportDebts';
import { useTheme } from '@/theme';

/** Detailed read-only payment register for the selected debt report and month. */
export default function DebtStatementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ direction?: string; month?: string }>();
  const { spacing } = useTheme();
  const hydrated = useFinanceHydrated();
  const debts = useFinanceStore(state => state.debts);
  const direction = params.direction === 'receivable' || params.direction === 'payable' ? params.direction : null;
  const month = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const period = useMemo(() => {
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    if (year < 100) return null;
    return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
  }, [month]);
  const rows = useMemo(() => {
    if (!hydrated || !direction || !period) return null;
    try { return aggregateDebtsReport(debts, period, direction); } catch { return null; }
  }, [hydrated, direction, period, debts]);
  const entries = useMemo(() => {
    if (!rows || !period) return [];
    const valid = new Set(rows.filter(row => row.status === 'available' && row.totalAmount !== null && row.periodPaid !== null).map(row => row.debtId));
    return debts.filter(debt => valid.has(debt.id)).flatMap(debt =>
      debt.payments.filter(payment => payment.date >= period.from && payment.date <= period.to)
        .map(payment => ({ id: debt.id + ':' + payment.id, person: debt.personName,
          date: payment.date, amount: payment.amount, currency: debt.currencyCode, note: payment.note })))
      .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [rows, period, debts]);
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to debt report"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Debt Report</AppText>
    </Pressable>
    <AppText variant="h1">{direction === 'receivable' ? 'Receivable' : 'Payable'} Statement</AppText>
    <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
      {month ?? 'Invalid month'} · Recorded payments only. These entries do not independently prove bank or ledger posting.
    </AppText>
    {!direction || !period ? <Card><AppText>Invalid statement filters.</AppText></Card> :
      !hydrated ? <Card><AppText>Loading finance data...</AppText></Card> :
      rows === null ? <Card><AppText>Statement data unavailable.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>No recorded payments in this month.</AppText></Card> :
      entries.map(item => <Card key={item.id} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{item.person}</AppText>
        <AppText>{item.date} · {item.amount.toFixed(getCurrencyDecimals(item.currency))} {item.currency}</AppText>
        {item.note ? <AppText color="textSecondary">{item.note}</AppText> : null}
      </Card>)}
  </Screen>;
}
