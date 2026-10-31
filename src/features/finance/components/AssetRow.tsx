
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui';
import {
  getCurrencyFlag,
  getCurrencyLabel,
} from '@/features/finance/constants/currencies';
import {
  GOLD_COLORS,
  SILVER_COLOR,
} from '@/features/finance/constants/metals';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance } from '@/features/finance/utils/finance';
import type { RateMap } from '@/features/finance/utils/money';
import {
  formatMoney,
  formatNumber,
} from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { moduleColors, useTheme } from '@/theme';

interface AssetRowProps {
  asset: Asset;
  baseCurrency: string;
  rates: RateMap;
  gold24PerGram: number | null;
  silverPerGram: number | null;
  first: boolean;
  onEdit: () => void;
  onViewEntries: () => void;
  onDelete: () => void;
}

export function AssetRow({
  asset,
  baseCurrency,
  rates,
  gold24PerGram,
  silverPerGram,
  first,
  onEdit,
  onDelete,
}: AssetRowProps) {
  const { colors, spacing, isDark } = useTheme();

  const isGold = asset.category === 'gold';
  const isSilver = asset.category === 'silver';
  const isLocalCurrency = asset.category === 'local_currency';
  const isForeignCurrency = asset.category === 'foreign_currency';

  const isCurrencyAsset = isLocalCurrency || isForeignCurrency;

  const goldText = isDark ? GOLD_COLORS.light : GOLD_COLORS.dark;
  const silverText = isDark ? '#CBD5E1' : '#64748B';

  const metalTextColor = isGold
    ? goldText
    : isSilver
      ? silverText
      : 'text';

  const balance = getAssetBalance(asset);

  const lastDate = asset.entries.reduce(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    '',
  );

  const assetCurrency = isCurrencyAsset ? asset.currencyCode : undefined;
  const assetFlag = assetCurrency ? getCurrencyFlag(assetCurrency) : '';

  let amountText: string;
  let subtitle: string;
  let showConverted: boolean;

  if (isGold) {
    amountText = `${formatNumber(balance, 3)} g`;
    subtitle = `Gold ${asset.karat}K`;
    showConverted = true;
  } else if (isSilver) {
    amountText = `${formatNumber(balance, 3)} g`;
    subtitle = 'Silver';
    showConverted = true;
  } else if (isCurrencyAsset && assetCurrency) {
    amountText = `${formatMoney(balance, assetCurrency)} ${assetFlag} ${assetCurrency}`;
    subtitle = isLocalCurrency
      ? `Local currency · ${assetFlag} ${getCurrencyLabel(assetCurrency)}`
      : `Foreign currency · ${assetFlag} ${getCurrencyLabel(assetCurrency)}`;
    showConverted = assetCurrency !== baseCurrency;
  } else {
    amountText = formatNumber(balance, 3);
    subtitle = asset.name;
    showConverted = false;
  }

  const value = getAssetValueInBase(
    asset,
    baseCurrency,
    rates,
    gold24PerGram,
    silverPerGram,
  );

  let convertedText: string;

  if (value !== null) {
    convertedText = `≈ ${formatMoney(value, baseCurrency)} ${getCurrencyFlag(baseCurrency)} ${baseCurrency}`;
  } else if (isGold) {
    convertedText = 'Set gold price in Rates';
  } else if (isSilver) {
    convertedText = 'Set silver price in Rates';
  } else {
    convertedText = 'No rate available';
  }

  const badgeBackground = isGold
    ? undefined
    : isSilver
      ? `${SILVER_COLOR}22`
      : `${moduleColors.finance}18`;

  return (
    <View
      style={[
        styles.row,
        {
          padding: spacing.md,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: isGold
            ? `${GOLD_COLORS.main}10`
            : isSilver
              ? `${SILVER_COLOR}0D`
              : undefined,
        },
      ]}
    >
      {isGold ? (
        <LinearGradient
          colors={GOLD_COLORS.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.badge, { marginEnd: spacing.sm }]}
        >
          <Ionicons name="diamond" size={14} color="#FFFFFF" />
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badgeBackground,
              marginEnd: spacing.sm,
            },
          ]}
        >
          {isSilver ? (
            <Ionicons name="layers-outline" size={14} color={SILVER_COLOR} />
          ) : assetFlag ? (
            <Text style={styles.flag}>{assetFlag}</Text>
          ) : (
            <Ionicons
              name="cash-outline"
              size={14}
              color={moduleColors.finance}
            />
          )}
        </View>
      )}

      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1} color={metalTextColor}>
          {asset.name}
        </AppText>

        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
          {lastDate ? ` · updated ${lastDate}` : ''}
        </AppText>
      </View>

      <View style={styles.end}>
        <AppText variant="bodyStrong" color={metalTextColor}>
          {amountText}
        </AppText>

        {showConverted ? (
          <AppText variant="caption" color="textSecondary">
            {convertedText}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.actions, { marginStart: spacing.sm }]}>
        <Pressable
          onPress={onEdit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${asset.name}`}
          style={styles.actionButton}
        >
          <Ionicons
            name="create-outline"
            size={17}
            color={moduleColors.finance}
          />
        </Pressable>

        <Pressable
          onPress={onDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${asset.name}`}
          style={styles.actionButton}
        >
          <Ionicons
            name="trash-outline"
            size={15}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  end: {
    alignItems: 'flex-end',
    marginStart: 6,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    padding: 2,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: {
    fontSize: 14,
  },
});
