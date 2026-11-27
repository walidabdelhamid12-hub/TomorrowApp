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
    toLocalISODate,
} from '@/utils/input';
import { AppButton } from './AppButton';
import { AppInput } from './AppInput';

interface DateFieldProps {
  label?: string;
  /** Canonical YYYY-MM-DD, or empty when unset. */
  value: string;
  onChange: (value: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Calendar-only date input; manual text entry is not supported. */
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
    if (event.type === 'set' && selected) {
      const next = toLocalISODate(selected);
      if (isValidISODate(next)) onChange(next);
    }
  };

  return (
    <View style={containerStyle}>
      <AppInput
        label={label}
        value={value}
        editable={false}
        placeholder="YYYY-MM-DD"
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