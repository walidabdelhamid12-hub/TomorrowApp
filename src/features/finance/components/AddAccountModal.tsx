import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ visible, onClose, onSave }) => {
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('0');
  const [selectedType, setSelectedType] = useState('Cash');
  const [selectedCurrency, setSelectedCurrency] = useState('EGP');

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

          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. CIB, CASH, فودافون كاش"
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
                  <Text style={[styles.typeText, selectedType === type && styles.typeTextActive]}>
                    {type}
                  </Text>
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
                  <Text style={[styles.currencyText, selectedCurrency === curr && styles.currencyTextActive]}>
                    {curr}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Starting balance</Text>
            <View style={styles.balanceContainer}>
              <View style={styles.balanceInputRow}>
                <Text style={styles.currencyLabelSymbol}>{selectedCurrency}</Text>
                <TextInput
                  style={styles.balanceInput}
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
              </View>
            </View>
            <Text style={styles.helperText}>Money already in the account before you start tracking.</Text>

            <TouchableOpacity 
              style={styles.saveButton}
              onPress={() => {
                onSave({ accountName, amount, selectedType, selectedCurrency });
                onClose();
              }}
            >
              <Text style={styles.saveButtonText}>Add account</Text>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  typesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginBottom: 6,
  },
  typeChipActive: {
    backgroundColor: '#4338ca',
  },
  typeText: {
    fontSize: 14,
    color: '#333',
  },
  typeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  currenciesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginBottom: 6,
  },
  currencyChipActive: {
    backgroundColor: '#059669',
  },
  currencyText: {
    fontSize: 13,
    color: '#333',
  },
  currencyTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  balanceContainer: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyLabelSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginRight: 10,
  },
  balanceInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    padding: 0,
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
  },
  saveButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});