import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { aggregateSavedInstallmentsReport } from '@/features/finance/utils/reportSavedInstallments';
import { useTheme } from '@/theme';

function period(month: string) {
  const [year, number] = month.split('-').map(Number);
  return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
}
function moveMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0');
}
export default function InstallmentsReportScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  useEffect(() => { if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate(); }, []);
  const dates = useMemo(() => period(month), [month]);
  const rows = useMemo(() => {
    if (saved.hydration !== 'ready') return null;
    try { return aggregateSavedInstallmentsReport(saved.contracts, dates.from, dates.to); }
    catch { return null; }
  }, [saved, dates]);
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Reports" onPress={() => router.back()}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Reports</AppText>
    </Pressable>
    <AppText variant="h1">Installments Report</AppText>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(m => moveMonth(m, -1))}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <AppText variant="bodyStrong">{month}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(m => moveMonth(m, 1))}
        style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-forward" size={22} color={colors.text} />
      </Pressable>
    </View>
    <AppText variant="caption" color="textSecondary" style={{ marginBottom: spacing.md }}>
      Scheduled amounts only. Payment confirmations are not stored here; paid and outstanding balances are unavailable. No account balances change.
    </AppText>
    {saved.hydration === 'blocked' ? <Card><AppText color="danger">Saved installment data is unavailable.</AppText></Card> :
      saved.hydration !== 'ready' ? <Card><AppText>Loading contracts...</AppText></Card> :
      rows === null ? <Card><AppText color="danger">Report data could not be validated.</AppText></Card> :
      rows.length === 0 ? <Card><AppText>No installment contracts yet.</AppText></Card> :
      rows.map(row => <Card key={row.id} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{row.name}</AppText>
        <AppText color="textSecondary">{row.currencyCode} · {row.ownership.replace('_', ' ')}</AppText>
        <AppText>Total scheduled: {row.totalScheduled} {row.currencyCode}</AppText>
        <AppText>Due this month: {row.dueInPeriod} {row.currencyCode}</AppText>
        <AppText>Installments due: {row.dueCount} / {row.scheduledCount}</AppText>
      </Card>)}
  </Screen>;
}
