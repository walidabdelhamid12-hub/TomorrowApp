import { AccountDetails } from '@/features/finance/components/AccountDetails';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card } from '@/components/ui';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Account, AccountType } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { useTheme } from '@/theme';

const PREVIEW_COUNT = 1;

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
  amountsVisible: boolean;
}

export function AccountsSection({
  accounts,
  onEdit,
  onDelete,
  amountsVisible,
}: AccountsSectionProps) {
  const { colors, spacing } = useTheme();
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const transactions = useLedgerStore((s) => s.transactions);
  const transfers = useLedgerStore((s) => s.transfers);

  const balances = useMemo(() => {
    const map = new Map<string, number>();

    for (const account of accounts) {
      map.set(
        account.id,
        getAccountBalance(account, transactions, transfers),
      );
    }

    return map;
  }, [accounts, transactions, transfers]);

  const visibleAccounts = showAll
    ? accounts
    : accounts.slice(0, PREVIEW_COUNT);

  return (
    <View style={{ marginTop: spacing.xl }}>
      <AccountDetails accountId={detailAccountId} onClose={() => setDetailAccountId(null)} amountsVisible={amountsVisible} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Toggle accounts section"
        onPress={() => {
          setExpanded((value) => !value);
          setShowAll(false);
        }}
        style={styles.sectionHeader}
      >
        <View style={styles.headerTitle}>
          <View style={[styles.headerIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons
              name="wallet-outline"
              size={21}
              color={colors.info}
            />
          </View>

          <AppText variant="h3">Accounts</AppText>

          <AppText variant="caption" color="textSecondary">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </AppText>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={21}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        accounts.length === 0 ? (
          <Card variant="filled">
            <AppText color="textSecondary" align="center">
              No accounts yet. Tap "Account" to add one.
            </AppText>
          </Card>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              {visibleAccounts.map((account) => {
                const balance =
                  balances.get(account.id) ?? account.initialBalance;
                const negative = balance < 0;

                return (
                  <View
                    key={account.id}
                    style={[
                      styles.row,
                      { padding: spacing.md },
                      { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16 },
                    ]}
                  >
                    <Pressable accessibilityRole="button" accessibilityLabel={'Details for ' + account.name} onPress={() => setDetailAccountId(account.id)} style={[styles.flex, { minHeight: 48 }]}>

                      <Ionicons name={account.type === 'bank' ? 'business-outline' : 'wallet-outline'} size={20} color={colors.primary} />
                      <AppText style={styles.name}>
                        {account.name}
                      </AppText>

                      <AppText variant="caption" color="textSecondary">
                        {`${TYPE_LABELS[account.type]} · ${account.currencyCode}`}
                      </AppText>

                    <AppText
                      {...(negative ? ({ color: 'danger' } as const) : {})}
                      style={styles.balance}
                    >
                      {amountsVisible
                        ? `${formatAmount(balance, account.currencyCode)} ${account.currencyCode}`
                        : '••••••'}
                    </AppText>

                    </Pressable>
                    <FinanceActionButtons label={account.name} onEdit={() => onEdit(account)} onDelete={() => onDelete(account)} />
                  </View>
                );
              })}
        </View>

            {accounts.length > PREVIEW_COUNT ? (
              <AppButton
                title={
                  showAll
                    ? 'Show less'
                    : `View all (${accounts.length})`
                }
                variant="ghost"
                onPress={() => setShowAll((value) => !value)}
              />
            ) : null}
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  name: {
    fontWeight: '600',
  },
  balance: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
