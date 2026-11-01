
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
import { moduleColors, useTheme } from '@/theme';

interface RatesModalProps {
  visible: boolean;
  onClose: () => void;
  refreshRates: () => Promise<unknown>;
  isRefreshing: boolean;
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

/** Displays and edits rates relative to the selected base currency. */
export function RatesModal({
  visible,
  onClose,
  refreshRates,
  isRefreshing,
}: RatesModalProps) {
  const { colors, spacing, radius } = useTheme();

  const rates = useCurrencyStore((s) => s.rates);
  const metals = useCurrencyStore((s) => s.metals);
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const updatedAt = useCurrencyStore((s) => s.updatedAt);
  const source = useCurrencyStore((s) => s.source);
  const setRate = useCurrencyStore((s) => s.setRate);
  const setMetalPrice = useCurrencyStore((s) => s.setMetalPrice);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [error, setError] = useState<string | undefined>();

  const rotation = useRef(new Animated.Value(0)).current;

  const baseRate = rates[baseCurrency];

  // The selected base currency is excluded from the displayed list.
  // EGP appears whenever another currency is selected.
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
  }, [visible]);

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

  const save = () => {
    if (!isValidRate(baseRate)) {
      setError(`No valid exchange rate found for ${baseCurrency}.`);
      return;
    }

    const parsed: Record<string, number> = {};

    for (const currency of displayedCurrencies) {
      // EGP is the fixed internal reference currency.
      // It is displayed as a calculated value, not edited directly.
      if (currency.code === RATE_ANCHOR) continue;

      const displayValue = parseAmount(
        drafts[currency.code] ?? '',
      );

      if (displayValue === null || displayValue <= 0) {
        setError(`Enter a valid rate for ${currency.code}.`);
        return;
      }

      // Convert the entered display value back into EGP storage.
      parsed[currency.code] = displayValue * baseRate;
    }

    const goldDisplay = gold.trim() === '' ? null : parseAmount(gold);
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

    Object.entries(parsed).forEach(([code, value]) => {
      const current = rates[code] ?? 0;

      if (Math.abs(value - current) > 0.0000001) {
        setRate(code, value);
      }
    });

    if (goldDisplay !== null) {
      const goldStored = goldDisplay * baseRate;

      if (
        metals.gold24PerGram === null ||
        Math.abs(goldStored - metals.gold24PerGram) > 0.0000001
      ) {
        setMetalPrice('gold24PerGram', goldStored);
      }
    }

    if (silverDisplay !== null) {
      const silverStored = silverDisplay * baseRate;

      if (
        metals.silverPerGram === null ||
        Math.abs(silverStored - metals.silverPerGram) > 0.0000001
      ) {
        setMetalPrice('silverPerGram', silverStored);
      }
    }

    onClose();
  };

  const status =
    source === 'default' || !updatedAt
      ? 'Using default placeholder rates.'
      : `Last update (${source}): ${updatedAt.slice(0, 16).replace('T', ' ')} UTC`;

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textSecondary">
            {status}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh exchange rates"
          accessibilityState={{ disabled: isRefreshing }}
          disabled={isRefreshing}
          onPress={() => void refreshRates()}
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
        variant="secondary"
        onPress={save}
      />

      <AppText variant="caption" color="textSecondary">
        Currency rates by Exchange Rate API (exchangerate-api.com), updated
        about once a day. Gold and silver spot prices by gold-api.com.
      </AppText>
    </FormModal>
  );
}
