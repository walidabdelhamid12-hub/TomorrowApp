import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../constants/financeUi';
import type { Category } from '../types/ledger';

export type CategoryKind = Category['kind'];

const OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'مصروف' },
  { value: 'income', label: 'دخل' },
];

type Props = {
  value: CategoryKind;
  onChange: (kind: CategoryKind) => void;
};

export function KindToggle({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.option, active && styles.optionActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: palette.key,
    borderRadius: 12,
    padding: 4,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  optionActive: { backgroundColor: palette.surface },
  label: { fontSize: 15, fontWeight: '600', color: palette.muted },
  labelActive: { color: palette.primary },
});