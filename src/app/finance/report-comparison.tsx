import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { useReportPeriod } from '@/features/finance/components/reporting/ReportLayout';
import { ReportDashboardDates } from '@/features/finance/components/reporting/ReportDashboardChrome';
import { ReportPicker, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { aggregateOperatingReport } from '@/features/finance/utils/reportAggregation';
import { buildOperatingComparison } from '@/features/finance/utils/comparisonAggregation';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { buildComparisonTrend } from '@/features/finance/utils/comparisonTrend';
import { useCurrencyStore, useCurrencyHydrated } from '@/features/finance/store/useCurrencyStore';
import { buildConvertedComparison, convertComparisonTrend } from '@/features/finance/utils/comparisonConverted';
import { buildIncomeStatement } from '@/features/finance/utils/incomeStatementReconciliation';
import { buildExpensesStatement } from '@/features/finance/utils/expensesStatementReconciliation';
import { buildComparisonExportTable, buildConvertedComparisonExportTable } from '@/features/finance/utils/comparisonStatement';
import { ComparisonExportActions } from '@/features/finance/components/reporting/ComparisonExportActions';
import type { ReportTable } from '@/features/finance/utils/reportTableExport';

const NAVY = '#0B315C';
const GREEN = '#15803D';
const RED = '#DC2626';
const foodIcon = (name: string) => /^food$/i.test(name.trim()) ? 'restaurant-outline' as const : undefined;
type ChartMode = 'vertical' | 'horizontal' | 'trend';

/** Native line segments: no chart dependency, no changes to accounting. */
function TrendLines({ points, max }: { points: readonly { label: string; income: number; expenses: number }[]; max: number }) {
  const width = Math.max(290, (points.length - 1) * 74 + 32);
  const height = 130;
  const x = (index: number) => 16 + index * ((width - 32) / Math.max(1, points.length - 1));
  const y = (amount: number) => 12 + (height - 26) * (1 - Math.max(0, amount) / max);
  const segments = (kind: 'income' | 'expenses', color: string) => points.slice(1).map((point, index) => {
    const x1 = x(index); const y1 = y(points[index][kind]);
    const x2 = x(index + 1); const y2 = y(point[kind]);
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return <View key={`${kind}-${index}`} style={{ position: 'absolute', left: (x1 + x2) / 2 - length / 2,
      top: (y1 + y2) / 2 - 1.5, width: length, height: 3, borderRadius: 2,
      backgroundColor: color, transform: [{ rotate: `${angle}deg` }] }} />;
  });
  return <ScrollView horizontal><View testID="comparison-verified-trend" style={{ width, paddingBottom: 6 }}>
    <View style={{ width, height, borderBottomWidth: 1, borderBottomColor: '#DEE7F0' }}>
      {segments('income', GREEN)}{segments('expenses', RED)}
      {points.map((point, index) => <View key={point.label + index} style={{ position: 'absolute',
        left: x(index) - 4, top: y(point.income) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />)}
      {points.map((point, index) => <View key={'expense-' + point.label + index} style={{ position: 'absolute',
        left: x(index) - 4, top: y(point.expenses) - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: RED }} />)}
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 5 }}>
      {points.map((point, index) => <AppText key={point.label + index} variant="caption" style={{ fontSize: 9, color: NAVY }}>{point.label}</AppText>)}
    </View>
  </View></ScrollView>;
}

function Metric({ label, amount, currency, color }: { label: string; amount: number | null; currency: string; color: string }) {
  return <View style={{ flex: 1, minWidth: 0, padding: 8, borderWidth: 1, borderColor: '#DEE7F0', backgroundColor: 'white', borderRadius: 10 }}>
    <AppText variant="caption" style={{ fontSize: 10, fontWeight: '700', color: NAVY }}>{label}</AppText>
    <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
      style={{ fontSize: 15, color }}>{amount === null ? '—' : formatAmount(amount, currency)}</AppText>
    <AppText variant="caption" style={{ fontSize: 10 }}>{currencyLabel(currency)}</AppText>
  </View>;
}

/** Read-only comparison preview. Export and statement are intentionally not wired in this stage. */
export default function ComparisonReportScreen() {
  const router = useRouter();
  const currencyReady = useCurrencyHydrated();
  const baseCurrency = useCurrencyStore(state => state.baseCurrency);
  const rates = useCurrencyStore(state => state.rates);
  const verifiedCurrencies = useCurrencyStore(state => state.verifiedCurrencies);
  const fx = useMemo(() => ({ rates, verifiedCurrencies }), [rates, verifiedCurrencies]);
  const { ready, context, accounts, categories } = useExpenseLedger();
  const [period, setPeriod] = useReportPeriod();
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [mode, setMode] = useState<ChartMode>('vertical');
  const filters = useMemo(() => ({ ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) }), [accountId, categoryId]);
  const report = useMemo(() => ready ? aggregateOperatingReport(context, period, filters) : null, [ready, context, period, filters]);
  const comparison = useMemo(() => report ? buildOperatingComparison(report) : null, [report]);
  const accountCurrency = accountId ? accounts.find(account => account.id === accountId)?.currencyCode : undefined;
  const activeCurrency = accountCurrency ?? baseCurrency;
  const allAccounts = !accountId;
  const converted = useMemo(() => comparison && currencyReady
    ? buildConvertedComparison(comparison, activeCurrency, fx) : null,
    [comparison, currencyReady, activeCurrency, fx]);
  const selected = allAccounts ? converted : comparison?.currencies.find(item => item.currencyCode === activeCurrency);
  const trend = useMemo(() => {
    if (!ready || !currencyReady || !report || !comparison || !converted) return null;
    if (!allAccounts) return buildComparisonTrend(context, period, filters, report, activeCurrency);
    return convertComparisonTrend(comparison.currencies.map(item => ({
      currencyCode: item.currencyCode,
      ...buildComparisonTrend(context, period, filters, report, item.currencyCode),
    })), activeCurrency, fx);
  }, [ready, currencyReady, report, comparison, converted, allAccounts, context, period, filters, activeCurrency, fx]);
  const trendMax = Math.max(1, ...(trend?.points ?? []).flatMap(point => [Math.abs(point.income), Math.abs(point.expenses)]));
  const rows = allAccounts ? (converted?.categories ?? [])
    : (comparison?.categories.filter(item => item.currencyCode === activeCurrency) ?? []);
  const namedRows = rows.map(item => ({ ...item, label: categories.find(c => c.id === item.categoryId)?.name ?? (item.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category') }));
  const maxAmount = Math.max(1, ...namedRows.map(item => Math.abs(item.amount)));
  const exportTable = useMemo((): ReportTable | null => {
    if (!ready || !currencyReady || !comparison?.verified || !selected || !converted) return null;
    try {
      const income = buildIncomeStatement(context, period, filters);
      const expenses = buildExpensesStatement(context, period, filters);
      const names = {
        accounts: new Map(accounts.map(account => [account.id, account.name])),
        categories: new Map(categories.map(category => [category.id, category.name])),
      };
      if (allAccounts) return buildConvertedComparisonExportTable(comparison, income, expenses, activeCurrency, fx, names);
      return buildComparisonExportTable(comparison, income, expenses, activeCurrency, names);
    } catch { return null; }
  }, [ready, currencyReady, comparison, selected, converted, context, period, filters, activeCurrency, fx, accounts, categories, allAccounts]);
  const statementRoute = () => router.push({
    pathname: '/finance/statement-comparison',
    params: {
      from: period.from, to: period.to, currencyCode: activeCurrency,
      ...(allAccounts ? { allAccounts: '1' } : {}),
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
  } as Href);

  return <View style={{ flex: 1 }}><Screen scroll contentContainerStyle={{ paddingBottom: 20 }}>
    <View style={{ backgroundColor: NAVY, borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="arrow-back" color="white" size={22} />
        <AppText variant="bodyStrong" style={{ color: 'white', fontSize: 17 }}>Tomorrow Finance</AppText>
      </Pressable>
      <AppText variant="bodyStrong" style={{ color: '#BFDBFE' }}>Income vs Expenses Comparison</AppText>
    </View>
    <ReportDashboardDates period={period} onChange={setPeriod} />
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
      <ReportPicker label="Account" value={accountId} onSelect={setAccountId} options={[{ id: '', label: 'All accounts' }, ...accounts.map(a => ({ id: a.id, label: `${a.name} ${currencyLabel(a.currencyCode)}` }))]} />
      <ReportPicker label="Category" value={categoryId} onSelect={setCategoryId} options={[{ id: '', label: 'All categories' }, ...categories.map(c => ({ id: c.id, label: c.name, icon: (foodIcon(c.name) ?? c.icon) as keyof typeof Ionicons.glyphMap, color: c.color }))]} />
    </View>
    {!ready || !currencyReady || !comparison ? <ActivityIndicator color={NAVY} /> : <>
      {!comparison.verified && <AppText accessibilityRole="alert" style={{ color: RED, marginBottom: 8 }}>Incomplete data: {comparison.unknown.length} unverified transaction(s). Values are known subtotals only.</AppText>}
      {!converted && <AppText accessibilityRole="alert" style={{ color: RED, marginBottom: 8 }}>
        Comparison totals unavailable: incomplete transactions or missing verified exchange rates. No estimated cross-currency total is shown.
      </AppText>}
      <View style={{ flexDirection: 'row', gap: 7, marginBottom: 12 }}>
        <Metric label="Total Income" amount={selected ? selected.income : null} currency={activeCurrency} color={GREEN} />
        <Metric label="Total Expenses" amount={selected ? selected.expenses : null} currency={activeCurrency} color={RED} />
        <Metric label="Net Difference" amount={selected ? selected.netDifference : null} currency={activeCurrency} color={NAVY} />
      </View>
      <View style={{ padding: 12, backgroundColor: 'white', borderColor: '#DEE7F0', borderWidth: 1, borderRadius: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <AppText variant="bodyStrong" style={{ flex: 1, color: NAVY }}>Comparison Analysis</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
          {(['vertical', 'horizontal', 'trend'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} analysis`} onPress={() => setMode(value)}
            style={{ flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8, backgroundColor: mode === value ? NAVY : '#E8EEF5' }}>
            <AppText variant="caption" style={{ color: mode === value ? 'white' : NAVY, fontWeight: '700' }}>{value[0].toUpperCase() + value.slice(1)}</AppText>
          </Pressable>)}
        </View>
        {!converted ? <AppText accessibilityRole="alert" color="textSecondary">Chart unavailable until verified rates and transactions are available.</AppText> : mode === 'trend' ? (trend?.verified ? <TrendLines points={trend.points} max={trendMax} /> : <AppText accessibilityRole="alert" color="textSecondary">Trend unavailable: date buckets could not be reconciled to the exact report totals.</AppText>) :
          namedRows.length ? <ScrollView horizontal={mode === 'vertical'}>
            <View style={mode === 'vertical' ? { flexDirection: 'row', alignItems: 'flex-end', gap: 12, minHeight: 145 } : { gap: 10 }}>
              {converted && namedRows.map(item => <View key={`${item.kind}:${item.categoryId}`} style={mode === 'vertical' ? { width: 62, alignItems: 'center', gap: 5 } : { minWidth: 200, gap: 3 }}>
                {mode === 'vertical' ? <View style={{ height: Math.max(3, Math.abs(item.amount) / maxAmount * 100), width: 28, borderRadius: 4, backgroundColor: item.kind === 'income' ? GREEN : RED }} /> :
                  <View style={{ height: 10, borderRadius: 5, backgroundColor: '#E8EEF5' }}><View style={{ height: 10, width: `${Math.abs(item.amount) / maxAmount * 100}%`, borderRadius: 5, backgroundColor: item.kind === 'income' ? GREEN : RED }} /></View>}
                <AppText variant="caption" numberOfLines={2} style={{ fontSize: 10, textAlign: mode === 'vertical' ? 'center' : 'left' }}>{item.label}</AppText>
              </View>)}
            </View>
          </ScrollView> : <AppText color="textSecondary">No categories for this selection.</AppText>}
        <AppText variant="caption" style={{ marginTop: 10, color: NAVY }}>Green: Income   Red: Expenses</AppText>
      </View>
      <View style={{ marginTop: 12 }}><AppText variant="bodyStrong" style={{ color: NAVY }}>Categories</AppText>
        {converted && namedRows.map(item => <View key={`${item.kind}:${item.categoryId}`} style={{ flexDirection: 'row', paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#E8EEF5' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>{item.label === 'Food' && <Ionicons name="restaurant-outline" size={16} color={NAVY} />}<AppText>{item.label}</AppText></View><AppText style={{ color: item.kind === 'income' ? GREEN : RED }}>{formatAmount(item.amount, activeCurrency)}</AppText>
        </View>)}
      </View>
      <View style={{ marginTop: 12 }}>
        {exportTable ? <ComparisonExportActions table={exportTable} statement={statementRoute} /> : <>
          <Pressable accessibilityRole="button" accessibilityLabel="View Statement" onPress={statementRoute}
            style={{ minHeight: 46, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#DCE5EF', borderRadius: 9, backgroundColor: 'white' }}>
            <AppText variant="bodyStrong" style={{ color: NAVY }}>View Statement</AppText>
          </Pressable>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
            PDF, Excel and Share are unavailable until transactions, exchange rates and names are verified.
          </AppText>
        </>}
      </View>
    </>}
  </Screen></View>;
}
