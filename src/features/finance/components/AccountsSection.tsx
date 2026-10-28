import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Account, AccountType } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { useTheme } from '@/theme';

const TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  wallet: 'Wallet',
  savings: 'Savings',
  credit_card: 'Credit card',
};

interface AccountsSectionProps {
  accounts: readonly Account[];
  onEdit: (account: Account) => void;
  // Accepted for compatibility with the screen; balances are shown in each account's own currency.
  baseCurrency?: string;
  rates?: unknown;
}

export function AccountsSection({ accounts, onEdit }: AccountsSectionProps) {
  const { spacing } = useTheme();
  const transactions = useLedgerStore((s) => s.transactions);

  // Balance = starting balance + income - expense (computed at display time).
  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of accounts) map.set(account.id, account.initialBalance);
    for (const tx of transactions) {
      const current = map.get(tx.accountId);
      if (current === undefined) continue;
      map.set(tx.accountId, current + (tx.type === 'income' ? tx.amount : -tx.amount));
    }
    return map;
  }, [accounts, transactions]);

  return (
    <>
      <AppText
        variant="h3"
        style={{ marginTop: spacing.xl, marginBottom: spacing.md }}
      >
        Accounts
      </AppText>

      {accounts.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No accounts yet. Tap "Account" to add one.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {accounts.map((account, index) => {
            const balance = balances.get(account.id) ?? account.initialBalance;
            const negative = balance < 0;
            return (
              <Pressable
                key={account.id}
                onPress={() => onEdit(account)}
                style={[
                  styles.row,
                  { padding: spacing.md },
                  index > 0 && styles.divider,
                ]}
              >
                <View style={styles.flex}>
                  <AppText style={styles.name}>{account.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {`${TYPE_LABELS[account.type]} · ${account.currencyCode}`}
                  </AppText>
                </View>
                <AppText
                  {...(negative ? ({ color: 'danger' } as const) : {})}
                  style={styles.balance}
                >
                  {`${formatAmount(balance)} ${account.currencyCode}`}
                </AppText>
              </Pressable>
            );
          })}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },
  name: { fontWeight: '600' },
  balance: { fontWeight: '600' },
});