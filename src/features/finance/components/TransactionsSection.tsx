import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Transaction, Transfer } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getTransactionDescription } from '@/features/finance/utils/transactionDescription';
import { isProtectedTransaction } from '@/features/finance/utils/paymentTransactionOwnership';
import { getTransactionDestination } from '@/features/finance/utils/transactionNavigation';
import { useTheme } from '@/theme';

const PREVIEW_COUNT = 3;
type IconName = keyof typeof Ionicons.glyphMap;

interface TransactionsSectionProps {
  onEdit: (transaction: Transaction) => void;
  onEditTransfer: (transfer: Transfer) => void;
  onDelete: (transaction: Transaction) => void;
  onDeleteTransfer: (transfer: Transfer) => void;
  onManage: (transaction: Transaction) => void;
  amountsVisible: boolean;
}

export function TransactionsSection({
  onEdit, onEditTransfer, onDelete, onDeleteTransfer, onManage, amountsVisible,
}: TransactionsSectionProps) {
  const { colors, spacing } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / fontScale < 340;
  const transactions = useLedgerStore(s => s.transactions);
  const transfers = useLedgerStore(s => s.transfers);
  const categories = useLedgerStore(s => s.categories);
  const accounts = useLedgerStore(s => s.accounts);
  const loans = useFinanceStore(s => s.loans);
  const debts = useFinanceStore(s => s.debts);
  const [showAll, setShowAll] = useState(false);
  const [detailItem, setDetailItem] = useState<{ kind: 'transaction' | 'transfer'; id: string } | null>(null);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accountById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const sorted = useMemo(() => [
    ...transactions.map(transaction => ({ kind: 'transaction' as const, id: transaction.id,
      date: transaction.date, createdAt: transaction.createdAt, transaction })),
    ...transfers.map(transfer => ({ kind: 'transfer' as const, id: transfer.id,
      date: transfer.date, createdAt: transfer.createdAt, transfer })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  [transactions, transfers]);
  const expanded = showAll && sorted.length > PREVIEW_COUNT;
  const visible = expanded ? sorted : sorted.slice(0, PREVIEW_COUNT);
  const toggleAll = () => setShowAll(value => !value);

  const detailMatches = detailItem?.kind === 'transfer' ? transfers.filter(t => t.id === detailItem.id)
    : transactions.filter(t => t.id === detailItem?.id);
  const detailRecord = detailMatches.length === 1 ? detailMatches[0] : undefined;
  const money = (amount: number, currency: string) => amountsVisible ? formatAmount(amount, currency) + ' ' + currency : '••••••';
  const detailLines = !detailRecord ? ['No unique record is available.'] : 'fromAccountId' in detailRecord ? [
    'From: ' + (accountById.get(detailRecord.fromAccountId)?.name ?? 'Unavailable account'),
    'To: ' + (accountById.get(detailRecord.toAccountId)?.name ?? 'Unavailable account'),
    'Sent: ' + money(detailRecord.fromAmount ?? detailRecord.amount, detailRecord.fromCurrencyCode ?? detailRecord.currencyCode),
    'Received: ' + money(detailRecord.toAmount ?? detailRecord.amount, detailRecord.toCurrencyCode ?? detailRecord.currencyCode),
    'Date: ' + detailRecord.date, ...(detailRecord.note ? ['Note: ' + detailRecord.note] : []),
  ] : [
    'Category: ' + (categoryById.get(detailRecord.categoryId)?.name ?? 'Unavailable category'),
    'Description: ' + getTransactionDescription(detailRecord, categoryById.get(detailRecord.categoryId)?.name, null),
    'Account amount: ' + money(detailRecord.amount, detailRecord.currencyCode),
    ...(detailRecord.originalAmount !== undefined && detailRecord.originalCurrencyCode
      ? [
          'Original amount: ' + money(detailRecord.originalAmount, detailRecord.originalCurrencyCode),
          ...(detailRecord.accountFxRate !== undefined
            ? ['Effective rate: ' + (amountsVisible
                ? detailRecord.accountFxRate.toPrecision(8) + ' ' + detailRecord.currencyCode + ' per ' + detailRecord.originalCurrencyCode
                : '••••••')]
            : []),
        ]
      : []),
    'Date: ' + detailRecord.date,
    'Account: ' + (accountById.get(detailRecord.accountId)?.name ?? 'Unavailable account'),
    ...(detailRecord.note ? ['Note: ' + detailRecord.note] : []),
  ];
  const performAction = (kind: 'transaction' | 'transfer', id: string, operation: 'edit' | 'delete') => {
    const latest = useLedgerStore.getState();
    if (kind === 'transfer') {
      const matches = latest.transfers.filter(item => item.id === id);
      if (matches.length === 1) (operation === 'edit' ? onEditTransfer : onDeleteTransfer)(matches[0]);
    } else {
      const matches = latest.transactions.filter(item => item.id === id);
      if (matches.length !== 1) return;
      if (isProtectedTransaction(matches[0], useFinanceStore.getState())) { onManage(matches[0]); return; }
      (operation === 'edit' ? onEdit : onDelete)(matches[0]);
    }
  };
  const selectedProtected = detailItem?.kind === 'transaction' && detailRecord && !('fromAccountId' in detailRecord)
    ? isProtectedTransaction(detailRecord, { loans, debts }) : false;
  const openDetailAction = (operation: 'edit' | 'delete') => {
    if (!detailItem || !detailRecord) return;
    const { kind, id } = detailItem;
    setDetailItem(null);
    performAction(kind, id, operation);
  };
  const openLinkedRecord = () => {
    if (!detailRecord || 'fromAccountId' in detailRecord) return;
    const latest = useLedgerStore.getState().transactions.filter(item => item.id === detailRecord.id);
    if (latest.length !== 1 || !isProtectedTransaction(latest[0], useFinanceStore.getState())) return;
    setDetailItem(null);
    onManage(latest[0]);
  };

  return (
    <View style={{ marginTop: spacing.xl }}>
      <FinanceDetailsModal title={detailItem ? detailItem.kind === 'transfer' ? 'Transfer details' : 'Transaction details' : undefined}
        lines={detailLines} plainLines={detailItem?.kind === 'transfer'}
        detailIcon={detailItem?.kind === 'transaction' && detailRecord && !('fromAccountId' in detailRecord)
          ? (() => { const category = categoryById.get(detailRecord.categoryId); return category?.icon && category.icon in Ionicons.glyphMap
            ? { name: category.icon as IconName, color: category.color ?? colors.textSecondary } : undefined; })() : undefined}
        onClose={() => setDetailItem(null)}>
        {detailRecord && detailItem ? selectedProtected ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open linked record details" onPress={openLinkedRecord}
            style={[styles.linkedAction, { backgroundColor: colors.finance.neutral.surface, borderColor: '#D6B777' }]}>
            <Ionicons name="open-outline" size={19} color={colors.finance.neutral.accent} />
            <AppText variant="bodyStrong">Open linked record</AppText>
          </Pressable>
        ) : (
          <FinanceActionButtons label={detailItem.kind} onEdit={() => openDetailAction('edit')} onDelete={() => openDetailAction('delete')} />
        ) : null}
      </FinanceDetailsModal>
      <View style={styles.toolbar}>
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt" size={21} color={colors.finance.balance.accent} accessible={false} />
          <AppText variant="bodyStrong" numberOfLines={1} ellipsizeMode="tail"
            accessibilityRole="header" accessibilityLabel="Recent Transactions" style={[styles.headingText, { color: colors.text, fontWeight: '800' }]}>
            Recent Transactions
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Show less' : 'View all (' + sorted.length + ')'}
          accessibilityState={{ expanded, disabled: sorted.length <= PREVIEW_COUNT }} disabled={sorted.length <= PREVIEW_COUNT}
          accessibilityHint={sorted.length <= PREVIEW_COUNT ? 'All transactions are already visible'
            : expanded ? 'Return to the most recent transaction' : 'Show every transaction'}
          onPress={toggleAll} style={({ pressed }) => [styles.listToggle, { opacity: pressed ? 0.65 : 1 }]}>
          <AppText variant="caption" color={sorted.length <= PREVIEW_COUNT ? 'textSecondary' : colors.finance.balance.accent} style={styles.actionLabel}>
            {expanded ? 'Show less' : 'View all (' + sorted.length + ')'}
          </AppText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16}
            color={sorted.length <= PREVIEW_COUNT ? colors.textSecondary : colors.finance.balance.accent} accessible={false} />
        </Pressable>
      </View>
      <AppText variant="label" color="textSecondary" style={{ marginBottom: spacing.sm }}>
        {'Showing ' + visible.length + ' of ' + sorted.length}
      </AppText>

      {sorted.length === 0 ? (
        <Card variant="filled"><AppText color="textSecondary">No transactions yet. Tap "Add transaction" to start.</AppText></Card>
      ) : (
        <Card padded={false} variant="outlined" style={{ backgroundColor: colors.finance.neutral.surface, borderColor: '#B68C42', borderWidth: 1.3, borderRadius: 14 }}>
          {visible.map((item, index) => {
            const rowStyle = [styles.row, stacked && styles.stacked,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D6B777' }];
            if (item.kind === 'transfer') {
              const transfer = item.transfer;
              const fromCurrency = transfer.fromCurrencyCode ?? transfer.currencyCode;
              const toCurrency = transfer.toCurrencyCode ?? transfer.currencyCode;
              const cardPayment = transfer.type === 'credit_card_payment';
              return (
                <View key={'transfer-' + item.id} style={rowStyle}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Transfer details" onPress={() => setDetailItem({ kind: 'transfer', id: transfer.id })} style={styles.rowBody}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.finance.transfer.surface }]}>
                    <Ionicons name={cardPayment ? 'card-outline' : 'swap-horizontal-outline'} size={20}
                      color={colors.finance.transfer.accent} accessible={false} />
                  </View>
                  <View style={styles.details}>
                    <View style={styles.primary}>
                      <AppText variant="caption" style={styles.name}>{cardPayment ? 'Credit card payment' : 'Transfer'}</AppText>
                    </View>
                    <AppText variant="label" color={colors.finance.neutral.accent} style={styles.metadata}>
                      {transfer.date + ' · ' + (accountById.get(transfer.fromAccountId)?.name ?? 'Unavailable account')
                        + ' → ' + (accountById.get(transfer.toAccountId)?.name ?? 'Unavailable account')}
                    </AppText>
                  </View>
                  </Pressable>
                  <View style={[styles.right, stacked && { maxWidth: '100%' }]}>
                    <AppText variant="caption" color={colors.finance.transfer.accent} style={styles.amount} textBreakStrategy="simple">
                      {amountsVisible ? formatAmount(transfer.fromAmount ?? transfer.amount, fromCurrency) + ' ' + fromCurrency : '••••••'}
                    </AppText>
                    {fromCurrency !== toCurrency && <AppText variant="caption" color={colors.finance.transfer.accent} style={styles.amount} textBreakStrategy="simple">
                      {amountsVisible ? '→ ' + formatAmount(transfer.toAmount ?? transfer.amount, toCurrency) + ' ' + toCurrency : '••••••'}
                    </AppText>}

                  </View>
                </View>
              );
            }
            const tx = item.transaction;
            const category = categoryById.get(tx.categoryId);
            const account = accountById.get(tx.accountId);
            const expense = tx.type === 'expense' && tx.entryType !== 'refund';
            const movementColor = (expense ? colors.finance.expense : colors.finance.income).accent;
            const icon: IconName = tx.entryType === 'refund' ? 'return-down-back-outline' : expense ? 'trending-down-outline' : 'trending-up-outline';
            const categoryIcon: IconName = category?.icon && category.icon in Ionicons.glyphMap ? category.icon as IconName : icon;
            const protectedRecord = isProtectedTransaction(tx, { loans, debts });
            const destination = protectedRecord ? getTransactionDestination(tx, { loans, debts }) : null;
            const description = getTransactionDescription(tx, category?.name, destination);
            const amount = amountsVisible
              ? (expense ? '-' : '+') + formatAmount(tx.amount, tx.currencyCode) + ' ' + tx.currencyCode : '••••••';
            const metadata = tx.date + ' · ' + (account?.name ?? 'Unavailable account');
            const content = (
              <>
                <View style={[styles.iconCircle, { backgroundColor: (expense ? colors.finance.expense : colors.finance.income).surface }]}>
                  <Ionicons name={protectedRecord ? destination?.href.pathname === '/finance/loans' ? 'cash-outline' : 'people-outline' : tx.entryType === 'refund' ? icon : categoryIcon}
                    size={20} color={movementColor} accessible={false} />
                </View>
                <View style={styles.details}>
                  <View style={styles.primary}>
                    <AppText variant="caption" style={styles.name}>{description}</AppText>

                  </View>
                  <AppText variant="label" color={colors.finance.neutral.accent} style={styles.metadata}>{metadata}</AppText>
                </View>
              </>
            );
            return (
              <View key={'transaction-' + item.id} style={rowStyle}>
                <Pressable accessibilityRole="button" accessibilityLabel="Transaction details"
                  onPress={() => setDetailItem({ kind: 'transaction', id: tx.id })} style={styles.rowBody}>{content}</Pressable>
                <View style={[styles.right, stacked && { maxWidth: '100%' }]}>
                  <AppText variant="caption" style={styles.amount} color={movementColor} textBreakStrategy="simple">{amount}</AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  stacked: { flexDirection: 'row', alignItems: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  headingText: { flexShrink: 1, minWidth: 0 },
  listToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, minWidth: 48,
    paddingHorizontal: 4, paddingVertical: 8, maxWidth: '50%' },
  right: { maxWidth: '52%', flexShrink: 1, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center' },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 3, minHeight: 52 },
  linkedAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderWidth: 1, borderRadius: 10, padding: 8 },
  primary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  details: { flex: 1, minWidth: 0, gap: 2 },
  iconCircle: { width: 26, height: 26, flexShrink: 0, alignSelf: 'center', marginTop: 0, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center' },
  name: { fontWeight: '600', flexGrow: 1, flexShrink: 1, flexBasis: 72 },
  amount: { textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  metadata: { letterSpacing: 0 },
  moreButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  actionSheet: { padding: 16, borderRadius: 16, gap: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, minWidth: 48,
    paddingHorizontal: 8, paddingVertical: 8, maxWidth: '100%' },
  actionLabel: { flexShrink: 1 },
});
