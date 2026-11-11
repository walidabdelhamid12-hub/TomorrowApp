import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { buildScheduledInstallmentsStatement } from '@/features/finance/utils/statementScheduledInstallments';
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
  const statement = useMemo(() => {
    if (saved.hydration !== 'ready' || !period) return null;
    try { return buildScheduledInstallmentsStatement(saved.contracts, period.from, period.to); }
    catch { return null; }
  }, [saved, period]);
  const entries = statement?.entries ?? [];
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
      statement === null ? <Card><AppText>Schedule statement unavailable.</AppText></Card> :
      !statement.reconciled ? <Card><AppText>Schedule totals do not reconcile. Details are withheld.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>No installments scheduled this month.</AppText></Card> :
      entries.map(item => <Card key={item.id} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{item.name}</AppText>
        <AppText>{item.date} · {item.amount} {item.currency}</AppText>
      </Card>)}
  </Screen>;
}
