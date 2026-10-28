import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import {
    applyKey,
    evaluateExpression,
} from '@/features/finance/utils/calculator';
import { moduleColors, useTheme } from '@/theme';

type KeyKind = 'digit' | 'operator' | 'action' | 'equals';

interface KeyDef {
  key: string;
  label: string;
  kind: KeyKind;
  flex: number;
}

const k = (key: string, kind: KeyKind, flex = 1, label = key): KeyDef => ({
  key,
  label,
  kind,
  flex,
});

const ROWS: KeyDef[][] = [
  [k('C', 'action', 2), k('DEL', 'action', 1, '⌫'), k('÷', 'operator')],
  [k('7', 'digit'), k('8', 'digit'), k('9', 'digit'), k('×', 'operator')],
  [k('4', 'digit'), k('5', 'digit'), k('6', 'digit'), k('-', 'operator')],
  [k('1', 'digit'), k('2', 'digit'), k('3', 'digit'), k('+', 'operator')],
  [k('0', 'digit', 2), k('.', 'digit'), k('=', 'equals')],
];

interface CalculatorPadProps {
  /** Starting value (for example when editing an existing amount). */
  initialValue?: number;
  /** Called on every key press with the resulting amount (0 when invalid). */
  onChange: (amount: number) => void;
}

/** In-app calculator keypad: + - × ÷ with instant result. */
export function CalculatorPad({ initialValue = 0, onChange }: CalculatorPadProps) {
  const { colors, spacing, radius } = useTheme();
  const accent = moduleColors.finance;

  const [expression, setExpression] = useState(
    initialValue > 0 ? String(initialValue) : ''
  );

  // Amounts are always positive; the sign comes from the transaction type.
  const toAmount = (expr: string): number | null => {
    const result = evaluateExpression(expr);
    return result !== null && result > 0 ? result : null;
  };

  const amount = toAmount(expression);
  const hasOperation = /[+\-×÷]/.test(expression);

  const handlePress = (key: string) => {
    const next =
      key === '='
        ? amount !== null
          ? String(amount)
          : expression
        : applyKey(expression, key);
    setExpression(next);
    onChange(toAmount(next) ?? 0);
  };

  const background: Record<KeyKind, string> = {
    digit: colors.surfaceAlt,
    operator: accent + '22',
    action: colors.surfaceAlt,
    equals: accent,
  };
  const foreground: Record<KeyKind, string> = {
    digit: colors.text,
    operator: accent,
    action: colors.danger,
    equals: '#FFFFFF',
  };

  return (
    <View style={styles.container}>
      <View style={[styles.display, { paddingHorizontal: spacing.sm }]}>
        {hasOperation ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {expression}
          </AppText>
        ) : null}
        <AppText variant="h1" numberOfLines={1}>
          {String(amount ?? 0)}
        </AppText>
      </View>

      {ROWS.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[styles.row, { marginTop: rowIndex === 0 ? 0 : spacing.sm }]}
        >
          {row.map((item, index) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => handlePress(item.key)}
              style={({ pressed }) => [
                styles.key,
                {
                  flex: item.flex,
                  borderRadius: radius.md,
                  marginStart: index === 0 ? 0 : spacing.sm,
                  backgroundColor: background[item.kind],
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <AppText
                variant="bodyStrong"
                color={foreground[item.kind]}
                style={styles.keyText}
              >
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The keypad is always left-to-right, even when the app is RTL.
  container: { direction: 'ltr' },
  display: {
    minHeight: 72,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  row: { flexDirection: 'row' },
  key: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 20 },
});