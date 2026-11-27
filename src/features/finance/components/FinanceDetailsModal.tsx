import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

/** Read-only details. No record objects or mutation callbacks cross this boundary. */
export function FinanceDetailsModal({ title, subtitle, lines = [], metrics = [], children, onClose, compact = false, detailIcon, plainLines = false }: {
  title?: string; subtitle?: string; lines?: readonly string[]; metrics?: readonly { label: string; value: string }[]; children?: ReactNode; onClose: () => void; compact?: boolean; detailIcon?: { name: keyof typeof Ionicons.glyphMap; color: string }; plainLines?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useAppLanguage();
  return <Modal visible={title !== undefined} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
      <View accessibilityViewIsModal style={[styles.panel, compact && styles.compactPanel, { backgroundColor: colors.surface }]}>
        <View style={[styles.heading, { backgroundColor: '#1E293B' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("Back to list", "العودة إلى القائمة")} onPress={onClose} style={styles.back}>
            <Ionicons name="arrow-back" size={21} color="#D6B777" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}><AppText variant="h3" color="#FFFFFF" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</AppText>{subtitle ? <AppText variant="caption" color="#D6B777" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{subtitle}</AppText> : null}</View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, compact && styles.compactScrollContent]} showsVerticalScrollIndicator={false}>
          {metrics.length > 0 && <View style={[styles.metrics, compact && styles.compactMetrics]}>
            {metrics.map(field => <View key={field.label} style={[styles.metric, compact && styles.compactMetric, { backgroundColor: colors.finance.neutral.surface, borderWidth: 1, borderColor: colors.finance.neutral.border }]}>
              <AppText variant="label" style={[{ fontWeight: '700' }, compact && styles.compactMetricLabel]} color={colors.finance.neutral.accent}>{field.label}</AppText>
              <AppText variant="bodyStrong"  style={[{ fontVariant: ['tabular-nums'] }, compact && styles.compactMetricValue]}>{field.value}</AppText>
            </View>)}
          </View>}
          {detailIcon ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}><Ionicons name={detailIcon.name} size={23} color={detailIcon.color} accessible={false} /><AppText variant="label" color="textSecondary">{t("Category", "التصنيف")}</AppText></View> : null}
          {lines.length > 0 && <View style={[styles.detailGroup, { borderColor: colors.border }]}>
            {lines.filter(Boolean).map((line, index) => {
              const separator = line.indexOf(': ');
              return <View key={index} style={[styles.detailRow, compact && styles.compactDetailRow]}>
                {separator > 0 && !plainLines ? <AppText style={{ flexShrink: 1 }}>
                  <AppText style={{ fontWeight: '800' }}>{line.slice(0, separator + 1)}</AppText>
                  {' ' + line.slice(separator + 2)}
                </AppText> : <AppText style={{ flexShrink: 1 }}>{line}</AppText>}
              </View>;
            })}
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
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  scrollContent: { gap: 12, paddingBottom: 24 },
  detailGroup: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  detailRow: { paddingVertical: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 4 },
  back: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  compactPanel: { padding: 12, gap: 7 },
  compactScrollContent: { gap: 7, paddingBottom: 20 },
  compactMetrics: { gap: 5 },
  compactMetric: { paddingHorizontal: 7, paddingVertical: 5, minWidth: 0, gap: 1 },
  compactMetricLabel: { fontSize: 11 },
  compactMetricValue: { fontSize: 13 },
  compactDetailRow: { paddingVertical: 5 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '46%', flexGrow: 1, minWidth: 120, padding: 10, borderRadius: 10, gap: 3 },
});
