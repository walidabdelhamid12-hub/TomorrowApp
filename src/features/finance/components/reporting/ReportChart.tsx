import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';
import { CATEGORY_COLORS } from '@/features/finance/constants/financeUi';
import { formatAmount } from '@/features/finance/utils/amountFormat';

/** Native Views only; no new chart dependency or currency conversion. */
export function ReportChart({ data, currency, formatValue, title = "Category analysis", description = "Positive net categories; refunds shown below.", empty = "No positive net expenses to chart." }: { formatValue?: (amount: number) => string; title?: string; description?: string; empty?: string; data: { id: string; label: string; amount: number; color?: string }[]; currency: string }) {
  const [mode, setMode] = useState<'donut' | 'vertical' | 'horizontal'>('donut'); const { colors } = useTheme();
  const displayAmount = formatValue ?? ((amount: number) => formatAmount(amount, currency));
  const positive = data.filter(item => Number.isFinite(item.amount) && item.amount > 0);
  // Scale before summing ratios so even large chart-only magnitudes remain finite.
  const maximum = Math.max(0, ...positive.map(item => item.amount));
  const total = positive.reduce((sum, item) => sum + item.amount / maximum, 0);
  const slices: { end: number; color: string }[] = [];
  for (let index = 0; index < positive.length; index++) { const item = positive[index]; slices.push({ end: (slices[index - 1]?.end ?? 0) + item.amount / maximum / total, color: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }); }
  if (positive.length === 0) return <View style={{ marginVertical: 4 }}><AppText variant="caption" color="textSecondary">{empty}</AppText></View>;
  return <View style={{ marginVertical: 8 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText variant="bodyStrong">{title}</AppText>
      <View style={{ flexDirection: 'row' }}>{([{ id: 'donut', icon: 'pie-chart-outline', label: 'Donut' },
        { id: 'vertical', icon: 'bar-chart-outline', label: 'Vertical Bar' }, { id: 'horizontal', icon: 'reorder-three-outline', label: 'Horizontal Bar' }] as const)
        .map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: mode === item.id }}
          onPress={() => setMode(item.id)} style={{ minWidth: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name={item.icon} size={21} color={moduleColors.finance} /></Pressable>)}</View>
    </View>
    <AppText variant="caption" color="textSecondary">{description}</AppText>
    {positive.length === 1 && mode === 'donut' ? <View testID="chart-donut" style={{ paddingVertical: 6, gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><AppText variant="caption" style={{ flex: 1 }}>{positive[0].label}</AppText><AppText variant="caption">{displayAmount(positive[0].amount)} {currency} · 100%</AppText></View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: positive[0].color || CATEGORY_COLORS[0] }} />
    </View> : mode === 'donut' ? (
      <View testID="chart-donut" accessible accessibilityLabel={`Donut, ${currency}: ${positive.map(item => `${item.label} ${displayAmount(item.amount)}`).join('; ')}`}
        style={{ width: 132, height: 132, alignSelf: 'center', marginVertical: 6 }}>
        {Array.from({ length: 96 }, (_, index) => {
          const angle = index / 96 * Math.PI * 2; const color = slices.find(slice => slice.end > index / 96)?.color ?? slices[slices.length - 1].color;
          return <View key={index} style={{ position: 'absolute', width: 4, height: 14,
            left: 64 + 52 * Math.cos(angle) - 2, top: 64 + 52 * Math.sin(angle) - 7, backgroundColor: color,
            transform: [{ rotate: `${angle * 180 / Math.PI + 90}deg` }] }} />;
        })}
      </View>
    ) : mode === 'vertical' ? (
      <ScrollView horizontal><View testID="chart-vertical" style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 160, gap: 10, paddingTop: 8 }}>
        {positive.map((item, index) => <View key={item.id} style={{ width: 76, alignItems: 'center' }}>
          <AppText variant="caption">{displayAmount(item.amount)}</AppText>
          <View style={{ width: 26, height: item.amount / maximum * 100, backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length], borderRadius: 3 }} />
          <AppText variant="caption">{item.label}</AppText>
        </View>)}
      </View></ScrollView>
    ) : (
      <View testID="chart-horizontal">{positive.map((item, index) => <View key={item.id} style={{ marginVertical: 4 }}>
        <AppText variant="caption">{item.label} · {displayAmount(item.amount)} {currency}</AppText>
        <View style={{ height: 9, backgroundColor: colors.border, borderRadius: 4 }}><View style={{ height: 9,
          width: `${item.amount / maximum * 100}%`, borderRadius: 4, backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /></View>
      </View>)}</View>
    )}
    {mode === 'donut' && positive.length > 1 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{positive.map((item, index) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><AppText variant="caption" style={{ flexShrink: 1 }}>{item.label} · {displayAmount(item.amount)} {currency} · {(item.amount / maximum / total * 100).toFixed(1)}%</AppText>
    </View>)}</View>}
  </View>;
}
