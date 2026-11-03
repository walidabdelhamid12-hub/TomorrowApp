import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Transaction, Transfer } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getTransactionDescription } from '@/features/finance/utils/transactionDescription';
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
  const [actionItem, setActionItem] = useState<{ kind: 'transaction' | 'transfer'; id: string } | null>(null);
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

  const selectedTransaction = actionItem?.kind === 'transaction'
    ? transactions.find(tx => tx.id === actionItem.id) : undefined;
  const selectedProtected = selectedTransaction && isProtectedTransaction(selectedTransaction, { loans, debts });
  const performAction = (operation: 'edit' | 'delete') => {
    const selected = actionItem;
    setActionItem(null);
    if (!selected) return;
    const latest = useLedgerStore.getState();
    if (selected.kind === 'transfer') {
      const matches = latest.transfers.filter(item => item.id === selected.id);
      if (matches.length === 1) (operation === 'edit' ? onEditTransfer : onDeleteTransfer)(matches[0]);
    } else {
      const matches = latest.transactions.filter(item => item.id === selected.id);
      if (matches.length !== 1) return;
      const tx = matches[0];
      if (isProtectedTransaction(tx, useFinanceStore.getState())) { onManage(tx); return; }
      (operation === 'edit' ? onEdit : onDelete)(tx);
    }
  };
  const moreButton = (kind: 'transaction' | 'transfer', id: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={kind === 'transfer' ? 'Transfer actions' : 'Transaction actions'}
      accessibilityHint="Open edit and delete actions" onPress={() => setActionItem({ kind, id })}
      style={({ pressed }) => [styles.moreButton, { opacity: pressed ? 0.65 : 1 }]}>
      <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} accessible={false} />
    </Pressable>
  );

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
            const rowStyle = [styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }];
            if (item.kind === 'transfer') {
              const transfer = item.transfer;
              const fromCurrency = transfer.fromCurrencyCode ?? transfer.currencyCode;
              const toCurrency = transfer.toCurrencyCode ?? transfer.currencyCode;
              const cardPayment = transfer.type === 'credit_card_payment';
              return (
                <View key={'transfer-' + item.id} style={rowStyle}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={cardPayment ? 'card-outline' : 'swap-horizontal-outline'} size={20}
                      color={moduleColors.finance} accessible={false} />
                  </View>
                  <View style={styles.details}>
                    <View style={styles.primary}>
                      <AppText variant="caption" style={styles.name}>{cardPayment ? 'Credit card payment' : 'Transfer'}</AppText>
                      <AppText variant="caption" style={styles.amount} textBreakStrategy="simple">
                        {amountsVisible ? formatAmount(transfer.fromAmount ?? transfer.amount, fromCurrency) + ' ' + fromCurrency : '••••••'}
                      </AppText>
                    </View>
                    {fromCurrency !== toCurrency && (
                      <AppText variant="caption" style={styles.amount} textBreakStrategy="simple">
                        {amountsVisible ? '→ ' + formatAmount(transfer.toAmount ?? transfer.amount, toCurrency) + ' ' + toCurrency : '••••••'}
                      </AppText>
                    )}
                    <AppText variant="label" color="textSecondary" style={styles.metadata}>
                      {transfer.date + ' · ' + (accountById.get(transfer.fromAccountId)?.name ?? 'Unavailable account')
                        + ' → ' + (accountById.get(transfer.toAccountId)?.name ?? 'Unavailable account')}
                    </AppText>
                  </View>
                  {moreButton('transfer', transfer.id)}
                </View>
              );
            }
            const tx = item.transaction;
            const category = categoryById.get(tx.categoryId);
            const account = accountById.get(tx.accountId);
            const expense = tx.type === 'expense' && tx.entryType !== 'refund';
            const icon = category?.icon ?? '';
            const protectedRecord = isProtectedTransaction(tx, { loans, debts });
            const destination = protectedRecord ? getTransactionDestination(tx, { loans, debts }) : null;
            const description = getTransactionDescription(tx, category?.name, destination);
            const amount = amountsVisible
              ? (expense ? '-' : '+') + formatAmount(tx.amount, tx.currencyCode) + ' ' + tx.currencyCode : '••••••';
            const metadata = tx.date + ' · ' + (account?.name ?? 'Unavailable account');
            const content = (
              <>
                <View style={styles.iconCircle}>
                  <Ionicons name={protectedRecord ? 'wallet-outline' : icon in Ionicons.glyphMap ? icon as IconName : 'receipt-outline'}
                    size={20} color={category?.color ?? moduleColors.finance} accessible={false} />
                </View>
                <View style={styles.details}>
                  <View style={styles.primary}>
                    <AppText variant="caption" style={styles.name}>{description}</AppText>
                    <AppText variant="caption" style={styles.amount} color={expense ? 'expense' : 'income'} textBreakStrategy="simple">
                      {amount}
                    </AppText>
                  </View>
                  <AppText variant="label" color="textSecondary" style={styles.metadata}>{metadata}</AppText>
                </View>
              </>
            );
            return protectedRecord ? (
              <Pressable key={'transaction-' + item.id} accessibilityRole="button"
                accessibilityLabel={(destination?.label ?? 'Linked record unavailable') + ': ' + description + ', ' + amount + ', ' + metadata}
                accessibilityHint={destination ? 'Opens the linked record' : 'Explains why the linked record cannot be opened safely'}
                onPress={() => onManage(tx)}
                style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.65 : 1 }]}>
                {content}
              </Pressable>
            ) : (
              <View key={'transaction-' + item.id} style={rowStyle}>
                {content}
                {moreButton('transaction', tx.id)}
              </View>
            );
          })}
        </Card>
      ))}
      {actionItem && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setActionItem(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close transaction actions"
              onPress={() => setActionItem(null)} />
            <View accessibilityViewIsModal style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
              <AppText variant="h3">{actionItem.kind === 'transfer' ? 'Transfer actions' : 'Transaction actions'}</AppText>
              {selectedProtected ? (
                <RowAction label="Open linked record" icon="open-outline" onPress={() => performAction('edit')} />
              ) : (
                <>
                  <RowAction label={actionItem.kind === 'transfer' ? 'Edit transfer' : 'Edit transaction'}
                    icon="create-outline" onPress={() => performAction('edit')} />
                  <RowAction label={actionItem.kind === 'transfer' ? 'Delete transfer' : 'Delete transaction'}
                    icon="trash-outline" danger onPress={() => performAction('delete')} />
                </>
              )}
              <RowAction label="Cancel" icon="close-outline" onPress={() => setActionItem(null)} />
            </View>
          </View>
        </Modal>
      )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, minHeight: 60 },
  primary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  details: { flex: 1, minWidth: 0, gap: 2 },
  iconCircle: { width: 24, height: 24, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  name: { fontWeight: '600', flexGrow: 1, flexShrink: 1, flexBasis: 72 },
  amount: { fontWeight: '600', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  metadata: { letterSpacing: 0 },
  moreButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' },
  actionSheet: { padding: 16, borderRadius: 16, gap: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, minWidth: 48,
    paddingHorizontal: 8, paddingVertical: 8, maxWidth: '100%' },
  actionLabel: { flexShrink: 1 },
});
