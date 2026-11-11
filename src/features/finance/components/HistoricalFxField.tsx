import { View } from 'react-native';
import { evaluateExpression } from '@/features/finance/utils/calculator';
import { AppButton, AppInput, AppText } from '@/components/ui';
import type { HistoricalFxSnapshot } from '@/features/finance/types/ledger';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import { moduleColors, useTheme } from '@/theme';

function resolveHistoricalRateExpression(input: string): number | null {
  const text = input.trim();
  if (!text || /[+\-×÷*/]$/.test(text)) return null;
  if (!/^[0-9.+\-×÷*/()]+$/.test(text)) return null;

  const value = evaluateExpression(
    text.replace(/\*/g, '×').replace(/\//g, '÷'),
  );

  return value !== null && Number.isFinite(value) && value > 0
    ? value
    : null;
}

type HistoricalFxFieldProps = {
  currencyCode: string;
  transactionDate: string;
  snapshot?: HistoricalFxSnapshot;
  loading: boolean;
  manualMode: boolean;
  manualRate: string;
  error?: string;
  onFetch: () => void;
  onManualMode: () => void;
  onManualRateChange: (value: string) => void;
};

export function HistoricalFxField({
  currencyCode,
  transactionDate,
  snapshot,
  loading,
  manualMode,
  manualRate,
  error,
  onFetch,
  onManualMode,
  onManualRateChange,
}: HistoricalFxFieldProps) {
  const { spacing, colors } = useTheme();
  const trimmedRate = manualRate.trim();
  const calculatedRate = manualMode
    ? resolveHistoricalRateExpression(manualRate)
    : null;
  const incompleteRate = /[+\-×÷*/]$/.test(trimmedRate);
  const invalidRate = trimmedRate.length > 0 && calculatedRate === null;
  const displayedRate =
    snapshot?.rate ?? (currencyCode === 'EGP' ? 1 : null);

  const finalizeRate = () => {
    if (calculatedRate !== null) {
      const normalized = String(calculatedRate);
      if (normalized !== manualRate) {
        onManualRateChange(normalized);
      }
    }
  };

  const sourceColor = snapshot?.source === 'manual' ? 'info' : 'success';

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 6,
        }}
      >
        <View style={{ flex: 38, minWidth: 0, gap: 4 }}>
          <AppText
            variant="caption"
            color={colors.finance.neutral.accent}
            style={{ minHeight: 28 }}
          >
            FROM
          </AppText>
          <View
            style={{
              minHeight: 48,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 6,
              justifyContent: 'center',
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.finance.neutral.border,
            }}
          >
            <AppText style={{ fontSize: 14 }}>
              {getCurrencyFlag(currencyCode)} {currencyCode}
            </AppText>
          </View>
        </View>

        <View style={{ flex: 24, minWidth: 0, gap: 4 }}>
          <AppText
            variant="caption"
            color={colors.finance.neutral.accent}
            style={{ minHeight: 28 }}
          >
            RATE
          </AppText>
          <View
            style={{
              minHeight: 48,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 6,
              justifyContent: 'center',
              backgroundColor: colors.surface,
              borderColor: colors.finance.neutral.border,
            }}
          >
            <AppText
              color={snapshot ? sourceColor : 'text'}
              style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {displayedRate === null ? '—' : String(displayedRate)}
            </AppText>
          </View>
        </View>

        <View style={{ flex: 38, minWidth: 0, gap: 4 }}>
          <AppText
            variant="caption"
            color={colors.finance.neutral.accent}
            style={{ minHeight: 28 }}
          >
            TO
          </AppText>
          <View
            style={{
              minHeight: 48,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 6,
              justifyContent: 'center',
              backgroundColor: colors.finance.balance.surface,
              borderColor: colors.finance.balance.border,
            }}
          >
            <AppText style={{ fontSize: 14 }}>
              {getCurrencyFlag('EGP')} EGP
            </AppText>
          </View>
        </View>
      </View>
      {snapshot ? (
        <AppText variant="caption" color={sourceColor}>
          {snapshot.source === 'manual' ? 'Manual rate' : 'Historical API'}

        </AppText>
      ) : (
        <AppText variant="caption" color="textSecondary">
          {currencyCode === 'EGP'
            ? 'Base currency · Identity rate'
            : 'Historical rate not available yet.'}
        </AppText>
      )}

      {manualMode ? (
        <AppInput
          label="Manual rate (EGP per 1 unit)"
          value={manualRate}
          onChangeText={onManualRateChange}
          onBlur={finalizeRate}
          onSubmitEditing={finalizeRate}
          returnKeyType="done"
          keyboardType="decimal-pad"
          placeholder="Enter historical rate"
        />
      ) : null}

      {manualMode && calculatedRate !== null && trimmedRate !== String(calculatedRate) ? (
        <AppText variant="caption" color="info">
          Calculated rate: {calculatedRate}
        </AppText>
      ) : null}

      {manualMode && invalidRate ? (
        <AppText variant="caption" color="danger">
          {incompleteRate
            ? 'Complete the calculation before using this rate.'
            : 'Enter a valid positive rate or calculation.'}
        </AppText>
      ) : null}

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppButton
            title="Get Rate"
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
    </View>
  );
}