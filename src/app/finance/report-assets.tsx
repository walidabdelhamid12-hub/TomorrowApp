import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateAssetsReport } from '@/features/finance/utils/reportAssets';
import { assetReportHistoryAvailable, validateAssetOpeningDate } from '@/features/finance/utils/assetOpeningDate';
import { moduleColors, useTheme } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportValueCards, ReportDetails, ReportNotice, ReportKeyValues, ReportStatementLink } from '@/features/finance/components/reporting/ReportLayout';
import { ReportPicker, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';

const assetTypes = { local_currency: 'Local currency', foreign_currency: 'Foreign currency', gold: 'Gold', silver: 'Silver' };
export default function AssetsReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const ready = useFinanceHydrated();
  const assets = useFinanceStore(state => state.assets);
  const [period, setPeriod] = useReportPeriod();
  const [assetId, setAssetId] = useState<string | null>(null);
  const month = period.from.slice(0, 7);
  const rows = useMemo(() => ready ? aggregateAssetsReport(assets, period) : null, [ready, assets, period]);
  const selected = rows?.filter(row => assetId === null || row.assetId === assetId) ?? [];
  const available = (row: NonNullable<typeof rows>[number]) => {
    const matches = assets.filter(asset => asset.id === row.assetId);
    const asset = matches.length === 1 ? matches[0] : undefined;
    return row.status === 'available' && !!asset && !!asset.openingBalanceDate && validateAssetOpeningDate(assets, asset.id, asset.openingBalanceDate).valid && assetReportHistoryAvailable(asset, period.from);
  };
  const incomplete = selected.some(row => !available(row));
  const primary = selected.length === 1 && available(selected[0]) ? selected[0] : null;
  const unit = (code: string) => code === 'g' ? 'g' : currencyLabel(code);
  const quantity = (value: number | null, code: string) => value === null ? 'Unavailable' : value.toFixed(3) + ' ' + code;
  return <Screen scroll>
    <ReportTitle active="assets" title="Assets Report" />
    <ReportDates period={period} onChange={setPeriod} />
    <ReportPicker label="Asset" value={assetId ?? ''} onSelect={value => setAssetId(value || null)} options={[{ id: '', label: 'All assets' }, ...assets.map(asset => ({ id: asset.id, label: asset.name + ' · ' + assetTypes[asset.category] }))]} />
    {!ready || !rows ? <ActivityIndicator color={moduleColors.finance} /> : selected.length === 0 ? <ReportStatus warning={assetId !== null}>{assetId !== null ? 'Selected asset is unavailable. Select another asset.' : 'No assets for this selection.'}</ReportStatus> : <>
      {incomplete && <ReportStatus warning>Historical quantities unavailable — incomplete asset history.</ReportStatus>}
      {primary && <>
        <ReportValueCards cards={[{ label: 'Opening quantity', value: primary.openingQuantity!.toFixed(3), unit: unit(primary.unit) }, { label: 'Closing quantity', value: primary.closingQuantity!.toFixed(3), unit: unit(primary.unit) }, { label: 'Net change', value: primary.netChange!.toFixed(3), unit: unit(primary.unit) }]} />
        <ReportChart currency={primary.unit} formatValue={value => value.toFixed(3)} title="Quantity movements" description="Verified additions and withdrawals." empty="No positive quantity movements." data={[{ id: 'additions', label: 'Additions', amount: primary.additions ?? 0 }, { id: 'withdrawals', label: 'Withdrawals', amount: primary.withdrawals ?? 0 }]} />
      </>}
      <AppText variant="bodyStrong" style={{ marginTop: 6 }}>Assets ({selected.length})</AppText>
      {selected.map((row, index) => {
        const asset = assets.find(asset => asset.id === row.assetId);
        const verified = available(row);
        return <View key={row.assetId + ':' + index} testID={'asset-report-' + row.assetId} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 3 }}>
          <ReportDetails title={row.assetName + ' · ' + assetTypes[row.category]} actionLabel="Details">
            {verified ? <>
              <ReportKeyValues items={([['Opening quantity', row.openingQuantity], ['Additions', row.additions], ['Withdrawals', row.withdrawals], ['Closing quantity', row.closingQuantity], ['Net change', row.netChange]] as const).map(([label, value]) => ({ label, value: quantity(value, row.unit) }))} />
              {asset && <ReportDetails title={row.assetName + ' movements'}><ReportTransactionRows rows={asset.entries.filter(entry => entry.date >= period.from && entry.date <= period.to).map(entry => ({ id: entry.id, date: entry.date, category: assetTypes[row.category], description: entry.note ?? '', amount: 0, formattedAmount: entry.amount.toFixed(3), currency: row.unit }))} /></ReportDetails>}
            </> : <AppText variant="caption">{row.reason ?? 'Incomplete or unverified historical quantity. Verify the opening date in Assets.'}</AppText>}
          </ReportDetails>
          <AppText variant="caption" color="textSecondary">{unit(row.unit)}{asset?.category === 'gold' ? ' · ' + asset.karat + ' karat' : ''}{verified && selected.length > 1 ? ' · Closing quantity: ' + quantity(row.closingQuantity, row.unit) : ''}</AppText>
        </View>;
      })}
      <ReportNotice summary="Historical valuation unavailable." warning={incomplete}>Quantities are shown in their own units. Historical market valuations and prices are unavailable. Verified historical quantities require a confirmed opening date and complete recorded movements. Unavailable quantities are not zero. Select one asset to see its quantity analysis; unlike assets and currencies are never combined.</ReportNotice>
      <ReportStatementLink accessibilityLabel="View Assets Statement" period={period} onPress={() => router.push({ pathname: '/finance/statement-assets', params: { month, from: period.from, to: period.to, ...(assetId ? { assetId } : {}) } })} />
      <ReportTableActions table={{ title: 'Assets Quantity Report', decimalPlaces: 3, period, notice: 'Quantities are in their own units. Historical market valuations are unavailable; these are not market currency valuations.', verified: !incomplete, columns: ['Asset', 'Type', 'Unit', 'Opening quantity', 'Additions', 'Withdrawals', 'Closing quantity', 'Net change'], rows: selected.map(row => [row.assetName, assetTypes[row.category], row.unit, row.openingQuantity, row.additions, row.withdrawals, row.closingQuantity, row.netChange]) }} />
    </>}
  </Screen>;
}
