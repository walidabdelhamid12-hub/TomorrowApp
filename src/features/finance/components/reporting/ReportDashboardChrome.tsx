import { useAppLanguage } from '@/localization/LanguageProvider';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import { getFinanceDesignTokens } from '@/features/finance/constants/financeDesignTokens';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { currencyLabel } from './ReportPrimitives';

export function ReportDashboardHeader({ kind }: { kind: 'income' | 'expenses' }) {
  const { t } = useAppLanguage();
  const router = useRouter();
  const { scheme } = useTheme();
  const tokens = getFinanceDesignTokens(scheme);
  return <View style={{ backgroundColor: tokens.header, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, marginBottom: 12, overflow: 'hidden' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 48 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Back", "رجوع")} onPress={() => router.back()}
        style={{ width: 40, minHeight: 44, justifyContent: 'center' }}><Ionicons name="arrow-back" size={22} color="white" /></Pressable>
      <AppText variant="bodyStrong" style={{ color: 'white', flex: 1, textAlign: 'center', fontSize: 17 }}>{'Tomorrow Finance Report'}</AppText>
      <View style={{ width: 40 }} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, paddingBottom: 12 }}>
      <Ionicons name="document-text-outline" size={20} color={kind === 'income' ? tokens.income : tokens.expense} />
      <AppText variant="bodyStrong" style={{ color: kind === 'income' ? tokens.income : tokens.expense, fontSize: 16, fontWeight: '700' }}>{kind === 'income' ? t('Income Report', 'تقرير الدخل') : t('Expenses Report', 'تقرير المصروفات')}</AppText>
    </View>
  </View>;
}

export function ReportDashboardDates({ period, onChange }: { period: { from: string; to: string }; onChange: (period: { from: string; to: string }) => void }) {
  const { t } = useAppLanguage();
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const { scheme } = useTheme();
  const tokens = getFinanceDesignTokens(scheme);
  const asDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };
  return <>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: tokens.inputBorder, borderRadius: 10,
      paddingHorizontal: 9, marginBottom: 9, minHeight: 46, backgroundColor: tokens.surface }}>
      <Ionicons name="calendar" size={20} color="#D6B777" />
      {(['from', 'to'] as const).map((key, index) => <Pressable key={key} accessibilityRole="button"
        accessibilityLabel={`${key === 'from' ? t("From", "من") : t("To", "إلى")} ${t("date", "تاريخ")}: ${period[key]}`} onPress={() => setEditing(key)}
        style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingLeft: 8 }}>
        <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
          style={{ fontSize: 12, fontWeight: '700', color: tokens.text }}>{index ? t('To', 'إلى') : t('From', 'من')} {period[key]}</AppText>
      </Pressable>)}
      <Ionicons name="chevron-down" size={15} color={tokens.text} />
    </View>
    {editing && <DateTimePicker mode="date" display="default" value={asDate(period[editing])}
      minimumDate={new Date(100, 1, 1)} maximumDate={new Date(9999, 11, 31)} onChange={(event, selected) => {
        if (Platform.OS !== 'ios' || event.type === 'dismissed') setEditing(null);
        if (event.type !== 'set' || !selected) return;
        const value = `${String(selected.getFullYear()).padStart(4, '0')}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
        const next = { ...period, [editing]: value };
        if (next.from > next.to) { if (editing === 'from') next.to = value; else next.from = value; }
        onChange(next);
      }} />}
    {editing && Platform.OS === 'ios' && <Pressable accessibilityRole="button" onPress={() => setEditing(null)}
      style={{ minHeight: 44, justifyContent: 'center' }}><AppText>{t("Done", "تم")}</AppText></Pressable>}
  </>;
}

export function ReportDashboardMetrics({ kind, total, currency, transactionCount, currencyCount, incomplete }: {
  kind: 'income' | 'expenses'; total: number | null; currency: string; transactionCount: number; currencyCount: number; incomplete: boolean;
}) {
  const { scheme } = useTheme();
  const tokens = getFinanceDesignTokens(scheme);
  const { t } = useAppLanguage();
  const cards = [
    { label: incomplete ? t('Known Total', 'الإجمالي المعروف') : kind === 'income' ? t('Total Income', 'إجمالي الدخل') : t('Total Expenses', 'إجمالي المصروفات'),
      value: total !== null && Number.isFinite(total) ? formatAmount(total, currency) : '—', unit: currencyLabel(currency) },
    { label: t('Transactions', 'المعاملات'), value: String(transactionCount), unit: t('Verified', 'متحقق منها') },
    { label: t('Currencies', 'العملات'), value: String(currencyCount), unit: t('Separate', 'منفصلة') },
  ];
  return <View style={{ flexDirection: 'row', gap: 7, marginBottom: 10 }}>
    {cards.map(card => <View key={card.label} style={{ flex: 1, minWidth: 0, backgroundColor: tokens.surface,
      borderRadius: 11, borderWidth: 1, borderColor: tokens.inputBorder, paddingVertical: 5, paddingHorizontal: 5,
      alignItems: 'center', gap: 1 }}>
      <AppText variant="caption" numberOfLines={2} style={{ fontSize: 10, fontWeight: '800', textAlign: 'center', color: tokens.secondaryText }}>{card.label}</AppText>
      <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
        style={{ fontSize: 15, fontVariant: ['tabular-nums'], color: tokens.text }}>{card.value}</AppText>
      <AppText variant="caption" style={{ fontSize: 10, color: tokens.secondaryText }}>{card.unit}</AppText>
    </View>)}
  </View>;
}
