
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  View,
} from 'react-native';

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

import type {
  MetalKey,
  RateSource,
} from '@/features/finance/store/useCurrencyStore';

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

function hasDisplayValueChanged(
  currentValue: string,
  originalValue: string,
): boolean {
  const current = currentValue.trim();
  const original = originalValue.trim();

  if (current === '' || original === '') {
    return current !== original;
  }

  const currentNumber = parseAmount(current);
  const originalNumber = parseAmount(original);

  if (currentNumber === null || originalNumber === null) {
    return current !== original;
  }

  return Math.abs(currentNumber - originalNumber) > 0.0000001;
}

function formatLocalDate(value: string | null): string {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Not available';
  }

  const datePart = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart} – ${timePart}`;
}

const SOURCE_LABELS: Record<RateSource, string> = {
  live: 'LIVE',
  manual: 'MANUAL',
  default: 'N/C',
};

const SOURCE_BACKGROUNDS: Record<RateSource, string> = {
  live: '#E7F5E9',
  manual: '#E8F0FE',
  default: '#FCE8E8',
};

const SOURCE_BORDERS: Record<RateSource, string> = {
  live: '#A5D6A7',
  manual: '#AFC7F5',
  default: '#F0B4B4',
};

export function RatesModal({
  visible,
  onClose,
  refreshRates,
  isRefreshing,
  lastResult = null,
}: RatesModalProps) {
  const { colors, spacing, radius, sizes } = useTheme();

  const rates = useCurrencyStore((s) => s.rates);
  const metals = useCurrencyStore((s) => s.metals);
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const updatedAt = useCurrencyStore((s) => s.updatedAt);
  const lastLiveUpdatedAt = useCurrencyStore(
    (s) => s.lastLiveUpdatedAt,
  );

  const rateSources = useCurrencyStore((s) => s.rateSources);
  const metalSources = useCurrencyStore((s) => s.metalSources);

  const setManualRates = useCurrencyStore(
    (s) => s.setManualRates,
  );
  const setMetalPrice = useCurrencyStore(
    (s) => s.setMetalPrice,
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [refreshMessage, setRefreshMessage] =
    useState<RefreshResult | null>(null);

  const rotation = useRef(new Animated.Value(0)).current;

  // Diagnostic: component mount and unmount.
  useEffect(() => {
    console.log('[RatesModal] COMPONENT MOUNTED');

    return () => {
      console.log('[RatesModal] COMPONENT UNMOUNTED');
    };
  }, []);

  // Diagnostic: track visibility changes.
  useEffect(() => {
    console.log('[RatesModal] VISIBLE CHANGED:', visible);
  }, [visible]);

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

  const getCurrencySource = (code: string): RateSource =>
    rateSources[code] ?? 'default';

  const getMetalSource = (kind: MetalKey): RateSource =>
    metalSources[kind] ?? 'default';

  const getInputStatusStyle = (source: RateSource) => ({
    backgroundColor: SOURCE_BACKGROUNDS[source],
    borderColor: SOURCE_BORDERS[source],
    borderWidth: 1,
  });

  const hasUnsavedChanges = (() => {
    if (!isValidRate(baseRate)) return false;

    for (const currency of displayedCurrencies) {
      if (currency.code === RATE_ANCHOR) continue;

      const originalDisplay = showRate(
        (rates[currency.code] ?? 0) / baseRate,
      );

      if (
        hasDisplayValueChanged(
          drafts[currency.code] ?? '',
          originalDisplay,
        )
      ) {
        return true;
      }
    }

    const originalGoldDisplay =
      metals.gold24PerGram === null
        ? ''
        : showMetal(metals.gold24PerGram / baseRate);

    if (hasDisplayValueChanged(gold, originalGoldDisplay)) {
      return true;
    }

    const originalSilverDisplay =
      metals.silverPerGram === null
        ? ''
        : showMetal(metals.silverPerGram / baseRate);

    if (hasDisplayValueChanged(silver, originalSilverDisplay)) {
      return true;
    }

    return false;
  })();

  const handleClose = () => {
    console.log('[RatesModal] HANDLE CLOSE CALLED');
    console.log('[RatesModal] Unsaved changes:', hasUnsavedChanges);

    if (!hasUnsavedChanges) {
      console.log('[RatesModal] Calling onClose directly');
      onClose();
      return;
    }

    Alert.alert(
      'Unsaved changes',
      'You have unsaved rate changes. Do you want to discard them?',
      [
        {
          text: 'Keep editing',
          style: 'cancel',
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            console.log('[RatesModal] Discard confirmed; calling onClose');
            onClose();
          },
        },
      ],
    );
  };

  const handleRefresh = async () => {
    console.log('[RatesModal] REFRESH STARTED');

    setRefreshMessage(null);

    const result = await refreshRates();

    console.log('[RatesModal] REFRESH FINISHED:', result);

    if (result) {
      setRefreshMessage(result);
    }
  };

  const save = () => {
    console.log('[RatesModal] SAVE STARTED');
    console.log('[RatesModal] Visible at save:', visible);

    setError(undefined);

    if (!isValidRate(baseRate)) {
      console.log('[RatesModal] SAVE STOPPED: invalid base rate');
      setError(`No valid exchange rate found for ${baseCurrency}.`);
      return;
    }

    const changedRates: Record<string, number> = {};

    for (const currency of displayedCurrencies) {
      if (currency.code === RATE_ANCHOR) continue;

      const displayValue = parseAmount(
        drafts[currency.code] ?? '',
      );

      if (displayValue === null || displayValue <= 0) {
        console.log('[RatesModal] SAVE STOPPED: invalid currency', currency.code);
        setError(`Enter a valid rate for ${currency.code}.`);
        return;
      }

      const storedValue = displayValue * baseRate;

      if (!Number.isFinite(storedValue) || storedValue <= 0) {
        console.log('[RatesModal] SAVE STOPPED: invalid converted rate', currency.code);
        setError(`Invalid converted rate for ${currency.code}.`);
        return;
      }

      const originalDisplayValue = showRate(
        (rates[currency.code] ?? 0) / baseRate,
      );

      if (
        hasDisplayValueChanged(
          drafts[currency.code] ?? '',
          originalDisplayValue,
        )
      ) {
        changedRates[currency.code] = storedValue;
      }
    }

    const goldDisplay =
      gold.trim() === '' ? null : parseAmount(gold);

    const silverDisplay =
      silver.trim() === '' ? null : parseAmount(silver);

    if (
      gold.trim() !== '' &&
      (goldDisplay === null || goldDisplay <= 0)
    ) {
      console.log('[RatesModal] SAVE STOPPED: invalid gold price');
      setError(
        'Enter a valid gold price or leave it empty to clear it.',
      );
      return;
    }

    if (
      silver.trim() !== '' &&
      (silverDisplay === null || silverDisplay <= 0)
    ) {
      console.log('[RatesModal] SAVE STOPPED: invalid silver price');
      setError(
        'Enter a valid silver price or leave it empty to clear it.',
      );
      return;
    }

    const goldStored =
      goldDisplay === null ? null : goldDisplay * baseRate;

    const silverStored =
      silverDisplay === null ? null : silverDisplay * baseRate;

    if (
      (goldStored !== null &&
        (!Number.isFinite(goldStored) || goldStored <= 0)) ||
      (silverStored !== null &&
        (!Number.isFinite(silverStored) || silverStored <= 0))
    ) {
      console.log('[RatesModal] SAVE STOPPED: invalid metal prices');
      setError('One or more metal prices are invalid.');
      return;
    }

    const originalGoldDisplay =
      metals.gold24PerGram === null
        ? ''
        : showMetal(metals.gold24PerGram / baseRate);

    const originalSilverDisplay =
      metals.silverPerGram === null
        ? ''
        : showMetal(metals.silverPerGram / baseRate);

    const goldChanged = hasDisplayValueChanged(
      gold,
      originalGoldDisplay,
    );

    const silverChanged = hasDisplayValueChanged(
      silver,
      originalSilverDisplay,
    );

    console.log('[RatesModal] Changed currencies:', Object.keys(changedRates));
    console.log('[RatesModal] Gold changed:', goldChanged);
    console.log('[RatesModal] Silver changed:', silverChanged);

    if (Object.keys(changedRates).length > 0) {
      console.log('[RatesModal] Saving currency rates');

      const saved = setManualRates(changedRates, {
        gold24PerGram: null,
        silverPerGram: null,
      });

      if (!saved) {
        console.log('[RatesModal] SAVE FAILED: currency rates');
        setError('Currency rates could not be saved.');
        return;
      }
    }

    if (goldChanged) {
      console.log('[RatesModal] Saving gold price');

      const saved = setMetalPrice('gold24PerGram', goldStored);

      if (!saved) {
        console.log('[RatesModal] SAVE FAILED: gold price');
        setError('Gold price could not be saved.');
        return;
      }
    }

    if (silverChanged) {
      console.log('[RatesModal] Saving silver price');

      const saved = setMetalPrice('silverPerGram', silverStored);

      if (!saved) {
        console.log('[RatesModal] SAVE FAILED: silver price');
        setError('Silver price could not be saved.');
        return;
      }
    }

    console.log('[RatesModal] SAVE FINISHED');
    console.log('[RatesModal] No onClose call was made by save');
    console.log('[RatesModal] Visible after save:', visible);

    // Intentionally keep the Rates window open after saving.
  };

  const cardStyle = {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  } as const;

  const metalCardStyle = {
    flex: 0,
    width: '40%',
    paddingVertical: spacing.xs * 0.56,
    paddingHorizontal: spacing.xs * 0.8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  } as const;

  const statusLegend = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: spacing.md,
      }}
    >
      {(['live', 'manual', 'default'] as RateSource[]).map(
        (status) => (
          <View
            key={status}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: SOURCE_BORDERS[status],
              }}
            />
            <AppText variant="caption" color="textSecondary">
              {SOURCE_LABELS[status]}
            </AppText>
          </View>
        ),
      )}
    </View>
  );

  return (
    <FormModal
      visible={visible}
      title="Exchange rates"
      onClose={handleClose}
    >
      <View style={{ gap: spacing.sm * 0.5 }}>
        {statusLegend}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color="textSecondary">
              Last Update: {formatLocalDate(lastLiveUpdatedAt)}
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
                size={19}
                color="#2E9D50"
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
            style={{ flexShrink: 1, fontSize: 11 }}
          >
            {refreshMessage.message}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs, marginTop: -spacing.lg * 0.5 }}>
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
              const status = getCurrencySource(currency.code);

              return (
                <View key={currency.code} style={cardStyle}>
                  <View
                    style={{
                      minHeight: 17,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      marginBottom: spacing.xs,
                    }}
                  >
                    {currency.flag ? (
                      <AppText style={{ fontSize: 13 }}>
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
                      paddingVertical: spacing.xs,
                      ...getInputStatusStyle(status),
                    }}
                    fieldStyle={{ minHeight: sizes.inputHeight * 0.72 }}
                    containerStyle={{ width: '100%' }}
                  />
                </View>
              );
            })}
          </View>
        ))}

        {baseCurrency !== RATE_ANCHOR ? (
          <AppText variant="caption" color="textSecondary">
            {RATE_ANCHOR} is shown as a calculated reference rate and
            cannot be edited directly.
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="textSecondary">
          METALS — PRICE PER GRAM IN {baseCurrency}
        </AppText>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
          <View style={metalCardStyle}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                marginBottom: spacing.xs * 0.56,
              }}
            >
              <AppText style={{ fontSize: 11 }}>🥇</AppText>
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
              style={{
                textAlign: 'center',
                fontSize: 12,
                paddingVertical: spacing.xs * 0.5,
                ...getInputStatusStyle(getMetalSource('gold24PerGram')),
              }}
              fieldStyle={{ minHeight: sizes.inputHeight * 0.392 }}
              containerStyle={{ width: '100%' }}
            />
          </View>

          <View style={metalCardStyle}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                marginBottom: spacing.xs * 0.8,
              }}
            >
              <AppText style={{ fontSize: 16 }}>🥈</AppText>
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
              style={{
                textAlign: 'center',
                fontSize: 12,
                paddingVertical: spacing.xs * 0.5,
                ...getInputStatusStyle(getMetalSource('silverPerGram')),
              }}
              fieldStyle={{ minHeight: sizes.inputHeight * 0.392 }}
              containerStyle={{ width: '100%' }}
            />
          </View>
        </View>

        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="textSecondary">
            Leave a metal price empty to clear the saved price.
          </AppText>
          <AppText variant="caption" color="textSecondary" style={{ fontSize: 10 }}>
            Other gold karats are calculated from the 24K price.
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Local market prices may differ from spot prices.
          </AppText>
        </View>
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

      <View style={{ gap: 2 }}>
        <AppText
          variant="caption"
          color="textSecondary"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          Currency rates by Exchange Rate API (exchangerate-api.com).
        </AppText>
        <AppText
          variant="caption"
          color="textSecondary"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          Gold and silver spot prices by gold-api.com.
        </AppText>
      </View>
    </FormModal>
  );
}
