import { AccountDropdown } from './AccountDropdown';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

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
import type { Transfer, TransferType } from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { moduleColors, useTheme } from '@/theme';
import { isValidISODate } from '@/utils/input';

type TransferMode = 'internal' | 'credit_card_payment';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  transfer?: Transfer | null;
}

export function TransferModal({
  visible,
  onClose,
  transfer = null,
}: TransferModalProps) {
  const { colors, spacing } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackFields = width / fontScale < 360;

  const accounts = useLedgerStore((state) => state.accounts);
  const addTransfer = useLedgerStore((state) => state.addTransfer);
  const updateTransfer = useLedgerStore((state) => state.updateTransfer);
  const rates = useCurrencyStore((state) => state.rates);

  const [mode, setMode] = useState<TransferMode>('internal');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loadedTransfer, setLoadedTransfer] = useState<Transfer | null | undefined>(undefined);
  const rateSelection = useRef('');

  const isEditing = !!transfer;

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

  // Load the existing transfer when opening the modal in edit mode.
  useEffect(() => {
    if (!visible) { setLoadedTransfer(undefined); return; }
    setLoadedTransfer(transfer);
    rateSelection.current = transfer ? [transfer.fromAccountId, transfer.toAccountId, transfer.type].join('|') : '';

    if (transfer) {
      setMode(transfer.type);
      setFromAccountId(transfer.fromAccountId);
      setToAccountId(transfer.toAccountId);

      const originalFromAmount =
        transfer.fromAmount ?? transfer.amount;

      const originalToAmount =
        transfer.toAmount ?? transfer.amount;

      const originalRate =
        transfer.exchangeRate ??
        (originalFromAmount > 0
          ? originalToAmount / originalFromAmount
          : 1);

      setFromAmount(String(originalFromAmount));
      setExchangeRate(String(originalRate));
      setDate(transfer.date);
      setNote(transfer.note ?? '');
    } else {
      setMode('internal');
      setFromAccountId('');
      setToAccountId('');
      setFromAmount('');
      setExchangeRate('1');
      setDate(todayISO());
      setNote('');
    }

    setError(undefined);
  }, [visible, transfer]);

  useEffect(() => {
    if (!visible || loadedTransfer !== transfer) return;
    setFromAccountId(current => sourceAccounts.some(account => account.id === current) ? current : sourceAccounts[0]?.id ?? '');
  }, [visible, loadedTransfer, transfer, sourceAccounts]);

  useEffect(() => {
    if (!visible || loadedTransfer !== transfer) return;
    setToAccountId(current => destinationAccounts.some(account => account.id === current) ? current : destinationAccounts[0]?.id ?? '');
  }, [visible, loadedTransfer, transfer, destinationAccounts]);

  useEffect(() => {
    if (!visible || loadedTransfer !== transfer || !selectedSource || !selectedDestination) return;
    const selection = [selectedSource.id, selectedDestination.id, mode].join('|');
    // Loading an edit or refreshing rates must not replace its stored/manual rate.
    if (rateSelection.current === selection) return;
    rateSelection.current = selection;
    setExchangeRate(mode === 'credit_card_payment' || sameCurrency ? '1' : String(suggestedRate));
  }, [visible, loadedTransfer, transfer, selectedSource, selectedDestination, mode, sameCurrency, suggestedRate]);

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

    const transferData = {
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
    };

    if (transfer) {
      const updated = updateTransfer(transfer.id, transferData);

      if (!updated) {
        setError(
          'Could not update the transfer. Please check the account balances and details.',
        );
        return;
      }
    } else {
      const result = addTransfer(transferData);

      if (result === null) {
        setError(
          'Could not save the transfer. Please check the account balances and details.',
        );
        return;
      }
    }

    onClose();
  };

  const accountsSelected = !!selectedSource && !!selectedDestination;
  const receivedText = accountsSelected && calculatedToAmount !== null
    ? calculatedToAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const rateHint = sameCurrency || mode === 'credit_card_payment'
    ? 'The exchange rate is fixed at 1 for this transfer.'
    : `Suggested rate: ${suggestedRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} · You can edit it manually.`;

  return (
    <FormModal
      visible={visible}
      title={isEditing ? 'Edit transfer' : 'Add transfer'}
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

          <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: spacing.sm }}>
            <AccountDropdown label="From account" options={sourceAccounts} value={fromAccountId}
              onChange={value => { setFromAccountId(value); setError(undefined); }} emptyMessage="No eligible source accounts" />
            <AccountDropdown label="To account" options={destinationAccounts} value={toAccountId}
              onChange={value => { setToAccountId(value); setError(undefined); }}
              emptyMessage={mode === 'credit_card_payment' ? 'Add a credit card account' : 'Choose another non-card account'} />
          </View>

          <View testID="transfer-amounts-row" style={[styles.amountsRow, stackFields && styles.stacked]}>
            <View style={[styles.field, !stackFields && { flex: 38 }]}>
              <AppText variant="label" color={colors.finance.neutral.accent} style={[styles.label, !stackFields && styles.rowLabel]}>Amount to transfer</AppText>
              <AppInput accessibilityLabel="Amount to transfer" accessibilityHint={selectedSource ? 'Amount in ' + selectedSource.currencyCode : 'Choose the source account currency'}
                value={fromAmount} onChangeText={value => { setFromAmount(value); setError(undefined); }}
                keyboardType="decimal-pad" placeholder="0" style={styles.input}
                fieldStyle={[styles.inputField, { borderColor: colors.finance.neutral.border }]} />
              <AppText variant="label" color={colors.finance.neutral.accent}>{selectedSource ? getCurrencyLabel(selectedSource.currencyCode) : '—'}</AppText>
            </View>
            <View style={[styles.field, !stackFields && { flex: 24 }]}>
              <AppText variant="label" color={colors.finance.neutral.accent} style={[styles.label, !stackFields && styles.rowLabel]}>Rate</AppText>
              <AppInput accessibilityLabel="Rate" accessibilityHint={accountsSelected ? rateHint : 'Choose both accounts to view the rate'}
                value={accountsSelected ? exchangeRate : ''} onChangeText={value => { setExchangeRate(value); setError(undefined); }}
                keyboardType="decimal-pad" editable={accountsSelected && !sameCurrency && mode !== 'credit_card_payment'}
                placeholder={accountsSelected ? '1' : '—'} style={styles.input}
                fieldStyle={[styles.inputField, { borderColor: colors.finance.neutral.border }]} />
            </View>
            <View style={[styles.field, !stackFields && { flex: 38 }]}>
              <AppText variant="label" color={colors.finance.neutral.accent} style={[styles.label, !stackFields && styles.rowLabel]}>Amount to receive</AppText>
              <View style={[styles.result, { backgroundColor: colors.finance.balance.surface, borderColor: colors.finance.balance.border }]}>
                <AppText variant="bodyStrong" accessibilityLabel={'Amount to receive: ' + receivedText + (selectedDestination ? ' ' + selectedDestination.currencyCode : '')}
                  style={styles.resultText} textBreakStrategy="simple">{receivedText}</AppText>
              </View>
              <AppText variant="label" color={colors.finance.neutral.accent}>{selectedDestination ? getCurrencyLabel(selectedDestination.currencyCode) : '—'}</AppText>
            </View>
          </View>

          <DateField value={date} onChange={setDate} />

          <AppInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Monthly savings transfer"
          />

          {accountsSelected && <AppText variant="caption" color={colors.finance.neutral.accent}>{rateHint}</AppText>}

          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}

          <AppButton
            title={
              isEditing
                ? 'Save changes'
                : mode === 'credit_card_payment'
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
const styles = StyleSheet.create({
  amountsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  field: { minWidth: 0, gap: 4 },
  label: { fontWeight: '700', fontSize: 11, lineHeight: 14 },
  rowLabel: { minHeight: 28 },
  inputField: { minHeight: 48, paddingHorizontal: 6, borderRadius: 10 },
  input: { fontSize: 14, paddingVertical: 8, fontVariant: ['tabular-nums'] },
  result: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 8, justifyContent: 'center' },
  resultText: { fontSize: 14, fontVariant: ['tabular-nums'], flexShrink: 1 },
});
