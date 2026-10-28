import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { AppText } from './AppText';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Selected background. Defaults to the theme primary color. */
  color?: string;
}

interface ChipSelectProps<T extends string> {
  label?: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Single-choice chips (wrapping row). */
export function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChipSelectProps<T>) {
  const { colors, spacing, radius } = useTheme();

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

      <View style={styles.wrap}>
        {options.map((option) => {
          const selected = option.value === value;
          const tint = option.color ?? colors.primary;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  borderRadius: radius.full,
                  paddingHorizontal: spacing.md,
                  marginEnd: spacing.sm,
                  marginBottom: spacing.sm,
                  backgroundColor: selected ? tint : colors.surfaceAlt,
                  borderColor: selected ? tint : colors.border,
                },
              ]}
            >
              <AppText
                variant="caption"
                color={selected ? '#FFFFFF' : 'text'}
                style={{ fontWeight: '600' }}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
  },
});