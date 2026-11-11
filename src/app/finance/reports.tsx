import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';

const REPORTS = [
  'Income', 'Expenses', 'Accounts', 'Assets',
  'Installments', 'Loans', 'Debts Receivable', 'Debts Payable',
] as const;

/** Navigation shell only. Data, filters, statements and exports are not wired yet. */
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
        Report navigation is ready. Financial figures, charts, statements and exports will be connected in the next steps.
      </AppText>
      {REPORTS.map((name) => (
        <Pressable key={name} disabled={name !== 'Income'}
          accessibilityRole="button"
          accessibilityLabel={`Open ${name} report`}
          onPress={() => router.push('/finance/report-income' as Href)} style={{
          padding: spacing.md, marginBottom: spacing.sm, borderRadius: 12,
          borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <Ionicons name="bar-chart-outline" size={20} color={moduleColors.finance} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <AppText variant="bodyStrong">{name}</AppText>
            <AppText variant="caption" color="textSecondary">{name === 'Income' ? 'View report' : 'Integration pending'}</AppText>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
