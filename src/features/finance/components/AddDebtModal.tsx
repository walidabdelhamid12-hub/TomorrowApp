
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { parseAmount } from '@/features/finance/utils/money';
import { roundMoney } from '@/features/finance/utils/finance';
import type {
    CurrencyCode,
    Debt,
    DebtDirection,
    NewDebtInput,
} from '@/features/finance/types/finance';

const CURRENCY_OPTIONS = [
  { code: 'EGP', flag: '🇪🇬', symbol: 'E£' },
  { code: 'OMR', flag: '🇴🇲', symbol: 'ر.ع.' },
  { code: 'SAR', flag: '🇸🇦', symbol: 'ر.س' },
  { code: 'AED', flag: '🇦🇪', symbol: 'د.إ' },
  { code: 'USD', flag: '🇺🇸', symbol: '$' },
  { code: 'EUR', flag: '🇪🇺', symbol: '€' },
  { code: 'GBP', flag: '🇬🇧', symbol: '£' },
  { code: 'JOD', flag: '🇯🇴', symbol: 'د.أ' },
  { code: 'QAR', flag: '🇶🇦', symbol: 'ر.ق' },
  { code: 'KWD', flag: '🇰🇼', symbol: 'د.ك' },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: 'E£',
  OMR: 'ر.ع.',
  SAR: 'ر.س',
  AED: 'د.إ',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JOD: 'د.أ',
  QAR: 'ر.ق',
  KWD: 'د.ك',
};

interface AddDebtModalProps {
  visible: boolean;
  direction: DebtDirection;
  debt?: Debt | null;
  onClose: () => void;
  onSave: (data: NewDebtInput) => void;
}

type DateField = 'debt' | 'due';

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

const parseDate = (value: string): Date | null => {
  if (!isValidDate(value)) return null;

  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day, 12, 0, 0);
};

const toDateString = (date: Date): string => {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AddDebtModal: React.FC<AddDebtModalProps> = ({
  visible,
  direction,
  debt = null,
  onClose,
  onSave,
}) => {
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

  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<DateField>('debt');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1, 12);
  });

  const isReceivable = direction === 'receivable';

  useEffect(() => {
    if (!visible) return;

    if (debt) {
      setPersonName(debt.personName);
      setAmount(String(debt.amount));
      setSelectedCurrency(debt.currencyCode);
      setDate(debt.date);
      setDueDate(debt.dueDate ?? '');
      setNotes(debt.notes ?? '');
      return;
    }

    setPersonName('');
    setAmount('');
    setSelectedCurrency(baseCurrency);
    setDate(getTodayDate());
    setDueDate('');
    setNotes('');
  }, [visible, debt, baseCurrency]);

  const currencyOption = CURRENCY_OPTIONS.find(
    (currency) => currency.code === selectedCurrency,
  );

  const currencySymbol =
    currencyOption?.symbol ??
    CURRENCY_SYMBOLS[selectedCurrency] ??
    selectedCurrency;

  const openCalendar = (target: DateField) => {
    setCalendarTarget(target);

    const currentValue = target === 'debt' ? date : dueDate;
    const parsed = parseDate(currentValue);
    const initialDate = parsed ?? new Date();

    setCalendarMonth(
      new Date(
        initialDate.getFullYear(),
        initialDate.getMonth(),
        1,
        12,
      ),
    );

    setCalendarVisible(true);
  };

  const selectCalendarDate = (selectedDate: Date) => {
    const value = toDateString(selectedDate);

    if (calendarTarget === 'debt') {
      setDate(value);
    } else {
      setDueDate(value);
    }

    setCalendarVisible(false);
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
      12,
    );

    const startOffset = firstDay.getDay();

    const firstCell = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1 - startOffset,
      12,
    );

    return Array.from({ length: 42 }, (_, index) => {
      return new Date(
        firstCell.getFullYear(),
        firstCell.getMonth(),
        firstCell.getDate() + index,
        12,
      );
    });
  }, [calendarMonth]);

  const changeCalendarMonth = (amount: number) => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + amount,
          1,
          12,
        ),
    );
  };

  const handleSave = () => {
    const cleanName = personName.trim();
    const parsedAmount = parseAmount(amount);
    const numericAmount = parsedAmount === null ? null : roundMoney(parsedAmount);
    const cleanDate = date.trim();
    const cleanDueDate = dueDate.trim();

    if (!cleanName) {
      Alert.alert('Missing name', 'Please enter the person or company name.');
      return;
    }

    if (
      numericAmount === null ||
      numericAmount <= 0
    ) {
      Alert.alert('Invalid amount', 'Please enter an amount greater than zero.');
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

  const renderDateField = (
    label: string,
    value: string,
    target: DateField,
    placeholder: string,
    optional = false,
  ) => (
    <>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.dateInputContainer}>
        <Ionicons
          name={target === 'debt' ? 'calendar-outline' : 'time-outline'}
          size={18}
          color="#64748b"
        />

        <TextInput
          style={styles.dateInput}
          value={value}
          onChangeText={
            target === 'debt' ? setDate : setDueDate
          }
          placeholder={placeholder}
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          onPress={() => openCalendar(target)}
          style={styles.calendarButton}
          accessibilityRole="button"
          accessibilityLabel={`Choose ${target === 'debt' ? 'debt date' : 'due date'} from calendar`}
        >
          <Ionicons name="calendar" size={20} color="#059669" />
        </TouchableOpacity>

        {optional && value.length > 0 && (
          <TouchableOpacity
            onPress={() => setDueDate('')}
            accessibilityRole="button"
            accessibilityLabel="Clear due date"
          >
            <Ionicons
              name="close-circle"
              size={18}
              color="#94a3b8"
            />
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.headerRow}>
              <View style={styles.titleContainer}>
                <Text style={styles.modalTitle}>
                  {debt ? 'Edit debt' : 'Add debt'}
                </Text>

                <Text
                  style={[
                    styles.subtitle,
                    {
                      color: isReceivable ? '#059669' : '#DC2626',
                    },
                  ]}
                >
                  {isReceivable
                    ? 'Money owed to you'
                    : 'Money you owe'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>PERSON / COMPANY NAME</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter name"
                placeholderTextColor="#999"
                value={personName}
                onChangeText={setPersonName}
              />

              <Text style={styles.label}>DEBT TYPE</Text>

              <View style={styles.directionCard}>
                <View
                  style={[
                    styles.directionIcon,
                    {
                      backgroundColor: isReceivable
                        ? '#D1FAE5'
                        : '#FEE2E2',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      isReceivable
                        ? 'arrow-down-circle-outline'
                        : 'arrow-up-circle-outline'
                    }
                    size={23}
                    color={isReceivable ? '#059669' : '#DC2626'}
                  />
                </View>

                <View style={styles.directionTextContainer}>
                  <Text style={styles.directionTitle}>
                    {isReceivable ? 'Receivable' : 'Payable'}
                  </Text>

                  <Text style={styles.directionDescription}>
                    {isReceivable
                      ? 'Someone owes you this money.'
                      : 'You owe this money to someone.'}
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>AMOUNT</Text>

              <View style={styles.balanceContainer}>
                <Text style={styles.currencyLabelSymbol}>
                  {currencySymbol}
                </Text>

                <TextInput
                  style={styles.balanceInput}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#999"
                />
              </View>

              <Text style={styles.label}>CURRENCY</Text>

              <View style={styles.currenciesGrid}>
                {CURRENCY_OPTIONS.map((currency) => {
                  const active = selectedCurrency === currency.code;

                  return (
                    <TouchableOpacity
                      key={currency.code}
                      style={[
                        styles.currencyCard,
                        active && styles.currencyCardActive,
                      ]}
                      onPress={() => setSelectedCurrency(currency.code)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={styles.currencyFlag}>
                        {currency.flag}
                      </Text>

                      <Text
                        style={[
                          styles.currencyCode,
                          active && styles.currencyCodeActive,
                        ]}
                      >
                        {currency.code}
                      </Text>

                      <Text
                        style={[
                          styles.currencySymbol,
                          active && styles.currencySymbolActive,
                        ]}
                      >
                        {currency.symbol}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {renderDateField(
                'DEBT DATE',
                date,
                'debt',
                'YYYY-MM-DD',
              )}

              <Text style={styles.helperText}>
                The date when this debt was created.
              </Text>

              {renderDateField(
                'DUE DATE (OPTIONAL)',
                dueDate,
                'due',
                'YYYY-MM-DD',
                true,
              )}

              <Text style={styles.helperText}>
                Leave empty if there is no specific due date.
              </Text>

              <Text style={styles.label}>NOTES (OPTIONAL)</Text>

              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Add any details about this debt..."
                placeholderTextColor="#999"
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.infoBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={19}
                  color="#2563EB"
                />

                <Text style={styles.infoText}>
                  Saving this debt will not change any account balance.
                  Account balances are updated only when you confirm an
                  actual payment or collection.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: isReceivable ? '#059669' : '#DC2626',
                  },
                ]}
                onPress={handleSave}
                accessibilityRole="button"
              >
                <Text style={styles.saveButtonText}>
                  {debt ? 'Save changes' : 'Add debt'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={calendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>
                {calendarTarget === 'debt' ? 'Debt date' : 'Due date'}
              </Text>

              <TouchableOpacity
                onPress={() => setCalendarVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.monthHeader}>
              <TouchableOpacity
                onPress={() => changeCalendarMonth(-1)}
                style={styles.monthArrow}
              >
                <Ionicons name="chevron-back" size={22} color="#334155" />
              </TouchableOpacity>

              <Text style={styles.monthTitle}>
                {MONTH_NAMES[calendarMonth.getMonth()]}{' '}
                {calendarMonth.getFullYear()}
              </Text>

              <TouchableOpacity
                onPress={() => changeCalendarMonth(1)}
                style={styles.monthArrow}
              >
                <Ionicons name="chevron-forward" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
              {WEEK_DAYS.map((day) => (
                <View key={day} style={styles.calendarDayHeader}>
                  <Text style={styles.calendarDayHeaderText}>{day}</Text>
                </View>
              ))}

              {calendarDays.map((day) => {
                const value = toDateString(day);
                const selectedValue =
                  calendarTarget === 'debt' ? date : dueDate;
                const selected = selectedValue === value;
                const inCurrentMonth =
                  day.getMonth() === calendarMonth.getMonth();

                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => selectCalendarDate(day)}
                    style={[
                      styles.calendarDay,
                      selected && styles.calendarDaySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        !inCurrentMonth && styles.calendarDayOutside,
                        selected && styles.calendarDayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <TouchableOpacity
                onPress={() => {
                  const today = new Date();
                  selectCalendarDate(today);
                }}
                style={styles.todayButton}
              >
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCalendarVisible(false)}
                style={styles.calendarDoneButton}
              >
                <Text style={styles.calendarDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '90%',
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#111',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 26,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 13,
    marginBottom: 7,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  directionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 11,
    padding: 11,
    backgroundColor: '#fafafa',
    gap: 11,
  },
  directionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionTextContainer: {
    flex: 1,
  },
  directionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  directionDescription: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 3,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 11,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  currencyLabelSymbol: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginRight: 9,
  },
  balanceInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    padding: 0,
  },
  currenciesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 7,
    columnGap: 5,
  },
  currencyCard: {
    width: '18.5%',
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    gap: 2,
  },
  currencyCardActive: {
    borderColor: '#059669',
    backgroundColor: '#ecfdf5',
  },
  currencyFlag: {
    fontSize: 14,
  },
  currencyCode: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  currencyCodeActive: {
    color: '#047857',
  },
  currencySymbol: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
  },
  currencySymbolActive: {
    color: '#047857',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 11,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 9,
  },
  dateInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    paddingVertical: 9,
  },
  calendarButton: {
    padding: 5,
  },
  helperText: {
    fontSize: 11,
    color: '#888',
    marginTop: 5,
  },
  notesInput: {
    minHeight: 85,
    paddingTop: 10,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 11,
    marginTop: 15,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: '#1E40AF',
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 17,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  calendarOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 18,
  },
  calendarModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },
  monthArrow: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayHeader: {
    width: '14.2857%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  calendarDay: {
    width: '14.2857%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarDaySelected: {
    backgroundColor: '#059669',
  },
  calendarDayText: {
    fontSize: 13,
    color: '#1e293b',
  },
  calendarDayOutside: {
    color: '#cbd5e1',
  },
  calendarDayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 10,
  },
  todayButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  calendarDoneButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
