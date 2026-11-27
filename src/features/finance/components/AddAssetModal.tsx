import { FinanceDateField } from './FinanceDateField';
import { FinanceButton } from './FinanceButton';
import { isValidISODate } from '@/features/finance/utils/input';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { FormModal } from '@/features/finance/components/FormModal';
import { FinanceChoiceDropdown, FINANCE_CURRENCY_CHOICES } from './FinanceChoiceDropdown';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import type {
  Asset,
  AssetCategory,
  GoldKarat,
} from '@/features/finance/types/finance';
import { getAssetBalance } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export type AddAssetFormData = {
  assetName: string;
  amount: string;
  selectedType: AssetCategory;
  selectedCurrency: string;
  karat: GoldKarat;
  openingBalanceDate?: string;
};

interface AddAssetModalProps {
  visible: boolean;
  asset?: Asset | null;
  onClose: () => void;
  onSave: (data: AddAssetFormData) => void;
}

const ASSET_TYPE_OPTIONS: {
  value: AssetCategory;
  label: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  background: string;
}[] = [
  {
    value: 'local_currency',
    label: 'Local currency',
    subtitle: 'Base currency',
    icon: 'cash-outline',
    color: '#059669',
    background: '#D1FAE5',
  },
  {
    value: 'foreign_currency',
    label: 'Foreign currency',
    subtitle: 'USD, OMR, EUR...',
    icon: 'globe-outline',
    color: '#2563EB',
    background: '#DBEAFE',
  },
  {
    value: 'gold',
    label: 'Gold',
    subtitle: 'Weight in grams',
    icon: 'diamond-outline',
    color: '#D97706',
    background: '#FEF3C7',
  },
  {
    value: 'silver',
    label: 'Silver',
    subtitle: 'Weight in grams',
    icon: 'layers-outline',
    color: '#64748B',
    background: '#E2E8F0',
  },
];

const CURRENCY_OPTIONS = [
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

export const AddAssetModal: React.FC<AddAssetModalProps> = ({
  visible,
  asset = null,
  onClose,
  onSave,
}) => {
  const { t } = useAppLanguage();
  const baseCurrency = useCurrencyStore(
    (state) => state.baseCurrency,
  );

  const isEditing = asset !== null;

  const [assetName, setAssetName] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [openingDateConfirmed, setOpeningDateConfirmed] = useState(false);
  const [amount, setAmount] = useState('');
  const [selectedType, setSelectedType] =
    useState<AssetCategory>('local_currency');
  const [selectedCurrency, setSelectedCurrency] =
    useState(baseCurrency);
  const [karat, setKarat] = useState<GoldKarat>(24);

  const formContext = { visible, asset, baseCurrency };
  const [loadedFormContext, setLoadedFormContext] = useState<typeof formContext | null>(null);
  if (!loadedFormContext || loadedFormContext.visible !== visible || loadedFormContext.asset !== asset || loadedFormContext.baseCurrency !== baseCurrency) {
    setLoadedFormContext(formContext);
    if (visible) {
      setAssetName(asset?.name ?? '');
      setOpeningDate('');
      setOpeningDateConfirmed(false);
      setAmount(asset ? String(getAssetBalance(asset)) : '');
      setSelectedType(asset?.category ?? 'local_currency');
      setSelectedCurrency(asset && (asset.category === 'local_currency' || asset.category === 'foreign_currency') ? asset.currencyCode : baseCurrency);
      setKarat(asset?.category === 'gold' ? asset.karat : 24);
    }
  }

  // Base-currency changes reset the form above; selecting local currency also
  // sets the currency in handleSelectType. No second reset effect is needed.

  const selectedCurrencyOption = CURRENCY_OPTIONS.find(
    (currency) => currency.code === selectedCurrency,
  );

  const handleSelectType = (type: AssetCategory) => {
    if (isEditing) return;

    setSelectedType(type);

    if (type === 'local_currency') {
      setSelectedCurrency(baseCurrency);
    } else if (
      type === 'foreign_currency' &&
      (selectedCurrency === baseCurrency ||
        selectedCurrency === 'EGP')
    ) {
      setSelectedCurrency('USD');
    }
  };

  const handleSave = () => {
    const parsedAmount = parseAmount(amount);

    if (!assetName.trim()) {
      Alert.alert(
        t('Asset name required', 'اسم الأصل مطلوب'),
        t('Enter a name for this asset.', 'أدخل اسمًا لهذا الأصل.'),
      );
      return;
    }

    if (
      !amount.trim() ||
      parsedAmount === null ||
      parsedAmount < 0
    ) {
      Alert.alert(
        t('Invalid amount', 'مبلغ غير صالح'),
        t('Enter a valid non-negative amount.', 'أدخل مبلغًا صالحًا لا يقل عن صفر.'),
      );
      return;
    }

    const isCurrencyAsset = selectedType === 'local_currency' || selectedType === 'foreign_currency';
    const assetCurrency = selectedType === 'local_currency' ? baseCurrency : selectedCurrency;
    if (isCurrencyAsset && !hasValidCurrencyPrecision(amount, assetCurrency)) {
      Alert.alert(t('Invalid amount precision', 'عدد المنازل العشرية غير صالح'), t(`${assetCurrency} allows up to ${getCurrencyDecimals(assetCurrency)} decimal places. Please correct the amount before saving.`, `العملة ${assetCurrency} تسمح بحد أقصى ${getCurrencyDecimals(assetCurrency)} منازل عشرية. صحّح المبلغ قبل الحفظ.`));
      return;
    }

    if (!isEditing && openingDate && (!isValidISODate(openingDate) || !openingDateConfirmed)) {
      Alert.alert(t('Confirm opening date', 'أكد تاريخ الافتتاح'), t('Choose a valid date and confirm the opening history.', 'اختر تاريخًا صحيحًا وأكد بداية السجل.'));
      return;
    }

    onSave({
      ...(!isEditing && openingDate ? { openingBalanceDate: openingDate } : {}),
      assetName: assetName.trim(),
      amount,
      selectedType,
      selectedCurrency:
        selectedType === 'local_currency'
          ? baseCurrency
          : selectedCurrency,
      karat,
    });
  
  };

  const isMetal =
    selectedType === 'gold' || selectedType === 'silver';

  const amountSymbol = isMetal
    ? 'g'
    : selectedType === 'local_currency'
      ? CURRENCY_SYMBOLS[baseCurrency] ?? baseCurrency
      : selectedCurrencyOption?.symbol ?? selectedCurrency;

  return (
    <FormModal visible={visible} title={isEditing ? t('Edit asset', 'تعديل أصل') : t('Add asset', 'إضافة أصل')} onClose={onClose} onBack={onClose}>
      <View>
            <Text style={styles.label}>{t('Name', 'الاسم')}</Text>

            <TextInput
              style={styles.input}
              placeholder={t('e.g. Dollar savings, Gold bars', 'مثال: مدخرات بالدولار، سبائك ذهب')}
              placeholderTextColor="#999"
              value={assetName}
              onChangeText={setAssetName}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 135 }}>
                <FinanceChoiceDropdown label={t('Asset Type', 'نوع الأصل')} value={selectedType}
                  disabled={isEditing}
                  options={ASSET_TYPE_OPTIONS.map(type => ({ value: type.value, label: t(type.label, ({ local_currency: 'عملة محلية', foreign_currency: 'عملة أجنبية', gold: 'ذهب', silver: 'فضة' } as Record<AssetCategory, string>)[type.value]) }))}
                  onChange={value => handleSelectType(value as AssetCategory)} />
              </View>
              <View style={{ flex: 1, minWidth: 135 }}>
                {selectedType === 'foreign_currency' ? (
                  <FinanceChoiceDropdown label={t('Currency', 'العملة')} value={selectedCurrency}
                    options={FINANCE_CURRENCY_CHOICES.filter(item => item.value !== baseCurrency && item.value !== 'EGP')}
                    onChange={setSelectedCurrency} />
                ) : (
                  <FinanceChoiceDropdown label={t('Asset Currency / Metal', 'عملة الأصل / المعدن')}
                    value={selectedType === 'local_currency' ? baseCurrency : selectedType}
                    disabled options={selectedType === 'local_currency'
                      ? FINANCE_CURRENCY_CHOICES.filter(item => item.value === baseCurrency)
                      : [{ value: selectedType, label: selectedType === 'gold' ? t('Gold', 'ذهب') : t('Silver', 'فضة') }]}
                    onChange={() => {}} />
                )}
              </View>
            </View>

            {selectedType === 'gold' && (
              <>
                <Text style={styles.label}>{t('GOLD KARAT', 'عيار الذهب')}</Text>

                <View style={styles.karatRow}>
                  {([24, 22, 21, 18, 14] as GoldKarat[]).map(
                    (value) => {
                      const active = karat === value;

                      return (
                        <TouchableOpacity
                          key={value}
                          style={[
                            styles.karatChip,
                            active && styles.karatChipActive,
                          ]}
                          onPress={() => setKarat(value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            style={[
                              styles.karatText,
                              active && styles.karatTextActive,
                            ]}
                          >
                            {value}K
                          </Text>
                        </TouchableOpacity>
                      );
                    },
                  )}
                </View>

                <Text style={styles.helperText}>
                  {t('For gold, enter the weight in grams.', 'للذهب، أدخل الوزن بالجرام.')}
                </Text>
              </>
            )}

            {selectedType === 'silver' && (
              <Text style={styles.helperText}>
                {t('For silver, enter the weight in grams.', 'للفضة، أدخل الوزن بالجرام.')}
              </Text>
            )}

            <>
              <Text style={styles.label}>
                {isEditing ? t('CURRENT BALANCE', 'الرصيد الحالي') : t('Starting balance / quantity', 'الرصيد / الكمية الافتتاحية')}
              </Text>

              <View style={styles.balanceContainer}>
                <View style={styles.balanceInputRow}>
                  <Text style={styles.currencyLabelSymbol}>
                    {amountSymbol}
                  </Text>

                  <TextInput
                    style={styles.balanceInput}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder=""
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              {isEditing && (
                <Text style={styles.helperText}>
                  {t('Enter the new total balance. Previous movements will be preserved.', 'أدخل الرصيد الإجمالي الجديد. ستُحفظ الحركات السابقة.')}
                </Text>
              )}
            </>

            {!isEditing && <View style={{ marginTop: 12, gap: 8 }}>
              <FinanceDateField label={t('Opening date (optional)', 'تاريخ الافتتاح (اختياري)')}
                value={openingDate} pickerOnly
                onChange={value => { setOpeningDate(value); setOpeningDateConfirmed(false); }}
                onClear={() => { setOpeningDate(''); setOpeningDateConfirmed(false); }} />
              {openingDate ? <TouchableOpacity accessibilityRole="checkbox"
                accessibilityState={{ checked: openingDateConfirmed }}
                onPress={() => setOpeningDateConfirmed(value => !value)}
                style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={styles.helperText}>{openingDateConfirmed ? '☑' : '☐'} {t('Confirm this is the complete recorded opening history.', 'أكد أن هذا هو تاريخ بداية سجل الأصل الكامل.')}</Text>
              </TouchableOpacity> : null}
            </View>}
            <FinanceButton title={isEditing ? t('Update asset', 'تحديث الأصل') : t('Create asset', 'إنشاء أصل')}
              style={styles.saveButton} onPress={handleSave} />
      </View>
    </FormModal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalContent: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  headerRow: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#365575',
    marginTop: 13,
    marginBottom: 7,
    letterSpacing: 0.5,
  },
  addToRow: {
    flexDirection: 'row',
    gap: 6,
  },
  addToChipActive: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D6B777',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToTextActive: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#111',
  },
  assetTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  assetTypeCard: {
    flexGrow: 1, flexBasis: 120,
    minWidth: 0,
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    gap: 1,
  },
  disabledTypeCard: {
    opacity: 0.85,
  },
  assetIconCircle: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  assetTypeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  assetTypeSubtitle: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
  },
  selectedCheck: {
    position: 'absolute',
    top: 3,
    right: 3,
  },
  currenciesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 7,
    columnGap: 5,
  },
  currencyCard: {
    width: '18.5%', minWidth: 64, flexGrow: 1,
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D6B777',
    backgroundColor: '#FFFFFF',
    gap: 2,
  },
  currencyCardActive: {
    borderColor: '#B38E49',
    backgroundColor: '#FFF8E9',
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
    color: '#1E293B',
  },
  currencySymbol: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
  },
  currencySymbolActive: {
    color: '#1E293B',
  },
  karatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  karatChip: {
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D6B777',
    backgroundColor: '#f8fafc',
  },
  karatChipActive: {
    borderColor: '#b45309',
    backgroundColor: '#fef3c7',
  },
  karatText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  karatTextActive: {
    color: '#92400e',
  },
  helperText: {
    fontSize: 11,
    color: '#888',
    marginTop: 6,
  },
  balanceContainer: {
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
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
  saveButton: {
    minHeight: 52, justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
