import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { AssetTypeIcon } from '@/features/finance/components/AssetTypeIcon';
import type { Asset } from '@/features/finance/types/finance';
import { useTheme } from '@/theme';

interface AssetCardProps {
  asset: Asset;
  categoryLabel: string;
  balanceText: string;
  valuationText?: string;
  baseCurrency: string;
  onViewEntries: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Content-driven compact card. No clipped names/amounts or oversized icon panels. */
export function AssetCard({ asset, categoryLabel, balanceText, valuationText, baseCurrency,
  onViewEntries, onEdit, onDelete }: AssetCardProps) {
  const { colors, spacing, radius } = useTheme();
  const metal = asset.category === 'gold' || asset.category === 'silver';
  const actions = [
    { title: 'Movements', icon: 'list-outline' as const, color: colors.info, onPress: onViewEntries },
    { title: 'Edit', icon: 'create-outline' as const, color: colors.primary, onPress: onEdit },
    { title: 'Delete', icon: 'trash-outline' as const, color: colors.danger, onPress: onDelete },
  ];
  return (
    <Card variant="outlined" padded={false} style={{ padding: spacing.sm, gap: spacing.xs }}>
      <Pressable onPress={onViewEntries} accessibilityRole="button"
        accessibilityLabel={'Movements for ' + asset.name + ', ' + categoryLabel + ', ' + balanceText + (valuationText ? ', ' + valuationText : '')}
        accessibilityHint="Open recorded asset movements"
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.heading}>
          <AssetTypeIcon category={asset.category} />
          <View style={styles.name}>
            <AppText variant="bodyStrong">{asset.name}</AppText>
            <AppText variant="label" color="textSecondary">{categoryLabel}</AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} accessible={false} />
        </View>
        <View style={styles.values}>
          <View style={styles.value}>
            <AppText variant="label" color="textSecondary">{metal ? 'Weight' : 'Balance'}</AppText>
            <AppText variant="caption" style={styles.amount} textBreakStrategy="simple">{balanceText}</AppText>
          </View>
          {valuationText !== undefined && (
            <View style={styles.value}>
              <AppText variant="label" color="textSecondary">{'Value in ' + baseCurrency}</AppText>
              <AppText variant="caption" style={styles.amount} textBreakStrategy="simple">{valuationText}</AppText>
            </View>
          )}
        </View>
      </Pressable>
      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        {actions.map(action => (
          <Pressable key={action.title} onPress={action.onPress} accessibilityRole="button"
            accessibilityLabel={action.title + ' ' + asset.name}
            style={({ pressed }) => [styles.action, { borderRadius: radius.sm, opacity: pressed ? 0.65 : 1 }]}>
            <Ionicons name={action.icon} size={18} color={action.color} accessible={false} />
            <AppText variant="caption" color={action.color} style={styles.actionLabel}>{action.title}</AppText>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { minHeight: 48 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  name: { flex: 1, minWidth: 0 },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  value: { flexGrow: 1, flexBasis: 112, minWidth: 0 },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  action: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  actionLabel: { flexShrink: 1 },
});
