import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { moduleColors, useTheme } from '@/theme';

export default function InstallmentsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const tone = colors.finance.account;
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  const busy = useRef(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate();
  }, []);
  const ready = saved.hydration === 'ready' && saved.writeStatus === 'idle';
  const openContract = (id: string, mode: 'details' | 'edit') => {
    if (!ready || busy.current) return;
    router.push({ pathname: '/finance/installment-contract', params: { id, mode } });
  };
  const confirmDelete = (id: string, name: string, revision: string) => {
    if (!ready || busy.current) return;
    Alert.alert('Delete contract?', 'Delete "' + name + '" and its installment schedule? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void (async () => {
        if (busy.current || installmentsStorage.getState().hydration !== 'ready' || installmentsStorage.getState().writeStatus !== 'idle') return;
        busy.current = true;
        setMessage('Deleting contract...');
        try {
          const result = await installmentsStorage.deleteContract(id, revision);
          setMessage(result.ok ? 'Contract deleted and verified. No balances changed.' :
            'Delete not confirmed (' + result.error.code + '). Check saved contracts before retrying.');
        } catch {
          setMessage('Delete could not be confirmed. Check saved contracts before retrying.');
        } finally { busy.current = false; }
      })(); } },
    ]);
  };
  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Finance" onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <AppText variant="h1">Installments</AppText>
          <AppText variant="caption" color="textSecondary">Standalone contract schedules</AppText>
        </View>
      </View>
      <AppButton title="+ New Contract" accentColor={moduleColors.finance}
        disabled={!ready} onPress={() => router.push({ pathname: '/finance/installment-contract', params: { id: 'new' } })} />
      <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.sm }}>
        Schedules only. Payments and balance posting are not available.
      </AppText>
      {message ? <AppText color="textSecondary">{message}</AppText> : null}
      {saved.hydration === 'blocked' ? (
        <Card variant="filled"><AppText color="danger">Saved contracts could not be loaded.</AppText>
          <AppButton title="Retry loading" onPress={() => { void installmentsStorage.hydrate(); }} /></Card>
      ) : saved.hydration !== 'ready' ? (
        <Card variant="filled"><AppText>Loading saved contracts...</AppText></Card>
      ) : saved.contracts.length === 0 ? (
        <Card variant="filled"><AppText>No installment contracts yet.</AppText></Card>
      ) : (
        <View style={styles.list}>
          <AppText variant="bodyStrong">Saved contracts ({saved.contracts.length})</AppText>
          {saved.contracts.map(record => (
            <Card key={record.contract.id} variant="outlined" padded={false}
              style={[styles.card, { backgroundColor: tone.surface, borderColor: tone.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={'Details for ' + record.name}
                onPress={() => openContract(record.contract.id, 'details')}
                style={({ pressed }) => [styles.heading, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={[styles.icon, { backgroundColor: colors.surface }]}>
                  <Ionicons name="document-text-outline" size={20} color={tone.accent} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{record.name}</AppText>
                  <AppText variant="caption" color="textSecondary">Standalone · {record.contract.currencyCode}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={'Details for ' + record.name + ' schedule'}
                onPress={() => openContract(record.contract.id, 'details')} style={styles.metrics}>
                <View style={styles.flex}>
                  <AppText variant="caption" color="textSecondary">Contract total</AppText>
                  <AppText variant="bodyStrong" color={tone.accent}>{record.contract.totalAmount} {record.contract.currencyCode}</AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="caption" color="textSecondary">Installments</AppText>
                  <AppText variant="bodyStrong">{record.contract.schedule.length}</AppText>
                </View>
              </Pressable>
              <FinanceActionButtons label={record.name}
                onEdit={() => openContract(record.contract.id, 'edit')}
                onDelete={() => confirmDelete(record.contract.id, record.name, record.updatedAt)} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 12, marginTop: 16 },
  card: { padding: 10, borderRadius: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.22)', marginTop: 8, paddingTop: 10, paddingBottom: 2 },
});
