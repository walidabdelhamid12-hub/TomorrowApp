import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

export type StatementMobileRow = {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  currencyCode?: string;
  categoryIcon?: keyof typeof Ionicons.glyphMap;
  categoryColor?: string;
};

/** Four-column, screen-width statement register. No horizontal scrolling or inferred totals. */
export function StatementMobileRows({ rows, secondColumnLabel = 'Category' }: { rows: readonly StatementMobileRow[]; secondColumnLabel?: string }) {
  const { colors } = useTheme();
  const widths = ['19%', '23%', '32%', '26%'] as const;
  const labels = ['Date', secondColumnLabel, 'Description', 'Amount'];
  return <View style={{ width: '100%' }}>
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8 }}>
      {labels.map((label, i) => <AppText key={label} variant="caption" style={{ width: widths[i], fontSize: 10, fontWeight: '700', textAlign: i === 3 ? 'right' : 'left' }}>{label}</AppText>)}
    </View>
    {rows.map(row => <View key={row.id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 9, alignItems: 'flex-start' }}>
      <AppText variant="caption" style={{ width: widths[0], fontSize: 10 }}>{row.date.slice(5)}</AppText>
      <View style={{ width: widths[1], flexDirection: 'row', alignItems: 'center', gap: 3, paddingRight: 3 }}>
        {row.categoryIcon && <Ionicons name={row.categoryIcon} size={12} color={row.categoryColor || colors.text} />}
        <AppText variant="caption" style={{ flex: 1, fontSize: 10 }} numberOfLines={2}>{row.category}</AppText>
      </View>
      <AppText variant="caption" style={{ width: widths[2], fontSize: 10, paddingRight: 3 }} numberOfLines={3}>{row.description}</AppText>
      <AppText variant="caption" style={{ width: widths[3], fontSize: 10, textAlign: 'right', fontVariant: ['tabular-nums'] }} adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={2}>{row.amount}{row.currencyCode === 'EGP' ? ' 🇪🇬 EGP' : row.currencyCode === 'OMR' ? ' 🇴🇲 OMR' : row.currencyCode === 'USD' ? ' 🇺🇸 USD' : row.currencyCode ? ` ${row.currencyCode}` : ''}</AppText>
    </View>)}
  </View>;
}
