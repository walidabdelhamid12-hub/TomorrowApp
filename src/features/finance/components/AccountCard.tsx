import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { FinanceActionButtons } from './FinanceActionButtons';
import type { Account, AccountType } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { useTheme } from '@/theme';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash', bank: 'Bank', wallet: 'Wallet', savings: 'Savings', credit_card: 'Credit card',
};
export function AccountCard({ account, balance, amountsVisible = true, onPress, onEdit, onDelete }: {
  account: Account; balance: number; amountsVisible?: boolean; onPress: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { colors } = useTheme();
  const tone = colors.finance.account;
  return <Card variant="outlined" padded={false} style={{ padding: 8, borderRadius: 14, backgroundColor: tone.surface, borderColor: tone.border }}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Details for ' + account.name} onPress={onPress}
      style={({ pressed }) => [styles.content, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: colors.surface }]}>
        <Ionicons name={account.type === 'bank' ? 'business-outline' : account.type === 'credit_card' ? 'card-outline' : 'wallet-outline'} size={20} color={tone.accent} />
      </View>
      <View style={styles.name}>
        <AppText variant="bodyStrong">{account.name}</AppText>
        <AppText variant="caption" color={colors.finance.neutral.accent}>{ACCOUNT_TYPE_LABELS[account.type] + ' · ' + account.currencyCode}</AppText>
      </View>
      <AppText variant="bodyStrong" color={balance < 0 ? 'danger' : tone.accent} style={styles.balance}>
        {amountsVisible ? formatAmount(balance, account.currencyCode) + ' ' + account.currencyCode : '••••••'}
      </AppText>
    </Pressable>
    <FinanceActionButtons label={account.name} onEdit={onEdit} onDelete={onDelete} />
  </Card>;
}
const styles = StyleSheet.create({
  content: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0, gap: 2 },
  balance: { maxWidth: '45%', flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
