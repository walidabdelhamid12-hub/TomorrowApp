import { StatementExportActions } from '@/features/finance/components/reporting/StatementExportActions';
import { StatementUnifiedChrome } from '@/features/finance/components/reporting/StatementUnifiedChrome';
import { StatementMobileRows } from '@/features/finance/components/reporting/StatementMobileRows';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { moduleColors } from '@/theme';
import { useExpenseLedger } from '@/features/finance/hooks/useExpenseLedger';
import { useExpenseExports } from '@/features/finance/hooks/useExpenseExports';
import { buildExpensesStatement } from '@/features/finance/utils/expensesStatementReconciliation';
import { selectExpenseCurrency } from '@/features/finance/utils/expenseReportPresentation';
import { isSupportedCurrency } from '@/features/finance/constants/currencies';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { ReportHeader, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

/** Read-only filtered Expenses Statement. */
export default function ExpensesStatementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; to?: string; accountId?: string; categoryId?: string; currencyCode?: string }>();
  const from = single(params.from);
  const to = single(params.to);
  const accountId = single(params.accountId);
  const categoryId = single(params.categoryId);
  const currencyCode = single(params.currencyCode);
  const valid = validDate(from) && validDate(to) && from <= to
    && (params.accountId === undefined || (typeof params.accountId === 'string' && params.accountId.length > 0))
    && (params.categoryId === undefined || (typeof params.categoryId === 'string' && params.categoryId.length > 0))
    && (params.currencyCode === undefined || (typeof params.currencyCode === 'string' && /^[A-Z]{3}$/.test(params.currencyCode) && isSupportedCurrency(params.currencyCode)))
    && (!accountId || !/[\s\u0000-\u001f\u007f]/u.test(accountId))
    && (!categoryId || !/[\s\u0000-\u001f\u007f]/u.test(categoryId));

  const ledgerReady = useExpenseLedger();
  const { ready, context, accounts, categories } = ledgerReady;
  const statement = useMemo(() => {
    if (!valid || !ready || !from || !to) return null;
    const result = buildExpensesStatement(context, { from, to },
      { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) });
    return selectExpenseCurrency(result, currencyCode ?? '');
  }, [valid, ready, context, from, to, accountId, categoryId, currencyCode]);
  const names = useMemo(() => ({ accounts: new Map(accounts.map(account => [account.id, account.name])),
    categories: new Map(categories.map(category => [category.id, category.name])) }), [accounts, categories]);
  const exports = useExpenseExports(statement, { from: from ?? '', to: to ?? '' }, names);
  const rows = statement?.reconciled ? statement.rows.map(row => ({ id: row.id, date: row.date,
    category: names.categories.get(row.categoryId) ?? (row.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category'),
    description: [row.note, names.accounts.get(row.accountId)].filter(Boolean).join(' · '), amount: row.amount, currency: row.currencyCode, categoryIcon: categories.find(c => c.id === row.categoryId)?.icon as keyof typeof Ionicons.glyphMap | undefined, categoryColor: categories.find(c => c.id === row.categoryId)?.color })) : [];
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Expenses Report" onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}><AppText>‹ Expenses Report</AppText></Pressable>

    {!valid ? <AppText accessibilityRole="alert">Invalid or missing statement filters. Return to the Expenses Report.</AppText>
      : !ready || !statement ? <ActivityIndicator color={moduleColors.finance} /> : <View>
        <StatementUnifiedChrome kind="Expenses" from={from!} to={to!}
          account={accountId ? names.accounts.get(accountId) ?? 'Unknown account' : 'All accounts'}
          category={categoryId ? names.categories.get(categoryId) ?? 'Unknown category' : 'All expense categories'} currency={currencyCode}
          totals={statement.report.currencies.map(total => ({ currencyCode: total.currencyCode, amount: formatAmount(total.expenses, total.currencyCode) }))} />
        {statement.report.unknown.length > 0 && <AppText accessibilityRole="alert">Incomplete: {statement.report.unknown.length} unverified transaction(s). Known expenses only; exports unavailable.</AppText>}
        {!statement.reconciled ? <AppText accessibilityRole="alert">Statement cannot be reconciled. Transaction details are hidden.</AppText>
          : <><StatementMobileRows rows={rows.map(row => ({ ...row, amount: formatAmount(row.amount, row.currency), currencyCode: row.currency }))} />{!rows.length && <AppText>No verified ordinary expenses for this selection.</AppText>}</>}
        <StatementExportActions busy={exports.exporting} disabled={!exports.canExport} pdf={exports.exportPdf} excel={exports.exportExcel} share={exports.share} />
      </View>}
  </Screen>;
}
