import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import type { Account } from '@/features/finance/types/ledger';
import { useTheme } from '@/theme';
import { FormModal } from '@/features/finance/components/FormModal';

function accountIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'bank': return 'business-outline';
    case 'cash': return 'cash-outline';
    case 'wallet': return 'wallet-outline';
    case 'savings': return 'save-outline';
    case 'credit_card': return 'card-outline';
    default: return 'wallet-outline';
  }
}

export function AccountDropdown({ label, options, value, onChange, emptyMessage }: {
  label: string; options: readonly Account[]; value: string; onChange: (id: string) => void; emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const selected = options.find(account => account.id === value);
  return <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
    <AppText variant="label" color={colors.finance.neutral.accent} style={{ fontWeight: '700' }}>{label}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open, disabled: !options.length }}
      disabled={!options.length} onPress={() => setOpen(true)}
      style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={selected ? accountIcon(selected.type) : "wallet-outline"} size={19} color={colors.finance.neutral.accent} />
      <AppText variant="caption" style={{ flex: 1 }}>{selected ? selected.name + ' · ' + selected.currencyCode : options.length ? 'Choose account' : emptyMessage}</AppText>
      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
    </Pressable>
    <FormModal visible={open} title={label} onClose={() => setOpen(false)}>
      {options.map(account => <Pressable key={account.id} accessibilityRole="button" accessibilityLabel={account.name + ' · ' + account.currencyCode}
        accessibilityState={{ selected: account.id === value }} onPress={() => { onChange(account.id); setOpen(false); }}
        style={{ minHeight: 48, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={accountIcon(account.type)} size={20} color={colors.finance.neutral.accent} />
        <AppText style={{ flex: 1 }}>{account.name + ' · ' + account.currencyCode}</AppText>
        {account.id === value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
      </Pressable>)}
    </FormModal>
  </View>;
}
