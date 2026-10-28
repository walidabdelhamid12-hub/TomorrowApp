import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui';
import {
    getCurrencyFlag,
    getCurrencyLabel,
} from '@/features/finance/constants/currencies';
import { GOLD_COLORS } from '@/features/finance/constants/metals';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance } from '@/features/finance/utils/finance';
import type { RateMap } from '@/features/finance/utils/money';
import { formatMoney, formatNumber } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { moduleColors, useTheme } from '@/theme';

interface AssetRowProps {
  asset: Asset;
  baseCurrency: string;
  rates: RateMap;
  gold24PerGram: number | null;
  first: boolean;
  onDelete: () => void;
}

export function AssetRow({
  asset,
  baseCurrency,
  rates,
  gold24PerGram,
  first,
  onDelete,
}: AssetRowProps) {
  const { colors, spacing, isDark } = useTheme();

  const isGold = asset.category === 'gold';
  const goldText = isDark ? GOLD_COLORS.light : GOLD_COLORS.dark;
  const balance = getAssetBalance(asset);
  const lastDate = asset.entries.reduce(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    ''
  );

  let amountText: string;
  let subtitle: string;
  let showConverted: boolean;
  let flag = '';

  if (asset.category === 'gold') {
    amountText = `${formatNumber(balance, 3)} g`;
    subtitle = `Gold ${asset.karat}K`;
    showConverted = true;
  } else {
    flag = getCurrencyFlag(asset.currencyCode);
    amountText = `${formatMoney(balance, asset.currencyCode)} ${getCurrencyLabel(asset.currencyCode)}`;
    subtitle =
      asset.category === 'local_currency' ? 'Local currency' : 'Foreign currency';
    showConverted = asset.currencyCode !== baseCurrency;
  }

  const value = getAssetValueInBase(asset, baseCurrency, rates, gold24PerGram);
  const convertedText =
    value === null
      ? isGold
        ? 'set the gold price in Rates'
        : 'no rate'
      : `≈ ${formatMoney(value, baseCurrency)} ${baseCurrency}`;

  return (
    <View
      style={[
        styles.row,
        {
          padding: spacing.lg,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: isGold ? GOLD_COLORS.main + '14' : undefined,
        },
      ]}
    >
      {isGold ? (
        <LinearGradient
          colors={GOLD_COLORS.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.badge, { marginEnd: spacing.md }]}
        >
          <Ionicons name="diamond" size={18} color="#FFFFFF" />
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: moduleColors.finance + '22',
              marginEnd: spacing.md,
            },
          ]}
        >
          {flag ? (
            <Text style={styles.flag}>{flag}</Text>
          ) : (
            <Ionicons name="cash-outline" size={18} color={moduleColors.finance} />
          )}
        </View>
      )}

      <View style={styles.flex}>
        <AppText
          variant="bodyStrong"
          numberOfLines={1}
          color={isGold ? goldText : 'text'}
        >
          {asset.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
          {lastDate ? ` · updated ${lastDate}` : ''}
        </AppText>
      </View>

      <View style={styles.end}>
        <AppText variant="bodyStrong" color={isGold ? goldText : 'text'}>
          {amountText}
        </AppText>
        {showConverted ? (
          <AppText variant="caption" color="textSecondary">
            {convertedText}
          </AppText>
        ) : null}
      </View>

      <Pressable
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${asset.name}`}
        style={{ marginStart: spacing.md }}
      >
        <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: { fontSize: 20 },
});