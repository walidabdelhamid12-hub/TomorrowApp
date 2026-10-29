import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface AddAssetModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

export const AddAssetModal: React.FC<AddAssetModalProps> = ({ visible, onClose, onSave }) => {
  const [assetName, setAssetName] = useState('');
  const [amount, setAmount] = useState('0');
  const [selectedType, setSelectedType] = useState('Local');
  const [selectedCurrency, setSelectedCurrency] = useState('EGP');

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

          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>ADD TO</Text>
            <View style={styles.addToRow}>
              <TouchableOpacity style={styles.addToChipActive}>
                <Text style={styles.addToTextActive}>+ New asset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addToChip}>
                <Text style={styles.addToText}>NBE</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Asset name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Dollar savings, Silver bars"
              placeholderTextColor="#999"
              value={assetName}
              onChangeText={setAssetName}
            />

            <Text style={styles.label}>TYPE</Text>
            <View style={styles.typesRow}>
              {['Local 🇪🇬 EGP', 'Foreign currency', 'Gold', 'Silver'].map((type) => (
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

            <Text style={styles.label}>Amount</Text>
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

            <TouchableOpacity 
              style={styles.saveButton}
              onPress={() => {
                onSave({ assetName, amount, selectedType, selectedCurrency });
                onClose();
              }}
            >
              <Text style={styles.saveButtonText}>Create asset</Text>
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
  addToRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addToChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  addToChipActive: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#059669',
  },
  addToText: {
    fontSize: 14,
    color: '#333',
  },
  addToTextActive: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
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
    flexDirection: `row`,
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