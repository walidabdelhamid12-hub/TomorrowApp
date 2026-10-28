import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { useTheme } from '@/theme';

interface TotalCardProps {
  baseCurrency: string;
  total: number;
  accountsTotal: number;
  assetsTotal: number;
  /** Items that couldn't be converted (a count or a list, depending on the summary hook). */
  missing?: unknown;
  income: number;
  expense: number;
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') return value;
  return value ? 1 : 0;
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText style={styles.statValue}>{value}</AppText>
    </View>
  );
}

export function TotalCard({
  baseCurrency,
  total,
  accountsTotal,
  assetsTotal,
  missing,
  income,
  expense,
}: TotalCardProps) {
  const { spacing } = useTheme();
  const missingCount = countOf(missing);
  const money = (n: number) => `${formatAmount(n)} ${baseCurrency}`;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Card>
        <AppText variant="caption" color="textSecondary">
          TOTAL BALANCE
        </AppText>
        <AppText variant="h1" style={{ marginTop: spacing.xs }}>
          {money(total)}
        </AppText>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat label="Accounts" value={money(accountsTotal)} />
          <Stat label="Assets" value={money(assetsTotal)} />
        </View>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat label="Income" value={`+${money(income)}`} />
          <Stat label="Expense" value={`-${money(Math.abs(expense))}`} />
        </View>

        {missingCount > 0 ? (
          <AppText
            variant="caption"
            color="danger"
            style={{ marginTop: spacing.md }}
          >
            {`${missingCount} item(s) could not be converted to ${baseCurrency}. Check Rates.`}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  stat: { flex: 1 },
  statValue: { fontWeight: '600', marginTop: 2 },
});