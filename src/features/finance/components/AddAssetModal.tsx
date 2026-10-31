
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import type {
  Asset,
  AssetCategory,
  GoldKarat,
} from '@/features/finance/types/finance';
import { getAssetBalance } from '@/features/finance/utils/finance';
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

export type AddAssetFormData = {
  assetName: string;
  amount: string;
  selectedType: AssetCategory;
  selectedCurrency: string;
  karat: GoldKarat;
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
  const baseCurrency = useCurrencyStore(
    (state) => state.baseCurrency,
  );

  const isEditing = asset !== null;

  const [assetName, setAssetName] = useState('');
  const [amount, setAmount] = useState('0');
  const [selectedType, setSelectedType] =
    useState<AssetCategory>('local_currency');
  const [selectedCurrency, setSelectedCurrency] =
    useState(baseCurrency);
  const [karat, setKarat] = useState<GoldKarat>(24);

  useEffect(() => {
    if (!visible) return;

    if (asset) {
      setAssetName(asset.name);
      setAmount(String(getAssetBalance(asset)));
      setSelectedType(asset.category);

      if (
        asset.category === 'local_currency' ||
        asset.category === 'foreign_currency'
      ) {
        setSelectedCurrency(asset.currencyCode);
      } else {
        setSelectedCurrency(baseCurrency);
      }

      if (asset.category === 'gold') {
        setKarat(asset.karat);
      } else {
        setKarat(24);
      }

      return;
    }

    setAssetName('');
    setAmount('0');
    setSelectedType('local_currency');
    setSelectedCurrency(baseCurrency);
    setKarat(24);
  }, [visible, asset, baseCurrency]);

  // Keep the local asset currency synchronized with the app's base currency.
  useEffect(() => {
    if (!isEditing && selectedType === 'local_currency') {
      setSelectedCurrency(baseCurrency);
    }
  }, [baseCurrency, selectedType, isEditing]);

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
    const parsedAmount = Number(amount);

    if (!assetName.trim()) {
      Alert.alert(
        'Asset name required',
        'Enter a name for this asset.',
      );
      return;
    }

    if (
      !amount.trim() ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount < 0
    ) {
      Alert.alert(
        'Invalid amount',
        'Enter a valid non-negative amount.',
      );
      return;
    }

    onSave({
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
              {isEditing ? 'Edit asset' : 'Assets'}
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
            <Text style={styles.label}>
              {isEditing ? 'EDITING ASSET' : 'ADD TO'}
            </Text>

            <View style={styles.addToRow}>
              <View style={styles.addToChipActive}>
                <Text style={styles.addToTextActive}>
                  {isEditing ? 'Edit existing asset' : '+ New asset'}
                </Text>
              </View>
            </View>

            <Text style={styles.label}>ASSET NAME</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. Dollar savings, Gold bars"
              placeholderTextColor="#999"
              value={assetName}
              onChangeText={setAssetName}
            />

            <Text style={styles.label}>ASSET TYPE</Text>

            <View style={styles.assetTypesGrid}>
              {ASSET_TYPE_OPTIONS.map((type) => {
                const active = selectedType === type.value;

                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.assetTypeCard,
                      active && {
                        borderColor: type.color,
                        backgroundColor: type.background,
                      },
                      isEditing && styles.disabledTypeCard,
                    ]}
                    onPress={() => handleSelectType(type.value)}
                    disabled={isEditing}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: active,
                      disabled: isEditing,
                    }}
                  >
                    <View
                      style={[
                        styles.assetIconCircle,
                        { backgroundColor: type.background },
                      ]}
                    >
                      <Ionicons
                        name={type.icon}
                        size={15}
                        color={type.color}
                      />
                    </View>

                    <Text
                      style={[
                        styles.assetTypeTitle,
                        active && { color: type.color },
                      ]}
                    >
                      {type.label}
                    </Text>

                    <Text style={styles.assetTypeSubtitle}>
                      {type.value === 'local_currency'
                        ? baseCurrency
                        : type.subtitle}
                    </Text>

                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={13}
                        color={type.color}
                        style={styles.selectedCheck}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedType === 'foreign_currency' && (
              <>
                <Text style={styles.label}>CURRENCY</Text>

                <View style={styles.currenciesGrid}>
                  {CURRENCY_OPTIONS.map((currency) => {
                    const active =
                      selectedCurrency === currency.code;

                    return (
                      <TouchableOpacity
                        key={currency.code}
                        style={[
                          styles.currencyCard,
                          active && styles.currencyCardActive,
                        ]}
                        onPress={() =>
                          setSelectedCurrency(currency.code)
                        }
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
              </>
            )}

            {selectedType === 'gold' && (
              <>
                <Text style={styles.label}>GOLD KARAT</Text>

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
                  For gold, enter the weight in grams.
                </Text>
              </>
            )}

            {selectedType === 'silver' && (
              <Text style={styles.helperText}>
                For silver, enter the weight in grams.
              </Text>
            )}

            <>
              <Text style={styles.label}>
                {isEditing ? 'CURRENT BALANCE' : 'AMOUNT'}
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
                    placeholder="0"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              {isEditing && (
                <Text style={styles.helperText}>
                  Enter the new total balance. Previous movements will be preserved.
                </Text>
              )}
            </>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              accessibilityRole="button"
            >
              <Text style={styles.saveButtonText}>
                {isEditing ? 'Update asset' : 'Create asset'}
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
    maxHeight: '82%',
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
  addToRow: {
    flexDirection: 'row',
    gap: 6,
  },
  addToChipActive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#059669',
  },
  addToTextActive: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
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
  assetTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
  },
  assetTypeCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 9,
    backgroundColor: '#fafafa',
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
    borderColor: '#e5e7eb',
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
