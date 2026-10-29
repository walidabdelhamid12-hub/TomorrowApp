import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

// --- 1. مودال إضافة الحساب ---
export const AddAccountModal: React.FC<ModalProps> = ({ visible, onClose, onSave }) => {
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('0');
  const [selectedType, setSelectedType] = useState('Cash');
  const [selectedCurrency, setSelectedCurrency] = useState('EGP');

  const handleNumPress = (num: string) => {
    setAmount((prev) => (prev === '0' ? num : prev + num));
  };

  const handleDelete = () => {
    setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleSave = () => {
    onSave({
      accountName: accountName.trim() || 'Account',
      amount: parseFloat(amount) || 0,
      selectedType,
      selectedCurrency,
    });
    setAmount('0');
    setAccountName('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>Add account</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, { textAlign: 'right' }]}
              placeholder="e.g. CIB, CASH"
              placeholderTextColor="#999"
              value={accountName}
              onChangeText={setAccountName}
            />

            <Text style={styles.label}>TYPE</Text>
            <View style={styles.typesRow}>
              {['Cash', 'Bank', 'Wallet', 'Savings', 'Credit card'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, selectedType === type && styles.typeChipActive]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text style={[styles.typeText, selectedType === type && styles.typeTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>CURRENCY</Text>
            <View style={styles.currenciesRow}>
              {['EGP', 'OMR', 'SAR', 'AED', 'USD', 'EUR', 'GBP', 'JOD', 'QAR', 'KWD'].map((curr) => (
                <TouchableOpacity
                  key={curr}
                  style={[styles.currencyChip, selectedCurrency === curr && styles.currencyChipActive]}
                  onPress={() => setSelectedCurrency(curr)}
                >
                  <Text style={[styles.currencyText, selectedCurrency === curr && styles.currencyTextActive]}>{curr}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Starting balance</Text>
            <View style={styles.balanceContainer}>
              <Text style={styles.currencySymbolText}>{selectedCurrency} {amount}</Text>
            </View>
          </ScrollView>

          {/* لوحة المفاتيح الرقمية */}
          <View style={styles.calculatorContainer}>
            {['1234', '5678'].map((row, idx) => (
              <View key={idx} style={styles.calcRow}>
                {row.split('').map((n) => (
                  <TouchableOpacity key={n} style={styles.calcButton} onPress={() => handleNumPress(n)}>
                    <Text style={styles.calcButtonText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={styles.calcRow}>
              {['9', '0', '.'].map((n) => (
                <TouchableOpacity key={n} style={styles.calcButton} onPress={() => handleNumPress(n)}>
                  <Text style={styles.calcButtonText}>{n}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.calcButtonDelete} onPress={handleDelete}>
                <Ionicons name="backspace-outline" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Add account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};


// --- 2. مودال إضافة الأصل ---
export const AddAssetModal: React.FC<ModalProps> = ({ visible, onClose, onSave }) => {
  const [assetName, setAssetName] = useState('');
  const [amount, setAmount] = useState('0');
  const [selectedType, setSelectedType] = useState('Local');
  const [selectedCurrency, setSelectedCurrency] = useState('OMR');

  const handleNumPress = (num: string) => {
    setAmount((prev) => (prev === '0' ? num : prev + num));
  };

  const handleDelete = () => {
    setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleSave = () => {
    onSave({
      assetName: assetName.trim() || 'Asset',
      amount: parseFloat(amount) || 0,
      selectedType,
      selectedCurrency,
    });
    setAmount('0');
    setAssetName('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>Assets</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Asset name</Text>
            <TextInput
              style={[styles.input, { textAlign: 'right' }]}
              placeholder="e.g. Dollar savings, Gold"
              placeholderTextColor="#999"
              value={assetName}
              onChangeText={setAssetName}
            />

            <Text style={styles.label}>CURRENCY</Text>
            <View style={styles.currenciesRow}>
              {['OMR', 'EGP', 'USD', 'EUR', 'SAR', 'AED', 'GBP', 'QAR', 'KWD'].map((curr) => (
                <TouchableOpacity
                  key={curr}
                  style={[styles.currencyChip, selectedCurrency === curr && styles.currencyChipActive]}
                  onPress={() => setSelectedCurrency(curr)}
                >
                  <Text style={[styles.currencyText, selectedCurrency === curr && styles.currencyTextActive]}>{curr}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Amount</Text>
            <View style={styles.balanceContainer}>
              <Text style={styles.currencySymbolText}>{selectedCurrency} {amount}</Text>
            </View>
          </ScrollView>

          {/* لوحة المفاتيح الرقمية */}
          <View style={styles.calculatorContainer}>
            {['1234', '5678'].map((row, idx) => (
              <View key={idx} style={styles.calcRow}>
                {row.split('').map((n) => (
                  <TouchableOpacity key={n} style={styles.calcButton} onPress={() => handleNumPress(n)}>
                    <Text style={styles.calcButtonText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={styles.calcRow}>
              {['9', '0', '.'].map((n) => (
                <TouchableOpacity key={n} style={styles.calcButton} onPress={() => handleNumPress(n)}>
                  <Text style={styles.calcButtonText}>{n}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.calcButtonDelete} onPress={handleDelete}>
                <Ionicons name="backspace-outline" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Create asset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '90%', paddingTop: 16, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  closeButton: { padding: 4 },
  scrollContent: { paddingBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, backgroundColor: '#fafafa', color: '#111' },
  typesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', marginBottom: 4 },
  typeChipActive: { backgroundColor: '#4338ca' },
  typeText: { fontSize: 13, color: '#333' },
  typeTextActive: { color: '#fff', fontWeight: '600' },
  currenciesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  currencyChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: '#f0f0f0', marginBottom: 4 },
  currencyChipActive: { backgroundColor: '#059669' },
  currencyText: { fontSize: 12, color: '#333' },
  currencyTextActive: { color: '#fff', fontWeight: '600' },
  balanceContainer: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 14, paddingVertical: 10 },
  currencySymbolText: { fontSize: 16, fontWeight: '600', color: '#111' },
  calculatorContainer: { borderTopWidth: 1, borderTopColor: '#eee', paddingVertical: 8, backgroundColor: '#fff' },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  calcButton: { flex: 1, backgroundColor: '#f8f9fa', paddingVertical: 12, marginHorizontal: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e9ecef' },
  calcButtonDelete: { flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 12, marginHorizontal: 3, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calcButtonText: { fontSize: 18, fontWeight: '500', color: '#1f2937' },
  saveButton: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});