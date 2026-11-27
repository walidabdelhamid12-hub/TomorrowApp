import { FinanceSubmissionReceipt } from './FinanceSubmissionReceipt';
import { useAppLanguage } from '@/localization/LanguageProvider';
import React, { useState } from 'react';
import { Alert, View, Text, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { FormModal } from './FormModal';
import { FinanceChoiceDropdown, FINANCE_CURRENCY_CHOICES } from './FinanceChoiceDropdown';
import { FinanceDateField } from './FinanceDateField';
import { FinanceInput } from './FinanceInput';
import { FinanceButton } from './FinanceButton';
import { shouldStackFinanceFields } from '../utils/formLayout';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { roundMoney } from '@/features/finance/utils/finance';
import type { CurrencyCode, Debt, DebtDirection, NewDebtInput } from '@/features/finance/types/finance';

interface AddDebtModalProps {
  visible: boolean;
  direction: DebtDirection;
  debt?: Debt | null;
  currencyLocked?: boolean;
  onClose: () => void;
  onSave: (data: NewDebtInput) => void;
}

const getTodayDate = (): string => {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
};

// Validate date components without converting local midnight to UTC.
// This avoids the timezone bug that rejected valid dates in Oman.
const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return day <= daysInMonth;
};

export const AddDebtModal: React.FC<AddDebtModalProps> = ({ visible, direction, debt = null, currencyLocked = false, onClose, onSave }) => {
  const { t } = useAppLanguage();
  const baseCurrency = useCurrencyStore(
    (state) => state.baseCurrency,
  );

  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] =
    useState<string>(baseCurrency);
  const [date, setDate] = useState(getTodayDate());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const isReceivable = direction === 'receivable';

  const formContext = { visible, debt, baseCurrency };
  const [loadedFormContext, setLoadedFormContext] = useState<typeof formContext | null>(null);
  if (!loadedFormContext || loadedFormContext.visible !== visible || loadedFormContext.debt !== debt || loadedFormContext.baseCurrency !== baseCurrency) {
    setLoadedFormContext(formContext);
    if (visible) {
      setPersonName(debt?.personName ?? '');
      setAmount(debt ? String(debt.amount) : '');
      setSelectedCurrency(debt?.currencyCode ?? baseCurrency);
      setDate(debt?.date ?? getTodayDate());
      setDueDate(debt?.dueDate ?? '');
      setNotes(debt?.notes ?? '');
    }
  }

  const handleSave = () => {
    const cleanName = personName.trim();
    const parsedAmount = parseAmount(amount);
    const numericAmount = parsedAmount === null ? null : roundMoney(parsedAmount);
    const cleanDate = date.trim();
    const cleanDueDate = dueDate.trim();

    if (!cleanName) {
      Alert.alert(t('Missing name', 'الاسم مطلوب'), t('Please enter the person or company name.', 'أدخل اسم الشخص أو الشركة.'));
      return;
    }

    if (
      numericAmount === null ||
      numericAmount <= 0
    ) {
      Alert.alert(t('Invalid amount', 'مبلغ غير صالح'), t('Please enter an amount greater than zero.', 'أدخل مبلغًا أكبر من صفر.'));
      return;
    }

    if (!hasValidCurrencyPrecision(amount, selectedCurrency)) {
      Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صالحة'), `${selectedCurrency} allows up to ${getCurrencyDecimals(selectedCurrency)} decimal places. Please correct the amount before saving.`);
      return;
    }
    if (!isValidDate(cleanDate)) {
      Alert.alert(
        'Invalid date',
        'Please select a valid debt date using the calendar.',
      );
      return;
    }

    if (cleanDueDate && !isValidDate(cleanDueDate)) {
      Alert.alert(
        'Invalid due date',
        'Please select a valid due date using the calendar.',
      );
      return;
    }

    if (cleanDueDate && cleanDueDate < cleanDate) {
      Alert.alert(
        'Invalid due date',
        'The due date cannot be earlier than the debt date.',
      );
      return;
    }

    onSave({
      direction,
      personName: cleanName,
      amount: numericAmount,
      currencyCode: selectedCurrency as CurrencyCode,
      date: cleanDate,
      dueDate: cleanDueDate || undefined,
      notes: notes.trim() || undefined,
    });
  
  };


  const { width, fontScale } = useWindowDimensions();
  const stack = shouldStackFinanceFields(width, fontScale);
  const dirty = personName !== (debt?.personName ?? '') || amount !== (debt ? String(debt.amount) : '') || selectedCurrency !== (debt?.currencyCode ?? baseCurrency) || date !== (debt?.date ?? getTodayDate()) || dueDate !== (debt?.dueDate ?? '') || notes !== (debt?.notes ?? '');
  const requestClose = () => {
    if (!dirty) { onClose(); return; }
    Alert.alert(t('Discard changes?', 'إلغاء التعديلات؟'), t('Unsaved changes will be lost.', 'ستفقد التعديلات غير المحفوظة.'), [
      { text: t('Keep editing', 'متابعة التعديل'), style: 'cancel' },
      { text: t('Discard', 'إلغاء التعديلات'), style: 'destructive', onPress: onClose },
    ]);
  };
  const title = isReceivable
    ? (debt ? t('Edit Receivable Debt', 'تعديل دين مستحق لك') : t('Add Receivable Debt', 'إضافة دين مستحق لك'))
    : (debt ? t('Edit Payable Debt', 'تعديل دين مستحق عليك') : t('Add Payable Debt', 'إضافة دين مستحق عليك'));
  return (
    <FormModal visible={visible} title={title} onClose={requestClose} onBack={requestClose}>
      <FinanceSubmissionReceipt scope="src/app/finance/debts.tsx:239" onCommitted={() => { /* receipt review is not a new debt; keep draft visible */ }} />
      <FinanceInput label={t('Person / Company Name', 'اسم الشخص / الشركة')} value={personName} onChangeText={setPersonName} placeholder={t('Enter name', 'أدخل الاسم')} />
      <View style={{ flexDirection: stack ? 'column' : 'row', gap: 10 }}>
        <View style={{ flex: stack ? 0 : 1, minWidth: 0 }}>
          <Text style={styles.label}>{t('Amount', 'المبلغ')}</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        </View>
        <View style={{ flex: stack ? 0 : 1, minWidth: 0 }}>
          <FinanceChoiceDropdown label={t('Currency', 'العملة')} value={selectedCurrency} options={FINANCE_CURRENCY_CHOICES} onChange={setSelectedCurrency} disabled={currencyLocked} />
        </View>
      </View>
      {currencyLocked && <Text>{t('Currency is locked to preserve payment history and linked account transactions.', 'العملة ثابتة للحفاظ على سجل الدفعات والمعاملات المرتبطة بالحساب.')}</Text>}
      <FinanceDateField label={t('Debt date', 'تاريخ الدين')} value={date} onChange={setDate} pickerOnly />
      <FinanceDateField label={t('Due date (optional)', 'تاريخ الاستحقاق (اختياري)')} value={dueDate} onChange={setDueDate} pickerOnly onClear={() => setDueDate('')} />
      <FinanceInput label={t('Notes (optional)', 'ملاحظات (اختياري)')} value={notes} onChangeText={setNotes} multiline textAlignVertical="top" style={{ minHeight: 64 }} />
      <Text>{t('Saving this debt does not change account balances. Balances change only on actual payment or collection.', 'حفظ الدين لا يغير أرصدة الحسابات. تتغير الأرصدة فقط عند السداد أو التحصيل الفعلي.')}</Text>
      <FinanceButton title={debt ? t('Save changes', 'حفظ التعديلات') : t('Save', 'حفظ')} onPress={handleSave} />
    </FormModal>
  );
};
const styles = StyleSheet.create({
  label: { color: '#334155', fontWeight: '700', fontSize: 12, marginBottom: 5 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, color: '#1E293B', fontWeight: '700' },
});
