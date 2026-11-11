import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateAssetsReport } from '@/features/finance/utils/reportAssets';
import { assetReportHistoryAvailable, validateAssetOpeningDate } from '@/features/finance/utils/assetOpeningDate';
import { moduleColors, useTheme } from '@/theme';

function monthPeriod(month: string) {
  const [year, number] = month.split('-').map(Number);
  return { from: `${month}-01`,
    to: `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`,
    label: new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}
function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const d = new Date(year, number - 1 + delta, 1);
  if (d.getFullYear() < 100 || d.getFullYear() > 9999) return month;
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AssetsReportScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const ready = useFinanceHydrated();
  const assets = useFinanceStore(state => state.assets);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [assetId, setAssetId] = useState<string | null>(null);
  const period = useMemo(() => monthPeriod(month), [month]);
  const rows = useMemo(() => ready ? aggregateAssetsReport(assets, period) : null, [ready, assets, period]);
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Reports"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Reports</AppText>
    </Pressable>
    <AppText variant="h1">Assets Report</AppText>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(m => shiftMonth(m, -1))}
        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <AppText variant="bodyStrong">{period.label}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(m => shiftMonth(m, 1))}
        style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
        <Ionicons name="chevron-forward" size={22} color={colors.text} />
      </Pressable>
    </View>
    <AppText variant="caption" color="textSecondary">
      Quantities are shown in their own units. Historical market valuations are unavailable.
    </AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="Show all assets" onPress={() => setAssetId(null)}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>All assets {assetId === null ? '✓' : ''}</AppText>
    </Pressable>
    {assets.map(asset => <Pressable key={asset.id} accessibilityRole="button"
      accessibilityLabel={`Filter asset ${asset.name}`} onPress={() => setAssetId(asset.id)}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>{asset.name} {assetId === asset.id ? '✓' : ''}</AppText>
    </Pressable>)}
    {ready && rows && <Pressable accessibilityRole="button" accessibilityLabel="View Assets Statement"
      onPress={() => router.push({ pathname: '/finance/statement-assets', params: { month, ...(assetId ? { assetId } : {}) } })}
      style={{ minHeight: 44, justifyContent: 'center', marginVertical: spacing.sm }}>
      <AppText color="primary">View Statement · {month}</AppText>
    </Pressable>}
    {!ready || !rows ? <ActivityIndicator color={moduleColors.finance} /> : rows
      .filter(row => assetId === null || row.assetId === assetId).map((row, index) => {
        const matches = assets.filter(asset => asset.id === row.assetId);
        const asset = matches.length === 1 ? matches[0] : undefined;
        const history = asset?.openingBalanceDate
          ? validateAssetOpeningDate(assets, asset.id, asset.openingBalanceDate).valid : false;
        const available = row.status === 'available' && !!asset && history
          && assetReportHistoryAvailable(asset, period.from);
        const fmt = (value: number | null) => available && value !== null
          ? `${value.toFixed(3)} ${row.unit}` : 'Unavailable';
        return <View key={`${row.assetId}-${index}`} testID={`asset-report-${row.assetId}`}
          style={{ padding: spacing.md, marginVertical: spacing.xs, borderWidth: 1,
            borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }}>
          <AppText variant="bodyStrong">{row.assetName}</AppText>
          <AppText variant="caption" color="textSecondary">{row.category} · {row.unit}</AppText>
          {([['Opening quantity', row.openingQuantity], ['Additions', row.additions],
            ['Withdrawals', row.withdrawals], ['Closing quantity', row.closingQuantity],
            ['Net change', row.netChange]] as const).map(([label, value]) =>
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 }}>
              <AppText color="textSecondary">{label}</AppText>
              <AppText>{fmt(value)}</AppText>
            </View>)}
          {!available && <AppText accessibilityRole="alert" color="textSecondary">
            {row.reason ?? 'Incomplete or unverified historical quantity. Verify the opening date in Assets.'}
          </AppText>}
          <AppText variant="caption" color="textSecondary">Historical market valuation: Unavailable</AppText>
        </View>;
      })}
  </Screen>;
}
