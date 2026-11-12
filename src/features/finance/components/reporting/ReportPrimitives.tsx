import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { AppText } from '@/components/ui';
import { useTheme, moduleColors } from '@/theme';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { formatAmount } from '@/features/finance/utils/amountFormat';

type Icon = ComponentProps<typeof Ionicons>['name'];
export const REPORT_ITEMS: { label: string; path: string; icon: Icon }[] = [
  { label: 'Income', path: 'income', icon: 'trending-up-outline' },
  { label: 'Expenses', path: 'expenses', icon: 'trending-down-outline' },
  { label: 'Accounts', path: 'accounts', icon: 'wallet-outline' },
  { label: 'Assets', path: 'assets', icon: 'diamond-outline' },
  { label: 'Installments', path: 'installments', icon: 'document-text-outline' },
  { label: 'Loans', path: 'loans', icon: 'cash-outline' },
  { label: 'Receivable', path: 'receivable', icon: 'people-outline' },
  { label: 'Payable', path: 'payable', icon: 'people-outline' },
];
export function currencyLabel(code: string) {
  const currency = CURRENCIES.find(item => item.code === code);
  return `${currency?.flag ?? ''} ${code}`.trim();
}
export function ReportNavigation({ active }: { active: string }) {
  const router = useRouter(); const { colors } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
    {REPORT_ITEMS.map(item => <Pressable key={item.path} accessibilityRole="button" accessibilityLabel={`Open ${item.label} report`}
      accessibilityState={{ selected: active === item.path }} onPress={() => { if (active !== item.path) router.push(`/finance/report-${item.path}` as Href); }}
      style={{ minHeight: 48, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', borderBottomWidth: 2,
        borderColor: active === item.path ? moduleColors.finance : 'transparent' }}>
      <Ionicons name={item.icon} size={19} color={active === item.path ? moduleColors.finance : colors.text} />
      <AppText variant="caption">{item.label}</AppText>
    </Pressable>)}
  </ScrollView>;
}
export function ReportHeader({ title, period, previous, next, previousDisabled, nextDisabled, icon }: {
  title: string; period: string; icon?: Icon; previous?: () => void; next?: () => void; previousDisabled?: boolean; nextDisabled?: boolean;
}) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}>{icon && <Ionicons name={icon} size={23} color={moduleColors.finance} />}<AppText variant="h3" style={{ flexShrink: 1 }}>{title}</AppText></View>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {previous && <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={previousDisabled} onPress={previous}
        style={{ minHeight: 44, minWidth: 36, alignItems: 'center', justifyContent: 'center', opacity: previousDisabled ? 0.35 : 1 }}>
        <Ionicons name="chevron-back" size={20} color={colors.text} /></Pressable>}
      <AppText variant="bodyStrong">{period}</AppText>
      {next && <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={nextDisabled} onPress={next}
        style={{ minHeight: 44, minWidth: 36, alignItems: 'center', justifyContent: 'center', opacity: nextDisabled ? 0.35 : 1 }}>
        <Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>}
    </View>
  </View>;
}
export function ReportPicker({ label, value, options, onSelect }: {
  label: string; value: string; options: { id: string; label: string }[]; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false); const { colors } = useTheme();
  const selected = options.find(item => item.id === value);
  return <View style={{ flex: 1, minWidth: 130 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.label ?? 'Unavailable selection'}`}
      accessibilityState={{ expanded: open }} onPress={() => setOpen(current => !current)}
      style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ flex: 1 }}><AppText variant="caption" color="textSecondary">{label}</AppText><AppText variant="caption">{selected?.label ?? 'Unavailable selection'}</AppText></View>
      <Ionicons name="chevron-down" size={16} color={colors.text} />
    </Pressable>
    {open && options.map((item, index) => <Pressable key={`${item.id}-${index}`} accessibilityRole="button" accessibilityLabel={item.label}
      accessibilityState={{ selected: item.id === value }} onPress={() => { onSelect(item.id); setOpen(false); }}
      style={{ minHeight: 44, justifyContent: 'center', padding: 8, borderBottomWidth: 1, borderColor: colors.border }}><AppText variant="caption">{item.label}</AppText></Pressable>)}
  </View>;
}
export function ReportSummaryCards({ cards, currency }: { cards: { label: string; value: number | null; detail?: string }[]; currency: string }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 6, marginVertical: 6 }}>
    {cards.map(card => <View key={card.label} style={{ flexGrow: 1, flexBasis: 100, minWidth: 0, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 5, gap: 2 }}>
      <AppText variant="caption" color="textSecondary" style={{ fontWeight: '600', minHeight: 0 }}>{card.label}</AppText>
      <AppText variant="bodyStrong" style={{ fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'], textAlign: 'left' }}>{card.value !== null && Number.isFinite(card.value) ? formatAmount(card.value, currency) : 'Unavailable'}</AppText>
      <AppText variant="caption" color="textSecondary" style={{ fontSize: 10 }}>{currencyLabel(currency)}</AppText>
      {card.detail && <AppText variant="caption" color="textSecondary" style={{ fontSize: 10, lineHeight: 12 }}>{card.detail}</AppText>}
    </View>)}
  </View>;
}
export function ReportTransactionRows({ rows }: { rows: { id: string; date: string; category: string; description: string; amount: number; currency: string }[] }) {
  const { colors } = useTheme();
  return <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
    <View style={{ minWidth: 490, flex: 1 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 6 }}>
        <AppText variant="caption" style={{ width: 84 }}>Date</AppText><AppText variant="caption" style={{ width: 110 }}>Category</AppText>
        <AppText variant="caption" style={{ flex: 1, minWidth: 160 }}>Description</AppText><AppText variant="caption" style={{ width: 132, textAlign: 'right' }}>Amount</AppText>
      </View>
      {rows.map(row => <View key={row.id} testID={`report-transaction-${row.id}`} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.border }}>
        <AppText variant="caption" style={{ width: 84 }}>{row.date}</AppText>
        <AppText variant="caption" style={{ width: 110, paddingRight: 6 }}>{row.category}</AppText>
        <AppText variant="caption" style={{ flex: 1, minWidth: 160, paddingRight: 6 }}>{row.description}</AppText>
        <AppText variant="caption" style={{ width: 132, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{formatAmount(row.amount, row.currency)} {row.currency}</AppText>
      </View>)}
    </View>
  </ScrollView>;
}
export function ReportExportActions({ busy, disabled, pdf, excel, share }: {
  busy: boolean; disabled: boolean; pdf: () => void; excel: () => void; share: () => void;
}) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
    {([{ label: 'PDF', icon: 'document-text-outline', action: pdf }, { label: 'Excel CSV', icon: 'grid-outline', action: excel },
      { label: 'Share', icon: 'share-outline', action: share }] as const).map(item => <Pressable key={item.label}
      accessibilityRole="button" accessibilityLabel={`Export ${item.label}`} disabled={disabled || busy} onPress={item.action}
      style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 8,
        borderWidth: 1, borderColor: colors.border, opacity: disabled || busy ? 0.4 : 1 }}>
      <Ionicons name={item.icon} size={18} color={colors.text} /><AppText variant="caption">{item.label}</AppText>
    </Pressable>)}
  </View>;
}
