import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';

const REPORTS = [
  'Income', 'Expenses', 'Accounts', 'Assets',
  'Installments', 'Loans', 'Debts Receivable', 'Debts Payable',
] as const;

/** Reports navigation. Income, Expenses, Accounts and Assets are available; other reports and exports remain pending. */
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
        Income, Expenses, Accounts and Assets reports are available. Additional reports and exports are coming next.
      </AppText>
      {REPORTS.map((name) => (
        <Pressable key={name} disabled={name !== 'Income' && name !== 'Expenses' && name !== 'Accounts' && name !== 'Assets'}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name} report`}
          onPress={() => router.push((name === 'Expenses' ? '/finance/report-expenses' : name === 'Accounts' ? '/finance/report-accounts' : name === 'Assets' ? '/finance/report-assets' : '/finance/report-income') as Href)} style={{
          padding: spacing.md, marginBottom: spacing.sm, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <Ionicons name="bar-chart-outline" size={20} color={moduleColors.finance} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption" color="textSecondary">{name === 'Income' || name === 'Expenses' || name === 'Accounts' || name === 'Assets' ? 'View report' : 'Integration pending'}</AppText>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
