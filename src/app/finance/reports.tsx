import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';
import { REPORT_ITEMS } from '@/features/finance/components/reporting/ReportPrimitives';

const REPORTS = [
  'Income', 'Expenses', 'Accounts', 'Assets',
  'Installments', 'Loans', 'Debts Receivable', 'Debts Payable',
] as const;

/** Reports navigation. Income, Expenses, Accounts, Assets, Installments and Loans are available; exports and statements remain pending. */
export default function FinanceReportsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  return (
    <Screen scroll>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Finance"
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, minHeight: 44 }}>
        <Ionicons name="arrow-back" size={23} color={colors.text} />
        <AppText style={{ marginLeft: spacing.sm }}>Finance</AppText>
      </Pressable>
      <AppText variant="h1">Reports</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        Choose a report to explore your finances.
      </AppText>
      <View testID="reports-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm }}>
      {REPORTS.map((name) => (
        <Pressable key={name} disabled={name !== 'Income' && name !== 'Expenses' && name !== 'Accounts' && name !== 'Assets' && name !== 'Installments' && name !== 'Loans' && name !== 'Debts Receivable' && name !== 'Debts Payable'}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name} report`}
          onPress={() => router.push((name === 'Expenses' ? '/finance/report-expenses' : name === 'Accounts' ? '/finance/report-accounts' : name === 'Assets' ? '/finance/report-assets' : name === 'Installments' ? '/finance/report-installments' : name === 'Loans' ? '/finance/report-loans' : name === 'Debts Receivable' ? '/finance/report-receivable' : name === 'Debts Payable' ? '/finance/report-payable' : '/finance/report-income') as Href)} style={{
          width: '48%', padding: spacing.md, borderRadius: 12, gap: 8,
          borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          alignItems: 'center', justifyContent: 'center', minHeight: 108,
        }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
            <Ionicons name={REPORT_ITEMS.find(item => item.label === name.replace('Debts ', ''))?.icon ?? 'bar-chart-outline'} size={24} color={moduleColors.finance} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <AppText variant="bodyStrong" style={{ textAlign: 'center' }}>{name}</AppText>
            <AppText variant="caption" color="textSecondary">{name === 'Income' || name === 'Expenses' || name === 'Accounts' || name === 'Assets' || name === 'Installments' || name === 'Loans' || name === 'Debts Receivable' || name === 'Debts Payable' ? 'View report' : 'Integration pending'}</AppText>
          </View>
        </Pressable>
      ))}
      </View>
    </Screen>
  );
}
