import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateLoansReport } from '@/features/finance/utils/reportLoans';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useTheme } from '@/theme';

function monthPeriod(month: string) {
  const [year, number] = month.split('-').map(Number);
  return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
}
function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  if (date.getFullYear() < 100 || date.getFullYear() > 9999) return month;
  return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
}
export default function LoansReportScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const hydrated = useFinanceHydrated();
  const loans = useFinanceStore(state => state.loans);
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
  });
  const dates = useMemo(() => monthPeriod(month), [month]);
  const rows = useMemo(() => {
    if (!hydrated) return null;
    try { return aggregateLoansReport(loans, dates); } catch { return null; }
  }, [hydrated, loans, dates]);
  const format = (value: number | null, currency: string) => value === null ? 'Unavailable' : value.toFixed(getCurrencyDecimals(currency)) + ' ' + currency;
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Reports" onPress={() => router.back()}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Reports</AppText>
    </Pressable>
    <AppText variant="h1">Loans Report</AppText>
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
      Read-only loan records. Recorded payments are not independent proof of ledger posting. Historical figures are hidden when contract history is insufficient. Amounts are never combined across currencies.
    </AppText>
    {hydrated && rows !== null && <Pressable accessibilityRole="button" accessibilityLabel="View Statement"
      onPress={() => router.push({ pathname: '/finance/statement-loans', params: { month } })}
      style={{ minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm }}>
      <AppText color="primary">View Statement · {month}</AppText>
    </Pressable>}
    {!hydrated ? <ActivityIndicator /> : rows === null ?
      <Card><AppText color="danger">Loan report could not be validated.</AppText></Card> :
      rows.length === 0 ? <Card><AppText>No loans saved yet.</AppText></Card> :
      rows.map(row => <Card key={row.loanId} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{row.loanName} · {row.currencyCode}</AppText>
        <AppText>Original principal: {format(row.originalPrincipal, row.currencyCode)}</AppText>
        <AppText>Contractual total: {format(row.contractualTotal, row.currencyCode)}</AppText>
        <AppText>Recorded payments this month: {format(row.periodPaid, row.currencyCode)}</AppText>
        <AppText>Late fees this month: {format(row.periodLateFees, row.currencyCode)}</AppText>
        <AppText>Current contractual remaining: {format(row.currentContractualRemaining, row.currencyCode)}</AppText>
        <AppText>Current principal remaining: {format(row.currentPrincipalRemaining, row.currencyCode)}</AppText>
        <AppText>Remaining at month end: {format(row.remainingAtPeriodEnd, row.currencyCode)}</AppText>
        {row.status !== 'available' ? <AppText color="textSecondary">{row.reason ?? 'Historical evidence unavailable'}</AppText> : null}
      </Card>)}
  </Screen>;
}
