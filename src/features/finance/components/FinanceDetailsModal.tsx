import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

/** Read-only details. No record objects or mutation callbacks cross this boundary. */
export function FinanceDetailsModal({ title, lines = [], metrics = [], children, onClose }: {
  title?: string; lines?: readonly string[]; metrics?: readonly { label: string; value: string }[]; children?: ReactNode; onClose: () => void;
}) {
  const { colors } = useTheme();
  return <Modal visible={title !== undefined} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <View accessibilityViewIsModal style={[styles.panel, { backgroundColor: colors.surface }]}>
        <View style={styles.heading}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to list" onPress={onClose} style={styles.back}>
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>
          <AppText variant="h3" style={{ flex: 1 }}>{title}</AppText>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {metrics.length > 0 && <View style={styles.metrics}>
            {metrics.map(field => <View key={field.label} style={[styles.metric, { backgroundColor: colors.finance.neutral.surface, borderWidth: 1, borderColor: colors.finance.neutral.border }]}>
              <AppText variant="label" color={colors.finance.neutral.accent}>{field.label}</AppText>
              <AppText variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{field.value}</AppText>
            </View>)}
          </View>}
          {lines.length > 0 && <View style={[styles.detailGroup, { borderColor: colors.border }]}>
            {lines.filter(Boolean).map((line, index) => <View key={index} style={styles.detailRow}><AppText style={{ flexShrink: 1 }}>{line}</AppText></View>)}
          </View>}
          {children}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxHeight: '85%', borderRadius: 18, padding: 16, gap: 12 },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 12, paddingBottom: 8 },
  detailGroup: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  detailRow: { paddingVertical: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '46%', flexGrow: 1, minWidth: 120, padding: 10, borderRadius: 10, gap: 3 },
});
