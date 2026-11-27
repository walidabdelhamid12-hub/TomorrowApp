import { useAppLanguage } from '@/localization/LanguageProvider';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { currencyLabel } from './ReportPrimitives';
import { moduleColors, useTheme } from '@/theme';
import { CATEGORY_COLORS } from '@/features/finance/constants/financeUi';
import { formatAmount } from '@/features/finance/utils/amountFormat';

/** Native Views only; no new chart dependency or currency conversion. */
export function ReportChart({ data, currency, formatValue, title = "Category analysis", description = "Positive net categories; refunds shown below.", empty = "No positive net expenses to chart.", currencies = [], onCurrencySelect, trendContent }: { trendContent?: ReactNode; currencies?: string[]; onCurrencySelect?: (code: string) => void; formatValue?: (amount: number) => string; title?: string; description?: string; empty?: string; data: { id: string; label: string; amount: number; color?: string }[]; currency: string }) {
  const [mode, setMode] = useState<'donut' | 'vertical' | 'horizontal' | 'trend'>('donut');
  const [picker, setPicker] = useState<'currency' | 'chart' | null>(null);
  const { colors } = useTheme();
  const { t } = useAppLanguage();
  const displayAmount = formatValue ?? ((amount: number) => formatAmount(amount, currency));
  const positive = data.filter(item => Number.isFinite(item.amount) && item.amount > 0);
  // Scale before summing ratios so even large chart-only magnitudes remain finite.
  const maximum = Math.max(0, ...positive.map(item => item.amount));
  const total = positive.reduce((sum, item) => sum + item.amount / maximum, 0);
  const slices: { end: number; color: string }[] = [];
  for (let index = 0; index < positive.length; index++) { const item = positive[index]; slices.push({ end: (slices[index - 1]?.end ?? 0) + item.amount / maximum / total, color: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }); }
  return <View style={{ marginVertical: 5, padding: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
      <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
        style={{ flex: 1, minWidth: 0, fontWeight: '800', color: title.toLowerCase().includes('income') ? '#15803D' : title.toLowerCase().includes('expense') ? '#DC2626' : '#0B315C', fontSize: 14 }}>{title === 'Category analysis' ? t('Category analysis', 'تحليل التصنيفات') : title}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("Choose analysis currency", "اختيار عملة التحليل")}, ${currency}`} accessibilityState={{ expanded: picker === 'currency' }}
        onPress={() => setPicker('currency')} style={{ width: 74, minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 11, fontWeight: '700' }}>{currencyLabel(currency)}</AppText>
        <Ionicons name="chevron-down" size={12} color={colors.text} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("Choose chart type", "اختيار نوع الرسم البياني")}, ${mode}`} accessibilityState={{ expanded: picker === 'chart' }}
        onPress={() => setPicker('chart')} style={{ width: 62, minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Ionicons name={mode === 'donut' ? 'pie-chart' : mode === 'vertical' ? 'bar-chart' : mode === 'trend' ? 'trending-up' : 'stats-chart'} size={20} color="#0B315C" />
        <Ionicons name="chevron-down" size={12} color={colors.text} />
      </Pressable>
    </View>
    <Modal transparent visible={picker !== null} animationType="fade" onRequestClose={() => setPicker(null)}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Close analysis selector", "إغلاق اختيار التحليل")} onPress={() => setPicker(null)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 30 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12, maxHeight: '70%' }}>
          <AppText variant="bodyStrong" style={{ marginBottom: 8 }}>{picker === 'currency' ? t('Select currency', 'اختيار العملة') : t('Chart type', 'نوع الرسم البياني')}</AppText>
          <ScrollView>
            {(picker === 'currency' ? (currencies.length ? currencies : [currency]).map(code => ({ id: code, label: currencyLabel(code), icon: 'cash-outline' as const })) : [
              { id: 'donut', label: t('Donut', 'دائري'), icon: 'pie-chart' as const },
              { id: 'vertical', label: t('Vertical', 'عمودي'), icon: 'bar-chart' as const },
              { id: 'horizontal', label: t('Horizontal', 'أفقي'), icon: 'stats-chart' as const },
              ...(trendContent !== undefined ? [{ id: 'trend', label: t('Trend', 'الاتجاه'), icon: 'trending-up' as const }] : []),
            ]).map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.label}
              accessibilityState={{ selected: picker === 'currency' ? currency === option.id : mode === option.id }}
              onPress={() => { if (picker === 'currency') onCurrencySelect?.(option.id); else setMode(option.id as 'donut' | 'vertical' | 'horizontal' | 'trend'); setPicker(null); }}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: colors.border }}>
              {picker === 'chart' && <Ionicons name={option.icon} size={20} color="#0B315C" />}
              <AppText variant="bodyStrong" style={{ flex: 1 }}>{option.label}</AppText>
              {(picker === 'currency' ? currency === option.id : mode === option.id) && <Ionicons name="checkmark" size={18} color="#15803D" />}
            </Pressable>)}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minHeight: 120 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 8, paddingTop: 5 }}>
        <AppText variant="caption" style={{ fontSize: 10, fontWeight: '700' }}>{t('Category · %', 'التصنيف · %')}</AppText>
        {positive.map((item, index) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
          <AppText variant="caption" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, fontSize: 10 }}>{item.label}</AppText>
          <AppText variant="caption" numberOfLines={1} style={{ fontSize: 10, fontWeight: '700', flexShrink: 0 }}>{(item.amount / maximum / total * 100).toFixed(1)}%</AppText>
        </View>)}
        {!positive.length && <AppText variant="caption" color="textSecondary">{empty}</AppText>}
      </View>
      <View style={{ flex: 2, minWidth: 0, justifyContent: 'center', minHeight: 120 }}>
        {mode === 'trend' && trendContent !== undefined ? trendContent : positive.length === 0 ? <AppText variant="caption" color="textSecondary">{empty}</AppText> : <>
    {mode === 'donut' ? (
      <View testID="chart-donut" accessible accessibilityLabel={`Donut, ${currency}: ${positive.map(item => `${item.label} ${displayAmount(item.amount)}`).join('; ')}`}
        style={{ width: 112, height: 112, alignSelf: 'center', marginVertical: 2 }}>
        {Array.from({ length: 96 }, (_, index) => {
          const angle = index / 96 * Math.PI * 2; const color = slices.find(slice => slice.end > index / 96)?.color ?? slices[slices.length - 1].color;
          return <View key={index} style={{ position: 'absolute', width: 4, height: 14,
            left: 54 + 43 * Math.cos(angle) - 2, top: 54 + 43 * Math.sin(angle) - 7, backgroundColor: color,
            transform: [{ rotate: `${angle * 180 / Math.PI + 90}deg` }] }} />;
        })}
      </View>
    ) : mode === 'vertical' ? (
      <ScrollView horizontal><View testID="chart-vertical" style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 115, gap: 10, paddingTop: 8 }}>
        {positive.map((item, index) => <View key={item.id} style={{ width: 44, alignItems: 'center' }}>
          <View style={{ width: 26, height: item.amount / maximum * 78, backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length], borderRadius: 3 }} />
        </View>)}
      </View></ScrollView>
    ) : (
      <View testID="chart-horizontal">{positive.map((item, index) => <View key={item.id} style={{ marginVertical: 4 }}>
        <View style={{ height: 9, backgroundColor: colors.border, borderRadius: 4 }}><View style={{ height: 9,
          width: `${item.amount / maximum * 100}%`, borderRadius: 4, backgroundColor: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /></View>
      </View>)}</View>
    )}
        </>}
      </View>
    </View>
  </View>;
}
