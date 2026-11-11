import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateDebtsReport } from '@/features/finance/utils/reportDebts';
import { useTheme } from '@/theme';

type Direction = 'receivable' | 'payable';
function monthPeriod(month: string) {
  const [year, number] = month.split('-').map(Number);
  return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
}
function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + delta, 1);
  if (date.getFullYear() < 100 || date.getFullYear() > 9999) return month;
  return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
}
export function DebtReportScreen({ direction }: { direction: Direction }) {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const hydrated = useFinanceHydrated();
  const debts = useFinanceStore(state => state.debts);
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
  });
  const period = useMemo(() => monthPeriod(month), [month]);
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
        previous.total += row.totalAmount;
        previous.periodPaid += row.periodPaid;
        previous.remaining += row.currentRemaining;
        if (![previous.total, previous.periodPaid, previous.remaining].every(Number.isSafeInteger)) {
          // Fractional amounts are valid; reject only unsafe magnitudes below.
          if (![previous.total, previous.periodPaid, previous.remaining].every(Number.isFinite)) previous.unavailable = true;
        }
      }
      byCurrency.set(row.currencyCode, previous);
    }
    return [...byCurrency].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  const money = (value: number | null, currency: string) =>
    value === null ? 'Unavailable' : value.toFixed(getCurrencyDecimals(currency)) + ' ' + currency;
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Reports"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Reports</AppText>
    </Pressable>
    <AppText variant="h1">{direction === 'receivable' ? 'Debts Receivable' : 'Debts Payable'} Report</AppText>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(m => shiftMonth(m, -1))}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <AppText variant="bodyStrong">Month: {month}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(m => shiftMonth(m, 1))}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-forward" size={22} color={colors.text} />
      </Pressable>
    </View>
    <AppText variant="caption" color="textSecondary" style={{ marginBottom: spacing.md }}>
      Read-only debt records. Recorded collections and payments are not independent proof of bank posting. Historical balances may be unavailable after edits. Currencies are never combined.
    </AppText>
    {summaries.map(([currency, summary]) => <Card key={currency} style={{ marginBottom: spacing.sm }}>
      <AppText variant="bodyStrong">{currency} · {summary.count} debts</AppText>
      {summary.unavailable ? <AppText color="textSecondary">Summary unavailable: incomplete debt evidence</AppText> : <>
        <AppText>Total: {money(summary.total, currency)}</AppText>
        <AppText>{direction === 'receivable' ? 'Collected' : 'Paid'} this month: {money(summary.periodPaid, currency)}</AppText>
        <AppText>Remaining: {money(summary.remaining, currency)}</AppText>
      </>}
    </Card>)}
    {!hydrated ? <ActivityIndicator /> : rows === null ?
      <Card><AppText color="textSecondary">Debt report could not be validated.</AppText></Card> :
      rows.length === 0 ? <Card><AppText>No matching debts saved.</AppText></Card> :
      rows.map(row => <Card key={row.debtId} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{row.personName} · {row.currencyCode}</AppText>
        <AppText>Total debt: {money(row.totalAmount, row.currencyCode)}</AppText>
        <AppText>Recorded {direction === 'receivable' ? 'collections' : 'payments'} this month: {money(row.periodPaid, row.currencyCode)}</AppText>
        <AppText>Current remaining: {money(row.currentRemaining, row.currencyCode)}</AppText>
        <AppText>Remaining at month end: {money(row.remainingAtPeriodEnd, row.currencyCode)}</AppText>
        {row.status !== 'available' ? <AppText color="textSecondary">{row.reason ?? 'Historical evidence unavailable'}</AppText> : null}
      </Card>)}
  </Screen>;
}
