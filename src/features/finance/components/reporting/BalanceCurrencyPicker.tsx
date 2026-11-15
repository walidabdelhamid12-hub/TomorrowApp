import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { useTheme } from '@/theme';

/** A native overlay: options never expand the surrounding report card. */
export function BalanceCurrencyPicker({ value, onSelect }: { value: string; onSelect: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const selected = CURRENCIES.find(item => item.code === value);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Balance currency: ${value}`}
      accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}
      style={{ minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 9,
        paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>{selected?.flag ?? '💱'} {value}</AppText>
      <Ionicons name="chevron-down" size={15} color={colors.text} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable accessibilityLabel="Close currency selection" onPress={() => setOpen(false)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderRadius: 14,
          padding: 14, maxHeight: '70%', borderWidth: 1, borderColor: colors.border }}>
          <AppText variant="bodyStrong" style={{ fontSize: 17, fontWeight: '800', marginBottom: 8 }}>Select balance currency</AppText>
          <ScrollView keyboardShouldPersistTaps="handled">
            {CURRENCIES.map(item => <Pressable key={item.code} accessibilityRole="button"
              accessibilityLabel={`${item.flag} ${item.code}`} accessibilityState={{ selected: item.code === value }}
              onPress={() => { onSelect(item.code); setOpen(false); }}
              style={{ minHeight: 46, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border }}>
              <AppText variant="bodyStrong" style={{ fontWeight: item.code === value ? '800' : '600' }}>{item.flag} {item.code}</AppText>
              {item.code === value && <Ionicons name="checkmark" size={20} color={colors.text} />}
            </Pressable>)}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
