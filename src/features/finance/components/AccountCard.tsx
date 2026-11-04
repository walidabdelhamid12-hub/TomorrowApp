import { Ionicons } from '@expo/vector-icons';
import { FinanceRecordCard } from './FinanceRecordCard';
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
  return <FinanceRecordCard icon={<Ionicons name={account.type === 'bank' ? 'business-outline' : account.type === 'credit_card' ? 'card-outline' : 'wallet-outline'} size={20} color={colors.primary} />}
    kind={ACCOUNT_TYPE_LABELS[account.type]} quantity={account.currencyCode} name={account.name}
    value={amountsVisible ? formatAmount(balance, account.currencyCode) + ' ' + account.currencyCode : '••••••'} negative={balance < 0}
    accessibilityLabel={'Details for ' + account.name} onPress={onPress} onEdit={onEdit} onDelete={onDelete} />;
}
