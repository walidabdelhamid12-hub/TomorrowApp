import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import { StatementMobileRows, type StatementMobileRow } from './StatementMobileRows';
import { currencyLabel } from './ReportPrimitives';

/** Read-only presentation only. Each caller retains its original verification gates. */
export function StatementSixChrome({ kind, from, to, category, currency }: {
  kind: string; from: string; to: string; category: string; currency?: string;
}) {
  const { colors } = useTheme();
  const accent = kind === 'Payable' ? '#D32F2F' : kind === 'Receivable' ? '#15803D' : '#123C68';
  const box = { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: colors.background } as const;
  return <View style={{ gap: 12, marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Ionicons name="document-text-outline" color={accent} size={26} />
      <AppText variant="h2" style={{ color: accent, flexShrink: 1 }}>{kind} Statement</AppText>
    </View>
    <View style={{ ...box, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Ionicons name="calendar" size={21} color="#D6B777" />
      <AppText variant="bodyStrong" style={{ flexShrink: 1 }}>From {from}    To {to}</AppText>
    </View>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ ...box, flex: 1, minWidth: 0 }}><AppText variant="bodyStrong">Selection</AppText><AppText numberOfLines={2} style={{ fontSize: 13 }}>{category}</AppText></View>
      <View style={{ ...box, flex: 1, minWidth: 0 }}><AppText variant="bodyStrong">Currency</AppText><AppText numberOfLines={2} style={{ fontSize: 13 }}>{currency ? currencyLabel(currency) : 'Multiple currencies'}</AppText></View>
    </View>
  </View>;
}
export function StatementSixRows({ rows, secondColumnLabel }: { rows: readonly StatementMobileRow[]; secondColumnLabel?: string }) {
  return <StatementMobileRows rows={rows} secondColumnLabel={secondColumnLabel} />;
}
