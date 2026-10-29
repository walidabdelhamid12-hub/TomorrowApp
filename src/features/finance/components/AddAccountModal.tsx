import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { accountName: string; amount: string; selectedType: string; selectedCurrency: string }) => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ visible, onClose, onSave }) => {
  const [accountName, setAccountName] = useState<string>('');
  const [amount, setAmount] = useState<string>('0');
  const [selectedType, setSelectedType] = useState<string>('Cash');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('EGP');
  
  // حالة لإظهار أو إخفاء لوحة الأرقام الخاصة بالرصيد فقط عند الضغط عليها
  const [isCalculatorVisible, setIsCalculatorVisible] = useState<boolean>(false);

  const handleNumPress = (num: string) => {
    if (amount === '0') {
      setAmount(num);
    } else {
      setAmount(amount + num);
    }
  };

  const handleDelete = () => {
    if (amount.length > 1) {
      setAmount(amount.slice(0, -1));
    } else {
      setAmount('0');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          
          {/* رأس النافذة */}
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>Add account</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* محتوى النموذج */}
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* اسم الحساب (كيبورد الحروف الطبيعي هيظهر لوحده من غير تداخل) */}
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. CIB, CASH, فودافون كاش"
              placeholderTextColor="#999"
              value={accountName}
              onChangeText={setAccountName}
              onFocus={() => setIsCalculatorVisible(false)} // لو كتب في الاسم، اقفل لوحة الأرقام
            />

            {/* نوع الحساب */}
            <Text style={styles.label}>TYPE</Text>
            <View style={styles.typesRow}>
              {['Cash', 'Bank', 'Wallet', 'Savings', 'Credit card'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, selectedType === type && styles.typeChipActive]}
                  onPress={() => {
                    setSelectedType(type);
                    setIsCalculatorVisible(false);
                  }}
                >
                  <Text style={[styles.typeText, selectedType === type && styles.typeTextActive]}>
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* العملة */}
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

            {/* حقل الرصيد الابتدائي - عند الضغط عليه تظهر لوحة الأرقام فقط */}
            <Text style={styles.label}>Starting balance</Text>
            <TouchableOpacity 
              style={[styles.balanceContainer, isCalculatorVisible && styles.balanceContainerActive]}
              activeOpacity={0.8}
              onPress={() => setIsCalculatorVisible(true)} // تظهر اللوحة عند الضغط هنا فقط
            >
              <Text style={styles.currencySymbolText}>{selectedCurrency} {amount}</Text>
            </TouchableOpacity>
            <Text style={styles.helperText}>Optional. Saved as the opening balance.</Text>

            {/* زر الحفظ */}
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

          {/* لوحة المفاتيح المخصصة تظهر فقط عندما يضغط المستخدم على خانة الرصيد وتختفي بزر Done */}
          {isCalculatorVisible && (
            <View style={styles.calculatorContainer}>
              <View style={styles.calcHeaderRow}>
                <Text style={styles.calcTitle}>Enter Amount</Text>
                <TouchableOpacity onPress={() => setIsCalculatorVisible(false)}>
                  <Text style={styles.doneButtonText}>Done ✓</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calcRow}>
                {['1', '2', '3', '4'].map((n) => (
                  <TouchableOpacity key={n} style={styles.calcButton} onPress={() => handleNumPress(n)}>
                    <Text style={styles.calcButtonText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.calcRow}>
                {['5', '6', '7', '8'].map((n) => (
                  <TouchableOpacity key={n} style={styles.calcButton} onPress={() => handleNumPress(n)}>
                    <Text style={styles.calcButtonText}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.calcRow}>
                <TouchableOpacity style={styles.calcButton} onPress={() => handleNumPress('9')}>
                  <Text style={styles.calcButtonText}>9</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calcButton} onPress={() => handleNumPress('0')}>
                  <Text style={styles.calcButtonText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calcButton} onPress={() => handleNumPress('.')}>
                  <Text style={styles.calcButtonText}>.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calcButtonDelete} onPress={handleDelete}>
                  <Ionicons name="backspace-outline" size={22} color="#333" />
                </TouchableOpacity>
              </View>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '90%',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    paddingBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 10,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#111',
  },
  typesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginBottom: 4,
  },
  typeChipActive: {
    backgroundColor: '#4338ca',
  },
  typeText: {
    fontSize: 13,
    color: '#333',
  },
  typeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  currenciesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  currencyChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    marginBottom: 4,
  },
  currencyChipActive: {
    backgroundColor: '#059669',
  },
  currencyText: {
    fontSize: 12,
    color: '#333',
  },
  currencyTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  balanceContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  balanceContainerActive: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  currencySymbolText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  helperText: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    marginBottom: 4,
  },
  calculatorContainer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 10,
    backgroundColor: '#fff',
    paddingBottom: 15,
  },
  calcHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  calcTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calcButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  calcButtonDelete: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  saveButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});