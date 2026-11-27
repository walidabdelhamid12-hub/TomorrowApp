import { useAppLanguage } from '@/localization/LanguageProvider';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { AssetTypeIcon } from '@/features/finance/components/AssetTypeIcon';

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  useWindowDimensions,
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
import { useTheme } from '@/theme';

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
  value === null ? '' : formatAmount(value, 'KWD').replace(/,/g, '').replace(/0+$/, '').replace(/\.$/, '');

// The clean display is never the source of truth for an untouched metal price.
function metalChanged(text: string, canonical: number | null, edited: boolean): boolean {
  if (!edited) return false;
  if (text.trim() === '') return canonical !== null;
  const value = parseAmount(text);
  return value === null || value !== canonical;
}

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

  return currentNumber !== originalNumber;
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

export function RatesModal({
  visible,
  onClose,
  refreshRates,
  isRefreshing,
  lastResult = null,
}: RatesModalProps) {
  const { colors, spacing, radius, sizes } = useTheme();
  const { t } = useAppLanguage();
  const { width, fontScale } = useWindowDimensions();
  const stackMetals = width / fontScale < 360;

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
  const editedRateCodes = useRef<Record<string, boolean>>({});
  const draftBaseCurrency = useRef<string | null>(null);
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [goldEdited, setGoldEdited] = useState(false);
  const [silverEdited, setSilverEdited] = useState(false);
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
    if (!visible) {
      draftBaseCurrency.current = null;
      editedRateCodes.current = {};
      return;
    }
    if (!isValidRate(baseRate)) return;

    const initial: Record<string, string> = {};

    displayedCurrencies.forEach((currency) => {
      const storedRate = rates[currency.code] ?? 0;
      initial[currency.code] = showRate(storedRate / baseRate);
    });

    const resetDrafts = draftBaseCurrency.current !== baseCurrency;
    draftBaseCurrency.current = baseCurrency;

    if (resetDrafts) {
      editedRateCodes.current = {};
      setDrafts(initial);
      setGoldEdited(false);
      setSilverEdited(false);
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
    } else {
      setDrafts((previous) => {
        const next = { ...initial };
        for (const code of Object.keys(editedRateCodes.current)) {
          if (editedRateCodes.current[code] && code in previous) {
            next[code] = previous[code];
          }
        }
        return next;
      });

      if (!goldEdited) {
        setGold(
          metals.gold24PerGram === null
            ? ''
            : showMetal(metals.gold24PerGram / baseRate),
        );
      }
      if (!silverEdited) {
        setSilver(
          metals.silverPerGram === null
            ? ''
            : showMetal(metals.silverPerGram / baseRate),
        );
      }
    }
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

  const sourceTone = (source: RateSource) => colors.finance[source === 'live' ? 'income' : source === 'manual' ? 'account' : 'expense'];
  const getInputStatusStyle = (source: RateSource) => ({
    backgroundColor: sourceTone(source).surface,
    borderColor: sourceTone(source).border,
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

    if (metalChanged(gold, metals.gold24PerGram === null ? null : metals.gold24PerGram / baseRate, goldEdited)) {
      return true;
    }

    if (metalChanged(silver, metals.silverPerGram === null ? null : metals.silverPerGram / baseRate, silverEdited)) {
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
      t('Unsaved changes', 'تغييرات غير محفوظة'),
      t('You have unsaved rate changes. Do you want to discard them?', 'لديك تغييرات غير محفوظة في الأسعار. هل تريد تجاهلها؟'),
      [
        {
          text: t('Keep editing', 'متابعة التعديل'),
          style: 'cancel',
        },
        {
          text: t('Discard', 'تجاهل'),
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
      setError(t(`No valid exchange rate found for ${baseCurrency}.`, `لم يُعثر على سعر صرف صالح للعملة ${baseCurrency}.`));
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
        setError(t(`Enter a valid rate for ${currency.code}.`, `أدخل سعر صرف صالحًا للعملة ${currency.code}.`));
        return;
      }

      const storedValue = displayValue * baseRate;

      if (!Number.isFinite(storedValue) || storedValue <= 0) {
        console.log('[RatesModal] SAVE STOPPED: invalid converted rate', currency.code);
        setError(t(`Invalid converted rate for ${currency.code}.`, `سعر التحويل غير صالح للعملة ${currency.code}.`));
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

    const goldChanged = metalChanged(gold, metals.gold24PerGram === null ? null : metals.gold24PerGram / baseRate, goldEdited);
    const silverChanged = metalChanged(silver, metals.silverPerGram === null ? null : metals.silverPerGram / baseRate, silverEdited);

    const goldDisplay =
      gold.trim() === '' ? null : parseAmount(gold);

    const silverDisplay =
      silver.trim() === '' ? null : parseAmount(silver);

    if (
      goldChanged && gold.trim() !== '' &&
      (goldDisplay === null || goldDisplay <= 0)
    ) {
      console.log('[RatesModal] SAVE STOPPED: invalid gold price');
      setError(
        t('Enter a valid gold price or leave it empty to clear it.', 'أدخل سعر ذهب صالحًا أو اتركه فارغًا لمسح السعر.'),
      );
      return;
    }

    if (
      silverChanged && silver.trim() !== '' &&
      (silverDisplay === null || silverDisplay <= 0)
    ) {
      console.log('[RatesModal] SAVE STOPPED: invalid silver price');
      setError(
        t('Enter a valid silver price or leave it empty to clear it.', 'أدخل سعر فضة صالحًا أو اتركه فارغًا لمسح السعر.'),
      );
      return;
    }

    const goldStored =
      goldChanged ? goldDisplay === null ? null : goldDisplay * baseRate : metals.gold24PerGram;

    const silverStored =
      silverChanged ? silverDisplay === null ? null : silverDisplay * baseRate : metals.silverPerGram;

    if (
      (goldStored !== null &&
        (!Number.isFinite(goldStored) || goldStored <= 0)) ||
      (silverStored !== null &&
        (!Number.isFinite(silverStored) || silverStored <= 0))
    ) {
      console.log('[RatesModal] SAVE STOPPED: invalid metal prices');
      setError(t('One or more metal prices are invalid.', 'سعر معدن واحد أو أكثر غير صالح.'));
      return;
    }

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
        setError(t('Currency rates could not be saved.', 'تعذّر حفظ أسعار العملات.'));
        return;
      }
    }

    if (goldChanged) {
      console.log('[RatesModal] Saving gold price');

      const saved = setMetalPrice('gold24PerGram', goldStored);

      if (!saved) {
        console.log('[RatesModal] SAVE FAILED: gold price');
        setError(t('Gold price could not be saved.', 'تعذّر حفظ سعر الذهب.'));
        return;
      }
    }

    if (silverChanged) {
      console.log('[RatesModal] Saving silver price');

      const saved = setMetalPrice('silverPerGram', silverStored);

      if (!saved) {
        console.log('[RatesModal] SAVE FAILED: silver price');
        setError(t('Silver price could not be saved.', 'تعذّر حفظ سعر الفضة.'));
        return;
      }
    }

    // Only after every requested write succeeds, release saved currency drafts.
    // Preserve full numeric precision in storage; normalize display only.
    if (Object.keys(changedRates).length > 0) {
      for (const code of Object.keys(changedRates)) {
        delete editedRateCodes.current[code];
      }

      setDrafts((previous) => {
        const next = { ...previous };
        for (const [code, storedValue] of Object.entries(changedRates)) {
          next[code] = showRate(storedValue / baseRate);
        }
        return next;
      });
    }

    // Successful saves may return edited metals to their formatted display.
    // The stored numeric value retains its full precision.
    if (goldChanged) {
      setGold(
        goldStored === null ? '' : showMetal(goldStored / baseRate),
      );
      setGoldEdited(false);
    }

    if (silverChanged) {
      setSilver(
        silverStored === null ? '' : showMetal(silverStored / baseRate),
      );
      setSilverEdited(false);
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
    borderColor: '#C9AE72',
    backgroundColor: colors.surface,
  } as const;

  const metalCardStyle = {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs * 0.56,
    paddingHorizontal: spacing.xs * 0.8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#C9AE72',
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
                backgroundColor: sourceTone(status).accent,
              }}
            />
            <AppText variant="caption" color="textSecondary">
              {t(SOURCE_LABELS[status], status === 'live' ? 'مباشر' : status === 'manual' ? 'يدوي' : 'غير متاح')}
            </AppText>
          </View>
        ),
      )}
    </View>
  );

  return (
    <FormModal
      visible={visible}
      title={t('Exchange rates', 'أسعار الصرف')}
      onClose={handleClose}
    >
      {statusLegend}

      <View style={{ gap: spacing.sm * 0.5 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="caption" style={{ color: '#1E293B', fontWeight: '700' }}>
              {t('Last Update:', 'آخر تحديث:')} {formatLocalDate(lastLiveUpdatedAt)}
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Refresh exchange rates', 'تحديث أسعار الصرف')}
            accessibilityState={{ disabled: isRefreshing }}
            disabled={isRefreshing}
            onPress={() => void handleRefresh()}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: '#D6B777',
              backgroundColor: '#334155',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isRefreshing ? 0.7 : 1,
            }}
          >
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Ionicons
                name="refresh-outline"
                size={19}
                color="#D6B777"
              />
            </Animated.View>
          </Pressable>
        </View>

        {isRefreshing ? (
          <AppText variant="caption" color="textSecondary">
            {t('Updating exchange rates...', 'جارٍ تحديث أسعار الصرف...')}
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
        <AppText variant="label" color="textSecondary" style={{ fontWeight: '800' }}>
          {t('CURRENCIES — VALUE IN', 'العملات — القيمة بعملة')} {baseCurrency}
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
                    onChangeText={(text) => {
                      editedRateCodes.current[currency.code] = true;
                      setDrafts((prev) => ({
                        ...prev,
                        [currency.code]: text,
                      }));
                    }}
                    keyboardType="decimal-pad"
                    style={{
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: '700',
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
            {RATE_ANCHOR} {t('is shown as a calculated reference rate and cannot be edited directly.', 'يُعرض كسعر مرجعي محسوب ولا يمكن تعديله مباشرة.')}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" color="textSecondary" style={{ fontWeight: '800' }}>
          {t('METALS — PRICE PER GRAM IN', 'المعادن — سعر الجرام بعملة')} {baseCurrency}
        </AppText>

        <View testID="rates-metals" style={{ flexDirection: stackMetals ? 'column' : 'row', alignItems: 'stretch', gap: spacing.sm }}>
          <View testID="rates-metal-gold" style={metalCardStyle}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                marginBottom: spacing.xs * 0.56,
              }}
            >
              <AssetTypeIcon category="gold" />
              <AppText
                variant="label"
                numberOfLines={stackMetals ? undefined : 1}
                adjustsFontSizeToFit={!stackMetals}
                minimumFontScale={0.9}
                color="text"
                style={{ fontWeight: '800', flexShrink: 1, color: '#A97808' }}
              >
                {t('Gold (gram)', 'ذهب (جرام)')}
              </AppText>
            </View>

            <AppInput
              accessibilityLabel={t('Gold price', 'سعر الذهب')}
              value={gold}
              onChangeText={value => { setGold(value); setGoldEdited(true); }}
              keyboardType="decimal-pad"
              placeholder={t('not set', 'غير محدد')}
              style={{
                textAlign: 'center',
                fontSize: 12,
                fontWeight: '700',
                paddingVertical: spacing.xs * 0.5,
                ...getInputStatusStyle(getMetalSource('gold24PerGram')),
              }}
              fieldStyle={{ minHeight: 44 }}
              containerStyle={{ width: '100%' }}
            />
          </View>

          <View testID="rates-metal-silver" style={metalCardStyle}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.xs,
                marginBottom: spacing.xs * 0.8,
              }}
            >
              <AssetTypeIcon category="silver" />
              <AppText
                variant="label"
                numberOfLines={stackMetals ? undefined : 1}
                adjustsFontSizeToFit={!stackMetals}
                minimumFontScale={0.9}
                color="text"
                style={{ fontWeight: '800', flexShrink: 1, color: '#697586' }}
              >
                {t('Silver (gram)', 'فضة (جرام)')}
              </AppText>
            </View>

            <AppInput
              accessibilityLabel={t('Silver price', 'سعر الفضة')}
              value={silver}
              onChangeText={value => { setSilver(value); setSilverEdited(true); }}
              keyboardType="decimal-pad"
              placeholder={t('not set', 'غير محدد')}
              style={{
                textAlign: 'center',
                fontSize: 12,
                fontWeight: '700',
                paddingVertical: spacing.xs * 0.5,
                ...getInputStatusStyle(getMetalSource('silverPerGram')),
              }}
              fieldStyle={{ minHeight: 44 }}
              containerStyle={{ width: '100%' }}
            />
          </View>
        </View>

      </View>

      <View style={{ gap: 2 }}>
        <AppText variant="caption" color="textSecondary" style={{ textAlign: 'left', fontSize: 11 }}>
          {t('Gold is 24K, other gold karats are calculated from 24K price.', 'سعر الذهب لعيار 24، وتُحسب بقية العيارات بناءً عليه.')}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ textAlign: 'left', fontSize: 11 }}>
          {t('Silver reference purity is unspecified by the source.', 'المصدر لا يحدد درجة نقاء الفضة المرجعية.')}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ textAlign: 'left', fontSize: 11 }}>
          {t('Leave a metal price empty to clear the saved price.', 'اترك سعر المعدن فارغًا لمسح السعر المحفوظ.')}
        </AppText>
      </View>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <AppButton
        title={t('Save rates', 'حفظ الأسعار')}
        variant={hasUnsavedChanges ? 'primary' : 'secondary'}
        accentColor={hasUnsavedChanges ? '#202B3E' : undefined}
        disabled={!hasUnsavedChanges}
        onPress={save}
      />

      <View style={{ gap: 2 }}>
        <AppText variant="caption" color="textSecondary" style={{ textAlign: 'left', fontSize: 11 }}>
          {t('Currency rates by Exchange Rate API', 'أسعار العملات من خدمة Exchange Rate API')} <AppText variant="caption" style={{ color: '#202B3E', fontWeight: '700', fontSize: 11 }}>(exchangerate-api.com)</AppText>
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ textAlign: 'left', fontSize: 11 }}>
          {t('Gold and silver spot prices by', 'الأسعار الفورية للذهب والفضة من')} <AppText variant="caption" style={{ color: '#202B3E', fontWeight: '700', fontSize: 11 }}>(gold-api.com)</AppText>
        </AppText>
      </View>
    </FormModal>
  );
}
