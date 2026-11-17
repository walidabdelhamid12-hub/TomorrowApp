import { financeChrome } from '@/features/finance/components/financeChrome';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { useMonthlyFinanceSummary } from '@/features/finance/hooks/useMonthlyFinanceSummary';
import { AddTransactionModal } from '@/features/finance/components/AddTransactionModal';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

type EntryKind = 'income' | 'expense';
interface IncomeExpensesScreenProps { kind: EntryKind; }

export function IncomeExpensesScreen({ kind }: IncomeExpensesScreenProps) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const ready = useLedgerHydrated();
  const transactions = useLedgerStore((state) => state.transactions);
  const categories = useLedgerStore((state) => state.categories);
  const accounts = useLedgerStore((state) => state.accounts);
  const [addOpen, setAddOpen] = useState(false);
  const isIncome = kind === 'income';
  const accent = isIncome ? '#209B70' : '#D65353';
  const rows = transactions.filter((item) => item.type === kind)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const summary = useMonthlyFinanceSummary();
  const total = isIncome ? summary.income : summary.expense;

  if (!ready) return <Screen><View style={styles.center}><ActivityIndicator color={moduleColors.finance} /></View></Screen>;

  return (
    <Screen scroll style={{ backgroundColor: '#F1F5F9' }}>
      <View style={financeChrome.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={financeChrome.back}>
          <Ionicons name="arrow-back" size={21} color="#D6B777" />
        </Pressable>
        <View style={styles.flex}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{isIncome ? 'Income' : 'Expenses'}</AppText>
          <AppText variant="caption" style={{ color: '#CBD5E1' }}>{rows.length} transactions</AppText>
        </View>
      </View>
      <Card>
        <AppText color="textSecondary">{summary.missing > 0 ? 'Partial total' : 'Total'} {isIncome ? 'income' : 'expenses'} · This month ({summary.monthKey})</AppText>
        <AppText variant="h1" style={{ color: accent }}>{formatAmount(total, summary.baseCurrency)} {summary.baseCurrency}</AppText>
        <AppText variant="caption" color="textSecondary">Monthly total converted to {summary.baseCurrency} using verified exchange rates. Transactions below show original currencies across all dates.</AppText>
        {summary.missing > 0 ? <AppText color="textSecondary">Monthly total incomplete: {summary.missing} transaction(s) could not be converted. Check verified exchange rates.</AppText> : null}
      </Card>
      <View style={styles.sectionHeader}>
        <AppText variant="h3">Transactions</AppText>
        <Pressable onPress={() => setAddOpen(true)} accessibilityRole="button" accessibilityLabel={isIncome ? 'Add income' : 'Add expense'} style={[styles.addButton, { backgroundColor: '#1E293B' }]}>
          <Ionicons name="add" size={19} color="#FFFFFF" />
          <AppText style={styles.addText}>Add</AppText>
        </Pressable>
      </View>
      {rows.length === 0 ? <Card variant="filled"><AppText color="textSecondary" align="center">No {kind} transactions yet.</AppText></Card> : (
        <Card padded={false}>
          {rows.map((item, index) => {
            const category = categories.find((entry) => entry.id === item.categoryId);
            const account = accounts.find((entry) => entry.id === item.accountId);
            return (
              <View key={item.id} style={[styles.row, { padding: spacing.md }, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={[styles.icon, { backgroundColor: isIncome ? '#E7F5EF' : '#FBECEC' }]}>
                  <Ionicons name={isIncome ? 'arrow-down-outline' : 'arrow-up-outline'} size={19} color={accent} />
                </View>
                <View style={styles.flex}>
                  <AppText style={styles.name}>{category?.name ?? 'Uncategorized'}</AppText>
                  <AppText variant="caption" color="textSecondary">{item.date} · {account?.name ?? 'Account unavailable'}</AppText>
                  {item.note ? <AppText variant="caption" color="textSecondary">{item.note}</AppText> : null}
                </View>
                <AppText style={{ color: accent, fontWeight: '700', flexShrink: 1 }}>{formatAmount(item.amount)} {item.currencyCode}</AppText>
              </View>
            );
          })}
        </Card>
      )}
      <AddTransactionModal visible={addOpen} transaction={null} onClose={() => setAddOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, backgroundColor: '#1E293B', borderRadius: 20, padding: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#D6B777', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  addText: { color: '#FFFFFF', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '600' },
});
