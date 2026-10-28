import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/ui';
import {
    CURRENCIES,
    type CurrencyInfo,
} from '@/features/finance/constants/currencies';
import { moduleColors, useTheme } from '@/theme';

interface CurrencyChipsProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  /** Currencies to show. Defaults to every supported currency. */
  options?: readonly CurrencyInfo[];
}

/** Currency buttons laid out in exactly two even rows (flag above the code). */
export function CurrencyChips({
  value,
  onChange,
  label,
  options = CURRENCIES,
}: CurrencyChipsProps) {
  const { colors, spacing, radius } = useTheme();
  const accent = moduleColors.finance;

  const perRow = Math.ceil(options.length / 2);
  const rows = [options.slice(0, perRow), options.slice(perRow)];

  return (
    <View>
      {label ? (
        <AppText
          variant="label"
          color="textSecondary"
          style={{ marginBottom: spacing.xs }}
        >
          {label}
        </AppText>
      ) : null}

      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.row, { marginTop: rowIndex === 0 ? 0 : spacing.xs }]}
        >
          {row.map((currency, index) => {
            const selected = currency.code === value;
            return (
              <Pressable
                key={currency.code}
                onPress={() => onChange(currency.code)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={currency.name}
                style={[
                  styles.chip,
                  {
                    borderRadius: radius.md,
                    marginEnd: index < perRow - 1 ? spacing.xs : 0,
                    backgroundColor: selected ? accent : colors.surfaceAlt,
                    borderColor: selected ? accent : colors.border,
                  },
                ]}
              >
                {currency.flag ? (
                  <Text style={styles.flag}>{currency.flag}</Text>
                ) : null}
                <AppText
                  variant="caption"
                  color={selected ? '#FFFFFF' : 'text'}
                  style={{ fontWeight: '600' }}
                >
                  {currency.code}
                </AppText>
              </Pressable>
            );
          })}

          {/* Empty slots keep both rows the same width when the count is odd. */}
          {Array.from({ length: perRow - row.length }).map((_, i) => (
            <View key={`slot-${i}`} style={styles.slot} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  chip: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 6,
  },
  slot: { flex: 1 },
  flag: { fontSize: 18 },
});