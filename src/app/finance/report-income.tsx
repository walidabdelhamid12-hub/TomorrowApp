import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { buildIncomeStatement } from '@/features/finance/utils/incomeStatementReconciliation';
import { aggregateOperatingReport } from '@/features/finance/utils/reportAggregation';
import { previousExpensePeriod } from '@/features/finance/utils/expenseDateRange';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { buildVerifiedOperatingStatementRows } from '@/features/finance/utils/operatingStatementCsv';
import { moduleColors } from '@/theme';
import { ReportTitle, ReportDates, useReportPeriod, ReportDetails, ReportCurrencyAnalysis, ReportNotice, ReportStatementLink } from '@/features/finance/components/reporting/ReportLayout';
import { ReportPicker, ReportSummaryCards, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';

/** Ordinary income only. All displayed rows come from the reconciled statement. */
export default function IncomeReportScreen() {
  const router = useRouter();
  const { ready, context, accounts, categories } = useExpenseLedger();
  const [period, setPeriod] = useReportPeriod();
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [currency, setCurrency] = useState('');
  const filters = useMemo(() => ({ ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) }), [accountId, categoryId]);
  const statement = useMemo(() => ready ? buildIncomeStatement(context, period, filters) : null, [ready, context, period, filters]);
  const previous = useMemo(() => { if (!ready) return null; try { return aggregateOperatingReport(context, previousExpensePeriod(period), filters); } catch { return null; } }, [ready, context, period, filters]);
  const report = statement?.report;
  const currencies = report?.currencies ?? [];
  const activeCurrency = currencies.some(item => item.currencyCode === currency) ? currency : currencies[0]?.currencyCode ?? 'EGP';
  const current = currencies.find(item => item.currencyCode === activeCurrency);
  const before = previous?.currencies.find(item => item.currencyCode === activeCurrency);
  const comparisonSafe = !!previous && !!report && !previous.unknown.length && !report.unknown.length;
  const priorUnits = before?.minorUnits?.income ?? (before ? null : 0);
  const currentUnits = current?.minorUnits?.income ?? (current ? null : 0);
  const difference = comparisonSafe && priorUnits !== null && currentUnits !== null && Number.isSafeInteger(currentUnits - priorUnits) ? (currentUnits - priorUnits) / 10 ** getCurrencyDecimals(activeCurrency) : null;
  const selectedRows = statement?.reconciled ? statement.rows.filter(row => row.currencyCode === activeCurrency) : [];
  const names = { accounts: new Map(accounts.map(item => [item.id, item.name])), categories: new Map(categories.map(item => [item.id, item.name])) };
  let exportRows: ReturnType<typeof buildVerifiedOperatingStatementRows> = [];
  let exportSafe = false;
  if (statement?.reconciled && !report?.unknown.length) {
    try { exportRows = buildVerifiedOperatingStatementRows({ ...statement, rows: selectedRows }, names); exportSafe = true; } catch { /* Missing names remain fail-closed. */ }
  }
  return <Screen scroll>
    <ReportTitle active="income" title="Income Report" />
    <ReportDates period={period} onChange={setPeriod} />
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <ReportPicker label="Acc." value={accountId} onSelect={setAccountId} options={[{ id: '', label: 'All accounts' }, ...accounts.map(account => ({ id: account.id, label: account.name + ' ' + currencyLabel(account.currencyCode) + (account.archived ? ' · Archived' : '') }))]} />
      <ReportPicker label="Cat." value={categoryId} onSelect={setCategoryId} options={[{ id: '', label: 'All Categories' }, ...categories.filter(category => category.kind === 'income').map(category => ({ id: category.id, label: category.name, icon: category.icon as keyof typeof Ionicons.glyphMap, color: category.color }))]} />
    </View>
    {!ready || !statement || !report ? <ActivityIndicator color={moduleColors.finance} /> : <>
      {!!report.unknown.length && <AppText accessibilityRole="alert">Incomplete report · {report.unknown.length} unverified transaction(s). Known subtotals only; exports unavailable.</AppText>}
      <ReportCurrencyAnalysis currencies={currencies.map(item => item.currencyCode)} value={activeCurrency} onSelect={setCurrency} />
      {!currencies.length && <AppText>No verified ordinary income transactions for this period.</AppText>}

      <ReportSummaryCards currency={activeCurrency} cards={[{ label: report.unknown.length ? 'Known Income' : 'Net Income', value: current?.income ?? 0 }, { label: 'Previous Period', value: comparisonSafe && priorUnits !== null ? priorUnits / 10 ** getCurrencyDecimals(activeCurrency) : null }, { label: 'Change', value: difference, detail: !comparisonSafe ? 'Incomplete data' : priorUnits === 0 ? 'Zero baseline' : priorUnits !== null && priorUnits < 0 ? 'Negative baseline' : difference === null ? 'Unsafe precision' : priorUnits !== null && priorUnits > 0 ? ((currentUnits! - priorUnits) / priorUnits * 100).toFixed(1) + '% vs previous' : undefined }]} />
      <ReportChart currency={activeCurrency} description="Positive ordinary income categories only." empty="No positive income to chart." data={report.incomeCategories.filter(item => item.currencyCode === activeCurrency).map(item => { const category = categories.find(category => category.id === item.categoryId); return { id: item.categoryId, label: category?.name ?? 'Uncategorized', amount: item.amount, color: category?.color }; })} />
      {!statement.reconciled ? <AppText accessibilityRole="alert">Statement cannot be reconciled; details are hidden.</AppText> : <ReportDetails title={`Transactions (${selectedRows.length})`}><ReportTransactionRows rows={selectedRows.map(row => { const category = categories.find(category => category.id === row.categoryId); return { id: row.id, date: row.date, category: category?.name ?? 'Uncategorized', categoryIcon: category?.icon as keyof typeof Ionicons.glyphMap | undefined, categoryColor: category?.color, description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '), amount: row.amount, currency: row.currencyCode }; })} /></ReportDetails>}
      <ReportNotice summary="Ordinary income only; financing is excluded.">Ordinary income only. Loans, transfers and debt collections are excluded. Currencies are never combined. The previous period uses the same account and category filters and the same number of days. Unverified transactions make comparisons and exports unavailable.</ReportNotice>
      <ReportStatementLink accessibilityLabel="View Income Statement" period={period} onPress={() => router.push({ pathname: '/finance/statement-income', params: { from: period.from, to: period.to, ...filters, currencyCode: activeCurrency } })} />
      <ReportTableActions table={{ title: 'Income Report', period, notice: 'Ordinary income only. Selected account, category and currency; previous-period comparison is not a posted balance.', verified: exportSafe, columns: ['Date', 'Account', 'Category', 'Description', 'Amount', 'Currency'], rows: exportRows.map(row => [row.date, row.account, row.category, row.note ?? '', Number(row.amount), row.currency]) }} />
    </>}
  </Screen>;
}
