import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import { currencyLabel } from './ReportPrimitives';

export function StatementUnifiedChrome({ kind, from, to, account, category, currency, totals = [] }: {
  kind: 'Expenses' | 'Income'; from: string; to: string; account: string; category: string; currency?: string; totals?: readonly { currencyCode: string; amount: string }[];
}) {
  const { colors } = useTheme();
  const accent = kind === 'Expenses' ? '#D32F2F' : '#15803D';
  const box = { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: colors.background } as const;
  return <View style={{ gap: 12, marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Ionicons name={kind === 'Expenses' ? 'arrow-down-circle' : 'arrow-up-circle'} color={accent} size={26} />
      <AppText variant="h2" style={{ color: accent, flexShrink: 1 }}>{kind} Statement</AppText>
    </View>
    <View style={{ ...box, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Ionicons name="calendar" size={21} color="#123C68" />
      <AppText variant="bodyStrong" style={{ flexShrink: 1 }}>From {from}    To {to}</AppText>
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ ...box, flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong">Account</AppText>
        <AppText numberOfLines={2} style={{ fontSize: 13 }}>{account}</AppText>
      </View>
      <View style={{ ...box, flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong">Category</AppText>
        <AppText numberOfLines={2} style={{ fontSize: 13 }}>{category}</AppText>
      </View>
    </View>
    <View style={{ ...box, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <AppText variant="bodyStrong">Currency</AppText>
      <View style={{ flex: 1, alignItems: 'flex-end', gap: 3 }}>
        {totals.length > 0 ? totals.map(total => <AppText key={total.currencyCode} variant="bodyStrong" style={{ fontSize: 13 }}>{currencyLabel(total.currencyCode)} · {total.amount}</AppText>)
          : <AppText style={{ fontSize: 13 }}>{currency ? currencyLabel(currency) : 'All currencies'}</AppText>}
      </View>
    </View>
  </View>;
}
