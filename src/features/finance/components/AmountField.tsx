import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatAmount } from '@/features/finance/utils/amountFormat';
import { palette } from '../constants/financeUi';
import { CalculatorPad } from './CalculatorPad';

type Props = {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  /** للرصيد الابتدائي (مثلاً كريديت كارد بالسالب) */
  allowNegative?: boolean;
};

export function AmountField({
  value,
  onChange,
  label,
  placeholder = '0',
  allowNegative = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(0);
  const [negative, setNegative] = useState(false);

  const openSheet = () => {
    setDraft(Math.abs(value));
    setNegative(value < 0);
    setOpen(true);
  };

  const commit = () => {
    onChange(negative && draft > 0 ? -draft : draft);
    setOpen(false);
  };

  return (
    <View>
      {label && <Text style={styles.label}>{label}</Text>}

      <Pressable style={styles.field} onPress={openSheet}>
        <Text style={[styles.value, value === 0 && styles.placeholder]}>
          {value === 0
            ? placeholder
            : `${value < 0 ? '−' : ''}${formatAmount(Math.abs(value))}`}
        </Text>
        <Ionicons name="calculator-outline" size={22} color={palette.primary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={styles.dismissArea} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            {allowNegative && (
              <Pressable
                style={[styles.signToggle, negative && styles.signToggleActive]}
                onPress={() => setNegative((n) => !n)}
              >
                <Text style={[styles.signText, negative && styles.signTextActive]}>
                  {negative ? 'رصيد بالسالب (−)' : 'رصيد بالموجب (+)'}
                </Text>
              </Pressable>
            )}

            <CalculatorPad
              key={`${open}-${Math.abs(value)}`}
              initialValue={Math.abs(value)}
              onChange={setDraft}
            />

            <Pressable style={styles.done} onPress={commit}>
              <Text style={styles.doneText}>تم</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.muted,
    marginTop: 16,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: { fontSize: 16, color: palette.text },
  placeholder: { color: palette.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: palette.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
  },
  signToggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: palette.key,
  },
  signToggleActive: { backgroundColor: palette.expenseSoft },
  signText: { color: palette.muted, fontWeight: '600' },
  signTextActive: { color: palette.expense },
  done: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});