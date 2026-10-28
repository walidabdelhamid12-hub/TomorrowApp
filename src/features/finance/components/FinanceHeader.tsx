import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface FinanceHeaderProps {
  selectedCurrency: string;
  onSelectCurrency: (currency: string) => void;
}

export const FinanceHeader: React.FC<FinanceHeaderProps> = ({ selectedCurrency, onSelectCurrency }) => {
  const [isOpen, setIsOpen] = useState(false);
  const currencies = ['EGP', 'OMR', 'SAR', 'AED', 'USD', 'EUR', 'GBP', 'JOD', 'QAR', 'KWD'];

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.headerRow} 
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text style={styles.title}>TOTAL ({selectedCurrency})</Text>
        <Ionicons 
          name={isOpen ? "chevron-up" : "chevron-down"} 
          size={18} 
          color="#333" 
        />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.dropdown}>
          {currencies.map((curr) => (
            <TouchableOpacity
              key={curr}
              style={[
                styles.chip, 
                selectedCurrency === curr && styles.chipActive
              ]}
              onPress={() => {
                onSelectCurrency(curr);
                setIsOpen(false);
              }}
            >
              <Text style={[
                styles.chipText, 
                selectedCurrency === curr && styles.chipTextActive
              ]}>
                {curr}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  dropdown: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
  },
  chipActive: {
    backgroundColor: '#059669',
  },
  chipText: {
    fontSize: 13,
    color: '#333',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});