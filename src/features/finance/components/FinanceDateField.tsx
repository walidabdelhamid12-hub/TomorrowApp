import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
    DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';

import { useAppLanguage } from '@/localization/LanguageProvider';
import { useTheme } from '@/theme';
import {
    isoToDate,
    isValidISODate,
    normalizeDigits,
    toLocalISODate,
} from '@/utils/input';
import { FinanceButton as AppButton } from './FinanceButton';
import { FinanceInput as AppInput } from './FinanceInput';

interface DateFieldProps {
  label?: string;
  /** "YYYY-MM-DD" (may be incomplete while typing). */
  value: string;
  onChange: (value: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  pickerOnly?: boolean;
  onClear?: () => void;
}

/** Date input: type it manually, or pick it from the calendar icon. */
export function FinanceDateField({
  label = 'Date',
  value,
  onChange,
  containerStyle,
  pickerOnly = false,
  onClear,
}: DateFieldProps) {
  const { spacing } = useTheme();
  const { t } = useAppLanguage();
  const [open, setOpen] = useState(false);

  const valid = isValidISODate(value);
  const error =
    value.length >= 10 && !valid ? t('Use the format YYYY-MM-DD', 'استخدم الصيغة YYYY-MM-DD') : undefined;

  const handlePick = (event: DateTimePickerEvent, selected?: Date) => {
    // Android shows a dialog that closes itself after one choice.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && selected) onChange(toLocalISODate(selected));
  };

  return (
    <View style={containerStyle}>
      <AppInput
        label={label === 'Date' ? t('Date', 'التاريخ') : label}
        value={value}
        editable={!pickerOnly}
        onChangeText={(text) => { if (!pickerOnly) onChange(normalizeDigits(text)); }}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={error}
        fieldStyle={{ borderColor: error ? '#DC2626' : '#CBD5E1' }}
        rightElement={
          <Pressable
            onPress={() => setOpen((v) => !v)}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={t('Open calendar', 'فتح التقويم')}
          >
            <Ionicons name="calendar-outline" size={22} color="#D6B777" />
          </Pressable>
        }
      />

      {onClear && value ? <AppButton title={t('Clear date', 'مسح التاريخ')} variant="ghost" onPress={onClear} /> : null}

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
              title={t('Done', 'تم')}
              variant="ghost"
              onPress={() => setOpen(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
