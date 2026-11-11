import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { FinanceActionButtons } from './FinanceActionButtons';

/** Shared three-zone asset/account card. Actions are siblings of the details target. */
export function FinanceRecordCard({ icon, kind, quantity, name, value, accessibilityLabel, onPress, onEdit, onDelete, negative = false }: {
  icon: ReactNode; kind: string; quantity: string; name: string; value: string;
  accessibilityLabel: string; onPress: () => void; onEdit: () => void; onDelete: () => void; negative?: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 340;
  return <Card variant="outlined" padded={false} style={{ padding: 8 }}>
    <View style={[styles.row, stacked && { flexDirection: 'column', alignItems: 'stretch' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.type}>
          {icon}
          <AppText variant="caption" style={{ fontWeight: '600' }}>{kind}</AppText>
          <AppText variant="label" color="textSecondary">{quantity}</AppText>
        </View>
        <AppText variant="bodyStrong" style={styles.name}>{name}</AppText>
      </Pressable>
      <View style={[styles.right, stacked && { maxWidth: '100%' }]}>
        <AppText variant="caption" color={negative ? 'danger' : 'text'} style={styles.amount}>{value}</AppText>
        <FinanceActionButtons label={name} onEdit={onEdit} onDelete={onDelete} />
      </View>
    </View>
  </Card>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, minHeight: 48 },
  type: { flexShrink: 1, maxWidth: '52%', gap: 2 },
  name: { flex: 1, minWidth: 0, fontSize: 13 },
  right: { flexShrink: 1, maxWidth: '48%', alignItems: 'flex-end', minWidth: 0 },
  amount: { fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
});
