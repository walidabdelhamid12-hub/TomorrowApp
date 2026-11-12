import { useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { useTheme, moduleColors } from '@/theme';
import { ReportHeader, ReportNavigation, ReportPicker, currencyLabel, REPORT_ITEMS } from './ReportPrimitives';

export function ReportTitle({ active, title }: { active: string; title: string }) {
  return <><ReportNavigation active={active} /><ReportHeader compact title={title} period="" icon={REPORT_ITEMS.find(item => item.path === active)?.icon} /></>;
}

export function useReportPeriod() {
  return useState(() => {
    const today = new Date();
    const local = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { from: local(new Date(today.getFullYear(), today.getMonth(), 1)), to: local(today) };
  });
}

export function ReportDates({ period, onChange }: { period: { from: string; to: string }; onChange: (period: { from: string; to: string }) => void }) {
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const { colors } = useTheme();
  const date = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
  return <>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      {(['from', 'to'] as const).map(key => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${key === 'from' ? 'From' : 'To'} date: ${period[key]}`} onPress={() => setEditing(key)}
        style={{ flex: 1, minWidth: 0, minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <AppText variant="caption" style={{ fontWeight: '700' }}>{key === 'from' ? 'From' : 'To'}</AppText>
          <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1, textAlign: 'right' }}>{period[key]}</AppText>
          <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
        </View>
      </Pressable>)}
    </View>
    {editing && <DateTimePicker mode="date" display="default" value={date(period[editing])} minimumDate={new Date(100, 1, 1)} maximumDate={new Date(9999, 11, 31)} onChange={(event, selected) => {
      if (Platform.OS !== 'ios' || event.type === 'dismissed') setEditing(null);
      if (event.type !== 'set' || !selected) return;
      const value = `${String(selected.getFullYear()).padStart(4, '0')}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
      const next = { ...period, [editing]: value };
      if (next.from > next.to) { if (editing === 'from') next.to = value; else next.from = value; }
      onChange(next);
    }} />}
    {editing && Platform.OS === 'ios' && <Pressable accessibilityRole="button" accessibilityLabel="Done selecting date" onPress={() => setEditing(null)} style={{ minHeight: 44, justifyContent: 'center' }}><AppText color="primary">Done</AppText></Pressable>}
  </>;
}

export function ReportDetails({ title, children, actionLabel = 'View all' }: { title: string; children: ReactNode; actionLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  return <><Pressable accessibilityRole="button" accessibilityLabel={`View all ${title}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
    <AppText variant="bodyStrong" style={{ flex: 1, paddingRight: 8 }}>{title}</AppText><AppText variant="caption" style={{ color: moduleColors.finance }}>{expanded ? 'Show less' : actionLabel}</AppText>
  </Pressable>{expanded && children}</>;
}

export function ReportCurrencyAnalysis({ currencies, value, onSelect }: { currencies: string[]; value: string; onSelect: (value: string) => void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
    <AppText variant="bodyStrong">Currency analysis</AppText>
    {currencies.length > 1 ? <View style={{ width: 180, maxWidth: '60%' }}><ReportPicker inline label="Currency" value={value} onSelect={onSelect} options={currencies.map(code => ({ id: code, label: currencyLabel(code) }))} /></View> : <AppText variant="caption" color="textSecondary">{currencyLabel(value)}</AppText>}
  </View>;
}

export function ReportNotice({ summary, children, warning = false }: { summary: string; children: ReactNode; warning?: boolean }) {
  return <><AppText variant="caption" accessibilityRole={warning ? 'alert' : undefined} color="textSecondary" style={{ marginVertical: 4 }}>{summary}</AppText><ReportDetails title="About this report" actionLabel="Details"><AppText variant="caption" color="textSecondary">{children}</AppText></ReportDetails></>;
}

export function ReportKeyValues({ items }: { items: { label: string; value: string }[] }) {
  const { colors } = useTheme();
  return <View>{items.map(item => <View key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 6 }}>
    <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>{item.label}</AppText>
    <AppText variant="caption" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{item.value}</AppText>
  </View>)}</View>;
}

export function ReportStatementLink({ period, onPress, label = 'View Statement', accessibilityLabel = label }: { period: { from: string; to: string }; onPress: () => void; label?: string; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
    <AppText variant="caption" color="primary">{label} · {period.from} – {period.to}</AppText>
  </Pressable>;
}

/** Exact preformatted quantities and decimal-string schedules never pass through Number. */
export function ReportValueCards({ cards }: { cards: { label: string; value: string; unit: string }[] }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>{cards.map(card => <View key={card.label} style={{ flexGrow: 1, flexBasis: 100, minWidth: 0, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 5, paddingVertical: 3 }}>
    <AppText variant="caption" style={{ fontSize: 10, textAlign: 'center', fontWeight: '600' }}>{card.label}</AppText>
    <AppText variant="bodyStrong" style={{ fontSize: 14, lineHeight: 18, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{card.value}</AppText>
    <AppText variant="caption" color="textSecondary" style={{ fontSize: 10, textAlign: 'center' }}>{card.unit}</AppText>
  </View>)}</View>;
}

export function ReportStatus({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  const { colors } = useTheme();
  return <View accessibilityRole={warning ? 'alert' : undefined} style={{ borderWidth: 1, borderColor: warning ? '#D97706' : colors.border, borderRadius: 8, padding: 8, marginVertical: 6 }}>
    <AppText variant="caption" color="textSecondary">{children}</AppText>
  </View>;
}
