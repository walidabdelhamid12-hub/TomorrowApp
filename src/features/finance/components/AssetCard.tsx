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
  return (
    <Card variant="outlined" padded={false} style={{ padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.finance.asset.surface, borderColor: colors.finance.asset.border, borderRadius: 14 }}>
      <View style={styles.content}>
        <Pressable onPress={onViewEntries} accessibilityRole="button"
          accessibilityLabel={'Movements for ' + asset.name + ', ' + categoryLabel + ', ' + balanceText + (valuationText ? ', ' + valuationText : '')}
          accessibilityHint="Open recorded asset movements"
          style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={styles.heading}>
            <AssetTypeIcon category={asset.category} currencyCode={'currencyCode' in asset ? asset.currencyCode : undefined} />
            <View style={styles.name}>
              <AppText variant="label" color={colors.finance.neutral.accent}>{categoryLabel}</AppText>
              <AppText variant="bodyStrong">{asset.name}</AppText>
              {valuationText !== undefined && <AppText variant="caption" color={colors.finance.neutral.accent}>{balanceText}</AppText>}
            </View>
            <View style={styles.value}>
              <AppText variant="caption" style={styles.amount} textBreakStrategy="simple">{valuationText ?? balanceText}</AppText>
              {valuationText !== undefined && <AppText variant="label" color={colors.finance.neutral.accent}>{'Value in ' + baseCurrency}</AppText>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} accessible={false} />
          </View>
        </Pressable>
        <FinanceActionButtons label={asset.name} onEdit={onEdit} onDelete={onDelete} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 0 },
  body: { minHeight: 48, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  name: { flex: 1, minWidth: 0 },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  value: { flexShrink: 1, maxWidth: '45%', minWidth: 0, alignItems: 'flex-end' },
  amount: { textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
