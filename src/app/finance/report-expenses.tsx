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
    categoryIcon: categories.find(c => c.id === row.categoryId)?.icon as keyof typeof Ionicons.glyphMap | undefined, categoryColor: categories.find(c => c.id === row.categoryId)?.color, category: names.categories.get(row.categoryId) ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'), description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '),
    amount: row.amount, currency: row.currencyCode })) : [];
  return <Screen scroll>
    <ReportNavigation active="expenses" />
    <ReportHeader title="Expenses Report" icon="trending-down-outline" compact period="" />
    {/* expenses-8-6e-inline-filters */}
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      {(['from', 'to'] as const).map(key => <Pressable key={key} accessibilityRole="button"
        accessibilityLabel={`${key === 'from' ? 'From' : 'To'} date: ${period[key]}`}
        onPress={() => setEditingDate(key)}
        style={{ flex: 1, minWidth: 0, minHeight: 40, borderWidth: 1, borderColor: '#DDE3EB',
          borderRadius: 8, paddingHorizontal: 8, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <AppText variant="caption" style={{ fontWeight: '700', color: '#0F172A' }}>{key === 'from' ? 'From' : 'To'}</AppText>
          <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1, textAlign: 'right' }}>{period[key]}</AppText>
          <Ionicons name="chevron-down" size={12} color="#64748B" />
        </View>
      </Pressable>)}
    </View>
    {editingDate && <DateTimePicker mode="date" display="default"
      value={dateValue(period[editingDate])} onChange={onDateChange}
      minimumDate={new Date(100, 1, 1)} maximumDate={new Date(9999, 11, 31)} />}
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <ReportPicker inline label="Acc." value={accountId} onSelect={setAccountId} options={[{ id: '', label: 'All accounts' },
        ...accounts.map(account => ({ id: account.id, label: `${account.name} ${currencyLabel(account.currencyCode)}${account.archived ? ' · Archived' : ''}` }))]} />
      <ReportPicker inline label="Cat." value={categoryId} selectedIcon={categories.find(c => c.id === categoryId)?.icon as keyof typeof Ionicons.glyphMap | undefined} selectedIconColor={categories.find(c => c.id === categoryId)?.color} onSelect={setCategoryId} options={[{ id: '', label: 'All Categories' },
        ...categories.filter(category => category.kind === 'expense').map(category => ({ id: category.id, label: category.name, icon: category.icon as keyof typeof Ionicons.glyphMap, color: category.color }))]} />
    </View>
    {!ready || !report || !visible ? <ActivityIndicator color={moduleColors.finance} /> : <>
      {report.unknown.length > 0 && <AppText accessibilityRole="alert" color="textSecondary">Incomplete report · {report.unknown.length} unverified transaction(s). Known subtotals only; exports unavailable.</AppText>}
      {report.currencies.length === 0 && <AppText>No verified ordinary expense transactions for this period.</AppText>}
      <ReportChart data={chartData} currency={activeCurrency} />
      
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText variant="bodyStrong">Currency analysis</AppText>
        {report.currencies.length > 1 && <View style={{ width: 180, maxWidth: '55%' }}>
          <ReportPicker inline label="Currency" value={activeCurrency} onSelect={setCurrencyCode}
            options={report.currencies.map(item => ({ id: item.currencyCode, label: currencyLabel(item.currencyCode) }))} />
        </View>}
      </View>
      <ReportSummaryCards compact denseCentered currency={activeCurrency} cards={[{ label: report.unknown.length ? 'Known Expenses' : 'Net Expenses', value: netExpenses },
        { label: 'Previous Period', value: metric?.previous ?? null }, { label: 'Change', value: metric?.difference ?? null, detail: metric?.reason === 'incomplete_data' ? 'Incomplete data' : metric?.percentageChange !== null && metric?.percentageChange !== undefined ? `${metric.percentageChange.toFixed(1)}% vs previous` : metric?.reason === 'zero_baseline' ? 'Zero baseline' : metric?.reason === 'negative_baseline' ? 'Negative baseline' : metric?.difference === null ? 'Unsafe precision' : undefined }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="bodyStrong">Transactions ({transactions.length})</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="View all Expenses transactions" onPress={() => setTransactionsExpanded(value => !value)} accessibilityState={{ expanded: transactionsExpanded }} style={{ minHeight: 44, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}><AppText variant="caption" style={{ color: moduleColors.finance, fontWeight: '600' }}>{transactionsExpanded ? 'Show less' : 'View all'}</AppText><Ionicons name={transactionsExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={moduleColors.finance} /></Pressable>
      </View>
      {!visible.reconciled ? <AppText accessibilityRole="alert">Statement cannot be reconciled; details are hidden.</AppText>
        : <>{transactionsExpanded && <ReportTransactionRows compact rows={transactions} />}{!transactions.length && <AppText color="textSecondary">No verified expenses for this currency.</AppText>}</>}
      <ReportExportActions excelLabel="Excel XLSX" busy={exports.exporting} disabled={!exports.canExport} pdf={exports.exportPdf} excel={exports.exportExcel} share={exports.share} />
    </>}
  </Screen>;
}
