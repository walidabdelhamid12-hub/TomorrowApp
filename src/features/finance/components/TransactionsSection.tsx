import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Transaction, Transfer } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { isProtectedTransaction } from '@/features/finance/utils/paymentTransactionOwnership';
import { getTransactionDestination } from '@/features/finance/utils/transactionNavigation';
import { moduleColors, useTheme } from '@/theme';

const PREVIEW_COUNT = 1;
type IconName = keyof typeof Ionicons.glyphMap;

interface TransactionsSectionProps {
  onEdit: (transaction: Transaction) => void;
  onEditTransfer: (transfer: Transfer) => void;
  onDelete: (transaction: Transaction) => void;
  onDeleteTransfer: (transfer: Transfer) => void;
  onManage: (transaction: Transaction) => void;
  amountsVisible: boolean;
}

function RowAction({ label, icon, onPress, danger = false }: {
  label: string; icon: IconName; onPress: () => void; danger?: boolean;
}) {
  const { colors } = useTheme();
  const tint = danger ? colors.danger : moduleColors.finance;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.65 : 1 }]}>
      <Ionicons name={icon} size={20} color={tint} accessible={false} />
      <AppText variant="caption" color={tint} style={styles.actionLabel}>{label}</AppText>
    </Pressable>
  );
}

export function TransactionsSection({
  onEdit, onEditTransfer, onDelete, onDeleteTransfer, onManage, amountsVisible,
}: TransactionsSectionProps) {
  const { colors, spacing } = useTheme();
  const transactions = useLedgerStore(s => s.transactions);
  const transfers = useLedgerStore(s => s.transfers);
  const categories = useLedgerStore(s => s.categories);
  const accounts = useLedgerStore(s => s.accounts);
  const loans = useFinanceStore(s => s.loans);
  const debts = useFinanceStore(s => s.debts);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const sorted = useMemo(() => [
    ...transactions.map(transaction => ({ kind: 'transaction' as const, id: transaction.id,
      date: transaction.date, createdAt: transaction.createdAt, transaction })),
    ...transfers.map(transfer => ({ kind: 'transfer' as const, id: transfer.id,
      date: transfer.date, createdAt: transfer.createdAt, transfer })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  [transactions, transfers]);
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_COUNT);
  const toggleAll = () => { setExpanded(true); setShowAll(value => !value); };

  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle recent transactions section"
          accessibilityState={{ expanded }} style={styles.sectionHeader}
          onPress={() => { setExpanded(value => !value); setShowAll(false); }}>
          <Ionicons name="swap-horizontal-outline" size={20} color={moduleColors.finance} accessible={false} />
          <View style={styles.headingText}>
            <AppText variant="h3">Recent transactions</AppText>
            <AppText variant="caption" color="textSecondary">
              {expanded ? 'Showing ' + visible.length + ' of ' + sorted.length : sorted.length + ' total'}
            </AppText>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20}
            color={colors.textSecondary} accessible={false} />
        </Pressable>
        {sorted.length > PREVIEW_COUNT && (
          <RowAction label={showAll ? 'Show less' : 'View all (' + sorted.length + ')'}
            icon={showAll ? 'chevron-up' : 'list-outline'} onPress={toggleAll} />
        )}
      </View>

      {expanded && (sorted.length === 0 ? (
        <Card variant="filled"><AppText color="textSecondary">No transactions yet. Tap "Add transaction" to start.</AppText></Card>
      ) : (
        <Card padded={false}>
          {visible.map((item, index) => {
            const rowStyle = [styles.row, { padding: spacing.md },
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }];
            if (item.kind === 'transfer') {
              const transfer = item.transfer;
              const fromCurrency = transfer.fromCurrencyCode ?? transfer.currencyCode;
              const toCurrency = transfer.toCurrencyCode ?? transfer.currencyCode;
              const cardPayment = transfer.type === 'credit_card_payment';
              return (
                <View key={'transfer-' + item.id} style={rowStyle}>
                  <View style={styles.detailsRow}>
                    <View style={styles.iconCircle}>
                      <Ionicons name={cardPayment ? 'card-outline' : 'swap-horizontal-outline'} size={20}
                        color={moduleColors.finance} accessible={false} />
                    </View>
                    <View style={styles.details}>
                      <AppText style={styles.name}>{cardPayment ? 'Credit card payment' : 'Transfer'}</AppText>
                      <AppText variant="caption" color="textSecondary">{transfer.date}</AppText>
                      <AppText variant="caption" color="textSecondary">{'From: ' + (accountById.get(transfer.fromAccountId)?.name ?? 'Unavailable account')}</AppText>
                      <AppText variant="caption" color="textSecondary">{'To: ' + (accountById.get(transfer.toAccountId)?.name ?? 'Unavailable account')}</AppText>
                    </View>
                  </View>
                  <AppText style={styles.amount} textBreakStrategy="simple">
                    {amountsVisible ? formatAmount(transfer.fromAmount ?? transfer.amount, fromCurrency) + ' ' + fromCurrency : '••••••'}
                  </AppText>
                  {fromCurrency !== toCurrency && (
                    <AppText style={styles.amount} textBreakStrategy="simple">
                      {amountsVisible ? '→ ' + formatAmount(transfer.toAmount ?? transfer.amount, toCurrency) + ' ' + toCurrency : '••••••'}
                    </AppText>
                  )}
                  <View style={styles.actions}>
                    <RowAction label="Edit transfer" icon="create-outline" onPress={() => onEditTransfer(transfer)} />
                    <RowAction label="Delete transfer" icon="trash-outline" danger onPress={() => onDeleteTransfer(transfer)} />
                  </View>
                </View>
              );
            }
            const tx = item.transaction;
            const category = categoryById.get(tx.categoryId);
            const account = accountById.get(tx.accountId);
            const refund = tx.entryType === 'refund';
            const expense = tx.type === 'expense' && !refund;
            const icon = category?.icon ?? '';
            const protectedRecord = isProtectedTransaction(tx, { loans, debts });
            const destination = protectedRecord ? getTransactionDestination(tx, { loans, debts }) : null;
            return (
              <View key={'transaction-' + item.id} style={rowStyle}>
                <View style={styles.detailsRow}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={icon in Ionicons.glyphMap ? icon as IconName : 'receipt-outline'}
                      size={20} color={category?.color ?? moduleColors.finance} accessible={false} />
                  </View>
                  <View style={styles.details}>
                    <AppText style={styles.name}>{(refund ? 'Refund · ' : '') + (category?.name ?? 'Uncategorized')}</AppText>
                    <AppText variant="caption" color="textSecondary">{tx.date}</AppText>
                    <AppText variant="caption" color="textSecondary">{'Account: ' + (account?.name ?? 'Unavailable account')}</AppText>
                  </View>
                </View>
                <AppText style={styles.amount} color={expense ? 'expense' : 'income'} textBreakStrategy="simple">
                  {amountsVisible ? (expense ? '-' : '+') + formatAmount(tx.amount, tx.currencyCode) + ' ' + tx.currencyCode : '••••••'}
                </AppText>
                <View style={styles.actions}>
                  {protectedRecord ? (
                    <RowAction label={destination?.label ?? 'Linked record unavailable'} icon="open-outline" onPress={() => onManage(tx)} />
                  ) : (
                    <>
                      <RowAction label="Edit transaction" icon="create-outline" onPress={() => onEdit(tx)} />
                      <RowAction label="Delete transaction" icon="trash-outline" danger onPress={() => onDelete(tx)} />
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
      ))}
      {expanded && showAll && sorted.length > PREVIEW_COUNT && (
        <RowAction label="Show less" icon="chevron-up" onPress={toggleAll} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, flexGrow: 1, flexBasis: 200 },
  headingText: { flex: 1, minWidth: 0 },
  row: { gap: 8 },
  detailsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  details: { flex: 1, minWidth: 0 },
  iconCircle: { width: 36, height: 36, flexShrink: 0, borderRadius: 18, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  name: { fontWeight: '600' },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, minWidth: 48,
    paddingHorizontal: 8, paddingVertical: 8, maxWidth: '100%' },
  actionLabel: { flexShrink: 1 },
});
