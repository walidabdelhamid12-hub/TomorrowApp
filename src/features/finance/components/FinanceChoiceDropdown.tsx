import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FormModal } from '@/features/finance/components/FormModal';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { useAppLanguage } from '@/localization/LanguageProvider';

type Choice = { value: string; label: string; flag?: string };
type Props = { label: string; value: string; options: Choice[]; onChange: (value: string) => void; disabled?: boolean };
/** Compact selector; choices live in a separate sheet to preserve form space. */
export function FinanceChoiceDropdown({ label, value, options, onChange, disabled = false }: Props) {
  const { t } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
      <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Choose ', 'اختر ') + label}
        accessibilityState={{ disabled }} disabled={disabled} onPress={() => setOpen(true)}
        style={{ minHeight: 48, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', borderRadius: 10,
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6, opacity: disabled ? 0.55 : 1 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: '#1E293B', fontWeight: '700' }}>
          {selected?.flag ? selected.flag + '  ' : ''}{selected?.label ?? value}
        </Text>
        <Ionicons name="chevron-down" size={17} color="#1E293B" />
      </Pressable>
      <FormModal visible={open} title={t('Select ', 'اختيار ') + label} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map(option => (
            <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label}
              accessibilityState={{ selected: value === option.value }}
              onPress={() => { onChange(option.value); setOpen(false); }}
              style={{ minWidth: '45%', flexGrow: 1, minHeight: 58, borderRadius: 10, padding: 10,
                backgroundColor: value === option.value ? '#F1E8D6' : '#FFFFFF', borderWidth: 1,
                borderColor: value === option.value ? '#B88C39' : '#D6B777', justifyContent: 'center' }}>
              <Text style={{ color: '#1E293B', fontWeight: '700', fontSize: 15 }}>
                {option.flag ? option.flag + '  ' : ''}{option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </FormModal>
    </View>
  );
}
export const FINANCE_CURRENCY_CHOICES = CURRENCIES.map(item => ({ value: item.code, label: item.code, flag: item.flag }));
