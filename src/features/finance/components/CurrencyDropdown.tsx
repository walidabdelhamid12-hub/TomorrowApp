import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui';
import { CURRENCIES, getCurrencyLabel } from '@/features/finance/constants/currencies';
import { FormModal } from '@/features/finance/components/FormModal';
import { useTheme } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChange: (code: string) => void;
};

export function CurrencyDropdown({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const selected = CURRENCIES.find((currency) => currency.code === value);

  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose transaction currency"
        onPress={() => setOpen(true)}
        style={{
          height: 48,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceAlt,
          borderRadius: 10,
          paddingHorizontal: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
          {selected ? getCurrencyLabel(selected.code) : value || 'Currency'}
        </AppText>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      <FormModal visible={open} title="Transaction Currency" onClose={() => setOpen(false)}>
        {CURRENCIES.map((currency) => (
          <Pressable
            key={currency.code}
            accessibilityRole="button"
            accessibilityLabel={`${currency.code} ${currency.name}`}
            onPress={() => {
              onChange(currency.code);
              setOpen(false);
            }}
            style={{
              minHeight: 48,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AppText style={{ flex: 1 }}>
              {getCurrencyLabel(currency.code)} - {currency.name}
            </AppText>
            {currency.code === value ? (
              <Ionicons name="checkmark" size={18} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </FormModal>
    </View>
  );
}