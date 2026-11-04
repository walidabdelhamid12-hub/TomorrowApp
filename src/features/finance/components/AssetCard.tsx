import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
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
  const { colors, spacing } = useTheme();
  const metal = asset.category === 'gold' || asset.category === 'silver';
  return (
    <Card variant="outlined" padded={false} style={{ padding: spacing.sm, gap: spacing.xs }}>
      <View style={styles.content}>
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
        <FinanceActionButtons label={asset.name} onEdit={onEdit} onDelete={onDelete} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 },
  body: { minHeight: 48, flexGrow: 1, flexShrink: 1, flexBasis: 176, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  name: { flex: 1, minWidth: 0 },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  value: { flexGrow: 1, flexBasis: 112, minWidth: 0 },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
