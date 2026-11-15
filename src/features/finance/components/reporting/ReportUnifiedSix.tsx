/** Phase 8 six-report presentation only. Approved Income/Expenses files are untouched. */
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { currencyLabel } from './ReportPrimitives';
import { ReportDashboardDates } from './ReportDashboardChrome';
import { ReportDetails, ReportKeyValues, ReportNotice, ReportStatus, ReportStatementLink, useReportPeriod } from './ReportLayout';
import { ReportChart as SharedReportChart } from './ReportChart';

export { ReportDetails, ReportKeyValues, ReportNotice, ReportStatus, ReportStatementLink, useReportPeriod };

const colors: Record<string, string> = {
  installments: '#2563EB', receivable: '#15803D', payable: '#DC2626',
  loans: '#7C3AED', assets: '#B45309', accounts: '#0B6691',
};
export function ReportTitle({ active, title }: { active: string; title: string }) {
  const router = useRouter();
  const accent = colors[active] ?? '#0B6691';
  return <View style={{ backgroundColor: '#0B315C', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 10 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 40, minHeight: 44, justifyContent: 'center' }}>
        <Ionicons name="arrow-back" size={22} color="white" />
      </Pressable>
      <AppText variant="bodyStrong" style={{ color: 'white', flex: 1, textAlign: 'center', fontSize: 17 }}>Tomorrow Finance</AppText>
      <View style={{ width: 40 }} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
      <Ionicons name="stats-chart" size={19} color={accent} />
      <AppText variant="bodyStrong" style={{ color: accent, fontSize: 16 }}>{title}</AppText>
    </View>
  </View>;
}
export const ReportDates = ReportDashboardDates;
export function ReportSummaryCards({ cards, currency }: { cards: { label: string; value: number | null; detail?: string }[]; currency: string }) {
  return <View style={{ flexDirection: 'row', gap: 7, marginVertical: 7 }}>
    {cards.map(card => <View key={card.label} style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#DEE7F0', backgroundColor: 'white', borderRadius: 11, paddingVertical: 5, paddingHorizontal: 4, alignItems: 'center' }}>
      <AppText variant="caption" numberOfLines={2} style={{ fontSize: 10, fontWeight: '800', textAlign: 'center', color: '#475569' }}>{card.label}</AppText>
      <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 14, color: '#0B315C', fontVariant: ['tabular-nums'] }}>{card.value !== null && Number.isFinite(card.value) ? formatAmount(card.value, currency) : 'Unavailable'}</AppText>
      <AppText variant="caption" style={{ fontSize: 10, color: '#64748B' }}>{currencyLabel(currency)}</AppText>
      {card.detail ? <AppText variant="caption" numberOfLines={1} style={{ fontSize: 9 }}>{card.detail}</AppText> : null}
    </View>)}
  </View>;
}
export function ReportValueCards({ cards }: { cards: { label: string; value: string; unit: string }[] }) {
  return <View style={{ flexDirection: 'row', gap: 7, marginVertical: 7 }}>
    {cards.map(card => <View key={card.label} style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#DEE7F0', backgroundColor: 'white', borderRadius: 11, paddingVertical: 5, paddingHorizontal: 4, alignItems: 'center' }}>
      <AppText variant="caption" numberOfLines={2} style={{ fontSize: 10, fontWeight: '800', textAlign: 'center', color: '#475569' }}>{card.label}</AppText>
      <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 14, color: '#0B315C' }}>{card.value}</AppText>
      <AppText variant="caption" numberOfLines={1} style={{ fontSize: 10, color: '#64748B' }}>{card.unit}</AppText>
    </View>)}
  </View>;
}
/** Currency summaries use independently verified per-currency values supplied by each report. */
export function ReportCurrencyTiles({ rows }: { rows: { code: string; amount: number | null }[] }) {
  if (!rows.length) return null;
  return <View style={{ marginTop: 10, marginBottom: 8 }}>
    <AppText variant="bodyStrong" style={{ marginBottom: 7, color: '#0B315C' }}>Currency Analysis</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {rows.map(row => <View key={row.code} style={{ width: '48%', minWidth: 0, borderWidth: 1, borderColor: '#DEE7F0', backgroundColor: 'white', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <AppText variant="caption" numberOfLines={1} style={{ fontWeight: '700', fontSize: 11 }}>{currencyLabel(row.code)}</AppText>
        <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontWeight: '700', fontSize: 11, fontVariant: ['tabular-nums'] }}>{row.amount !== null && Number.isFinite(row.amount) ? formatAmount(row.amount, row.code) : '—'}</AppText>
      </View>)}
    </View>
  </View>;
}
export function ReportCurrencyAnalysis({ currencies, value, onSelect }: { currencies: string[]; value: string; onSelect: (value: string) => void }) {
  // The compact currency selector is hosted by the chart directly below; do not duplicate it.
  return null;
}
export function ReportChart(props: ComponentProps<typeof SharedReportChart>) {
  return <SharedReportChart {...props} title={props.title} />;
}
