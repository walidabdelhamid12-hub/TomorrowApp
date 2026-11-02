
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { AppButton, AppInput, AppText } from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import {
  CURRENCIES,
  RATE_ANCHOR,
} from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { parseAmount } from '@/features/finance/utils/money';
import type { RefreshResult } from '@/services/liveRates';
import { moduleColors, useTheme } from '@/theme';

interface RatesModalProps {
  visible: boolean;
  onClose: () => void;
  refreshRates: () => Promise<RefreshResult | null>;
  isRefreshing: boolean;
  lastResult?: RefreshResult | null;
}

const showRate = (value: number): string =>
  String(Number(value.toFixed(4)));

const showMetal = (value: number | null): string =>
  value === null ? '' : String(Number(value.toFixed(2)));

function isValidRate(value: number | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

function formatLocalDate(value: string | null): string {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Invalid date';
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Displays and edits rates relative to the selected base currency. */
export function RatesModal({
  visible,
  onClose,
  refreshRates,
  isRefreshing,
  lastResult = null,
}: RatesModalProps) {
  const { colors, spacing, radius } = useTheme();

  const rates = useCurrencyStore((s) => s.rates);
  const metals = useCurrencyStore((s) => s.metals);
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const updatedAt = useCurrencyStore((s) => s.updatedAt);

  const lastLiveUpdatedAt = useCurrencyStore(
    (s) => s.lastLiveUpdatedAt,
  );

  const lastManualUpdatedAt = useCurrencyStore(
    (s) => s.lastManualUpdatedAt,
  );

  const source = useCurrencyStore((s) => s.source);
  const setRate = useCurrencyStore((s) => s.setRate);
  const setMetalPrice = useCurrencyStore((s) => s.setMetalPrice);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [refreshMessage, setRefreshMessage] =
    useState<RefreshResult | null>(null);

  const rotation = useRef(new Animated.Value(0)).current;

  const baseRate = rates[baseCurrency];

  const displayedCurrencies = CURRENCIES.filter(
    (currency) => currency.code !== baseCurrency,
  );

  const currencyRows = Array.from(
    { length: Math.ceil(displayedCurrencies.length / 3) },
    (_, index) => displayedCurrencies.slice(index * 3, index * 3 + 3),
  );

  useEffect(() => {
    if (isRefreshing) {
      rotation.setValue(0);

      const animation = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      );

      animation.start();

      return () => animation.stop();
    }

    rotation.stopAnimation();
    rotation.setValue(0);
  }, [isRefreshing, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    if (!visible) return;

    setError(undefined);
    setRefreshMessage(null);
  }, [visible]);

  useEffect(() => {
    if (lastResult) {
      setRefreshMessage(lastResult);
    }
  }, [lastResult]);

  // Convert stored EGP-based rates into the selected display currency.
  useEffect(() => {
    if (!visible || !isValidRate(baseRate)) return;

    const initial: Record<string, string> = {};

    displayedCurrencies.forEach((currency) => {
      const storedRate = rates[currency.code] ?? 0;
      initial[currency.code] = showRate(storedRate / baseRate);
    });

    setDrafts(initial);

    setGold(
      metals.gold24PerGram === null
        ? ''
        : showMetal(metals.gold24PerGram / baseRate),
    );

    setSilver(
      metals.silverPerGram === null
        ? ''
        : showMetal(metals.silverPerGram / baseRate),
    );
  }, [
    visible,
    updatedAt,
    baseCurrency,
    baseRate,
    rates,
    metals,
  ]);

  // Detect changes that have not been saved yet.
  const hasUnsavedChanges = (() => {
    if (!isValidRate(baseRate)) return false;

    for (const currency of displayedCurrencies) {
      if (currency.code === RATE_ANCHOR) continue;

      const displayValue = parseAmount(
        drafts[currency.code] ?? '',
      );

      if (displayValue === null || displayValue <= 0) {
        return true;
      }

      const storedValue = displayValue * baseRate;
      const currentValue = rates[currency.code] ?? 0;

      if (
        Math.abs(storedValue - currentValue) > 0.0000001
      ) {
        return true;
      }
    }

    if (gold.trim() !== '') {
      const goldValue = parseAmount(gold);

      if (goldValue === null || goldValue <= 0) {
        return true;
      }

      const storedGold = goldValue * baseRate;

      if (
        metals.gold24PerGram === null ||
        Math.abs(storedGold - metals.gold24PerGram) > 0.0000001
      ) {
        return true;
      }
    }

    if (silver.trim() !== '') {
      const silverValue = parseAmount(silver);

      if (silverValue === null || silverValue <= 0) {
        return true;
      }

      const storedSilver = silverValue * baseRate;

      if (
        metals.silverPerGram === null ||
        Math.abs(storedSilver - metals.silverPerGram) > 0.0000001
      ) {
        return true;
      }
    }

    return false;
  })();

  const handleRefresh = async () => {
    setRefreshMessage(null);

    const result = await refreshRates();

    if (result) {
      setRefreshMessage(result);
    }
  };

  const save = () => {
    setError(undefined);

    if (!isValidRate(baseRate)) {
      setError(`No valid exchange rate found for ${baseCurrency}.`);
      return;
    }

    const parsed: Record<string, number> = {};

    for (const currency of displayedCurrencies) {
      if (currency.code === RATE_ANCHOR) continue;

      const displayValue = parseAmount(
        drafts[currency.code] ?? '',
      );

      if (displayValue === null || displayValue <= 0) {
        setError(`Enter a valid rate for ${currency.code}.`);
        return;
      }

      parsed[currency.code] = displayValue * baseRate;
    }

    const goldDisplay =
      gold.trim() === '' ? null : parseAmount(gold);

    const silverDisplay =
      silver.trim() === '' ? null : parseAmount(silver);

    if (
      gold.trim() !== '' &&
      (goldDisplay === null || goldDisplay <= 0)
    ) {
      setError('Enter a valid gold price.');
      return;
    }

    if (
      silver.trim() !== '' &&
      (silverDisplay === null || silverDisplay <= 0)
    ) {
      setError('Enter a valid silver price.');
      return;
    }

    let saveFailed = false;

    Object.entries(parsed).forEach(([code, value]) => {
      const current = rates[code] ?? 0;

      if (
        Math.abs(value - current) > 0.0000001 &&
        !setRate(code, value)
      ) {
        saveFailed = true;
      }
    });

    if (goldDisplay !== null) {
      const goldStored = goldDisplay * baseRate;

      if (
        metals.gold24PerGram === null ||
        Math.abs(goldStored - metals.gold24PerGram) > 0.0000001
      ) {
        if (!setMetalPrice('gold24PerGram', goldStored)) {
          saveFailed = true;
        }
      }
    }

    if (silverDisplay !== null) {
      const silverStored = silverDisplay * baseRate;

      if (
        metals.silverPerGram === null ||
        Math.abs(silverStored - metals.silverPerGram) > 0.0000001
      ) {
        if (!setMetalPrice('silverPerGram', silverStored)) {
          saveFailed = true;
        }
      }
    }

    if (saveFailed) {
      setError('Some rates could not be saved.');
      return;
    }

    onClose();
  };

  const sourceLabel = {
    live: 'Live',
    manual: 'Manual',
    default: 'Default',
  }[source];

  const cardStyle = {
    flex: 1,
    minWidth: 0,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  } as const;

  return (
    <FormModal visible={visible} title="Exchange rates" onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="caption" color="textSecondary">
              Current source: {sourceLabel}
            </AppText>

            <AppText variant="caption" color="textSecondary">
              Last live update: {formatLocalDate(lastLiveUpdatedAt)}
            </AppText>

            <AppText variant="caption" color="textSecondary">
              Last manual change: {formatLocalDate(lastManualUpdatedAt)}
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh exchange rates"
            accessibilityState={{ disabled: isRefreshing }}
            disabled={isRefreshing}
            onPress={() => void handleRefresh()}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isRefreshing ? 0.7 : 1,
            }}
          >
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Ionicons
                name="refresh-circle"
                size={27}
                color={moduleColors.finance}
              />
            </Animated.View>
          </Pressable>
        </View>

        {isRefreshing ? (
          <AppText variant="caption" color="textSecondary">
            Updating exchange rates...
          </AppText>
        ) : null}

        {refreshMessage ? (
          <AppText
            variant="caption"
            color={refreshMessage.ok ? 'success' : 'danger'}
          >
            {refreshMessage.message}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="textSecondary">
          CURRENCIES — VALUE IN {baseCurrency}
        </AppText>

        {currencyRows.map((row, rowIndex) => (
          <View
            key={`currency-row-${rowIndex}`}
            style={{
              flexDirection: 'row',
              gap: spacing.xs,
            }}
          >
            {row.map((currency) => {
              const isAnchor = currency.code === RATE_ANCHOR;

              return (
                <View key={currency.code} style={cardStyle}>
                  <View
                    style={{
                      minHeight: 28,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {currency.flag ? (
                      <AppText style={{ fontSize: 19 }}>
                        {currency.flag}
                      </AppText>
                    ) : null}

                    <AppText
                      variant="label"
                      color="text"
                      style={{ fontWeight: '700' }}
                    >
                      {currency.code}
                    </AppText>
                  </View>

                  <AppInput
                    value={drafts[currency.code] ?? ''}
                    editable={!isAnchor}
                    onChangeText={(text) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [currency.code]: text,
                      }))
                    }
                    keyboardType="decimal-pad"
                    style={{
                      textAlign: 'center',
                      fontSize: 13,
                      paddingHorizontal: 2,
                    }}
                    containerStyle={{ width: '100%' }}
                  />
                </View>
              );
            })}
          </View>
        ))}

        {baseCurrency !== RATE_ANCHOR ? (
          <AppText variant="caption" color="textSecondary">
            {RATE_ANCHOR} is shown as a calculated reference rate and cannot
            be edited directly.
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="textSecondary">
          METALS — PRICE PER GRAM IN {baseCurrency}
        </AppText>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={cardStyle}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                marginBottom: spacing.xs,
              }}
            >
              <AppText style={{ fontSize: 23 }}>🥇</AppText>
              <AppText
                variant="label"
                color="text"
                style={{ fontWeight: '600' }}
              >
                Gold 24K
              </AppText>
            </View>

            <AppInput
              value={gold}
              onChangeText={setGold}
              keyboardType="decimal-pad"
              placeholder="not set"
              style={{ textAlign: 'center', fontSize: 14 }}
              containerStyle={{ width: '100%' }}
            />
          </View>

          <View style={cardStyle}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                marginBottom: spacing.xs,
              }}
            >
              <AppText style={{ fontSize: 23 }}>🥈</AppText>
              <AppText
                variant="label"
                color="text"
                style={{ fontWeight: '600' }}
              >
                Silver
              </AppText>
            </View>

            <AppInput
              value={silver}
              onChangeText={setSilver}
              keyboardType="decimal-pad"
              placeholder="not set"
              style={{ textAlign: 'center', fontSize: 14 }}
              containerStyle={{ width: '100%' }}
            />
          </View>
        </View>

        <AppText variant="caption" color="textSecondary">
          Other gold karats are calculated from the 24K price. Local market
          prices are usually higher than spot.
        </AppText>
      </View>

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <AppButton
        title="Save rates"
        variant={hasUnsavedChanges ? 'primary' : 'secondary'}
        accentColor={
          hasUnsavedChanges ? moduleColors.finance : undefined
        }
        disabled={!hasUnsavedChanges}
        onPress={save}
      />

      <AppText variant="caption" color="textSecondary">
        Currency rates by Exchange Rate API (exchangerate-api.com).
        Gold and silver spot prices by gold-api.com.
      </AppText>
    </FormModal>
  );
}
