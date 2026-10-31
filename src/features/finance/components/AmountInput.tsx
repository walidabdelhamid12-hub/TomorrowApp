import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, AppInput, AppText, ChipSelect } from '@/components/ui';
import { CalculatorPad } from '@/features/finance/components/CalculatorPad';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

type Sign = 'plus' | 'minus';

interface AmountInputProps {
  label?: string;
  /** Plain number text such as "1250.5" or "-30". Empty means no amount. */
  value: string;
  onChangeText: (value: string) => void;
  hint?: string;
  error?: string;
  leftElement?: ReactNode;
  /** Lets the user enter a negative amount (e.g. a credit card balance). */
  allowNegative?: boolean;
  sheetTitle?: string;
}

/**
 * A money field that opens the in-app calculator instead of the phone keyboard.
 * Drop-in for a text input that holds the amount as a string.
 */
export function AmountInput({
  label,
  value,
  onChangeText,
  hint,
  error,
  leftElement,
  allowNegative = false,
  sheetTitle = 'Enter amount',
}: AmountInputProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const accent = moduleColors.finance;

  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(0);
  const [draft, setDraft] = useState(0);
  const [sign, setSign] = useState<Sign>('plus');

  const parsedValue = Number(value.replace(/,/g, ''));
  const hasValidValue = value.trim() !== '' && Number.isFinite(parsedValue);

  const displayValue = hasValidValue
    ? `${parsedValue < 0 ? '-' : ''}${formatAmount(Math.abs(parsedValue))}`
    : value;

  const openSheet = () => {
    const current = Number(value.replace(/,/g, ''));
    const safe = Number.isFinite(current) ? current : 0;

    setSeed(Math.abs(safe));
    setDraft(Math.abs(safe));
    setSign(safe < 0 ? 'minus' : 'plus');
    setOpen(true);
  };

  const commit = () => {
    const signed = sign === 'minus' ? -draft : draft;
    onChangeText(draft === 0 ? '' : String(signed));
    setOpen(false);
  };

  return (
    <View>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}, open calculator` : 'Open calculator'}
      >
        {/* The field only displays the value; the calculator handles input. */}
        <View pointerEvents="none">
          <AppInput
            label={label}
            value={displayValue}
            placeholder="0"
            hint={hint}
            error={error}
            leftElement={leftElement}
            showSoftInputOnFocus={false}
            rightElement={
              <Ionicons name="calculator-outline" size={22} color={accent} />
            }
          />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={styles.dismiss} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                padding: spacing.lg,
                paddingBottom: spacing.lg + insets.bottom,
              },
            ]}
          >
            <AppText variant="bodyStrong">{sheetTitle}</AppText>

            {allowNegative ? (
              <View style={{ marginTop: spacing.md }}>
                <ChipSelect<Sign>
                  options={[
                    { value: 'plus', label: 'Positive (+)' },
                    { value: 'minus', label: 'Negative (−)', color: colors.danger },
                  ]}
                  value={sign}
                  onChange={setSign}
                />
              </View>
            ) : null}

            <View style={{ marginTop: spacing.md }}>
              <CalculatorPad
                key={`${open}-${seed}`}
                initialValue={seed}
                onChange={setDraft}
              />
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <AppButton title="Done" accentColor={accent} onPress={commit} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismiss: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
});