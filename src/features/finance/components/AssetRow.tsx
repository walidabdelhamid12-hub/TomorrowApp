
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
  onDelete: () => void;
}

export function AssetRow({
  asset,
  baseCurrency,
  rates,
  gold24PerGram,
  silverPerGram,
  first,
  onDelete,
}: AssetRowProps) {
  const { colors, spacing, isDark } = useTheme();

  const isGold = asset.category === 'gold';
  const isSilver = asset.category === 'silver';
  const isLocalCurrency = asset.category === 'local_currency';
  const isForeignCurrency = asset.category === 'foreign_currency';

  const balance = getAssetBalance(asset);

  const lastDate = asset.entries.reduce<string>(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    '',
  );

  const goldText = isDark ? GOLD_COLORS.light : GOLD_COLORS.dark;
  const silverText = isDark ? '#CBD5E1' : '#64748B';

  const metalTextColor = isGold
    ? goldText
    : isSilver
      ? silverText
      : 'text';

  let amountText: string;
  let subtitle: string;
  let showConverted: boolean;
  let assetFlag = '';

  if (asset.category === 'gold') {
    amountText = `${formatNumber(balance, 3)} g`;
    subtitle = `Gold ${asset.karat}K`;
    showConverted = true;
  } else if (asset.category === 'silver') {
    amountText = `${formatNumber(balance, 3)} g`;
    subtitle = 'Silver';
    showConverted = true;
  } else if (asset.category === 'local_currency') {
    const currency = asset.currencyCode;
    assetFlag = getCurrencyFlag(currency);

    amountText = `${formatMoney(balance, currency)} ${assetFlag} ${currency}`;
    subtitle = `Local currency · ${assetFlag} ${getCurrencyLabel(currency)}`;
    showConverted = currency !== baseCurrency;
  } else if (asset.category === 'foreign_currency') {
    const currency = asset.currencyCode;
    assetFlag = getCurrencyFlag(currency);

    amountText = `${formatMoney(balance, currency)} ${assetFlag} ${currency}`;
    subtitle = `Foreign currency · ${assetFlag} ${getCurrencyLabel(currency)}`;
    showConverted = currency !== baseCurrency;
  } else {
    // Fallback for an unexpected category at runtime.
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
  } else if (asset.category === 'gold') {
    convertedText = 'Set gold price in Rates';
  } else if (asset.category === 'silver') {
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
            <Ionicons
              name="layers-outline"
              size={14}
              color={SILVER_COLOR}
            />
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
        <AppText
          variant="bodyStrong"
          numberOfLines={1}
          color={metalTextColor}
        >
          {asset.name}
        </AppText>

        <AppText
          variant="caption"
          color="textSecondary"
          numberOfLines={1}
        >
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

      <Pressable
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${asset.name}`}
        style={{ marginStart: spacing.sm }}
      >
        <Ionicons
          name="trash-outline"
          size={14}
          color={colors.textSecondary}
        />
      </Pressable>
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
