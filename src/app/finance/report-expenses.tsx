import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { moduleColors } from '@/theme';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { useExpenseExports } from '@/features/finance/hooks/useExpenseExports';
import { buildExpensesStatement } from '@/features/finance/utils/expensesStatementReconciliation';
import { aggregateMonthlyOperatingComparison } from '@/features/finance/utils/reportMonthlyComparison';
import { expenseMonthPeriod, shiftExpenseMonth, selectExpenseCurrency } from '@/features/finance/utils/expenseReportPresentation';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { ReportNavigation, ReportHeader, ReportPicker, ReportSummaryCards, ReportTransactionRows, ReportExportActions, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';

/** Expenses presentation only; all monetary rows come from the existing report engine. */
export default function ExpensesReportScreen() {
  const router = useRouter(); const { ready, context, accounts, categories } = useExpenseLedger();
  const [month, setMonth] = useState(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; });
  const [accountId, setAccountId] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [currencyCode, setCurrencyCode] = useState(''); const [filtersOpen, setFiltersOpen] = useState(true);
  const period = useMemo(() => expenseMonthPeriod(month), [month]);
  const filtersActive = accountId !== '' || categoryId !== '';
  const statement = useMemo(() => ready ? buildExpensesStatement(context, { from: period.from, to: period.to },
    { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) }) : null,
  [ready, context, period, accountId, categoryId]);
  const report = statement?.report;
  const comparison = useMemo(() => ready && !filtersActive ? aggregateMonthlyOperatingComparison(context, month) : null, [ready, context, filtersActive, month]);
  const activeCurrency = currencyCode || report?.currencies[0]?.currencyCode || accounts[0]?.currencyCode || '';
  const visible = useMemo(() => statement ? selectExpenseCurrency(statement, activeCurrency) : null, [statement, activeCurrency]);
  const names = useMemo(() => ({ accounts: new Map(accounts.map(account => [account.id, account.name])),
    categories: new Map(categories.map(category => [category.id, category.name])) }), [accounts, categories]);
  const exports = useExpenseExports(visible, { from: period.from, to: period.to }, names);
  const comparisonRow = comparison?.currencies.find(row => row.currencyCode === activeCurrency);
  const metric = comparisonRow?.expenses;
  const netExpenses = report?.currencies.find(item => item.currencyCode === activeCurrency)?.expenses ?? null;
  const chartData = (report?.expenseCategories ?? []).filter(item => item.currencyCode === activeCurrency)
    .sort((a, b) => b.amount - a.amount).map(item => ({ id: item.categoryId,
      label: categories.find(category => category.id === item.categoryId)?.name ?? (item.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), amount: item.amount }));
  const transactions = visible?.reconciled ? visible.rows.map(row => ({ id: row.id, date: row.date,
    category: names.categories.get(row.categoryId) ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '),
    amount: row.amount, currency: row.currencyCode })) : [];
  return <Screen scroll>
    <ReportNavigation active="expenses" />
    <ReportHeader title="Expenses Report" icon="trending-down-outline" period={period.label} previous={() => setMonth(value => shiftExpenseMonth(value, -1))}
      next={() => setMonth(value => shiftExpenseMonth(value, 1))} previousDisabled={month === '0100-02'} nextDisabled={month === '9999-12'} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
      <AppText variant="caption" color="textSecondary">{period.from} – {period.to}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Filters" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><AppText variant="caption">Filters {filtersActive ? '•' : ''}</AppText></Pressable>
    </View>
    {filtersOpen && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
      <ReportPicker label="Accounts" value={accountId} onSelect={setAccountId} options={[{ id: '', label: 'All accounts' },
        ...accounts.map(account => ({ id: account.id, label: `${account.name} (${account.currencyCode})${account.archived ? ' · Archived' : ''}` }))]} />
      <ReportPicker label="Category" value={categoryId} onSelect={setCategoryId} options={[{ id: '', label: 'All Categories' },
        ...categories.filter(category => category.kind === 'expense').map(category => ({ id: category.id, label: category.name }))]} />
    </View>}
    {!ready || !report || !visible ? <ActivityIndicator color={moduleColors.finance} /> : <>
      <ReportPicker label="Currency" value={activeCurrency} onSelect={setCurrencyCode} options={report.currencies.map(item => ({ id: item.currencyCode, label: currencyLabel(item.currencyCode) }))} />
      <ReportSummaryCards currency={activeCurrency} cards={[{ label: report.unknown.length ? 'Known Expenses' : 'Net Expenses', value: netExpenses },
        { label: 'Previous Month', value: metric?.previous ?? null, detail: filtersActive ? 'All accounts/categories only' : undefined }, { label: 'Change', value: metric?.difference ?? null, detail: filtersActive ? 'Clear filters to compare' : metric?.reason === 'incomplete_data' ? 'Incomplete data' : metric?.percentageChange !== null && metric?.percentageChange !== undefined ? `${metric.percentageChange.toFixed(1)}% vs previous` : metric?.reason === 'zero_baseline' ? 'Zero baseline' : metric?.reason === 'negative_baseline' ? 'Negative baseline' : metric?.difference === null ? 'Unsafe precision' : undefined }]} />
      {report.unknown.length > 0 && <AppText accessibilityRole="alert" color="textSecondary">Incomplete report · {report.unknown.length} unverified transaction(s). Known subtotals only; exports unavailable.</AppText>}
      {report.currencies.length === 0 && <AppText>No verified ordinary expense transactions for this period.</AppText>}
      <ReportChart data={chartData} currency={activeCurrency} />
      <AppText variant="bodyStrong">Currency analysis</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{report.currencies.map(item => <Pressable key={item.currencyCode}
        accessibilityRole="button" accessibilityLabel={`Select ${item.currencyCode}`} accessibilityState={{ selected: item.currencyCode === activeCurrency }}
        onPress={() => setCurrencyCode(item.currencyCode)} style={{ minHeight: 44, paddingVertical: 6, paddingRight: 10 }}>
        <AppText variant="caption">{currencyLabel(item.currencyCode)} · {formatAmount(item.expenses, item.currencyCode)}</AppText>
      </Pressable>)}</View>
      {chartData.map(item => <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
        <AppText variant="caption" style={{ flex: 1 }}>{item.label}</AppText><AppText variant="caption">{formatAmount(item.amount, activeCurrency)} {activeCurrency}</AppText>
      </View>)}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong">Transactions ({transactions.length})</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="View all Expenses transactions" onPress={() => router.push({
          pathname: '/finance/statement-expenses', params: { from: period.from, to: period.to,
            ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}), ...(activeCurrency ? { currencyCode: activeCurrency } : {}) },
        } as Href)} style={{ minHeight: 44, justifyContent: 'center' }}><AppText variant="caption" style={{ color: moduleColors.finance, fontWeight: '600' }}>View all</AppText></Pressable>
      </View>
      {!visible.reconciled ? <AppText accessibilityRole="alert">Statement cannot be reconciled; details are hidden.</AppText>
        : <><ReportTransactionRows rows={transactions} />{!transactions.length && <AppText color="textSecondary">No verified expenses for this currency.</AppText>}</>}
      <ReportExportActions busy={exports.exporting} disabled={!exports.canExport} pdf={exports.exportPdf} excel={exports.exportExcel} share={exports.share} />
    </>}
  </Screen>;
}
