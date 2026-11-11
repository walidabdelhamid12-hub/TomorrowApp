import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { aggregateOperatingReport } from '@/features/finance/utils/reportAggregation';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

function currentMonth(): { from: string; to: string; label: string } {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

/** Read-only Income report. Current month only; other filters will be added separately. */
export default function IncomeReportScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
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
  const [period] = useState(currentMonth);
  const report = useMemo(() => {
    if (!ledgerReady || !financeReady) return null;
    return aggregateOperatingReport(
      { ledger: { accounts, categories, transactions, transfers }, finance: { assets, debts, loans, cheques } },
      { from: period.from, to: period.to },
    );
  }, [ledgerReady, financeReady, accounts, categories, transactions, transfers, assets, debts, loans, cheques, period]);

  return (
    <Screen scroll>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Reports"
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: spacing.md }}>
        <Ionicons name="arrow-back" size={23} color={colors.text} />
        <AppText style={{ marginLeft: spacing.sm }}>Reports</AppText>
      </Pressable>
      <AppText variant="h1">Income Report</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
        {period.label} Â· {period.from} to {period.to}
      </AppText>
      {!ledgerReady || !financeReady || !report ? (
        <ActivityIndicator color={moduleColors.finance} />
      ) : (
        <>
          <AppText variant="h3">Income by currency</AppText>
          <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
            Ordinary income only. Loans, transfers and debt collections are excluded. Currencies are never combined.
          </AppText>
          {report.currencies.length === 0 ? (
            <AppText color="textSecondary">No verified ordinary income transactions for this period.</AppText>
          ) : report.currencies.map(item => (
            <View key={item.currencyCode} style={{
              backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
              borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <AppText variant="bodyStrong">{item.currencyCode}</AppText>
              <AppText variant="bodyStrong" style={{ color: moduleColors.finance }}>
                {formatAmount(item.income, item.currencyCode)}
              </AppText>
            </View>
          ))}
          {report.unknown.length > 0 && (
            <View style={{ borderWidth: 1, borderColor: '#D97706', borderRadius: 12,
              padding: spacing.md, marginTop: spacing.md }}>
              <AppText style={{ color: '#D97706', fontWeight: '700' }}>Incomplete report</AppText>
              <AppText color="textSecondary">
                {report.unknown.length} transaction(s) could not be classified or verified. Shown figures are known subtotals, not complete income totals.
              </AppText>
            </View>
          )}
          <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.lg }}>
            Period selection, category insights, charts, View Statement and exports are pending.
          </AppText>
        </>
      )}
    </Screen>
  );
}
