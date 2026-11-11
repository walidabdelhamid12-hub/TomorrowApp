
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
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
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import type { Account, AccountType } from '@/features/finance/types/ledger';

export type AccountTypeLabel =
  | 'Cash'
  | 'Bank'
  | 'Wallet'
  | 'Savings'
  | 'Credit card';

export type AddAccountFormData = {
  accountName: string;
  amount: string;
  selectedType: AccountTypeLabel;
  selectedCurrency: string;
  openingBalanceDate?: string;
};

const ACCOUNT_TYPE_OPTIONS: {
  label: AccountTypeLabel;
  value: AccountType;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  background: string;
}[] = [
  {
    label: 'Cash',
    value: 'cash',
    icon: 'cash-outline',
    color: '#059669',
    background: '#D1FAE5',
  },
  {
    label: 'Bank',
    value: 'bank',
    icon: 'business-outline',
    color: '#2563EB',
    background: '#DBEAFE',
  },
  {
    label: 'Wallet',
    value: 'wallet',
    icon: 'wallet-outline',
    color: '#9333EA',
    background: '#F3E8FF',
  },
  {
    label: 'Savings',
    value: 'savings',
    icon: 'save-outline',
    color: '#D97706',
    background: '#FEF3C7',
  },
  {
    label: 'Credit card',
    value: 'credit_card',
    icon: 'card-outline',
    color: '#E11D48',
    background: '#FFE4E6',
  },
];

const TYPE_LABEL_BY_VALUE: Record<AccountType, AccountTypeLabel> = {
  cash: 'Cash',
  bank: 'Bank',
  wallet: 'Wallet',
  savings: 'Savings',
  credit_card: 'Credit card',
};

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

interface AddAccountModalProps {
  visible: boolean;
  account?: Account | null;
  initialType?: AccountTypeLabel;
  onClose: () => void;
  onSave: (data: AddAccountFormData) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  visible,
  account = null,
  initialType = 'Cash',
  onClose,
  onSave,
}) => {
  const baseCurrency = useCurrencyStore(
    (state) => state.baseCurrency,
  );

  const [accountName, setAccountName] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [openingDateConfirmed, setOpeningDateConfirmed] = useState(false);
  const [amount, setAmount] = useState('0');
  const [selectedType, setSelectedType] =
    useState<AccountTypeLabel>('Cash');
  const [selectedCurrency, setSelectedCurrency] =
    useState(baseCurrency);

  useEffect(() => {
    if (!visible) return;

    setOpeningDate('');
    setOpeningDateConfirmed(false);
    if (account) {
      setAccountName(account.name);
      setAmount(String(account.initialBalance));
      setSelectedType(TYPE_LABEL_BY_VALUE[account.type]);
      setSelectedCurrency(account.currencyCode);
      return;
    }

    setAccountName('');
    setAmount('0');
    setSelectedType(initialType);
    setSelectedCurrency(baseCurrency);
  }, [visible, account, baseCurrency, initialType]);

  const selectedCurrencyOption = CURRENCY_OPTIONS.find(
    (currency) => currency.code === selectedCurrency,
  );

  const currencySymbol =
    selectedCurrencyOption?.symbol ??
    CURRENCY_SYMBOLS[selectedCurrency] ??
    selectedCurrency;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>
              {account ? 'Edit account' : 'Add account'}
            </Text>

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
            <Text style={styles.label}>Name</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. CIB, CASH, فودافون كاش"
              placeholderTextColor="#999"
              value={accountName}
              onChangeText={setAccountName}
            />

            <Text style={styles.label}>ACCOUNT TYPE</Text>

            <View style={styles.typesGrid}>
              {ACCOUNT_TYPE_OPTIONS.map((type) => {
                const active = selectedType === type.label;

                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeCard,
                      active && {
                        borderColor: type.color,
                        backgroundColor: type.background,
                      },
                    ]}
                    onPress={() => setSelectedType(type.label)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <View
                      style={[
                        styles.typeIconCircle,
                        { backgroundColor: type.background },
                      ]}
                    >
                      <Ionicons
                        name={type.icon}
                        size={21}
                        color={type.color}
                      />
                    </View>

                    <Text
                      style={[
                        styles.typeText,
                        active && { color: type.color },
                      ]}
                    >
                      {type.label}
                    </Text>

                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={type.color}
                        style={styles.selectedCheck}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
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

            <Text style={styles.label}>Starting balance</Text>

            <View style={styles.balanceContainer}>
              <View style={styles.balanceInputRow}>
                <Text style={styles.currencyLabelSymbol}>
                  {currencySymbol}
                </Text>

                <TextInput
                  style={styles.balanceInput}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor="#999"
                />
              </View>
            </View>

            <Text style={styles.helperText}>
              Money already in the account before you start tracking.
            </Text>

            {!account && <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={styles.label}>VERIFIED OPENING DATE (OPTIONAL)</Text>
              <TextInput accessibilityLabel="New account opening date (YYYY-MM-DD)"
                style={styles.input} value={openingDate} onChangeText={value => {
                  setOpeningDate(value); setOpeningDateConfirmed(false);
                }} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"
                autoCorrect={false} maxLength={10} />
              <TouchableOpacity accessibilityRole="checkbox"
                accessibilityState={{ checked: openingDateConfirmed }}
                onPress={() => setOpeningDateConfirmed(value => !value)}
                style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={styles.helperText}>
                  {openingDateConfirmed ? '☑' : '☐'} This starting balance applies before transactions on this date.
                </Text>
              </TouchableOpacity>
            </View>}

            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => {
                const parsed = parseAmount(amount);
                if (!hasValidCurrencyPrecision(amount, selectedCurrency)) {
                  Alert.alert('Invalid amount precision', `${selectedCurrency} allows up to ${getCurrencyDecimals(selectedCurrency)} decimal places. Please correct the amount before saving.`);
                  return;
                }
                if (parsed === null || parsed < 0 || !Number.isSafeInteger(Math.round(parsed * 1000))
                  || Math.abs(parsed * 1000 - Math.round(parsed * 1000)) > 1e-6) {
                  Alert.alert('Invalid starting balance', 'Enter a valid non-negative amount.');
                  return;
                }
                if (!accountName.trim()) {
                  Alert.alert('Account name required', 'Enter a name for this account.');
                  return;
                }
                if (!account && openingDate.trim() && !openingDateConfirmed) {
                  Alert.alert('Confirmation required', 'Confirm the opening balance date before saving.');
                  return;
                }
                onSave({
                  ...(!account && openingDate.trim() ? { openingBalanceDate: openingDate.trim() } : {}),
                  accountName: accountName.trim(),
                  amount,
                  selectedType,
                  selectedCurrency,
                });
              }}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>
                {account ? 'Save changes' : 'Add account'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    maxHeight: '85%',
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#111',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 24,
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
  typesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    width: '31%',
    minHeight: 84,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    gap: 5,
  },
  typeIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  selectedCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
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
  balanceContainer: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 11,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyLabelSymbol: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginRight: 9,
  },
  balanceInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    padding: 0,
  },
  helperText: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
  },
  saveButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
