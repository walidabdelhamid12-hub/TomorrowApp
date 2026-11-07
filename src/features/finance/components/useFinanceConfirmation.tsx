import { useState } from 'react';
import { Modal, View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { useTheme } from '@/theme';

type Confirmation = { title: string; message: string; action: string; onConfirm: () => void };

/** One themed confirmation pattern. Dismissal and Android Back always cancel. */
export function useFinanceConfirmation() {
  const { colors } = useTheme();
  const [pending, setPending] = useState<Confirmation | null>(null);
  const cancel = () => setPending(null);
  const confirm = (title: string, message: string, onConfirm: () => void, action = 'Delete') => {
    let consumed = false;
    setPending({ title, message, action, onConfirm: () => {
      if (consumed) return;
      consumed = true;
      onConfirm();
    } });
  };
  const confirmation = pending && <Modal visible transparent animationType="fade" onRequestClose={cancel}>
    <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 20 }}>
      <View accessibilityViewIsModal style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 }}>
        <AppText variant="h3" accessibilityRole="header">{pending.title}</AppText>
        <AppText color="textSecondary">{pending.message}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <AppButton title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={cancel} />
          <AppButton title={pending.action} variant="danger" style={{ flex: 1 }} onPress={() => {
            const action = pending.onConfirm;
            setPending(null);
            action();
          }} />
        </View>
      </View>
    </View>
  </Modal>;
  return { confirm, confirmation };
}
