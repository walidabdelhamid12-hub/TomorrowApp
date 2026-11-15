import { StatementExportActions } from '@/features/finance/components/reporting/StatementExportActions';
import { buildReportTableXlsx } from '@/features/finance/utils/reportTableXlsx';
import { shareStatementXlsx } from '@/features/finance/utils/shareStatementXlsx';
import { StatementUnifiedChrome } from '@/features/finance/components/reporting/StatementUnifiedChrome';
import { StatementMobileRows } from '@/features/finance/components/reporting/StatementMobileRows';
import { reportRouteCurrency } from '@/features/finance/utils/reportRoutePeriod';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { shareStatementPdf } from '@/features/finance/utils/shareStatementPdf';
import { buildOperatingStatementPrintHtml } from '@/features/finance/utils/operatingStatementPrintHtml';
import { Alert, ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { buildIncomeStatement } from '@/features/finance/utils/incomeStatementReconciliation';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

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

/** Read-only ordinary-income statement. No ledger writes or posting. */
export default function IncomeStatementScreen() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{
    currencyCode?: string; from?: string; to?: string; accountId?: string; categoryId?: string;
  }>();
  const from = single(params.from);
  const to = single(params.to);
  const accountId = single(params.accountId);
  const categoryId = single(params.categoryId);
  const currencyCode = reportRouteCurrency(params.currencyCode);
  const valid = currencyCode !== null && validDate(from) && validDate(to) && from <= to
    && (params.accountId === undefined || (typeof params.accountId === 'string' && params.accountId.length > 0))
    && (params.categoryId === undefined || (typeof params.categoryId === 'string' && params.categoryId.length > 0))
    && (!accountId || !/[\s\u0000-\u001f\u007f]/u.test(accountId))
    && (!categoryId || !/[\s\u0000-\u001f\u007f]/u.test(categoryId));

  const ledgerReady = useLedgerHydrated();
  const financeReady = useFinanceHydrated();
  const accounts = useLedgerStore(s => s.accounts);
  const categories = useLedgerStore(s => s.categories);
  const transactions = useLedgerStore(s => s.transactions);
  const transfers = useLedgerStore(s => s.transfers);
  const assets = useFinanceStore(s => s.assets);
  const debts = useFinanceStore(s => s.debts);
  const loans = useFinanceStore(s => s.loans);
  const cheques = useFinanceStore(s => s.cheques);

  const statement = useMemo(() => {
    if (!valid || !ledgerReady || !financeReady || !from || !to) return null;
    const full = buildIncomeStatement(
      { ledger: { accounts, categories, transactions, transfers }, finance: { assets, debts, loans, cheques } },
      { from, to },
      { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) },
    );
    return !currencyCode ? full : { ...full, rows: full.rows.filter(row => row.currencyCode === currencyCode), report: { ...full.report, currencies: full.report.currencies.filter(row => row.currencyCode === currencyCode), incomeCategories: full.report.incomeCategories.filter(row => row.currencyCode === currencyCode) } };
  }, [currencyCode, valid, ledgerReady, financeReady, from, to, accountId, categoryId,
    accounts, categories, transactions, transfers, assets, debts, loans, cheques]);
  const exportExcel = async () => {
    if (exporting || !statement || !statement.reconciled || statement.report.unknown.length > 0 || !from || !to) return;
    setExporting(true);
    try {
      const rows = statement.rows.map(row => [row.date,
        categories.find(c => c.id === row.categoryId)?.name ?? 'Uncategorized',
        [row.note, accounts.find(a => a.id === row.accountId)?.name].filter(Boolean).join(' · '),
        row.currencyCode, row.amount] as const);
      const bytes = buildReportTableXlsx({ title: 'Income Statement', period: { from, to },
        columns: ['Date', 'Category', 'Description', 'Currency', 'Amount'], rows,
        numericColumns: [4], verified: true, notice: 'Verified ordinary income only.' });
      await shareStatementXlsx(bytes, { title: 'Income Statement', filePrefix: 'income-statement' });
    } catch (error) {
      Alert.alert('Excel export failed', error instanceof Error ? error.message : 'Unable to create Excel workbook.');
    } finally { setExporting(false); }
  };
  const exportPdf = async () => {
    if (exporting || !statement || !statement.reconciled || statement.report.unknown.length > 0 || !from || !to) return;
    setExporting(true);
    try {
      const html = buildOperatingStatementPrintHtml(statement, 'income', { from, to }, {
        accounts: new Map(accounts.map(account => [account.id, account.name])),
        categories: new Map(categories.map(category => [category.id, category.name])),
      });
      await shareStatementPdf(html);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to create PDF.');
    } finally {
      setExporting(false);
    }
  };
  return (
    <Screen scroll>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Income Report"
        onPress={() => router.back()}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <Ionicons name="arrow-back" size={23} color={colors.text} />
        <AppText style={{ marginLeft: spacing.sm }}>Income Report</AppText>
      </Pressable>
      {!valid ? (
        <AppText color="textSecondary" style={{ marginTop: spacing.md }}>
          Invalid or missing statement filters. Return to the Income Report.
        </AppText>
      ) : !ledgerReady || !financeReady || !statement ? (
        <ActivityIndicator color={moduleColors.finance} />
      ) : (
        <View style={{ marginTop: spacing.md }}>
          <StatementUnifiedChrome kind="Income" from={from!} to={to!}
            account={accountId ? accounts.find(a => a.id === accountId)?.name ?? 'Unknown account' : 'All accounts'}
            category={categoryId ? categories.find(c => c.id === categoryId)?.name ?? 'Unknown category' : 'All income categories'}
            currency={currencyCode || undefined}
            totals={statement.report.currencies.map(total => ({ currencyCode: total.currencyCode, amount: formatAmount(total.income, total.currencyCode) }))} />
          {statement.report.unknown.length > 0 && (
            <AppText style={{ color: '#D97706', marginTop: spacing.md }}>
              Incomplete: {statement.report.unknown.length} unverified transaction(s).
              Totals represent known income only.
            </AppText>
          )}
          {!statement.reconciled ? (
            <AppText style={{ color: '#D97706', marginTop: spacing.md }}>
              Statement cannot be reconciled with the report. Transaction details are hidden to avoid misleading totals.
            </AppText>
          ) : (
            <>
              <AppText variant="bodyStrong" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Transactions ({statement.rows.length})</AppText>
              {statement.rows.length === 0 && (
                <AppText color="textSecondary" style={{ marginTop: spacing.sm }}>
                  No income transactions for this period.
                </AppText>
              )}
              <StatementMobileRows rows={statement.rows.map(row => ({
                id: row.id,
                date: row.date,
                category: categories.find(c => c.id === row.categoryId)?.name ?? 'Uncategorized',
                description: [row.note, accounts.find(a => a.id === row.accountId)?.name].filter(Boolean).join(' · '),
                amount: formatAmount(row.amount, row.currencyCode),
                categoryIcon: categories.find(c => c.id === row.categoryId)?.icon as keyof typeof Ionicons.glyphMap | undefined,
                categoryColor: categories.find(c => c.id === row.categoryId)?.color,
                currencyCode: row.currencyCode,
              }))} />
            </>
          )}
          <StatementExportActions busy={exporting}
            disabled={!statement.reconciled || statement.report.unknown.length > 0}
            pdf={exportPdf}
            excel={exportExcel}
            share={() => Alert.alert('Share Income Statement', 'Choose a format', [
              { text: 'PDF', onPress: () => { void exportPdf(); } },
              { text: 'Excel XLSX', onPress: () => { void exportExcel(); } },
              { text: 'Cancel', style: 'cancel' },
            ])} />
        </View>
      )}
    </Screen>
  );
}
