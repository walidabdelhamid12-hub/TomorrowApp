import { View } from 'react-native';
import { AppButton, AppInput, AppText } from '@/components/ui';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import { moduleColors, useTheme } from '@/theme';

type DirectHistoricalFxFieldProps = {
  accountCurrencyCode: string;
  transactionCurrencyCode: string;
  rate: number | null;
  transactionDate: string;
  loading: boolean;
  manualMode: boolean;
  manualRate: string;
  readOnly?: boolean;
  error?: string;
  onFetch: () => void;
  onManualMode: () => void;
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
  error,
  onFetch,
  onManualMode,
  onManualRateChange,
}: DirectHistoricalFxFieldProps) {
  const { colors, spacing } = useTheme();

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const rateLabel = transactionDate === todayKey ? 'Live Rate' : 'Historical Rate';
  const displayRate = (value: number) => Number(value.toPrecision(5)).toString();

  const validRate =
    rate !== null && Number.isFinite(rate) && rate > 0;

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText color="textSecondary" variant="caption">
        Historical Exchange Rate
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
            <AppText variant="caption" color={colors.finance.neutral.accent}>
              {item.label}
            </AppText>

            <View
              style={{
                minHeight: 48,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 6,
                justifyContent: 'center',
                backgroundColor:
                  index === 2 ? colors.finance.balance.surface : colors.surfaceAlt,
                borderColor:
                  index === 2
                    ? colors.finance.balance.border
                    : colors.finance.neutral.border,
              }}
            >
              <AppText
                style={{
                  fontSize: 14,
                  fontVariant: index === 1 ? ['tabular-nums'] : undefined,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item.value}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <AppText variant="caption" color="textSecondary">
        1 {accountCurrencyCode} = {validRate ? displayRate(rate!) : '—'}{' '}
        {transactionCurrencyCode}
      </AppText>

      {readOnly && validRate ? (
        <AppText variant="caption" color="textSecondary">
          Derived from historical reference rates
        </AppText>
      ) : null}

      {!readOnly && manualMode ? (
        <AppInput
          label={`Manual rate (${transactionCurrencyCode} per 1 ${accountCurrencyCode})`}
          value={manualRate}
          onChangeText={onManualRateChange}
          keyboardType="decimal-pad"
          placeholder="Enter direct historical rate"
        />
      ) : null}

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      {!readOnly ? (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppButton
            title={rateLabel}
            accentColor={moduleColors.finance}
            loading={loading}
            disabled={loading}
            onPress={onFetch}
          />
        </View>

        <View style={{ flex: 1 }}>
          <AppButton
            title={manualMode ? 'Use API Rate' : 'Enter Manual Rate'}
            accentColor={moduleColors.finance}
            disabled={loading}
            onPress={onManualMode}
          />
        </View>
      </View>
      ) : null}
    </View>
  );
}
