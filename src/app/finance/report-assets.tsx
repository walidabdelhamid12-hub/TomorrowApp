import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { SixReportDetails } from '@/features/finance/components/reporting/SixReportPresentation';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateAssetsReport } from '@/features/finance/utils/reportAssets';
import { getAssetBalance } from '@/features/finance/utils/finance';
import { AssetTrendChart } from '@/features/finance/components/reporting/AssetTrendChart';
import { getCurrencyFlag, getCurrencyLabel } from '@/features/finance/constants/currencies';
import { assetReportHistoryAvailable, validateAssetOpeningDate } from '@/features/finance/utils/assetOpeningDate';
import { moduleColors, useTheme } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportValueCards, ReportKeyValues } from '@/features/finance/components/reporting/ReportUnifiedSix';
import { ReportPicker, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { BalanceCurrencyPicker } from '@/features/finance/components/reporting/BalanceCurrencyPicker';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { useCurrencyHydrated, useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { formatMoney } from '@/features/finance/utils/money';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { MetalTypeLabel } from '@/features/finance/components/MetalTypeLabel';

const assetTypes = { local_currency: 'Local currency', foreign_currency: 'Foreign currency', gold: 'Gold', silver: 'Silver' };
export default function AssetsReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const ready = useFinanceHydrated();
  const currencyReady = useCurrencyHydrated();
  const baseCurrency = useCurrencyStore(state => state.baseCurrency);
  const rates = useCurrencyStore(state => state.rates);
  const verifiedCurrencies = useCurrencyStore(state => state.verifiedCurrencies);
  const metals = useCurrencyStore(state => state.metals);
  const metalSources = useCurrencyStore(state => state.metalSources);
  const ratesUpdatedAt = useCurrencyStore(state => state.updatedAt);
  const assets = useFinanceStore(state => state.assets);
  const [period, setPeriod] = useReportPeriod();
  const [assetId, setAssetId] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState('');
  const [analysisCurrency, setAnalysisCurrency] = useState('');
  const [assetGroup, setAssetGroup] = useState<'all' | 'currencies' | 'metals'>('all');
  const month = period.from.slice(0, 7);
  const rows = useMemo(() => ready ? aggregateAssetsReport(assets, period) : null, [ready, assets, period]);
  const isInGroup = (category: string) =>
    assetGroup === 'all' ||
    (assetGroup === 'currencies' && (category === 'local_currency' || category === 'foreign_currency')) ||
    (assetGroup === 'metals' && (category === 'gold' || category === 'silver'));
  const filteredAssets = assets.filter(asset => isInGroup(asset.category));
  const selected = rows?.filter(row =>
    isInGroup(row.category) && (assetId === null || row.assetId === assetId)
  ) ?? [];
  const available = (row: NonNullable<typeof rows>[number]) => {
    const matches = assets.filter(asset => asset.id === row.assetId);
    const asset = matches.length === 1 ? matches[0] : undefined;
    return row.status === 'available' && !!asset && !!asset.openingBalanceDate && validateAssetOpeningDate(assets, asset.id, asset.openingBalanceDate).valid && assetReportHistoryAvailable(asset, period.from);
  };
  const incomplete = selected.some(row => !available(row));
  const primary = selected.length === 1 && available(selected[0]) ? selected[0] : null;
  const groupKey = (asset: (typeof assets)[number]) =>
    asset.category === 'gold' ? 'gold' :
    asset.category === 'silver' ? 'silver' :
    asset.currencyCode;

  // Trends only combine movements with compatible native units.
  const trendAssets = filteredAssets.filter(asset => assetId === null || asset.id === assetId);
  const trendKey = trendAssets.length === 1 ? groupKey(trendAssets[0]) : null;
  const safeHoldings = trendKey === null ? [] : trendAssets.filter(asset =>
    groupKey(asset) === trendKey && Array.isArray(asset.entries) &&
    asset.entries.every(entry => Number.isFinite(entry.amount) && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) &&
    Number.isFinite(getAssetBalance(asset)));
  const analysisUnit = trendKey === 'gold' || trendKey === 'silver' ? 'Gr' : trendKey ?? '';
  const valuationPool = filteredAssets.filter(asset => assetId === null || asset.id === assetId);
  const balanceCurrency = displayCurrency || baseCurrency;
  const chartCurrency = analysisCurrency || baseCurrency;
  const valueAssets = (target: string) => valuationPool.map(asset => currencyReady ? getAssetValueInBase(
    asset, target, rates,
    metalSources.gold24PerGram === 'default' ? null : metals.gold24PerGram,
    metalSources.silverPerGram === 'default' ? null : metals.silverPerGram,
    verifiedCurrencies,
  ) : null);
  const valuedAssets = valueAssets(balanceCurrency);
  const allValued = currencyReady && valuedAssets.length > 0 && valuedAssets.every(value => value !== null && Number.isFinite(value));
  const currentValuation = allValued ? valuedAssets.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const chartValues = valueAssets(chartCurrency);
  const chartReady = currencyReady && chartValues.length > 0 && chartValues.every(value => value !== null && Number.isFinite(value));
  const categories = [
    { id: 'gold', label: 'Gold', color: '#A97808' },
    { id: 'silver', label: 'Silver', color: '#94A3B8' },
    { id: 'currency', label: 'Currency', color: '#0B7497' },
  ];
  const chartRows = chartReady ? categories.map(category => ({
    ...category,
    amount: valuationPool.reduce((sum, asset, index) => sum + ((category.id === 'currency' ? asset.category === 'local_currency' || asset.category === 'foreign_currency' : asset.category === category.id) ? (chartValues[index] ?? 0) : 0), 0),
  })).filter(row => Number.isFinite(row.amount) && row.amount > 0) : [];
  const currencyOptions = CURRENCIES.map(item => ({ id: item.code, label: getCurrencyLabel(item.code) }));
  const unit = (code: string) => code === 'g' ? 'Gr' : getCurrencyLabel(code);
  const iconFor = (category: string, code: string) =>
    category === 'gold' ? '🥇' :
    category === 'silver' ? '🥈' :
    getCurrencyFlag(code) || '💵';
  const quantity = (value: number | null, code: string) => value === null ? 'Unavailable' : value.toFixed(3) + ' ' + (code === 'g' ? 'Gr' : code);
  return <Screen scroll style={{ backgroundColor: '#F4F7FA' }}>
    <View style={{
  backgroundColor: '#1E293B',
  borderBottomLeftRadius: 24,
  borderBottomRightRadius: 24,
  marginBottom: 10,
  overflow: 'hidden',
  paddingTop: 12,
  paddingBottom: 14,
  paddingHorizontal: 10,
}}>
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => router.back()}
      style={{
        width: 44,
        minHeight: 44,
        justifyContent: 'center',
      }}
    >
      <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
    </Pressable>
    <AppText variant="bodyStrong" style={{
      color: '#FFFFFF',
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
    }}>
      Tomorrow Finance Report
    </AppText>
    <View style={{ width: 44 }} />
  </View>
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  }}>
    <Ionicons name="document-text-outline" size={20} color="#B45309" />
    <AppText variant="bodyStrong" style={{
      color: '#B45309',
      fontSize: 16,
      fontWeight: '700',
    }}>
      Assets Report
    </AppText>
  </View>
</View>
    <ReportDates period={period} onChange={setPeriod} />
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <ReportPicker label="Asset Type" value={assetGroup}
          onSelect={value => { setAssetGroup(value as 'all' | 'currencies' | 'metals'); setAssetId(null); }}
          options={[
            { id: 'all', label: 'All Assets' },
            { id: 'currencies', label: 'Currencies' },
            { id: 'metals', label: 'Metals' },
          ]} />
      </View>
      <View style={{ flex: 1 }}>
        <ReportPicker label="Asset" value={assetId ?? ''}
          onSelect={value => setAssetId(value || null)}
          options={[
            { id: '', label: 'All in group' },
            ...filteredAssets.map(asset => ({
              id: asset.id,
              label: asset.name + ' · ' +
                (asset.category === 'gold' || asset.category === 'silver'
                  ? assetTypes[asset.category]
                  : getCurrencyLabel(asset.currencyCode)),
              ...(asset.category === 'gold' || asset.category === 'silver' ? { metalType: asset.category, metalPrefix: asset.name + ' · ' } : {}),
            })),
          ]} />
      </View>
    </View>
    {!ready || !rows ? <ActivityIndicator color={moduleColors.finance} /> : selected.length === 0 ? <ReportStatus warning={assetId !== null}>{assetId !== null ? 'Selected asset is unavailable. Select another asset.' : 'No assets for this selection.'}</ReportStatus> : <>

      {primary && <ReportValueCards cards={[{ label: 'Opening quantity', value: primary.openingQuantity!.toFixed(3), unit: unit(primary.unit) }, { label: 'Closing quantity', value: primary.closingQuantity!.toFixed(3), unit: unit(primary.unit) }, { label: 'Net change', value: primary.netChange!.toFixed(3), unit: unit(primary.unit) }]} />}
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginVertical: 8, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><AppText variant="bodyStrong" style={{ fontSize: 16, fontWeight: '800' }}>Total Assets Balance</AppText></View>
          <View style={{ flexShrink: 0 }}><BalanceCurrencyPicker value={balanceCurrency} onSelect={setDisplayCurrency} /></View>
        </View>
        <AppText variant="bodyStrong" style={{ fontSize: 25, fontWeight: '800', marginTop: 8, fontVariant: ['tabular-nums'] }}>{currentValuation !== null && Number.isFinite(currentValuation) ? formatMoney(currentValuation, balanceCurrency) : 'Valuation unavailable'}</AppText>
      </View>
      <ReportChart title="Asset Analysis" currency={chartCurrency} currencies={CURRENCIES.map(item => item.code)} onCurrencySelect={setAnalysisCurrency}
        empty={chartReady ? 'No positive valued holdings.' : 'Valuation unavailable'} data={chartRows}
        trendContent={trendKey === null ? <AppText variant="caption">Select one asset for its recorded movements trend. Different units cannot be combined.</AppText> : <AssetTrendChart compact assets={safeHoldings} unit={analysisUnit} />} />
      <AppText variant="bodyStrong" style={{ marginTop: 6 }}>Assets ({selected.length})</AppText>
      {selected.map((row, index) => {
        const asset = assets.find(asset => asset.id === row.assetId);
        const verified = available(row);
        return <View key={row.assetId + ':' + index} testID={'asset-report-' + row.assetId} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 3 }}>
          <SixReportDetails title={row.assetName} leadingIcon={iconFor(row.category, row.unit)} subtitle={asset && Number.isFinite(getAssetBalance(asset)) ? 'Current: ' + quantity(getAssetBalance(asset), row.unit) + (asset.category === 'gold' ? ' · ' + asset.karat + 'K' : '') : 'Current quantity unavailable'}>
            <AppText variant="bodyStrong" style={{ marginTop: 6 }}>{row.category === 'gold' || row.category === 'silver' ? <MetalTypeLabel type={row.category} /> : assetTypes[row.category]}</AppText>
            {verified ? <>
              <ReportKeyValues items={([['Opening quantity', row.openingQuantity], ['Additions', row.additions], ['Withdrawals', row.withdrawals], ['Closing quantity', row.closingQuantity], ['Net change', row.netChange]] as const).map(([label, value]) => ({ label, value: quantity(value, row.unit) }))} />
              {asset && <SixReportDetails title={row.assetName + ' movements'}><ReportTransactionRows rows={asset.entries.filter(entry => entry.date >= period.from && entry.date <= period.to).map(entry => ({ id: entry.id, date: entry.date, category: assetTypes[row.category], description: entry.note ?? '', amount: 0, formattedAmount: entry.amount.toFixed(3), currency: row.unit }))} /></SixReportDetails>}
            </> : <AppText variant="caption">{row.reason ?? 'Incomplete or unverified historical quantity. Verify the opening date in Assets.'}</AppText>}
          </SixReportDetails>

        </View>;
      })}

      <ReportTableActions presentation="assets" table={{ title: 'Assets Quantity Report', decimalPlaces: 3, period, notice: 'Quantities are in their own units. Historical market valuations are unavailable; these are not market currency valuations.', verified: !incomplete, columns: ['Asset', 'Type', 'Unit', 'Opening quantity', 'Additions', 'Withdrawals', 'Closing quantity', 'Net change'], rows: selected.map(row => [row.assetName, assetTypes[row.category], row.unit, row.openingQuantity, row.additions, row.withdrawals, row.closingQuantity, row.netChange]) }} statement={() => router.push({ pathname: '/finance/statement-assets', params: { month, from: period.from, to: period.to, ...(assetId ? { assetId } : {}) } })} />
    </>}
  </Screen>;
}
