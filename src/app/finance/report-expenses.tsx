import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppText, Screen } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { moduleColors } from '@/theme';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { useExpenseExports } from '@/features/finance/hooks/useExpenseExports';
import { buildExpensesStatement } from '@/features/finance/utils/expensesStatementReconciliation';
import { compareExpenseRange } from '@/features/finance/utils/expenseRangeComparison';
import { selectExpenseCurrency } from '@/features/finance/utils/expenseReportPresentation';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { ReportNavigation, ReportHeader, ReportPicker, ReportSummaryCards, ReportTransactionRows, ReportExportActions, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';

/** Expenses presentation only; all monetary rows come from the existing report engine. */
export default function ExpensesReportScreen() {
  const { ready, context, accounts, categories } = useExpenseLedger();
  const [period, setPeriod] = useState(() => {
    const today = new Date();
    const localDate = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    return { from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: localDate(today) };
  });
  const [editingDate, setEditingDate] = useState<'from' | 'to' | null>(null);
  const dateValue = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };
  const onDateChange = (_event: { type: string }, selected?: Date) => {
    const target = editingDate;
    if (Platform.OS !== 'ios') setEditingDate(null);
    if (!target || !selected || _event.type === 'dismissed') return;
    const date = [selected.getFullYear(), String(selected.getMonth() + 1).padStart(2, '0'), String(selected.getDate()).padStart(2, '0')].join('-');
    setPeriod(current => target === 'from'
      ? { from: date, to: date > current.to ? date : current.to }
      : { from: date < current.from ? date : current.from, to: date });
  };
  const [accountId, setAccountId] = useState(''); const [categoryId, setCategoryId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const statement = useMemo(() => ready ? buildExpensesStatement(context, { from: period.from, to: period.to },
    { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) }) : null,
  [ready, context, period, accountId, categoryId]);
  const report = statement?.report;
  const activeCurrency = currencyCode || report?.currencies[0]?.currencyCode || accounts[0]?.currencyCode || '';
  const visible = useMemo(() => statement ? selectExpenseCurrency(statement, activeCurrency) : null, [statement, activeCurrency]);
  const names = useMemo(() => ({ accounts: new Map(accounts.map(account => [account.id, account.name])),
    categories: new Map(categories.map(category => [category.id, category.name])) }), [accounts, categories]);
  const exports = useExpenseExports(visible, { from: period.from, to: period.to }, names);
  const metric = useMemo(() => ready && activeCurrency ? compareExpenseRange(context, period, activeCurrency,
    { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) }) : null,
    [ready, context, period, activeCurrency, accountId, categoryId]);
  const netExpenses = report?.currencies.find(item => item.currencyCode === activeCurrency)?.expenses ?? null;
  const chartData = (report?.expenseCategories ?? []).filter(item => item.currencyCode === activeCurrency)
    .sort((a, b) => b.amount - a.amount).map(item => ({ id: item.categoryId,
      label: categories.find(category => category.id === item.categoryId)?.name ?? (item.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), amount: item.amount }));
  const transactions = visible?.reconciled ? visible.rows.map(row => ({ id: row.id, date: row.date,
    category: names.categories.get(row.categoryId) ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '),
    amount: row.amount, currency: row.currencyCode })) : [];
  return <Screen scroll>
    <ReportNavigation active="expenses" />
    <ReportHeader title="Expenses Report" icon="trending-down-outline" compact period="" />
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      {(['from', 'to'] as const).map(key => <Pressable key={key} accessibilityRole="button"
        accessibilityLabel={`${key === 'from' ? 'From' : 'To'} date: ${period[key]}`}
        onPress={() => setEditingDate(key)}
        style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: moduleColors.finance, borderRadius: 8, paddingHorizontal: 9, justifyContent: 'center' }}>
        <AppText variant="caption" color="textSecondary">{key === 'from' ? 'From' : 'To'}</AppText>
        <AppText variant="caption">{period[key]}  ▾</AppText>
      </Pressable>)}
    </View>
    {editingDate && <DateTimePicker mode="date" display="default"
      value={dateValue(period[editingDate])} onChange={onDateChange}
      minimumDate={new Date(100, 1, 1)} maximumDate={new Date(9999, 11, 31)} />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
      <ReportPicker label="Accounts" value={accountId} onSelect={setAccountId} options={[{ id: '', label: 'All accounts' },
        ...accounts.map(account => ({ id: account.id, label: `${account.name} (${account.currencyCode})${account.archived ? ' · Archived' : ''}` }))]} />
      <ReportPicker label="Category" value={categoryId} onSelect={setCategoryId} options={[{ id: '', label: 'All Categories' },
        ...categories.filter(category => category.kind === 'expense').map(category => ({ id: category.id, label: category.name }))]} />
    </View>
    {!ready || !report || !visible ? <ActivityIndicator color={moduleColors.finance} /> : <>
      <AppText variant="bodyStrong">Currency analysis</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{report.currencies.map(item => <Pressable key={item.currencyCode}
        accessibilityRole="button" accessibilityLabel={`Select ${item.currencyCode}`} accessibilityState={{ selected: item.currencyCode === activeCurrency }}
        onPress={() => setCurrencyCode(item.currencyCode)} style={{ minHeight: 44, borderWidth: 1, borderRadius: 8,
          borderColor: moduleColors.finance, backgroundColor: item.currencyCode === activeCurrency ? '#E8F4EF' : 'transparent',
          justifyContent: 'center', paddingHorizontal: 10 }}>
        <AppText variant="caption">{currencyLabel(item.currencyCode)} · {formatAmount(item.expenses, item.currencyCode)}</AppText>
      </Pressable>)}</View>
      <ReportSummaryCards compact denseCentered currency={activeCurrency} cards={[{ label: report.unknown.length ? 'Known Expenses' : 'Net Expenses', value: netExpenses },
        { label: 'Previous Period', value: metric?.previous ?? null }, { label: 'Change', value: metric?.difference ?? null, detail: metric?.reason === 'incomplete_data' ? 'Incomplete data' : metric?.percentageChange !== null && metric?.percentageChange !== undefined ? `${metric.percentageChange.toFixed(1)}% vs previous` : metric?.reason === 'zero_baseline' ? 'Zero baseline' : metric?.reason === 'negative_baseline' ? 'Negative baseline' : metric?.difference === null ? 'Unsafe precision' : undefined }]} />
      {report.unknown.length > 0 && <AppText accessibilityRole="alert" color="textSecondary">Incomplete report · {report.unknown.length} unverified transaction(s). Known subtotals only; exports unavailable.</AppText>}
      {report.currencies.length === 0 && <AppText>No verified ordinary expense transactions for this period.</AppText>}
      <ReportChart data={chartData} currency={activeCurrency} />
      {chartData.map(item => <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
        <AppText variant="caption" style={{ flex: 1 }}>{item.label}</AppText><AppText variant="caption">{formatAmount(item.amount, activeCurrency)} {activeCurrency}</AppText>
      </View>)}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong">Transactions ({transactions.length})</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="View all Expenses transactions" onPress={() => setTransactionsExpanded(value => !value)} accessibilityState={{ expanded: transactionsExpanded }} style={{ minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}><AppText variant="caption" style={{ color: moduleColors.finance, fontWeight: '600' }}>{transactionsExpanded ? 'Show less' : 'View all'}</AppText><Ionicons name={transactionsExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={moduleColors.finance} /></Pressable>
      </View>
      {!visible.reconciled ? <AppText accessibilityRole="alert">Statement cannot be reconciled; details are hidden.</AppText>
        : <>{transactionsExpanded && <ReportTransactionRows compact rows={transactions} />}{!transactions.length && <AppText color="textSecondary">No verified expenses for this currency.</AppText>}</>}
      <ReportExportActions busy={exports.exporting} disabled={!exports.canExport} pdf={exports.exportPdf} excel={exports.exportExcel} share={exports.share} />
    </>}
  </Screen>;
}
