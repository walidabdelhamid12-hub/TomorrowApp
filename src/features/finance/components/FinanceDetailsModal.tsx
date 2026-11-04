import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Read-only details. No record objects or mutation callbacks cross this boundary. */
export function FinanceDetailsModal({ title, lines, onClose }: { title?: string; lines: readonly string[]; onClose: () => void }) {
  const { colors } = useTheme();
  return <Modal visible={title !== undefined} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <View accessibilityViewIsModal style={[styles.panel, { backgroundColor: colors.surface }]}>
        <AppText variant="h3">{title}</AppText>
        <ScrollView contentContainerStyle={{ gap: 8 }}>
          {lines.map((line, index) => <AppText key={index} style={{ flexShrink: 1 }}>{line}</AppText>)}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to list" onPress={onClose} style={styles.back}>
          <AppText color="primary">Back to list</AppText>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16 },
  panel: { maxHeight: '90%', borderRadius: 16, padding: 16, gap: 12 },
  back: { minHeight: 48, justifyContent: 'center' },
});
