import { useAppLanguage } from '@/localization/LanguageProvider';
import { TextInput, View } from 'react-native';
import { AppButton, AppText } from '@/components/ui';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import { useTheme } from '@/theme';

type DirectHistoricalFxFieldProps = {
  accountCurrencyCode: string;
  transactionCurrencyCode: string;
  rate: number | null;
  transactionDate: string;
  loading: boolean;
  manualMode: boolean;
  manualRate: string;
  readOnly?: boolean;
  compact?: boolean;
  manualOnly?: boolean;
  error?: string;
  onFetch?: () => void;
  onManualMode?: () => void;
  onManualRateChange: (value: string) => void;
};

export function DirectHistoricalFxField({
  accountCurrencyCode,
  transactionCurrencyCode,
  rate,
  transactionDate,
  loading,
  manualMode,
  manualRate,
  readOnly = false,
  compact = false,
  manualOnly = false,
  error,
  onFetch,
  onManualMode,
  onManualRateChange,
}: DirectHistoricalFxFieldProps) {
  const { colors, spacing } = useTheme();
  const { t } = useAppLanguage();

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const rateLabel = transactionDate === todayKey ? t('Live Rate', 'السعر الحالي') : t('Historical Rate', 'السعر التاريخي');
  const displayRate = (value: number) => Number(value.toPrecision(5)).toString();

  const validRate =
    rate !== null && Number.isFinite(rate) && rate > 0;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText color="textSecondary" variant="caption" style={{ fontWeight: '700' }}>
        {t("Historical Exchange Rate", "سعر الصرف التاريخي")}
      </AppText>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[
          {
            label: 'FROM',
            value: `${getCurrencyFlag(accountCurrencyCode)} ${accountCurrencyCode}`,
          },
          {
            label: 'RATE',
            value: validRate ? displayRate(rate!) : '—',
          },
          {
            label: 'TO',
            value: `${getCurrencyFlag(transactionCurrencyCode)} ${transactionCurrencyCode}`,
          },
        ].map((item, index) => (
          <View
            key={item.label}
            style={{
              flex: index === 1 ? 24 : 38,
              minWidth: 0,
              gap: 4,
            }}
          >
            <AppText variant="caption" color={colors.finance.neutral.accent} style={{ fontWeight: '700', textAlign: 'center' }}>
              {item.label}
            </AppText>

            <View
              style={{
                minHeight: 48,
                alignItems: index === 1 && !readOnly && (manualMode || manualOnly) ? 'stretch' : 'center',
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 6,
                justifyContent: 'center',
                backgroundColor:
                  index === 2 ? colors.finance.balance.surface : colors.surfaceAlt,
                borderColor:
                  index === 2
                    ? colors.finance.balance.border
                    : '#D6B777',
              }}
            >
              {index === 1 && !readOnly && (manualMode || manualOnly) ? <TextInput
                accessibilityLabel={`Manual rate (${transactionCurrencyCode} per 1 ${accountCurrencyCode})`}
                value={manualRate} onChangeText={onManualRateChange} keyboardType="decimal-pad"
                style={{ color: colors.text, fontSize: 14, padding: 0, minHeight: 44, textAlign: 'center', fontWeight: '700' }}
              /> : <AppText
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  textAlign: 'center',
                  fontVariant: index === 1 ? ['tabular-nums'] : undefined,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item.value}
              </AppText>}
            </View>
          </View>
        ))}
      </View>

      {!compact && <AppText variant="caption" color="textSecondary">
        1 {accountCurrencyCode} = {validRate ? displayRate(rate!) : '—'}{' '}
        {transactionCurrencyCode}
      </AppText>}

      {readOnly && validRate ? (
        <AppText variant="caption" color="textSecondary">
          {t("Derived from historical reference rates", "محسوب من أسعار الصرف المرجعية التاريخية")}
        </AppText>
      ) : null}

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      {!readOnly && !manualOnly && onFetch && onManualMode ? (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppButton
            title={rateLabel}
            accentColor={'#1E293B'}
            loading={loading}
            disabled={loading}
            onPress={onFetch}
          />
        </View>

        <View style={{ flex: 1 }}>
          <AppButton
            title={manualMode ? t('Use API Rate', 'استخدام سعر الصرف الآلي') : t('Enter Manual Rate', 'إدخال سعر الصرف يدويًا')}
            accentColor={'#1E293B'}
            disabled={loading}
            onPress={onManualMode}
          />
        </View>
      </View>
      ) : null}
    </View>
  );
}
