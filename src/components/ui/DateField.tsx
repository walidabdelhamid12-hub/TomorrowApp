import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
    DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import {
    isoToDate,
    isValidISODate,
    normalizeDigits,
    toLocalISODate,
} from '@/utils/input';
import { AppButton } from './AppButton';
import { AppInput } from './AppInput';

interface DateFieldProps {
  label?: string;
  /** "YYYY-MM-DD" (may be incomplete while typing). */
  value: string;
  onChange: (value: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Date input: type it manually, or pick it from the calendar icon. */
export function DateField({
  label = 'Date',
  value,
  onChange,
  containerStyle,
}: DateFieldProps) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);

  const valid = isValidISODate(value);
  const error =
    value.length >= 10 && !valid ? 'Use the format YYYY-MM-DD' : undefined;

  const handlePick = (event: DateTimePickerEvent, selected?: Date) => {
    // Android shows a dialog that closes itself after one choice.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && selected) onChange(toLocalISODate(selected));
  };

  return (
    <View style={containerStyle}>
      <AppInput
        label={label}
        value={value}
        onChangeText={(text) => onChange(normalizeDigits(text))}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={error}
        rightElement={
          <Pressable
            onPress={() => setOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
          >
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </Pressable>
        }
      />

      {open ? (
        <View style={{ marginTop: spacing.sm }}>
          <DateTimePicker
            value={valid ? isoToDate(value) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handlePick}
          />
          {Platform.OS === 'ios' ? (
            <AppButton
              title="Done"
              variant="ghost"
              onPress={() => setOpen(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}