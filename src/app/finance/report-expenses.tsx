import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { moduleColors } from '@/theme';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { useExpenseExports } from '@/features/finance/hooks/useExpenseExports';
import { buildExpensesStatement } from '@/features/finance/utils/expensesStatementReconciliation';
import { selectExpenseCurrency } from '@/features/finance/utils/expenseReportPresentation';
import { ReportPicker, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportDashboardActions } from '@/features/finance/components/reporting/ReportDashboardActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';
import { ReportDashboardHeader, ReportDashboardDates, ReportDashboardMetrics } from '@/features/finance/components/reporting/ReportDashboardChrome';

/** Expenses presentation only; all monetary rows come from the existing report engine. */
export default function ExpensesReportScreen() {
  const router = useRouter();
  const { ready, context, accounts, categories } = useExpenseLedger();
  const [period, setPeriod] = useState(() => {
    const today = new Date();
    const localDate = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    return { from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDate(today) };
  });
  const [accountId, setAccountId] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const statement = useMemo(() => ready ? buildExpensesStatement(context, { from: period.from, to: period.to },
    { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) }) : null,
  [ready, context, period, accountId, categoryId]);
  const report = statement?.report;
  const activeCurrency = report?.currencies.some(item => item.currencyCode === currencyCode) ? currencyCode : report?.currencies[0]?.currencyCode || accounts[0]?.currencyCode || '';
  const visible = useMemo(() => statement ? selectExpenseCurrency(statement, activeCurrency) : null, [statement, activeCurrency]);
  const names = useMemo(() => ({ accounts: new Map(accounts.map(account => [account.id, account.name])),
    categories: new Map(categories.map(category => [category.id, category.name])) }), [accounts, categories]);
  const exports = useExpenseExports(visible, { from: period.from, to: period.to }, names);
  const netExpenses = report?.currencies.find(item => item.currencyCode === activeCurrency)?.expenses ?? null;
  const chartData = (report?.expenseCategories ?? []).filter(item => item.currencyCode === activeCurrency)
    .sort((a, b) => b.amount - a.amount).map(item => ({ id: item.categoryId,
      label: categories.find(category => category.id === item.categoryId)?.name ?? (item.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), amount: item.amount }));
  const transactionBase = visible?.reconciled ? visible.rows.reduce((sum, row) => sum + Math.abs(row.amount), 0) : 0;
  const transactions = visible?.reconciled ? visible.rows.map(row => ({ id: row.id, date: row.date,
    categoryIcon: categories.find(c => c.id === row.categoryId)?.icon as keyof typeof Ionicons.glyphMap | undefined, categoryColor: categories.find(c => c.id === row.categoryId)?.color, category: names.categories.get(row.categoryId) ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '),
    amount: row.amount, currency: row.currencyCode, percent: transactionBase > 0 ? Math.abs(row.amount) / transactionBase * 100 : null })) : [];
  return <View style={{ flex: 1 }}><Screen scroll contentContainerStyle={{ paddingBottom: 20 }}>
    <ReportDashboardHeader kind="expenses" />
    <ReportDashboardDates period={period} onChange={setPeriod} />
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <ReportPicker inline label="Account" value={accountId} onSelect={setAccountId} options={[{ id: '', label: 'All accounts' },
        ...accounts.map(account => ({ id: account.id, label: `${account.name} ${currencyLabel(account.currencyCode)}${account.archived ? ' · Archived' : ''}` }))]} />
      <ReportPicker inline label="Category" value={categoryId} selectedIcon={categories.find(c => c.id === categoryId)?.icon as keyof typeof Ionicons.glyphMap | undefined} selectedIconColor={categories.find(c => c.id === categoryId)?.color} onSelect={setCategoryId} options={[{ id: '', label: 'All Categories' },
        ...categories.filter(category => category.kind === 'expense').map(category => ({ id: category.id, label: category.name, icon: category.icon as keyof typeof Ionicons.glyphMap, color: category.color }))]} />
    </View>
    {!ready || !report || !visible ? <ActivityIndicator color={moduleColors.finance} /> : <>
      {report.unknown.length > 0 && <AppText accessibilityRole="alert" color="textSecondary">Incomplete report · {report.unknown.length} unverified transaction(s). Known subtotals only; exports unavailable.</AppText>}
      {report.currencies.length === 0 && <AppText>No verified ordinary expense transactions for this period.</AppText>}
      <ReportDashboardMetrics kind="expenses" total={netExpenses} currency={activeCurrency}
        transactionCount={transactions.length} currencyCount={report.currencies.length} incomplete={report.unknown.length > 0} />
      <ReportChart title="Expenses Analysis" data={chartData} currency={activeCurrency} currencies={report.currencies.map(item => item.currencyCode)} onCurrencySelect={setCurrencyCode} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong">Transactions ({transactions.length})</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="View all Expenses transactions" onPress={() => setTransactionsExpanded(value => !value)} accessibilityState={{ expanded: transactionsExpanded }} style={{ minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}><AppText variant="caption" style={{ color: moduleColors.finance, fontWeight: '600' }}>{transactionsExpanded ? 'Show less' : 'View all'}</AppText><Ionicons name={transactionsExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={moduleColors.finance} /></Pressable>
      </View>
      {!visible.reconciled ? <AppText accessibilityRole="alert">Statement cannot be reconciled; details are hidden.</AppText>
        : <>{transactionsExpanded && <ReportTransactionRows compact rows={transactions} />}{!transactions.length && <AppText color="textSecondary">No verified expenses for this currency.</AppText>}</>}

    </>}
  </Screen>
    {ready && report && visible && <ReportDashboardActions statement={() => router.push({ pathname: '/finance/statement-expenses', params: {
      from: period.from, to: period.to, ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}),
      ...(activeCurrency ? { currencyCode: activeCurrency } : {}) } })}
      busy={exports.exporting} disabled={!exports.canExport}
      pdf={exports.exportPdf} excel={exports.exportExcel} share={exports.share} />}
  </View>;
}
