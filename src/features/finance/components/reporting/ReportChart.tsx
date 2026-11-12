import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';
import { CATEGORY_COLORS } from '@/features/finance/constants/financeUi';
import { formatAmount } from '@/features/finance/utils/amountFormat';

/** Native Views only; no new chart dependency or currency conversion. */
export function ReportChart({ data, currency }: { data: { id: string; label: string; amount: number }[]; currency: string }) {
  const [mode, setMode] = useState<'donut' | 'vertical' | 'horizontal'>('donut'); const { colors } = useTheme();
  const positive = data.filter(item => Number.isFinite(item.amount) && item.amount > 0);
  // Scale before summing ratios so even large chart-only magnitudes remain finite.
  const maximum = Math.max(0, ...positive.map(item => item.amount));
  const total = positive.reduce((sum, item) => sum + item.amount / maximum, 0);
  const slices = positive.map((_, index) => ({ end: positive.slice(0, index + 1).reduce((sum, item) => sum + item.amount / maximum / total, 0), color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }));
  return <View style={{ marginVertical: 8 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText variant="bodyStrong">Category analysis · {currency}</AppText>
      <View style={{ flexDirection: 'row' }}>{([{ id: 'donut', icon: 'pie-chart-outline', label: 'Donut' },
        { id: 'vertical', icon: 'bar-chart-outline', label: 'Vertical Bar' }, { id: 'horizontal', icon: 'reorder-three-outline', label: 'Horizontal Bar' }] as const)
        .map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: mode === item.id }}
          onPress={() => setMode(item.id)} style={{ minWidth: 40, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name={item.icon} size={21} color={mode === item.id ? moduleColors.finance : colors.text} /></Pressable>)}</View>
    </View>
    <AppText variant="caption" color="textSecondary">Positive net categories; refunds shown below.</AppText>
    {!positive.length ? <AppText color="textSecondary">No positive net expenses to chart.</AppText> : mode === 'donut' ? (
      <View testID="chart-donut" accessible accessibilityLabel={`Donut, ${currency}: ${positive.map(item => `${item.label} ${formatAmount(item.amount, currency)}`).join('; ')}`}
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
          <AppText variant="caption">{formatAmount(item.amount, currency)}</AppText>
          <View style={{ width: 26, height: item.amount / maximum * 100, backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length], borderRadius: 3 }} />
          <AppText variant="caption">{item.label}</AppText>
        </View>)}
      </View></ScrollView>
    ) : (
      <View testID="chart-horizontal">{positive.map((item, index) => <View key={item.id} style={{ marginVertical: 4 }}>
        <AppText variant="caption">{item.label} · {formatAmount(item.amount, currency)} {currency}</AppText>
        <View style={{ height: 9, backgroundColor: colors.border, borderRadius: 4 }}><View style={{ height: 9,
          width: `${item.amount / maximum * 100}%`, borderRadius: 4, backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /></View>
      </View>)}</View>
    )}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{positive.map((item, index) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><AppText variant="caption">{item.label}</AppText>
    </View>)}</View>
  </View>;
}
