import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../constants/financeUi';

type Props = {
  options: string[]; // أكواد العملات، مثلاً ['OMR', 'AED', 'KWD', ...]
  value: string;
  onChange: (code: string) => void;
};

export function CurrencyPicker({ options, value, onChange }: Props) {
  const perRow = Math.ceil(options.length / 2);
  const rows = [options.slice(0, perRow), options.slice(perRow)];

  return (
    <View style={styles.container}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((code) => {
            const active = code === value;
            return (
              <Pressable
                key={code}
                onPress={() => onChange(code)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.text, active && styles.textActive]}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
          {/* مساحة فاضية لو العدد فردي، عشان الصفين يفضلوا متساويين */}
          {Array.from({ length: perRow - row.length }).map((_, j) => (
            <View key={`filler-${j}`} style={styles.filler} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: palette.key,
  },
  chipActive: { backgroundColor: palette.primary },
  filler: { flex: 1 },
  text: { fontSize: 14, fontWeight: '600', color: palette.text },
  textActive: { color: '#FFFFFF' },
});