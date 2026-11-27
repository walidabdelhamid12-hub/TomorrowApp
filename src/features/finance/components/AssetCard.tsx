import { useAppLanguage } from '@/localization/LanguageProvider';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { AssetTypeIcon } from '@/features/finance/components/AssetTypeIcon';
import { MetalTypeLabel } from '@/features/finance/components/MetalTypeLabel';
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
  const { t } = useAppLanguage();
  const currency = 'currencyCode' in asset ? asset.currencyCode : undefined;
  const flag = currency ? getCurrencyFlag(currency) : undefined;
  const original = flag && balanceText.includes(flag) ? balanceText.replace(flag + ' ', '') : balanceText;
  return (
    <Card variant="outlined" padded={false} style={{ padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.finance.account.surface, borderColor: colors.finance.account.border, borderRadius: 14 }}>
      <View style={styles.content}>
        <Pressable onPress={onViewEntries} accessibilityRole="button"
          accessibilityLabel={t('Movements for', 'حركات') + ' ' + asset.name + ', ' + categoryLabel + ', ' + balanceText + (valuationText ? ', ' + valuationText : '')}
          accessibilityHint={t('Open recorded asset movements', 'فتح حركات الأصل المسجلة')}
          style={({ pressed }) => [styles.body, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={styles.heading}>
            <View style={styles.type}>
              {currency ? <Ionicons name="cash-outline" size={19} color={colors.finance.account.accent} /> : <AssetTypeIcon category={asset.category} />}
              <AppText variant="caption" style={{ fontWeight: '700', textAlign: 'center' }} color={colors.finance.neutral.accent}>{asset.category === 'gold' || asset.category === 'silver' ? <MetalTypeLabel type={asset.category} suffix={categoryLabel.slice(asset.category === 'gold' ? 4 : 6)} /> : categoryLabel.split(' · ')[0]}</AppText>
            </View>
            <View style={styles.name}>
              <AppText variant="bodyStrong">{asset.name}</AppText>
              {currency ? <View style={{ gap: 2 }}>
                <AppText variant="bodyStrong" color={colors.finance.neutral.accent}>{original.endsWith(' ' + currency) ? original.slice(0, -currency.length - 1) : original}</AppText>
                <AppText variant="caption" color={colors.finance.neutral.accent}>{flag + ' ' + currency}</AppText>
              </View> : valuationText !== undefined && <AppText variant="bodyStrong" color={colors.finance.neutral.accent}>{original}</AppText>}
            </View>
            <View style={styles.value}>
              <AppText variant="bodyStrong" style={styles.amount} textBreakStrategy="simple">{valuationText ?? balanceText}</AppText>
              {valuationText !== undefined && <AppText variant="label" color={colors.finance.neutral.accent}>{t('Value in', 'القيمة بعملة') + ' ' + baseCurrency}</AppText>}
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
  type: { width: '25%', alignItems: 'center', gap: 2, flexShrink: 0 },
  value: { flexShrink: 1, maxWidth: '45%', minWidth: 0, alignItems: 'flex-end' },
  amount: { textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
