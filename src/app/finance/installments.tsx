import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';

import { AppText, Card, Screen } from '@/components/ui';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

export default function InstallmentsScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const { colors, spacing } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
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
    confirm(t('Delete contract?', 'حذف العقد؟'), t('Delete "', 'حذف "') + name + t('" and its installment schedule? This cannot be undone.', '" وجدول أقساطه؟ لا يمكن التراجع عن ذلك.'), async () => {
        if (busy.current || installmentsStorage.getState().hydration !== 'ready' || installmentsStorage.getState().writeStatus !== 'idle') return false;
        busy.current = true;
        setMessage(t('Deleting contract...', 'جارٍ حذف العقد...'));
        try {
          const result = await installmentsStorage.deleteContract(id, revision);
          setMessage(result.ok ? t('Contract deleted and verified. No balances changed.', 'تم حذف العقد والتحقق منه. لم تتغير الأرصدة.') :
            t('Delete not confirmed (', 'لم يتم تأكيد الحذف (') + result.error.code + t('). Check saved contracts before retrying.', '). تحقق من العقود المحفوظة قبل إعادة المحاولة.'));
          return result.ok;
        } catch {
          setMessage(t('Delete could not be confirmed. Check saved contracts before retrying.', 'تعذر تأكيد الحذف. تحقق من العقود المحفوظة قبل إعادة المحاولة.'));
          return false;
        } finally { busy.current = false; }
    }, t('Delete', 'حذف'));
  };
  return (
    <Screen scroll style={{ backgroundColor: '#F1F5F9' }}>
      <View style={financeChrome.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back to Finance', 'العودة إلى المالية')} onPress={() => router.back()}
          style={financeChrome.back}>
          <Ionicons name="arrow-back" size={20} color="#D6B777" />
        </Pressable>
        <View style={styles.flex}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{t('Installments', 'الأقساط')}</AppText>
          <AppText variant="caption" style={{ color: '#CBD5E1' }}>{t('Standalone contract schedules', 'جداول العقود المستقلة')}</AppText>
        </View>
      </View>
      <AppText variant="caption" color="textSecondary" style={{ marginBottom: spacing.sm }}>
        {t('Schedules only. Payments and balance posting are not available.', 'الجداول فقط. الدفع وترحيل الأرصدة غير متاحين.')}
      </AppText>
      <AppButton title={t('+ New Contract', '+ عقد جديد')} accentColor="#1E293B"
        disabled={!ready} onPress={() => router.push({ pathname: '/finance/installment-contract', params: { id: 'new' } })} />
      {message ? <AppText color="textSecondary">{message}</AppText> : null}
      {saved.hydration === 'blocked' ? (
        <Card variant="filled"><AppText color="danger">{t('Saved contracts could not be loaded.', 'تعذر تحميل العقود المحفوظة.')}</AppText>
          <AppButton title={t('Retry loading', 'إعادة المحاولة')} onPress={() => { void installmentsStorage.hydrate(); }} /></Card>
      ) : saved.hydration !== 'ready' ? (
        <Card variant="filled"><AppText>{t('Loading saved contracts...', 'جارٍ تحميل العقود المحفوظة...')}</AppText></Card>
      ) : saved.contracts.length === 0 ? (
        <Card variant="filled"><AppText>{t('No installment contracts yet.', 'لا توجد عقود أقساط بعد.')}</AppText></Card>
      ) : (
        <View style={styles.list}>
          <AppText variant="bodyStrong">{t('Saved contracts', 'العقود المحفوظة')} ({saved.contracts.length})</AppText>
          {saved.contracts.map(record => (
            <Card key={record.contract.id} variant="outlined" padded={false}
              style={[styles.card, { backgroundColor: tone.surface, borderColor: tone.border }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Details for ', 'تفاصيل ') + record.name}
                onPress={() => openContract(record.contract.id, 'details')}
                style={({ pressed }) => [styles.heading, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={[styles.icon, { backgroundColor: colors.surface }]}>
                  <Ionicons name="document-text-outline" size={20} color={tone.accent} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{record.name}</AppText>
                  <AppText variant="caption" color="textSecondary">{t('Standalone', 'مستقل')} · {record.contract.currencyCode}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Details for ', 'تفاصيل ') + record.name + t(' schedule', ' - جدول الأقساط')}
                onPress={() => openContract(record.contract.id, 'details')} style={styles.metrics}>
                <View style={styles.flex}>
                  <AppText variant="caption" color="textSecondary">{t('Contract total', 'إجمالي العقد')}</AppText>
                  <AppText variant="bodyStrong" color={tone.accent}>{record.contract.totalAmount} {record.contract.currencyCode}</AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="caption" color="textSecondary">{t('Installments', 'الأقساط')}</AppText>
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
      {confirmation}
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
