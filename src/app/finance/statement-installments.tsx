import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { aggregateSavedInstallmentsReport } from '@/features/finance/utils/reportSavedInstallments';
import { useTheme } from '@/theme';

/** Scheduled due dates only. Does not infer payment status or account effects. */
export default function InstallmentsStatementScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ month?: string }>();
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  const month = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  useEffect(() => { if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate(); }, []);
  const period = useMemo(() => {
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    if (year < 100) return null;
    return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
  }, [month]);
  const rows = useMemo(() => {
    if (saved.hydration !== 'ready' || !period) return null;
    try { return aggregateSavedInstallmentsReport(saved.contracts, period.from, period.to); } catch { return null; }
  }, [saved, period]);
  const entries = useMemo(() => {
    if (!rows || !period) return [];
    const ids = new Set(rows.map(row => row.id));
    return saved.contracts.filter(record => ids.has(record.contract.id)).flatMap(record =>
      record.contract.schedule.filter(item => item.dueDate >= period.from && item.dueDate <= period.to)
        .map(item => ({ id: record.contract.id + ':' + item.id, name: record.name,
          date: item.dueDate, amount: item.amount, currency: record.contract.currencyCode })))
      .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [saved, rows, period]);
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Installments Report"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Installments Report</AppText>
    </Pressable>
    <AppText variant="h1">Installments Schedule Statement</AppText>
    <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
      {month ?? 'Invalid month'} · Scheduled due dates only. Paid, overdue and remaining balances are not verified here.
    </AppText>
    {!period ? <Card><AppText>Invalid statement month.</AppText></Card> :
      saved.hydration === 'blocked' ? <Card><AppText>Saved installments unavailable.</AppText></Card> :
      saved.hydration !== 'ready' ? <Card><AppText>Loading contracts...</AppText></Card> :
      rows === null ? <Card><AppText>Schedule statement unavailable.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>No installments scheduled this month.</AppText></Card> :
      entries.map(item => <Card key={item.id} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{item.name}</AppText>
        <AppText>{item.date} · {item.amount} {item.currency}</AppText>
      </Card>)}
  </Screen>;
}
