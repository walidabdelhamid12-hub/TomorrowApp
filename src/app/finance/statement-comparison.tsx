import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { aggregateOperatingReport } from '@/features/finance/utils/reportAggregation';
import { buildOperatingComparison } from '@/features/finance/utils/comparisonAggregation';
import { buildIncomeStatement } from '@/features/finance/utils/incomeStatementReconciliation';
import { buildExpensesStatement } from '@/features/finance/utils/expensesStatementReconciliation';
import { buildComparisonExportTable, buildComparisonStatement, buildConvertedComparisonExportTable } from '@/features/finance/utils/comparisonStatement';
import { ComparisonExportActions } from '@/features/finance/components/reporting/ComparisonExportActions';
import { StatementMobileRows } from '@/features/finance/components/reporting/StatementMobileRows';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { useCurrencyStore, useCurrencyHydrated } from '@/features/finance/store/useCurrencyStore';
import { buildConvertedComparison, convertComparisonAmount } from '@/features/finance/utils/comparisonConverted';
import { reportRouteCurrency } from '@/features/finance/utils/reportRoutePeriod';

const NAVY = '#0B315C';
const RED = '#DC2626';
const GREEN = '#15803D';
const single = (value: string | string[] | undefined) => typeof value === 'string' ? value : undefined;
function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

/** Read-only selected-currency statement. Recompute every value from hydrated stores; never trust route totals. */
export default function ComparisonStatementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; to?: string; currencyCode?: string; accountId?: string; categoryId?: string; allAccounts?: string }>();
  const { ready, context, accounts, categories } = useExpenseLedger();
  const currencyReady = useCurrencyHydrated();
  const baseCurrency = useCurrencyStore(s => s.baseCurrency);
  const rates = useCurrencyStore(s => s.rates);
  const verifiedCurrencies = useCurrencyStore(s => s.verifiedCurrencies);
  const allAccounts = params.allAccounts === '1';
  const from = single(params.from);
  const to = single(params.to);
  const currencyCode = reportRouteCurrency(params.currencyCode);
  const accountId = single(params.accountId);
  const categoryId = single(params.categoryId);
  const valid = (!allAccounts || !accountId) && (params.allAccounts === undefined || params.allAccounts === '1')
    && (!allAccounts || currencyCode === baseCurrency) && validDate(from) && validDate(to) && from <= to && !!currencyCode
    && (params.accountId === undefined || (typeof accountId === 'string' && !!accountId && !/[\s\u0000-\u001f\u007f]/u.test(accountId)))
    && (params.categoryId === undefined || (typeof categoryId === 'string' && !!categoryId && !/[\s\u0000-\u001f\u007f]/u.test(categoryId)));
  const snapshot = useMemo(() => {
    if (!ready || !currencyReady || !valid || !from || !to || !currencyCode) return null;
    const period = { from, to };
    const filters = { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) };
    const comparison = buildOperatingComparison(aggregateOperatingReport(context, period, filters));
    const income = buildIncomeStatement(context, period, filters);
    const expenses = buildExpensesStatement(context, period, filters);
    try {
      const fx = { rates, verifiedCurrencies };
      const converted = buildConvertedComparison(comparison, currencyCode, fx);
      if (!converted) throw new Error('Missing verified exchange rates or incomplete transactions');
      const rows = allAccounts
        ? comparison.currencies.flatMap(item => buildComparisonStatement(comparison, income, expenses, item.currencyCode))
        : buildComparisonStatement(comparison, income, expenses, currencyCode);
      const names = {
        accounts: new Map(accounts.map(a => [a.id, a.name])),
        categories: new Map(categories.map(c => [c.id, c.name])),
      };
      const table = allAccounts
        ? buildConvertedComparisonExportTable(comparison, income, expenses, currencyCode, fx, names)
        : buildComparisonExportTable(comparison, income, expenses, currencyCode, names);
      return { rows, table, error: null as string | null,
        selected: allAccounts ? converted : comparison.currencies.find(c => c.currencyCode === currencyCode) };
    } catch (error) {
      return { rows: [], table: null, error: error instanceof Error ? error.message : 'Unverified statement', selected: null };
    }
  }, [ready, currencyReady, valid, from, to, currencyCode, accountId, categoryId, context, accounts, categories, allAccounts, rates, verifiedCurrencies]);
  return <Screen scroll contentContainerStyle={{ paddingBottom: 24 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Comparison Report" onPress={() => router.back()}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <Ionicons name="arrow-back" size={23} color={NAVY} />
      <AppText>Comparison Report</AppText>
    </Pressable>
    {!valid ? <AppText accessibilityRole="alert" style={{ color: RED }}>Invalid or missing statement filters.</AppText>
      : !ready || !currencyReady || !snapshot ? <ActivityIndicator color={NAVY} />
      : snapshot.error ? <AppText accessibilityRole="alert" style={{ color: RED }}>Statement unavailable: {snapshot.error}</AppText>
      : <>
        <View style={{ gap: 10, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <Ionicons name="git-compare-outline" size={26} color={NAVY} />
            <AppText variant="h2" style={{ color: NAVY, flexShrink: 1 }}>Comparison Statement</AppText>
          </View>
          <View style={{ borderWidth: 1, borderColor: '#DEE7F0', borderRadius: 12, padding: 12, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="calendar" size={20} color="#D6B777" />
            <AppText variant="bodyStrong">From {from}    To {to}</AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: '#DEE7F0', borderRadius: 12, padding: 10, backgroundColor: 'white' }}>
              <AppText variant="bodyStrong">Account</AppText>
              <AppText numberOfLines={2}>{accountId ? accounts.find(a => a.id === accountId)?.name ?? 'Unknown account' : 'All accounts'}</AppText>
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: '#DEE7F0', borderRadius: 12, padding: 10, backgroundColor: 'white' }}>
              <AppText variant="bodyStrong">Category</AppText>
              <AppText numberOfLines={2}>{categoryId ? categories.find(c => c.id === categoryId)?.name ?? 'Unknown category' : 'All categories'}</AppText>
            </View>
          </View>
          <View style={{ borderWidth: 1, borderColor: '#DEE7F0', borderRadius: 12, padding: 10, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="bodyStrong">Display currency</AppText>
            <AppText variant="bodyStrong">{currencyCode}</AppText>
          </View>
        </View>
        {snapshot.selected && <View style={{ paddingVertical: 10, gap: 3 }}>
          <AppText style={{ color: GREEN }}>Income: {formatAmount(snapshot.selected.income, currencyCode!)}</AppText>
          <AppText style={{ color: RED }}>Expenses: {formatAmount(snapshot.selected.expenses, currencyCode!)}</AppText>
          <AppText variant="bodyStrong" style={{ color: NAVY }}>Net difference: {formatAmount(snapshot.selected.netDifference, currencyCode!)}</AppText>
        </View>}
        <AppText variant="bodyStrong" style={{ color: NAVY, marginTop: 8 }}>Transactions ({snapshot.rows.length})</AppText>
        {snapshot.rows.length === 0 && <AppText color="textSecondary">No transactions in this selection. Export is unavailable.</AppText>}
        <StatementMobileRows rows={snapshot.rows.map(row => {
          const category = categories.find(c => c.id === row.categoryId);
          const account = accounts.find(a => a.id === row.accountId);
          const convertedAmount = allAccounts && row.currencyCode !== currencyCode
            ? convertComparisonAmount(row.amount, row.currencyCode, currencyCode!, { rates, verifiedCurrencies }) : null;
          return {
            id: `${row.kind}:${row.id}`,
            date: row.date,
            category: category?.name ?? 'Uncategorized',
            categoryIcon: (/^food$/i.test(category?.name?.trim() ?? '') ? 'restaurant-outline' : category?.icon) as keyof typeof Ionicons.glyphMap | undefined,
            categoryColor: category?.color,
            description: [row.kind, row.note, account?.name, convertedAmount === null ? '' : `≈ ${formatAmount(convertedAmount, currencyCode!)} ${currencyCode}`].filter(Boolean).join(' · '),
            amount: formatAmount(row.amount, row.currencyCode),
            currencyCode: row.currencyCode,
          };
        })} />
        {snapshot.table && <ComparisonExportActions table={snapshot.table} statementMode />}
      </>}
  </Screen>;
}
