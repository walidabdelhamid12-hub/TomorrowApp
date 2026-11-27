import { formPayload, matchesUniqueRevision, submitFinanceForm } from './explicitFinanceForm';
import { afterFinanceSave } from '@/features/finance/components/acknowledgedFinanceHandler';
import { AccountDropdown } from './AccountDropdown';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppButton,
  AppInput,
  AppText,
  ChipSelect,
} from '@/components/ui';
import { FinanceDateField as DateField } from '@/features/finance/components/FinanceDateField';
import { FormModal } from '@/features/finance/components/FormModal';
import { getCurrencyLabel, getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { NewTransferInput, Transfer, TransferType } from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { isValidISODate } from '@/utils/input';
import { shouldStackFinanceFields } from '../utils/formLayout';
import { TRANSFER_FEES_CATEGORY } from '../utils/transferSettlement';
import { getTransferRateSuggestion } from '../utils/transferRateSuggestion';

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
  const { t } = useAppLanguage();
  const { width, fontScale } = useWindowDimensions();
  const stackFields = shouldStackFinanceFields(width, fontScale);

  const accounts = useLedgerStore((state) => state.accounts);
  const categories = useLedgerStore((state) => state.categories);
  const transactions = useLedgerStore((state) => state.transactions);
  const addTransfer = useLedgerStore((state) => state.addTransfer);
  const updateTransfer = useLedgerStore((state) => state.updateTransfer);
  const rates = useCurrencyStore((state) => state.rates);
  const verifiedCurrencies = useCurrencyStore((state) => state.verifiedCurrencies);
  const rateSources = useCurrencyStore((state) => state.rateSources);

  const [mode, setMode] = useState<TransferMode>('internal');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [actualReceived, setActualReceived] = useState('');
  const [sourceFee, setSourceFee] = useState('');
  const [feeCategoryId, setFeeCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loadedTransfer, setLoadedTransfer] = useState<Transfer | null | undefined>(undefined);
  const [rateSelection, setRateSelection] = useState('');

  const isEditing = !!transfer;
  const existingFee = transfer?.feeTransactionId ? transactions.find(tx => tx.id === transfer.feeTransactionId) : undefined;
  const expenseCategories = categories.filter(c => c.kind === 'expense' && (!c.archived || c.id === existingFee?.categoryId));
  if (!categories.some(c => c.id === TRANSFER_FEES_CATEGORY.id)) expenseCategories.unshift(TRANSFER_FEES_CATEGORY);
  const selectedFeeCategory = feeCategoryId || (expenseCategories.some(c => c.id === TRANSFER_FEES_CATEGORY.id) ? TRANSFER_FEES_CATEGORY.id : '');

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
    if (!selectedSource || !selectedDestination) return null;
    return getTransferRateSuggestion(selectedSource.currencyCode, selectedDestination.currencyCode, rates, verifiedCurrencies, rateSources);
  }, [selectedSource, selectedDestination, rates, verifiedCurrencies, rateSources]);

  const parsedFromAmount = parseAmount(fromAmount);
  const parsedRate = parseAmount(exchangeRate);

  const calculatedToAmount =
    parsedFromAmount !== null &&
    parsedFromAmount > 0 &&
    parsedRate !== null &&
    parsedRate > 0
      ? parsedFromAmount * parsedRate
      : null;

  // Synchronize a new form session during render, before the form can be
  // committed. React discards this render and renders with the updated draft.
  // Never silently switch an existing transfer to another account.
  if (!visible) {
    if (loadedTransfer !== undefined) {
      setLoadedTransfer(undefined);
      setRateSelection('');
    }
  } else if (loadedTransfer !== transfer) {
    setLoadedTransfer(transfer);
    setRateSelection(transfer ? [transfer.fromAccountId, transfer.toAccountId, transfer.type].join('|') : '');
    if (transfer) {
      setMode(transfer.type);
      setFromAccountId(transfer.fromAccountId);
      setToAccountId(transfer.toAccountId);
      const originalFromAmount = transfer.fromAmount ?? transfer.amount;
      const originalToAmount = transfer.toAmount ?? transfer.amount;
      const originalRate = transfer.exchangeRate ?? (originalFromAmount > 0 ? originalToAmount / originalFromAmount : 1);
      setFromAmount(String(originalFromAmount));
      setExchangeRate(String(transfer.quotedExchangeRate ?? originalRate));
      setActualReceived(transfer.actualReceivedConfirmed ? String(originalToAmount) : '');
      setSourceFee(transfer.feeAmount === undefined ? '' : String(transfer.feeAmount));
      setFeeCategoryId(existingFee?.categoryId ?? '');
      setDate(transfer.date);
      setNote(transfer.note ?? '');
    } else {
      setMode('internal');
      setFromAccountId('');
      setToAccountId('');
      setFromAmount('');
      setExchangeRate('');
      setActualReceived('');
      setSourceFee('');
      setFeeCategoryId('');
      setDate(todayISO());
      setNote('');
    }
    setError(undefined);
  } else {
    // New transfers may default to eligible accounts. Editing an existing
    // transfer with a missing/archived account requires an explicit choice.
    const nextFrom = !transfer && !selectedSource ? sourceAccounts[0]?.id ?? '' : fromAccountId;
    const nextTo = !transfer && nextFrom === fromAccountId && !selectedDestination ? destinationAccounts[0]?.id ?? '' : toAccountId;
    if (nextFrom !== fromAccountId) {
      setFromAccountId(nextFrom);
    } else if (nextTo !== toAccountId) {
      setToAccountId(nextTo);
    } else if (selectedSource && selectedDestination) {
      const selection = [selectedSource.id, selectedDestination.id, mode].join('|');
      // A refresh of the saved market rates must not overwrite a manual draft.
      if (rateSelection !== selection) {
        setRateSelection(selection);
        setActualReceived('');
        setSourceFee('');
        setFeeCategoryId('');
        setExchangeRate(sameCurrency ? '1' : mode === 'credit_card_payment' ? '' : suggestedRate ? String(suggestedRate.rate) : '');
      }
    } else if (rateSelection !== '') {
      setRateSelection('');
      setExchangeRate('');
      setActualReceived('');
      setSourceFee('');
      setFeeCategoryId('');
    }
  }

  const handleModeChange = (value: string) => {
    setMode(value as TransferMode);
    setFromAmount('');
    setActualReceived('');
    setSourceFee('');
    setFeeCategoryId('');
    setError(undefined);
  };

  const submit = () => {
    afterFinanceSave(() => setError(undefined));

    const source = activeAccounts.find(
      (account) => account.id === fromAccountId,
    );

    const destination = activeAccounts.find(
      (account) => account.id === toAccountId,
    );

    const amount = parseAmount(fromAmount);
    const rate = parseAmount(exchangeRate);

    if (!source || !destination) {
      afterFinanceSave(() => setError(t('Choose a source account and a destination account.', 'اختر حساب المصدر وحساب الوجهة.')));
      return;
    }

    if (source.id === destination.id) {
      afterFinanceSave(() => setError(t('Source and destination accounts must be different.', 'يجب أن يكون حساب المصدر مختلفًا عن حساب الوجهة.')));
      return;
    }

    if (source.archived || destination.archived) {
      afterFinanceSave(() => setError(t('Archived accounts cannot be used for transfers.', 'لا يمكن استخدام الحسابات المؤرشفة للتحويل.')));
      return;
    }

    if (amount === null || amount <= 0) {
      afterFinanceSave(() => setError(t('Enter an amount greater than zero.', 'أدخل مبلغًا أكبر من صفر.')));
      return;
    }

    if (!hasValidCurrencyPrecision(fromAmount, source.currencyCode)) {
      afterFinanceSave(() => setError(`Invalid amount precision: ${source.currencyCode} allows up to ${getCurrencyDecimals(source.currencyCode)} decimal places. Please correct the amount before saving.`));
      return;
    }

    if (!isValidISODate(date)) {
      afterFinanceSave(() => setError(t('Date must be a real date in the format YYYY-MM-DD.', 'أدخل تاريخًا صحيحًا بصيغة YYYY-MM-DD.')));
      return;
    }

    if (rate === null || rate <= 0) {
      afterFinanceSave(() => setError(t('Enter a valid exchange rate greater than zero.', 'أدخل سعر صرف صحيحًا أكبر من صفر.')));
      return;
    }

    if (mode === 'credit_card_payment') {
      if (
        source.type === 'credit_card' ||
        destination.type !== 'credit_card'
      ) {
        afterFinanceSave(() => setError(
          t('For a card payment, choose a non-card source and a credit card destination.', 'لسداد البطاقة اختر حساب مصدر غير بطاقة وحساب بطاقة ائتمان كوجهة.'),
        ));
        return;
      }

      if (source.currencyCode !== destination.currencyCode) {
        afterFinanceSave(() => setError(t('Credit card payments must use the same currency.', 'يجب أن يكون سداد البطاقة بنفس العملة.')));
        return;
      }

      if (Math.abs(rate - 1) > 0.000001) {
        afterFinanceSave(() => setError(t('The exchange rate for a card payment must be 1.', 'يجب أن يكون سعر صرف سداد البطاقة 1.')));
        return;
      }
    } else {
      if (
        source.type === 'credit_card' ||
        destination.type === 'credit_card'
      ) {
        afterFinanceSave(() => setError(
          t('Credit cards cannot be used in normal internal transfers.', 'لا يمكن استخدام البطاقات الائتمانية في التحويلات الداخلية العادية.'),
        ));
        return;
      }
    }

    if (
      source.currencyCode === destination.currencyCode &&
      Math.abs(rate - 1) > 0.000001
    ) {
      afterFinanceSave(() => setError(
        t('The exchange rate must be 1 when both accounts use the same currency.', 'يجب أن يكون سعر الصرف 1 عندما تكون عملة الحسابين واحدة.'),
      ));
      return;
    }

    const same = source.currencyCode === destination.currencyCode;
    const explicitActual = actualReceived.trim() !== '';
    const feeEntered = sourceFee.trim() !== '';
    const fee = feeEntered ? parseAmount(sourceFee) : 0;
    if (fee === null || fee < 0 || (feeEntered && !hasValidCurrencyPrecision(sourceFee, source.currencyCode))) {
      afterFinanceSave(() => setError(t('Enter a valid fee in the source currency.', 'أدخل رسومًا صحيحة بعملة الحساب المصدر.')));
      return;
    }
    if (fee > 0 && !selectedFeeCategory) {
      afterFinanceSave(() => setError(t('Choose an expense category for the fee.', 'اختر تصنيف مصروف للرسوم.')));
      return;
    }
    if (!same && !explicitActual && (fee > 0 || transfer?.actualReceivedConfirmed)) {
      afterFinanceSave(() => setError(t('Confirm the actual received amount before saving.', 'أكد المبلغ المستلم فعليًا قبل الحفظ.')));
      return;
    }
    if (explicitActual && !hasValidCurrencyPrecision(actualReceived, destination.currencyCode)) {
      afterFinanceSave(() => setError(t('Invalid precision for the received currency.', 'دقة المبلغ المستلم غير صالحة للعملة.')));
      return;
    }
    const destinationAmount = explicitActual ? parseAmount(actualReceived) : amount * rate;

    if (destinationAmount === null ||
      !Number.isFinite(destinationAmount) ||
      destinationAmount <= 0
    ) {
      afterFinanceSave(() => setError(t('The calculated destination amount is invalid.', 'المبلغ المحسوب لحساب الوجهة غير صحيح.')));
      return;
    }

    const transferType: TransferType =
      mode === 'credit_card_payment'
        ? 'credit_card_payment'
        : 'internal';

    const transferData: NewTransferInput = {
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
      ...(explicitActual || (same && transfer?.actualReceivedConfirmed) ? { actualReceivedConfirmed: true as const } : {}),
      ...(feeEntered || transfer?.feeTransactionId ? { feeAmount: fee, ...(fee > 0 ? { feeCategoryId: selectedFeeCategory } : {}) } : {}),
    };

    const targetId = transfer?.id ?? null;
    return submitFinanceForm("src/features/finance/components/TransferModal.tsx:199",
      formPayload(targetId ? 'transfer.edit' : 'transfer.create', targetId, transferData, { expectedUpdatedAt: transfer?.updatedAt }),
      () => targetId ? matchesUniqueRevision(useLedgerStore.getState().transfers, targetId, transfer!.updatedAt) && updateTransfer(targetId, transferData) : addTransfer(transferData),
      () => onClose(), () => setError(t('Could not save the transfer. Please check the account balances and details.', 'تعذر حفظ التحويل. راجع أرصدة الحسابات والتفاصيل.')));

  };

  const accountsSelected = !!selectedSource && !!selectedDestination;
  const receivedText = accountsSelected && calculatedToAmount !== null
    ? calculatedToAmount.toLocaleString(undefined, { minimumFractionDigits: getCurrencyDecimals(selectedDestination.currencyCode), maximumFractionDigits: getCurrencyDecimals(selectedDestination.currencyCode) })
    : '—';
  const rateHint = sameCurrency || mode === 'credit_card_payment'
    ? t('The exchange rate is fixed at 1 for this transfer.', 'سعر الصرف ثابت عند 1 لهذا التحويل.')
    : suggestedRate
      ? `${t('Suggested rate', 'سعر الصرف المقترح')}: ${suggestedRate.rate.toLocaleString(undefined, { maximumFractionDigits: 8 })} · ${suggestedRate.source === 'saved-live' ? t('Saved market rate', 'سعر سوق محفوظ') : suggestedRate.source === 'saved-manual' ? t('Saved manual rate', 'سعر يدوي محفوظ') : t('Mixed saved sources', 'مصادر محفوظة مختلطة')} · ${t('Not guaranteed current; confirm or edit before saving.', 'ليس مضمونًا أنه حديث؛ أكده أو عدله قبل الحفظ.')}`
      : t('No confirmed suggested rate. Enter the actual exchange rate manually.', 'لا يوجد سعر مقترح مؤكد. أدخل سعر الصرف الفعلي يدويًا.');

  return (
    <FormModal
      visible={visible}
      title={isEditing ? t('Edit transfer', 'تعديل التحويل') : t('Add transfer', 'إضافة تحويل')}
      onClose={onClose}
      onBack={onClose}
    >
      {activeAccounts.length === 0 ? (
        <AppText color="textSecondary">
          {t('You need active accounts before adding a transfer.', 'يجب إضافة حساب نشط قبل إجراء تحويل.')}
        </AppText>
      ) : (
        <>
          <ChipSelect<string>
            label={t('TRANSFER TYPE', 'نوع التحويل')}
            options={[
              {
                value: 'internal',
                label: t('Internal transfer', 'تحويل داخلي'),
                color: '#1E293B',
              },
              {
                value: 'credit_card_payment',
                label: t('Credit card payment', 'سداد بطاقة ائتمان'),
                color: '#1E293B',
              },
            ]}
            value={mode}
            onChange={handleModeChange}
          />

          <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: spacing.sm }}>
            <AccountDropdown label={t('From account', 'من حساب')} options={sourceAccounts} value={fromAccountId}
              containerStyle={stackFields ? { flex: 0 } : undefined}
              onChange={value => { setFromAccountId(value); setError(undefined); }} emptyMessage={t('No eligible source accounts', 'لا توجد حسابات مصدر مؤهلة')} />
            <AccountDropdown label={t('To account', 'إلى حساب')} options={destinationAccounts} value={toAccountId}
              containerStyle={stackFields ? { flex: 0 } : undefined}
              onChange={value => { setToAccountId(value); setError(undefined); }}
              emptyMessage={mode === 'credit_card_payment' ? t('Add a credit card account', 'أضف حساب بطاقة ائتمان') : t('Choose another non-card account', 'اختر حسابًا آخر غير البطاقة')} />
          </View>

          <View testID="transfer-amounts-row" style={[styles.amountsRow, stackFields && styles.stacked]}>
            <View style={[styles.field, !stackFields && { flex: 38 }]}>
              <AppText variant="label" color={colors.finance.neutral.accent} style={[styles.label, !stackFields && styles.rowLabel]}>{t('Amount to transfer', 'المبلغ المحوّل')}</AppText>
              <AppInput accessibilityLabel={t('Amount to transfer', 'المبلغ المحوّل')} accessibilityHint={selectedSource ? t('Amount in ', 'المبلغ بعملة ') + selectedSource.currencyCode : t('Choose the source account currency', 'اختر عملة حساب المصدر')}
                value={fromAmount} onChangeText={value => { setFromAmount(value); setError(undefined); }}
                keyboardType="decimal-pad" placeholder="" style={styles.input}
                fieldStyle={[styles.inputField, { borderColor: '#D6B777', backgroundColor: '#FFFFFF' }]} />
              <AppText variant="label" color={colors.finance.neutral.accent}>{selectedSource ? getCurrencyLabel(selectedSource.currencyCode) : '—'}</AppText>
            </View>
            <View style={[styles.field, !stackFields && { flex: 24 }]}>
              <AppText variant="label" color={colors.finance.neutral.accent} style={[styles.label, !stackFields && styles.rowLabel]}>{t('Rate', 'سعر الصرف')}</AppText>
              <AppInput accessibilityLabel={t('Rate', 'سعر الصرف')} accessibilityHint={accountsSelected ? rateHint : t('Choose both accounts to view the rate', 'اختر الحسابين لعرض سعر الصرف')}
                value={accountsSelected ? exchangeRate : ''} onChangeText={value => { setExchangeRate(value); setError(undefined); }}
                keyboardType="decimal-pad" editable={accountsSelected && !sameCurrency && mode !== 'credit_card_payment'}
                placeholder={accountsSelected && sameCurrency ? '1' : '—'} style={styles.input}
                fieldStyle={[styles.inputField, { borderColor: '#D6B777', backgroundColor: '#FFFFFF' }]} />
            </View>
            <View style={[styles.field, !stackFields && { flex: 38 }]}>
              <AppText variant="label" color={colors.finance.neutral.accent} style={[styles.label, !stackFields && styles.rowLabel]}>{t('Amount to receive', 'المبلغ المستلم')}</AppText>
              <View style={[styles.result, { backgroundColor: colors.finance.balance.surface, borderColor: colors.finance.balance.border }]}>
                <AppText variant="bodyStrong" accessibilityLabel={t('Amount to receive: ', 'المبلغ المستلم: ') + receivedText + (selectedDestination ? ' ' + selectedDestination.currencyCode : '')}
                  style={styles.resultText} textBreakStrategy="simple">{receivedText}</AppText>
              </View>
              <AppText variant="label" color={colors.finance.neutral.accent}>{selectedDestination ? getCurrencyLabel(selectedDestination.currencyCode) : '—'}</AppText>
            </View>
          </View>

          {accountsSelected && (
            <>
              <View testID="transfer-settlement-row" style={{ flexDirection: stackFields ? 'column' : 'row', gap: spacing.sm }}>
                {!sameCurrency && <View style={{ flex: 1, minWidth: 0 }}>
                  <AppInput label={t('Actual amount', 'المبلغ الفعلي')}
                    accessibilityLabel={t('Actual amount received', 'المبلغ المستلم فعليًا')}
                    value={actualReceived} onChangeText={value => { setActualReceived(value); setError(undefined); }}
                    keyboardType="decimal-pad" placeholder={selectedDestination.currencyCode} />
                </View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppInput label={t('Fee', 'الرسوم')}
                    accessibilityLabel={t('Additional transfer fee', 'رسوم إضافية للتحويل')}
                    value={sourceFee} onChangeText={value => { setSourceFee(value); setError(undefined); }}
                    keyboardType="decimal-pad" placeholder={selectedSource.currencyCode} />
                </View>
              </View>
              {parseAmount(sourceFee) !== null && (parseAmount(sourceFee) ?? 0) > 0 && (
                <>
                  <AppText variant="caption">{t('The fee is added to the sent amount and recorded once as an expense.', 'تُضاف الرسوم إلى المبلغ المرسل وتُسجل مرة واحدة كمصروف.')}</AppText>
                  <ChipSelect<string> label={t('Fee expense category', 'تصنيف مصروف الرسوم')}
                    options={expenseCategories.map(c => ({ value: c.id, label: c.name, color: c.color }))}
                    value={selectedFeeCategory} onChange={setFeeCategoryId} />
                </>
              )}
            </>
          )}

          {accountsSelected && <AppText variant="caption" color={colors.finance.neutral.accent}>{rateHint}</AppText>}

          <DateField value={date} onChange={setDate} pickerOnly />
          <AppInput label={t('Note (optional)', 'ملاحظة (اختياري)')}
            value={note} onChangeText={setNote}
            placeholder={t('e.g. Monthly savings transfer', 'مثال: تحويل ادخار شهري')} />

          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}

          <AppButton
            title={
              isEditing
                ? t('Save changes', 'حفظ التغييرات')
                : mode === 'credit_card_payment'
                  ? t('Record card payment', 'تسجيل سداد البطاقة')
                  : t('Save transfer', 'حفظ التحويل')
            }
            accentColor={'#1E293B'}
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
  inputField: { minHeight: 48, paddingHorizontal: 10, borderRadius: 12 },
  input: { fontSize: 14, paddingVertical: 8, fontVariant: ['tabular-nums'] },
  result: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 8, justifyContent: 'center' },
  resultText: { fontSize: 14, fontVariant: ['tabular-nums'], flexShrink: 1 },
});
