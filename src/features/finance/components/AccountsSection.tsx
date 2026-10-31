
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Account, AccountType } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { moduleColors, useTheme } from '@/theme';

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
  onDelete: (account: Account) => void;
  baseCurrency?: string;
  rates?: unknown;
}

export function AccountsSection({
  accounts,
  onEdit,
  onDelete,
}: AccountsSectionProps) {
  const { colors, spacing } = useTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const transfers = useLedgerStore((s) => s.transfers);

  // Use the same balance calculation as the Finance Summary.
  const balances = useMemo(() => {
    const map = new Map<string, number>();

    for (const account of accounts) {
      map.set(
        account.id,
        getAccountBalance(account, transactions, transfers)
      );
    }

    return map;
  }, [accounts, transactions, transfers]);

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
            const balance =
              balances.get(account.id) ?? account.initialBalance;
            const negative = balance < 0;

            return (
              <View
                key={account.id}
                style={[
                  styles.row,
                  { padding: spacing.md },
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={styles.flex}>
                  <AppText style={styles.name}>
                    {account.name}
                  </AppText>

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

                <View style={[styles.actions, { marginStart: spacing.sm }]}>
                  <Pressable
                    onPress={() => onEdit(account)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${account.name}`}
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="create-outline"
                      size={17}
                      color={moduleColors.finance}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => onDelete(account)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${account.name}`}
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={15}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontWeight: '600',
  },
  balance: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    padding: 2,
  },
});
