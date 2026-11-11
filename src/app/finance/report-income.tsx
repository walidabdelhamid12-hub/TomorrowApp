import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { aggregateOperatingReport } from '@/features/finance/utils/reportAggregation';
import { aggregateMonthlyOperatingComparison } from '@/features/finance/utils/reportMonthlyComparison';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  const nextYear = date.getFullYear();
  const nextMonth = date.getMonth() + 1;
  if (nextYear < 100 || nextYear > 9999 ||
      (nextYear === 100 && nextMonth < 2)) {
    return month;
  }
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function monthPeriod(month: string): { from: string; to: string; label: string } {
  const [year, number] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`;
  const label = new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return { from, to, label };
}

function FilterPicker({ title, value, options, onSelect, colors }: {
  title: string;
  value: string;
  options: { id: string; label: string }[];
  onSelect: (value: string) => void;
  colors: { surface: string; border: string; text: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = options.find(option => option.id === value);
  return (
    <View style={{ marginBottom: 10 }}>
      <AppText color="textSecondary">{title}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${selected?.label ?? 'All'}`}
        onPress={() => setExpanded(!expanded)}
        style={{ minHeight: 44, padding: 12, borderWidth: 1, borderColor: colors.border,
          borderRadius: 10, backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText>{selected?.label ?? 'All'}</AppText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
      </Pressable>
      {expanded && options.map(option => (
        <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: option.id === value }}
          onPress={() => { onSelect(option.id); setExpanded(false); }}
          style={{ minHeight: 44, padding: 12, borderBottomWidth: 1, borderColor: colors.border,
            flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText>{option.label}</AppText>
          {option.id === value && <Ionicons name="checkmark" size={18} color={colors.text} />}
        </Pressable>
      ))}
    </View>
  );
}

function currentMonth(): { from: string; to: string; label: string } {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to, label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

/** Read-only Income report with month, account and category filters. */
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
  const [month, setMonth] = useState(() => currentMonth().from.slice(0, 7));
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const period = useMemo(() => monthPeriod(month), [month]);
  const filtersActive = accountId !== '' || categoryId !== '';
  const accountOptions = useMemo(() => [
    { id: '', label: 'All accounts' },
    ...accounts.map(account => ({ id: account.id, label: `${account.name} (${account.currencyCode})${account.archived ? ' - Archived' : ''}` })),
  ], [accounts]);
  const categoryOptions = useMemo(() => [
    { id: '', label: 'All income categories' },
    ...categories.filter(category => category.kind === 'income').map(category => ({ id: category.id, label: category.name })),
  ], [categories]);
  const report = useMemo(() => {
    if (!ledgerReady || !financeReady) return null;
    return aggregateOperatingReport(
      { ledger: { accounts, categories, transactions, transfers }, finance: { assets, debts, loans, cheques } },
      { from: period.from, to: period.to },
      { ...(accountId ? { accountId } : {}), ...(categoryId ? { categoryId } : {}) },
    );
  }, [ledgerReady, financeReady, accounts, categories, transactions, transfers, assets, debts, loans, cheques, period, accountId, categoryId]);

  const comparison = useMemo(() => {
    if (!ledgerReady || !financeReady || filtersActive) return null;
    return aggregateMonthlyOperatingComparison(
      { ledger: { accounts, categories, transactions, transfers }, finance: { assets, debts, loans, cheques } },
      period.from.slice(0, 7),
    );
  }, [ledgerReady, financeReady, accounts, categories, transactions, transfers, assets, debts, loans, cheques, period, filtersActive]);
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
        {period.label} | {period.from} to {period.to}
      </AppText>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="h3">Filters</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month"
            onPress={() => setMonth(value => shiftMonth(value, -1))}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <AppText variant="bodyStrong">{period.label}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month"
            onPress={() => setMonth(value => shiftMonth(value, 1))}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>
        <FilterPicker title="Account" value={accountId} options={accountOptions} onSelect={setAccountId} colors={colors} />
        <FilterPicker title="Income category" value={categoryId} options={categoryOptions} onSelect={setCategoryId} colors={colors} />
      </View>
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
          <AppText variant="h3" style={{ marginTop: spacing.lg }}>Income by Category</AppText>
          <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
            Income categories are grouped by account currency. Figures reflect the selected filters.
          </AppText>
          {report.incomeCategories.length === 0 ? (
            <AppText color="textSecondary">No classified income categories for this selection.</AppText>
          ) : (
            [...new Set(report.incomeCategories.map(item => item.currencyCode))]
              .sort()
              .map(currencyCode => {
                const rows = report.incomeCategories
                  .filter(item => item.currencyCode === currencyCode)
                  .sort((a, b) => b.amount - a.amount || a.categoryId.localeCompare(b.categoryId));
                const top = rows.find(item => item.amount > 0);
                return (
                  <View key={currencyCode} style={{
                    backgroundColor: colors.surface, borderColor: colors.border,
                    borderWidth: 1, borderRadius: 12, padding: spacing.md,
                    marginBottom: spacing.sm,
                  }}>
                    <AppText variant="bodyStrong" style={{ marginBottom: spacing.sm }}>
                      {currencyCode}
                    </AppText>
                    {top && (
                      <AppText color="textSecondary" style={{ marginBottom: spacing.sm }}>
                        Top category: {categories.find(category => category.id === top.categoryId)?.name
                          ?? (top.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category')}
                      </AppText>
                    )}
                    {rows.map(item => (
                      <View key={item.categoryId} style={{
                        flexDirection: 'row', justifyContent: 'space-between',
                        alignItems: 'center', marginBottom: spacing.sm,
                      }}>
                        <View style={{ flex: 1, marginRight: spacing.sm }}>
                          <AppText>
                            {categories.find(category => category.id === item.categoryId)?.name
                              ?? (item.categoryId === 'uncategorized' ? 'Uncategorized' : 'Unknown category')}
                          </AppText>
                        </View>
                        <AppText variant="bodyStrong">
                          {formatAmount(item.amount, currencyCode)}
                        </AppText>
                      </View>
                    ))}
                  </View>
                );
              })
          )}
          {report.unknown.length > 0 && (
            <AppText color="textSecondary">
              Category figures are known subtotals only; unverified transactions are excluded.
            </AppText>
          )}
          <AppText variant="h3" style={{ marginTop: spacing.lg }}>Compared with previous month</AppText>
          {filtersActive && <AppText color="textSecondary">Comparison is shown for all accounts and categories only. Clear the filters to see it.</AppText>}
          {!filtersActive && (
            <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
              Ordinary income by account currency. Change is current month minus previous month.
            </AppText>
          )}
          {comparison?.currencies.length === 0 && (
            <AppText color="textSecondary">No account currencies available for comparison.</AppText>
          )}
          {comparison?.currencies.map(row => {
            const metric = row.income;
            const incomplete = row.currentStatus === 'incomplete' || row.previousStatus === 'incomplete';
            return (
              <View key={row.currencyCode} style={{
                backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
                borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm,
              }}>
                <AppText variant="bodyStrong">{row.currencyCode}</AppText>
                <AppText color="textSecondary">Previous: {metric.previous === null ? 'Unavailable' : formatAmount(metric.previous, row.currencyCode)}</AppText>
                <AppText color="textSecondary">Current: {metric.current === null ? 'Unavailable' : formatAmount(metric.current, row.currencyCode)}</AppText>
                <AppText variant="bodyStrong">
                  Change: {metric.difference === null ? 'Unavailable' : formatAmount(metric.difference, row.currencyCode)}
                </AppText>
                {metric.percentageChange !== null && Number.isFinite(metric.percentageChange) && (
                  <AppText color="textSecondary">{metric.percentageChange.toFixed(1)}% vs previous month</AppText>
                )}
                {incomplete && (
                  <AppText color="textSecondary">Incomplete data: comparison unavailable, not zero.</AppText>
                )}
                {!incomplete && metric.reason === 'zero_baseline' && (
                  <AppText color="textSecondary">Percentage unavailable: previous month was zero.</AppText>
                )}
                {!incomplete && metric.reason === 'negative_baseline' && (
                  <AppText color="textSecondary">Percentage unavailable: negative baseline.</AppText>
                )}
                {!incomplete && (metric.reason === 'unsafe_amount' || metric.reason === 'unsafe_difference') && (
                  <AppText color="textSecondary">Comparison unavailable: unsafe monetary precision.</AppText>
                )}
              </View>
            );
          })}
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
            Charts, View Statement and exports are pending.
          </AppText>
        </>
      )}
    </Screen>
  );
}
