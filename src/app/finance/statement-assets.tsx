import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateAssetsReport } from '@/features/finance/utils/reportAssets';
import { assetReportHistoryAvailable, validateAssetOpeningDate } from '@/features/finance/utils/assetOpeningDate';
import { useTheme } from '@/theme';

/** Raw recorded quantity movements only; no market valuation or inferred balances. */
export default function AssetsStatementScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ month?: string; assetId?: string }>();
  const hydrated = useFinanceHydrated();
  const assets = useFinanceStore(state => state.assets);
  const month = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const assetId = typeof params.assetId === 'string' ? params.assetId : '';
  const period = useMemo(() => {
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    if (year < 100) return null;
    return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
  }, [month]);
  const rows = useMemo(() => {
    if (!hydrated || !period) return null;
    try { return aggregateAssetsReport(assets, period); } catch { return null; }
  }, [hydrated, assets, period]);
  const entries = useMemo(() => {
    if (!rows || !period) return [];
    const validIds = new Set(rows.filter(row => {
      const matches = assets.filter(asset => asset.id === row.assetId);
      const asset = matches.length === 1 ? matches[0] : undefined;
      return row.status === 'available' && !!asset && !!asset.openingBalanceDate
        && validateAssetOpeningDate(assets, asset.id, asset.openingBalanceDate).valid
        && assetReportHistoryAvailable(asset, period.from);
    }).map(row => row.assetId));
    return assets.filter(asset => validIds.has(asset.id) && (!assetId || asset.id === assetId))
      .flatMap(asset => asset.entries.filter(entry => entry.date >= period.from && entry.date <= period.to)
        .map(entry => ({ id: asset.id + ':' + entry.id, name: asset.name, date: entry.date,
          amount: entry.amount, unit: asset.category === 'gold' || asset.category === 'silver' ? 'g' : asset.currencyCode,
          note: entry.note })))
      .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [rows, period, assets, assetId]);
  const selectionValid = !assetId || assets.filter(asset => asset.id === assetId).length === 1;
  const incomplete = !!rows && rows.some(row => (!assetId || row.assetId === assetId) && !assets.some(asset =>
    asset.id === row.assetId && row.status === 'available' && !!asset.openingBalanceDate
      && validateAssetOpeningDate(assets, asset.id, asset.openingBalanceDate).valid
      && assetReportHistoryAvailable(asset, period!.from)));
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Assets Report"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Assets Report</AppText>
    </Pressable>
    <AppText variant="h1">Assets Statement</AppText>
    <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
      {month ?? 'Invalid month'} · Recorded quantity movements only. Historical market valuations and unverified balances are unavailable.
    </AppText>
    {!period || !selectionValid ? <Card><AppText>Invalid statement filters.</AppText></Card> :
      !hydrated ? <Card><AppText>Loading assets...</AppText></Card> :
      rows === null ? <Card><AppText>Statement unavailable.</AppText></Card> :
      incomplete ? <Card><AppText color="textSecondary">Some asset history is unverified. Movement details are withheld until the opening date and history are validated.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>No verified quantity movements in this period.</AppText></Card> :
      entries.map(item => <Card key={item.id} style={{ marginBottom: spacing.sm }}>
        <AppText variant="bodyStrong">{item.name}</AppText>
        <AppText>{item.date} · {item.amount} {item.unit}</AppText>
        {item.note ? <AppText color="textSecondary">{item.note}</AppText> : null}
      </Card>)}
  </Screen>;
}
