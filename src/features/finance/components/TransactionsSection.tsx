
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card } from '@/components/ui';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type {
  Transaction,
  Transfer,
} from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

const PREVIEW_COUNT = 1;

type GlyphName = keyof typeof Ionicons.glyphMap;

const isGlyph = (name: string): name is GlyphName =>
  name in Ionicons.glyphMap;

interface TransactionsSectionProps {
  onEdit: (transaction: Transaction) => void;
  onEditTransfer: (transfer: Transfer) => void;
  onDelete: (transaction: Transaction) => void;
  onDeleteTransfer: (transfer: Transfer) => void;
  amountsVisible: boolean;
}

type RecentItem =
  | {
      kind: 'transaction';
      id: string;
      date: string;
      createdAt: string;
      transaction: Transaction;
    }
  | {
      kind: 'transfer';
      id: string;
      date: string;
      createdAt: string;
      transfer: Transfer;
    };

export function TransactionsSection({
  onEdit,
  onEditTransfer,
  onDelete,
  onDeleteTransfer,
  amountsVisible,
}: TransactionsSectionProps) {
  const { colors, spacing } = useTheme();

  const transactions = useLedgerStore((s) => s.transactions);
  const transfers = useLedgerStore((s) => s.transfers);
  const categories = useLedgerStore((s) => s.categories);
  const accounts = useLedgerStore((s) => s.accounts);

  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const sorted = useMemo<RecentItem[]>(() => {
    const transactionItems: RecentItem[] = transactions.map((transaction) => ({
      kind: 'transaction',
      id: transaction.id,
      date: transaction.date,
      createdAt: transaction.createdAt,
      transaction,
    }));

    const transferItems: RecentItem[] = transfers.map((transfer) => ({
      kind: 'transfer',
      id: transfer.id,
      date: transfer.date,
      createdAt: transfer.createdAt,
      transfer,
    }));

    return [...transactionItems, ...transferItems].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  }, [transactions, transfers]);

  const visible = showAll
    ? sorted
    : sorted.slice(0, PREVIEW_COUNT);

  return (
    <View style={{ marginTop: spacing.xl }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Toggle recent transactions section"
        onPress={() => {
          setExpanded((value) => !value);
          setShowAll(false);
        }}
        style={styles.sectionHeader}
      >
        <View style={styles.headerTitle}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="swap-horizontal-outline"
              size={21}
              color="#60A5FA"
            />
          </View>

          <AppText variant="h3">Recent transactions</AppText>

          <AppText variant="caption" color="textSecondary">
            {sorted.length} total
          </AppText>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={21}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        sorted.length === 0 ? (
          <Card variant="filled">
            <AppText color="textSecondary" align="center">
              No transactions yet. Tap "Add transaction" to start.
            </AppText>
          </Card>
        ) : (
          <>
            <Card padded={false}>
              {visible.map((item, index) => {
                if (item.kind === 'transfer') {
                  const transfer = item.transfer;
                  const fromAccount = accountById.get(
                    transfer.fromAccountId,
                  );
                  const toAccount = accountById.get(
                    transfer.toAccountId,
                  );

                  const fromAmount =
                    transfer.fromAmount ?? transfer.amount;
                  const toAmount =
                    transfer.toAmount ?? transfer.amount;

                  const fromCurrency =
                    transfer.fromCurrencyCode ?? transfer.currencyCode;
                  const toCurrency =
                    transfer.toCurrencyCode ?? transfer.currencyCode;

                  const isCardPayment =
                    transfer.type === 'credit_card_payment';

                  const sameCurrency =
                    fromCurrency === toCurrency;

                  return (
                    <View
                      key={`transfer-${transfer.id}`}
                      style={[
                        styles.row,
                        { padding: spacing.md },
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: colors.border,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.iconCircle,
                          styles.transferIcon,
                          { marginEnd: spacing.md },
                        ]}
                      >
                        <Ionicons
                          name={
                            isCardPayment
                              ? 'card-outline'
                              : 'swap-horizontal-outline'
                          }
                          size={20}
                          color="#2563EB"
                        />
                      </View>

                      <View style={styles.flex}>
                        <AppText style={styles.name}>
                          {isCardPayment
                            ? 'Credit Card Payment'
                            : 'Transfer'}
                        </AppText>

                        <AppText
                          variant="caption"
                          color="textSecondary"
                          numberOfLines={2}
                        >
                          {`${item.date} · ${fromAccount?.name ?? '—'} → ${toAccount?.name ?? '—'}`}
                        </AppText>
                      </View>

                      <AppText
                        style={[
                          styles.amount,
                          { color: colors.text },
                        ]}
                        numberOfLines={2}
                      >
                        {amountsVisible
                          ? sameCurrency
                            ? `${formatAmount(fromAmount, fromCurrency)} ${fromCurrency}`
                            : `${formatAmount(fromAmount)} ${fromCurrency}\n→ ${formatAmount(toAmount, toCurrency)} ${toCurrency}`
                          : '••••••'}
                      </AppText>

                      <View
                        style={[
                          styles.actions,
                          { marginStart: spacing.sm },
                        ]}
                      >
                        <Pressable
                          onPress={() => onEditTransfer(transfer)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Edit transfer"
                          style={styles.actionButton}
                        >
                          <Ionicons
                            name="create-outline"
                            size={17}
                            color={moduleColors.finance}
                          />
                        </Pressable>

                        <Pressable
                          onPress={() => onDeleteTransfer(transfer)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Delete transfer"
                          style={styles.actionButton}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            color="#DC2626"
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                const tx = item.transaction;
                const category = categoryById.get(tx.categoryId);
                const account = accountById.get(tx.accountId);
                const isExpense = tx.type === 'expense';
                const isRefund = tx.entryType === 'refund';

                const icon = category?.icon ?? '';
                const tint = category?.color ?? moduleColors.finance;

                return (
                  <View
                    key={`transaction-${tx.id}`}
                    style={[
                      styles.row,
                      { padding: spacing.md },
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconCircle,
                        { marginEnd: spacing.md },
                      ]}
                    >
                      {isGlyph(icon) ? (
                        <Ionicons name={icon} size={20} color={tint} />
                      ) : (
                        <AppText>{icon || '•'}</AppText>
                      )}
                    </View>

                    <View style={styles.flex}>
                      <AppText style={styles.name}>
                        {isRefund
                          ? `Refund · ${category?.name ?? 'Uncategorized'}`
                          : category?.name ?? 'Uncategorized'}
                      </AppText>

                      <AppText variant="caption" color="textSecondary">
                        {`${tx.date} · ${account?.name ?? '—'}`}
                      </AppText>
                    </View>

                    <AppText
                      style={[
                        styles.amount,
                        {
                          color: isRefund
                            ? '#16A34A'
                            : isExpense
                              ? '#DC2626'
                              : '#16A34A',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {amountsVisible
                        ? `${isExpense && !isRefund ? '-' : '+'}${formatAmount(tx.amount, tx.currencyCode)} ${tx.currencyCode}`
                        : '••••••'}
                    </AppText>

                    <View
                      style={[
                        styles.actions,
                        { marginStart: spacing.sm },
                      ]}
                    >
                      <Pressable
                        onPress={() => onEdit(tx)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Edit transaction"
                        style={styles.actionButton}
                      >
                        <Ionicons
                          name="create-outline"
                          size={17}
                          color={moduleColors.finance}
                        />
                      </Pressable>

                      <Pressable
                        onPress={() => onDelete(tx)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Delete transaction"
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

            {sorted.length > PREVIEW_COUNT ? (
              <AppButton
                title={
                  showAll
                    ? 'Show less'
                    : `View all (${sorted.length})`
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  transferIcon: {
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  name: {
    fontWeight: '600',
  },
  amount: {
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
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
