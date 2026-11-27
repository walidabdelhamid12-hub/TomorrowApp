import { useAppLanguage } from '@/localization/LanguageProvider';
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
import { useReportPeriod, ReportDetails } from '@/features/finance/components/reporting/ReportLayout';
import { ReportPicker, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';
import { ReportDashboardHeader, ReportDashboardDates, ReportDashboardMetrics } from '@/features/finance/components/reporting/ReportDashboardChrome';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';

/** Ordinary income only. All displayed rows come from the reconciled statement. */
export default function IncomeReportScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
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
  const transactionBase = selectedRows.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  return <View style={{ flex: 1 }}><Screen scroll contentContainerStyle={{ paddingBottom: 20 }}>
    <ReportDashboardHeader kind="income" />
    <ReportDashboardDates period={period} onChange={setPeriod} />
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <ReportPicker label={t("Account", "الحساب")} value={accountId} onSelect={setAccountId} options={[{ id: '', label: t('All accounts', 'كل الحسابات') }, ...accounts.map(account => ({ id: account.id, label: account.name + ' ' + currencyLabel(account.currencyCode) + (account.archived ? ' · ' + t('Archived', 'مؤرشف') : '') }))]} />
      <ReportPicker label={t("Category", "التصنيف")} value={categoryId} onSelect={setCategoryId} options={[{ id: '', label: t('All Categories', 'كل التصنيفات') }, ...categories.filter(category => category.kind === 'income').map(category => ({ id: category.id, label: category.name, icon: category.icon as keyof typeof Ionicons.glyphMap, color: category.color }))]} />
    </View>
    {!ready || !statement || !report ? <ActivityIndicator color={moduleColors.finance} /> : <>
      {!!report.unknown.length && <AppText accessibilityRole="alert">{t('Incomplete report', 'تقرير غير مكتمل')} · {report.unknown.length} {t('unverified transaction(s). Known subtotals only; exports unavailable.', 'معاملة غير مؤكدة. الإجماليات المعروفة فقط متاحة؛ التصدير غير متاح.')}</AppText>}
      {!currencies.length && <AppText>{t("No verified ordinary income transactions for this period.", "لا توجد معاملات دخل عادية متحقق منها لهذه الفترة.")}</AppText>}

      <ReportDashboardMetrics kind="income" total={current?.income ?? 0} currency={activeCurrency}
        transactionCount={selectedRows.length} currencyCount={currencies.length} incomplete={report.unknown.length > 0} />
      <ReportChart title={t("Income Analysis", "تحليل الدخل")} currencies={currencies.map(item => item.currencyCode)} onCurrencySelect={setCurrency} currency={activeCurrency} description={t("Positive ordinary income categories only.", "تصنيفات الدخل العادي الموجبة فقط.")} empty={t("No positive income to chart.", "لا توجد مبالغ دخل موجبة لعرضها.")} data={report.incomeCategories.filter(item => item.currencyCode === activeCurrency).map(item => { const category = categories.find(category => category.id === item.categoryId); return { id: item.categoryId, label: category?.name ?? 'Uncategorized', amount: item.amount, color: category?.color }; })} />
      {!statement.reconciled ? <AppText accessibilityRole="alert">{t("Statement cannot be reconciled; details are hidden.", "تعذرت مطابقة كشف الحساب؛ التفاصيل مخفية.")}</AppText> : <ReportDetails title={`${t('Transactions', 'المعاملات')} (${selectedRows.length})`}><ReportTransactionRows rows={selectedRows.map(row => { const category = categories.find(category => category.id === row.categoryId); return { id: row.id, date: row.date, category: category?.name ?? 'Uncategorized', categoryIcon: category?.icon as keyof typeof Ionicons.glyphMap | undefined, categoryColor: category?.color, description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '), amount: row.amount, currency: row.currencyCode, percent: transactionBase > 0 ? Math.abs(row.amount) / transactionBase * 100 : null }; })} /></ReportDetails>}
    </>}
  </Screen>
  {ready && statement && report && <ReportTableActions
    statement={() => router.push({ pathname: '/finance/statement-income', params: { from: period.from, to: period.to, ...filters, currencyCode: activeCurrency } })}
    table={{ title: t('Income Report', 'تقرير الدخل'), period, notice: t('Ordinary income only. Selected account, category and currency; previous-period comparison is not a posted balance.', 'الدخل العادي فقط. وفق الحساب والتصنيف والعملة المختارة؛ المقارنة بالفترة السابقة ليست رصيدًا مُرحّلًا.'), verified: exportSafe, columns: [t('Date', 'التاريخ'), t('Account', 'الحساب'), t('Category', 'التصنيف'), t('Description', 'الوصف'), t('Amount', 'المبلغ'), t('Currency', 'العملة')], rows: exportRows.map(row => [row.date, row.account, row.category, row.note ?? '', Number(row.amount), row.currency]) }} />}
  </View>;
}
