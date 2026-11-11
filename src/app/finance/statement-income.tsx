import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
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
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{
    from?: string; to?: string; accountId?: string; categoryId?: string;
  }>();
  const from = single(params.from);
  const to = single(params.to);
  const accountId = single(params.accountId);
  const categoryId = single(params.categoryId);
  const valid = validDate(from) && validDate(to) && from <= to
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
    return buildIncomeStatement(
      { ledger: { accounts, categories, transactions, transfers }, finance: { assets, debts, loans, cheques } },
      { from, to },
      { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) },
    );
  }, [valid, ledgerReady, financeReady, from, to, accountId, categoryId,
    accounts, categories, transactions, transfers, assets, debts, loans, cheques]);
  return (
    <Screen scroll>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Income Report"
        onPress={() => router.back()}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
        <Ionicons name="arrow-back" size={23} color={colors.text} />
        <AppText style={{ marginLeft: spacing.sm }}>Income Report</AppText>
      </Pressable>
      <AppText variant="h1">Income Statement</AppText>
      {!valid ? (
        <AppText color="textSecondary" style={{ marginTop: spacing.md }}>
          Invalid or missing statement filters. Return to the Income Report.
        </AppText>
      ) : !ledgerReady || !financeReady || !statement ? (
        <ActivityIndicator color={moduleColors.finance} />
      ) : (
        <View style={{ marginTop: spacing.md }}>
          <AppText color="textSecondary">{from} to {to}</AppText>
          <AppText color="textSecondary">
            Account: {accountId ? accounts.find(a => a.id === accountId)?.name ?? 'Unknown account' : 'All accounts'}
          </AppText>
          <AppText color="textSecondary">
            Category: {categoryId ? categories.find(c => c.id === categoryId)?.name ?? 'Unknown category' : 'All income categories'}
          </AppText>
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
              <AppText variant="h3" style={{ marginTop: spacing.lg }}>Income by currency</AppText>
              {statement.report.currencies.filter(c => c.income !== 0).map(total => (
                <View key={total.currencyCode} style={{
                  flexDirection: 'row', justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                }}>
                  <AppText>{total.currencyCode}</AppText>
                  <AppText variant="bodyStrong">{formatAmount(total.income, total.currencyCode)}</AppText>
                </View>
              ))}
              <AppText variant="h3" style={{ marginTop: spacing.lg }}>Transactions ({statement.rows.length})</AppText>
              {statement.rows.length === 0 && (
                <AppText color="textSecondary" style={{ marginTop: spacing.sm }}>
                  No verified ordinary income for this selection.
                </AppText>
              )}
              {statement.rows.map(row => (
                <View key={row.id} style={{
                  borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
                  borderRadius: 12, padding: spacing.md, marginTop: spacing.sm,
                }}>
                  <AppText variant="bodyStrong">
                    {categories.find(c => c.id === row.categoryId)?.name ?? 'Uncategorized'}
                  </AppText>
                  <AppText color="textSecondary">{row.date} · {accounts.find(a => a.id === row.accountId)?.name ?? 'Unknown account'}</AppText>
                  {!!row.note && <AppText color="textSecondary">{row.note}</AppText>}
                  <AppText variant="bodyStrong" style={{ color: moduleColors.finance, marginTop: spacing.xs }}>
                    +{formatAmount(row.amount, row.currencyCode)} {row.currencyCode}
                  </AppText>
                </View>
              ))}
            </>
          )}
          <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.lg }}>
            Read-only statement. PDF and Excel exports are pending.
          </AppText>
        </View>
      )}
    </Screen>
  );
}