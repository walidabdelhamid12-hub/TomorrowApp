import { createFinanceConfirmationAttempt } from './financeConfirmationAttempt';
import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Modal, View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

type Confirmation = { title: string; message: string; action: string; attempt: ReturnType<typeof createFinanceConfirmationAttempt> };

/** One themed confirmation pattern. Dismissal and Android Back always cancel. */
export function useFinanceConfirmation() {
  const { colors } = useTheme();
  const { t } = useAppLanguage();
  const [pending, setPending] = useState<Confirmation | null>(null);
  const current = useRef<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = () => {
    if (!current.current?.attempt.cancel()) return;
    current.current = null;
    setPending(null);
  };
  const confirm = (title: string, message: string, onConfirm: () => unknown, action = 'Delete') => {
    if (current.current?.attempt.isRunning()) return;
    current.current?.attempt.cancel();
    const next = { title, message, action, attempt: createFinanceConfirmationAttempt(onConfirm) };
    current.current = next;
    setPending(next);
  };
  const submit = async (item: Confirmation) => {
    if (current.current !== item || item.attempt.isRunning()) return;
    setBusy(true);
    try {
      if (await item.attempt.run() && current.current === item) {
        current.current = null;
        setPending(null);
      }
    } catch (error) {
      Alert.alert(t('Finance save requires review', 'الحفظ المالي يحتاج مراجعة'), String(error));
    } finally {
      setBusy(false);
    }
  };
  const confirmation = pending && <Modal visible transparent animationType="fade" onRequestClose={cancel}>
    <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 }}>
      <View accessibilityViewIsModal style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={25} color={colors.danger} />
          <AppText variant="h3" color="danger" accessibilityRole="header" style={{ flex: 1 }}>{pending.title}</AppText>
        </View>
        <AppText color="textSecondary">{pending.message}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <AppButton title={t("Cancel", "إلغاء")} variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={cancel} />
          <AppButton title={pending.action === "Delete" ? t("Delete", "حذف") : pending.action} variant="danger" style={{ flex: 1 }} loading={busy} onPress={() => { void submit(pending); }} />
        </View>
      </View>
    </View>
  </Modal>;
  return { confirm, confirmation };
}
