import { View } from 'react-native';
import { evaluateExpression } from '@/features/finance/utils/calculator';

import { AppButton, AppInput, AppText } from '@/components/ui';
import type { HistoricalFxSnapshot } from '@/features/finance/types/ledger';
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
  const { spacing } = useTheme();
  const trimmedRate = manualRate.trim();
  const calculatedRate = manualMode
    ? resolveHistoricalRateExpression(manualRate)
    : null;
  const incompleteRate = /[+\-×÷*/]$/.test(trimmedRate);
  const invalidRate = trimmedRate.length > 0 && calculatedRate === null;

  const finalizeRate = () => {
    if (calculatedRate !== null) {
      const normalized = String(calculatedRate);
      if (normalized !== manualRate) {
        onManualRateChange(normalized);
      }
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="caption" color="textSecondary">
        HISTORICAL EXCHANGE RATE
      </AppText>

      <AppText>
        {currencyCode} to EGP
      </AppText>

      <AppText variant="caption" color="textSecondary">
        Transaction date: {transactionDate}
      </AppText>

      {snapshot ? (
        <>
          <AppText color={snapshot.source === 'manual' ? 'info' : 'success'}>
            Rate: {snapshot.rate}
          </AppText>
          <AppText
            variant="caption"
            color={snapshot.source === 'manual' ? 'info' : 'success'}
          >
            {snapshot.source === 'manual' ? 'Manual rate' : 'Historical API'}
            {' | Rate date: '}
            {snapshot.effectiveRateDate ?? snapshot.rateDate}
          </AppText>
        </>
      ) : (
        <AppText variant="caption" color="textSecondary">
          Historical rate not available yet.
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

      <AppButton
        title="Get historical rate"
        accentColor={moduleColors.finance}
        loading={loading}
        disabled={loading}
        onPress={onFetch}
      />

      <AppButton
        title={manualMode ? 'Use API rate' : 'Enter manual rate'}
        accentColor={moduleColors.finance}
        disabled={loading}
        onPress={onManualMode}
      />
    </View>
  );
}