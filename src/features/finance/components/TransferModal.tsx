
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
    AppButton,
    AppInput,
    AppText,
    ChipSelect,
    DateField,
} from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import { getCurrencyLabel } from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { TransferType } from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { moduleColors, useTheme } from '@/theme';
import { isValidISODate } from '@/utils/input';

type TransferMode = 'internal' | 'credit_card_payment';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TransferModal({
  visible,
  onClose,
}: TransferModalProps) {
  const { colors, spacing } = useTheme();

  const accounts = useLedgerStore((state) => state.accounts);
  const addTransfer = useLedgerStore((state) => state.addTransfer);
  const rates = useCurrencyStore((state) => state.rates);

  const [mode, setMode] = useState<TransferMode>('internal');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts],
  );

  const sourceAccounts = useMemo(
    () => activeAccounts.filter((account) => account.type !== 'credit_card'),
    [activeAccounts],
  );

  const destinationAccounts = useMemo(
    () =>
      activeAccounts.filter((account) => {
        if (account.id === fromAccountId) return false;

        if (mode === 'credit_card_payment') {
          return account.type === 'credit_card';
        }

        return account.type !== 'credit_card';
      }),
    [activeAccounts, fromAccountId, mode],
  );

  const selectedSource = sourceAccounts.find(
    (account) => account.id === fromAccountId,
  );

  const selectedDestination = destinationAccounts.find(
    (account) => account.id === toAccountId,
  );

  const sameCurrency =
    !!selectedSource &&
    !!selectedDestination &&
    selectedSource.currencyCode === selectedDestination.currencyCode;

  const suggestedRate = useMemo(() => {
    if (!selectedSource || !selectedDestination) return 1;

    if (
      selectedSource.currencyCode === selectedDestination.currencyCode
    ) {
      return 1;
    }

    const sourceRate = rates[selectedSource.currencyCode];
    const destinationRate = rates[selectedDestination.currencyCode];

    if (
      !Number.isFinite(sourceRate) ||
      !Number.isFinite(destinationRate) ||
      sourceRate <= 0 ||
      destinationRate <= 0
    ) {
      return 1;
    }

    return sourceRate / destinationRate;
  }, [selectedSource, selectedDestination, rates]);

  const parsedFromAmount = parseAmount(fromAmount);
  const parsedRate = parseAmount(exchangeRate);

  const calculatedToAmount =
    parsedFromAmount !== null &&
    parsedFromAmount > 0 &&
    parsedRate !== null &&
    parsedRate > 0
      ? parsedFromAmount * parsedRate
      : null;

  useEffect(() => {
    if (!visible) return;

    setMode('internal');
    setFromAccountId('');
    setToAccountId('');
    setFromAmount('');
    setExchangeRate('1');
    setDate(todayISO());
    setNote('');
    setError(undefined);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const firstSource = sourceAccounts[0];

    if (!firstSource) {
      setFromAccountId('');
      return;
    }

    const currentSourceExists = sourceAccounts.some(
      (account) => account.id === fromAccountId,
    );

    if (!currentSourceExists) {
      setFromAccountId(firstSource.id);
    }
  }, [visible, sourceAccounts, fromAccountId]);

  useEffect(() => {
    if (!visible) return;

    const firstDestination = destinationAccounts[0];

    const currentDestinationExists = destinationAccounts.some(
      (account) => account.id === toAccountId,
    );

    if (!currentDestinationExists) {
      setToAccountId(firstDestination?.id ?? '');
    }
  }, [visible, destinationAccounts, toAccountId]);

  useEffect(() => {
    if (!visible || !selectedSource || !selectedDestination) return;

    if (mode === 'credit_card_payment' || sameCurrency) {
      setExchangeRate('1');
      return;
    }

    setExchangeRate(String(suggestedRate));
  }, [
    visible,
    selectedSource?.id,
    selectedDestination?.id,
    selectedSource?.currencyCode,
    selectedDestination?.currencyCode,
    mode,
    sameCurrency,
    suggestedRate,
  ]);

  const handleModeChange = (value: string) => {
    setMode(value as TransferMode);
    setFromAmount('');
    setError(undefined);
  };

  const submit = () => {
    setError(undefined);

    const source = activeAccounts.find(
      (account) => account.id === fromAccountId,
    );

    const destination = activeAccounts.find(
      (account) => account.id === toAccountId,
    );

    const amount = parseAmount(fromAmount);
    const rate = parseAmount(exchangeRate);

    if (!source || !destination) {
      setError('Choose a source account and a destination account.');
      return;
    }

    if (source.id === destination.id) {
      setError('Source and destination accounts must be different.');
      return;
    }

    if (source.archived || destination.archived) {
      setError('Archived accounts cannot be used for transfers.');
      return;
    }

    if (amount === null || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    if (!isValidISODate(date)) {
      setError('Date must be a real date in the format YYYY-MM-DD.');
      return;
    }

    if (rate === null || rate <= 0) {
      setError('Enter a valid exchange rate greater than zero.');
      return;
    }

    if (mode === 'credit_card_payment') {
      if (
        source.type === 'credit_card' ||
        destination.type !== 'credit_card'
      ) {
        setError(
          'For a card payment, choose a non-card source and a credit card destination.',
        );
        return;
      }

      if (source.currencyCode !== destination.currencyCode) {
        setError('Credit card payments must use the same currency.');
        return;
      }

      if (Math.abs(rate - 1) > 0.000001) {
        setError('The exchange rate for a card payment must be 1.');
        return;
      }
    } else {
      if (
        source.type === 'credit_card' ||
        destination.type === 'credit_card'
      ) {
        setError(
          'Credit cards cannot be used in normal internal transfers.',
        );
        return;
      }
    }

    if (
      source.currencyCode === destination.currencyCode &&
      Math.abs(rate - 1) > 0.000001
    ) {
      setError(
        'The exchange rate must be 1 when both accounts use the same currency.',
      );
      return;
    }

    const destinationAmount = amount * rate;

    if (
      !Number.isFinite(destinationAmount) ||
      destinationAmount <= 0
    ) {
      setError('The calculated destination amount is invalid.');
      return;
    }

    const transferType: TransferType =
      mode === 'credit_card_payment'
        ? 'credit_card_payment'
        : 'internal';

    const result = addTransfer({
      fromAccountId: source.id,
      toAccountId: destination.id,
      fromAmount: amount,
      fromCurrencyCode: source.currencyCode,
      toAmount: destinationAmount,
      toCurrencyCode: destination.currencyCode,
      exchangeRate: rate,
      date,
      type: transferType,
      note: note.trim() || undefined,
    });

    if (result === null) {
      setError(
        'Could not save the transfer. Please check the account balances and details.',
      );
      return;
    }

    onClose();
  };

  return (
    <FormModal
      visible={visible}
      title="Add transfer"
      onClose={onClose}
    >
      {activeAccounts.length === 0 ? (
        <AppText color="textSecondary">
          You need active accounts before adding a transfer.
        </AppText>
      ) : (
        <>
          <ChipSelect<string>
            label="TRANSFER TYPE"
            options={[
              {
                value: 'internal',
                label: 'Internal transfer',
                color: moduleColors.finance,
              },
              {
                value: 'credit_card_payment',
                label: 'Credit card payment',
                color: colors.income,
              },
            ]}
            value={mode}
            onChange={handleModeChange}
          />

          {sourceAccounts.length === 0 ? (
            <AppText color="textSecondary">
              No eligible source accounts are available.
            </AppText>
          ) : (
            <ChipSelect<string>
              label="FROM ACCOUNT"
              options={sourceAccounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${getCurrencyLabel(account.currencyCode)}`,
                color: moduleColors.finance,
              }))}
              value={fromAccountId}
              onChange={(value) => {
                setFromAccountId(value);
                setError(undefined);
              }}
            />
          )}

          {destinationAccounts.length === 0 ? (
            <AppText color="textSecondary">
              {mode === 'credit_card_payment'
                ? 'Add an active credit card account first.'
                : 'Choose another active non-card account as the destination.'}
            </AppText>
          ) : (
            <ChipSelect<string>
              label="TO ACCOUNT"
              options={destinationAccounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${getCurrencyLabel(account.currencyCode)}`,
                color: moduleColors.finance,
              }))}
              value={toAccountId}
              onChange={(value) => {
                setToAccountId(value);
                setError(undefined);
              }}
            />
          )}

          {selectedSource && selectedDestination ? (
            <AppText variant="caption" color="textSecondary">
              {selectedSource.name} ({selectedSource.currencyCode}) →{' '}
              {selectedDestination.name} ({selectedDestination.currencyCode})
            </AppText>
          ) : null}

          <AppInput
            label="Amount to transfer"
            value={fromAmount}
            onChangeText={(value) => {
              setFromAmount(value);
              setError(undefined);
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            leftElement={
              <AppText color="textSecondary">
                {selectedSource
                  ? getCurrencyLabel(selectedSource.currencyCode)
                  : ''}
              </AppText>
            }
          />

          {selectedSource && selectedDestination ? (
            <>
              <AppInput
                label="Exchange rate"
                value={exchangeRate}
                onChangeText={(value) => {
                  setExchangeRate(value);
                  setError(undefined);
                }}
                keyboardType="decimal-pad"
                editable={!sameCurrency && mode !== 'credit_card_payment'}
                placeholder="1"
                hint={
                  sameCurrency || mode === 'credit_card_payment'
                    ? 'The exchange rate is fixed at 1 for this transfer.'
                    : `Suggested rate: ${suggestedRate.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })} · You can edit it manually.`
                }
              />

              <View
                style={{
                  padding: spacing.md,
                  borderRadius: 12,
                  backgroundColor: colors.surfaceAlt,
                  gap: spacing.xs,
                }}
              >
                <AppText color="textSecondary" variant="caption">
                  AMOUNT TO RECEIVE
                </AppText>

                <AppText variant="h2">
                  {calculatedToAmount === null
                    ? '—'
                    : calculatedToAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                </AppText>

                <AppText color="textSecondary" variant="caption">
                  {getCurrencyLabel(selectedDestination.currencyCode)}
                </AppText>
              </View>
            </>
          ) : null}

          <DateField value={date} onChange={setDate} />

          <AppInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Monthly savings transfer"
          />

          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}

          <AppButton
            title={
              mode === 'credit_card_payment'
                ? 'Record card payment'
                : 'Save transfer'
            }
            accentColor={moduleColors.finance}
            onPress={submit}
            style={{ marginTop: spacing.xs }}
            disabled={
              !selectedSource ||
              !selectedDestination ||
              destinationAccounts.length === 0
            }
          />
        </>
      )}
    </FormModal>
  );
}
