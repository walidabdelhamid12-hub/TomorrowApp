import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

interface CalculatorModalProps {
  visible: boolean;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (val: string) => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({
  visible,
  initialValue = '0',
  onClose,
  onConfirm,
}) => {
  const [expr, setExpr] = useState<string>(initialValue === '0' ? '' : initialValue);

  const handlePress = (char: string) => {
    setExpr((prev) => prev + char);
  };

  const handleClear = () => {
    setExpr('');
  };

  const handleBackspace = () => {
    setExpr((prev) => prev.slice(0, -1));
  };

  const handleCalculate = () => {
    try {
      const cleanExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');
      const result = Function(`'use strict'; return (${cleanExpr || '0'})`)();
      onConfirm(String(result));
    } catch {
      onConfirm(expr || '0');
    }
  };

  const keys = [
    ['1', '2', '3', '(', ')', ','],
    ['4', '5', '6', '+', '-', ';'],
    ['7', '8', '9', '/', 'N', '⌫'],
    ['*', '0', '#', '.', 'C', '↵'],
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.keyboardContainer}>
              <View style={styles.displayArea}>
                <Text style={styles.displayText}>{expr || '0'}</Text>
              </View>

              <View style={styles.grid}>
                {keys.map((row, rIdx) => (
                  <View key={rIdx} style={styles.row}>
                    {row.map((k) => {
                      const isConfirmKey = k === '↵';
                      const isBackspace = k === '⌫';
                      const isClear = k === 'C';

                      return (
                        <TouchableOpacity
                          key={k}
                          style={[
                            styles.key,
                            isConfirmKey && styles.confirmKey,
                            isBackspace && styles.actionKey,
                          ]}
                          onPress={() => {
                            if (isConfirmKey) handleCalculate();
                            else if (isBackspace) handleBackspace();
                            else if (isClear) handleClear();
                            else handlePress(k);
                          }}
                        >
                          <Text style={[styles.keyText, isConfirmKey && styles.confirmKeyText]}>
                            {k}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    backgroundColor: '#EAEBEE',
    padding: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  displayArea: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  displayText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  grid: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  key: {
    flex: 1,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
  },
  actionKey: {
    backgroundColor: '#B4B9C3',
  },
  confirmKey: {
    backgroundColor: '#4C4DDC',
  },
  keyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#000',
  },
  confirmKeyText: {
    color: '#FFF',
    fontWeight: '700',
  },
});