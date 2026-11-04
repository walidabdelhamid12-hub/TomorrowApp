import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { debtDetailLines } from '@/features/finance/utils/detailLines';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { editLinkedPayment, postLinkedPayment, reverseLinkedPayment } from '@/features/finance/store/paymentOperations';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    PanResponder,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { AddDebtModal } from '@/features/finance/components/AddDebtModal';
import { DEFAULT_CATEGORIES } from '@/features/finance/constants/defaultCategories';
import {
    useFinanceHydrated,
    useFinanceStore,
} from '@/features/finance/store/useFinanceStore';
import {
    useLedgerHydrated,
    useLedgerStore,
} from '@/features/finance/store/useLedgerStore';
import type {
    Debt,
    DebtDirection,
    DebtPayment,
    NewDebtInput,
} from '@/features/finance/types/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getDebtPaid, getDebtRemaining, roundMoney } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { focusLinkedRecords } from '@/features/finance/utils/transactionNavigation';
import { moduleColors, useTheme } from '@/theme';

type DebtTab = 'receivable' | 'payable';

const getTodayDate = (): string => {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
};

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const parseDate = (value: string): Date | null => {
  if (!isValidDate(value)) return null;

  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day, 12, 0, 0);
};

const toDateString = (date: Date): string =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getPaidAmount = getDebtPaid;
const getRemainingAmount = getDebtRemaining;

const getRemainingExcludingPayment = (debt: Debt, paymentId: string) =>
  getDebtRemaining({
    ...debt,
    payments: debt.payments.filter((payment) => payment.id !== paymentId),
  });

const formatDate = (value?: string) => {
  if (!value) return 'No due date';

  const parts = value.split('-');

  if (parts.length !== 3) return value;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export default function DebtsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ direction?: string; debtId?: string }>();
  const { colors } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();

  const financeReady = useFinanceHydrated();
  const ledgerReady = useLedgerHydrated();
  const ready = financeReady && ledgerReady;

  const debts = useFinanceStore((state) => state.debts);
  const addDebt = useFinanceStore((state) => state.addDebt);
  const updateDebt = useFinanceStore((state) => state.updateDebt);
  const deleteDebt = useFinanceStore((state) => state.deleteDebt);

  const accounts = useLedgerStore((state) => state.accounts);
  const categories = useLedgerStore((state) => state.categories);
  const transactions = useLedgerStore((state) => state.transactions);

  const [activeTab, setActiveTab] = useState<DebtTab>(
    params.direction === 'payable' ? 'payable' : 'receivable',
  );

  const [debtModalVisible, setDebtModalVisible] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);

  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [paymentAccountId, setPaymentAccountId] = useState('');

  const [editingPayment, setEditingPayment] = useState<{
    debt: Debt;
    payment: DebtPayment;
  } | null>(null);

  const [detailDebtId, setDetailDebtId] = useState<string | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const detailDebt = debts.filter(d => d.id === detailDebtId).length === 1 ? debts.find(d => d.id === detailDebtId) : undefined;
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 60 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) setActiveTab(g.dx < 0 ? 'payable' : 'receivable'); },
  }), []);
  const linkedDebt = params.debtId === undefined ? undefined : focusLinkedRecords(debts, params.debtId)[0];
  const linkedDebtId = linkedDebt?.id;
  const linkedDebtDirection = linkedDebt?.direction;
  useEffect(() => {
    if (linkedDebtId && linkedDebtDirection) {
      setActiveTab(linkedDebtDirection);
    }
  }, [linkedDebtId, linkedDebtDirection]);

  const visibleDebts = useMemo(
    () =>
      focusLinkedRecords(debts, params.debtId)
        .filter((debt) => debt.direction === activeTab)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [debts, activeTab, params.debtId],
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts],
  );

  const currencyTotals = useMemo(() => {
    const totals = new Map<
      string,
      { total: number; paid: number; remaining: number }
    >();

    visibleDebts.forEach((debt) => {
      const current = totals.get(debt.currencyCode) ?? {
        total: 0,
        paid: 0,
        remaining: 0,
      };

      current.total += debt.amount;
      current.paid += getPaidAmount(debt);
      current.remaining += getRemainingAmount(debt);

      totals.set(debt.currencyCode, current);
    });

    return Array.from(totals.entries())
      .map(([currencyCode, values]) => ({
        currencyCode,
        total: roundMoney(values.total),
        paid: roundMoney(values.paid),
        remaining: roundMoney(values.remaining),
      }))
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  }, [visibleDebts]);

  const openAddDebt = () => {
    setEditingDebt(null);
    setDebtModalVisible(true);
  };

  const openEditDebt = (debt: Debt) => {
    setEditingDebt(debt);
    setDebtModalVisible(true);
  };

  const closeDebtModal = () => {
    setDebtModalVisible(false);
    setEditingDebt(null);
  };

  const handleSaveDebt = (data: NewDebtInput) => {
    if (editingDebt) {
      const alreadyPaid = getPaidAmount(editingDebt);

      if (data.amount < alreadyPaid) {
        Alert.alert(
          'Invalid amount',
          `The debt amount cannot be less than the amount already paid (${formatAmount(alreadyPaid, editingDebt.currencyCode)}).`,
        );
        return;
      }

      if (!updateDebt(editingDebt.id, data)) {
        Alert.alert('Cannot update debt', 'Currency cannot change while payment history or linked account transactions exist, or accounting data is not ready. The amount must also cover all recorded payments.');
        return;
      }
    } else {
      addDebt(data);
    }

    closeDebtModal();
  };

  const confirmDeleteDebt = (debt: Debt) => {
    const hasPayments = debt.payments.length > 0;

    const message = hasPayments
      ? 'This debt already has recorded payments. Deleting it could leave linked account transactions behind. Please keep it and edit its details instead.'
      : 'Are you sure you want to delete this debt?';

    if (hasPayments) {
      Alert.alert('Cannot delete debt', message);
      return;
    }

    const performDelete = () => {
      if (!deleteDebt(debt.id)) {
        Alert.alert('Cannot delete debt', 'The debt may have payment history or linked account transactions, or its accounting data is not ready. Keep it to preserve its history.');
      }
    };

    confirm('Delete debt?', message, performDelete, 'Delete');
  };

  const openPayment = (debt: Debt) => {
    const remaining = getRemainingAmount(debt);

    if (remaining <= 0) {
      Alert.alert('Settled', 'This debt has already been fully settled.');
      return;
    }

    const matchingAccounts = activeAccounts.filter(
      (account) => account.currencyCode === debt.currencyCode,
    );

    if (matchingAccounts.length === 0) {
      Alert.alert(
        'No matching account',
        `You need an active account in ${debt.currencyCode} to record this ${debt.direction === 'receivable' ? 'collection' : 'payment'}.`,
      );
      return;
    }

    setPaymentDebt(debt);
    setPaymentAmount(String(remaining));
    setPaymentNote('');
    setPaymentDate(getTodayDate());
    setPaymentAccountId(matchingAccounts[0].id);
  };

  const closePayment = () => {
    setPaymentDebt(null);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentDate(getTodayDate());
    setPaymentAccountId('');
  };

  const handleConfirmPayment = () => {
    if (!paymentDebt) return;

    const parsedAmount = parseAmount(paymentAmount);
    const amount = parsedAmount === null ? null : roundMoney(parsedAmount);

    if (amount === null || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }

    const cleanPaymentDate = paymentDate.trim();

    if (!isValidDate(cleanPaymentDate)) {
      Alert.alert(
        'Invalid date',
        'Please select a valid date using the calendar.',
      );
      return;
    }

    const remaining = getRemainingAmount(paymentDebt);

    if (amount > remaining) {
      Alert.alert(
        'Amount too large',
        `The remaining amount is ${formatAmount(remaining, paymentDebt.currencyCode)} ${paymentDebt.currencyCode}.`,
      );
      return;
    }

    const account = activeAccounts.find(
      (item) => item.id === paymentAccountId,
    );

    if (!account) {
      Alert.alert('Select account', 'Choose an active account.');
      return;
    }

    if (account.currencyCode !== paymentDebt.currencyCode) {
      Alert.alert(
        'Currency mismatch',
        'The selected account must use the same currency as this debt.',
      );
      return;
    }

    const categoryKind =
      paymentDebt.direction === 'receivable' ? 'income' : 'expense';

    const preferredCategoryId =
      paymentDebt.direction === 'receivable'
        ? 'cat_other_in'
        : 'cat_other_out';

    const category =
      categories.find(
        (item) =>
          item.id === preferredCategoryId &&
          item.kind === categoryKind,
      ) ??
      categories.find((item) => item.kind === categoryKind) ??
      DEFAULT_CATEGORIES.find(
        (item) =>
          item.id === preferredCategoryId &&
          item.kind === categoryKind,
      );

    if (!category) {
      Alert.alert(
        'Missing category',
        `No ${categoryKind} category is available. Please add one before recording this operation.`,
      );
      return;
    }

    const result = postLinkedPayment({ entityType: 'debt', entityId: paymentDebt.id,
      amount, date: cleanPaymentDate, note: paymentNote.trim() || undefined,
      accountId: account.id, categoryId: category.id });
    if (!result.ok) { Alert.alert('Payment not saved', result.reason); return; }

    closePayment();

    Alert.alert(
      'Saved',
      paymentDebt.direction === 'receivable'
        ? 'The collection was recorded and added to the selected account.'
        : 'The payment was recorded and deducted from the selected account.',
    );
  };

  const openEditPayment = (
    debt: Debt,
    payment: DebtPayment,
  ) => {
    setEditingPayment({ debt, payment });
  };

  const confirmDeletePayment = (debt: Debt, payment: DebtPayment) => {
    const performDelete = () => {
      const result = reverseLinkedPayment({ entityType: 'debt', entityId: debt.id, paymentId: payment.id });
      if (!result.ok) { Alert.alert('Cannot delete payment', result.reason); return; }
      Alert.alert('Deleted', 'The payment and its linked account transaction were deleted.');
    };

    const message =
      `Delete this ${debt.direction === 'receivable' ? 'collection' : 'payment'} of ` +
      `${formatAmount(payment.amount, debt.currencyCode)} ${debt.currencyCode}? The linked account balance will be reversed.`;

    confirm('Delete payment?', message, performDelete, 'Delete');
  };

  const closeEditPayment = () => {
    setEditingPayment(null);
  };

  const handleSavePaymentEdit = (
    amountText: string,
    date: string,
    note: string,
  ) => {
    if (!editingPayment) return;

    const { debt, payment } = editingPayment;
    const parsedAmount = parseAmount(amountText);
    const amount = parsedAmount === null ? null : roundMoney(parsedAmount);
    const cleanDate = date.trim();

    if (amount === null || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }

    if (!isValidDate(cleanDate)) {
      Alert.alert('Invalid date', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    // Calculate the maximum using the shared debt-balance rule,
    // excluding the payment currently being edited.
    const maximumAllowed = getRemainingExcludingPayment(debt, payment.id);

    if (amount > maximumAllowed) {
      Alert.alert(
        'Amount too large',
        `The maximum allowed for this payment is ${formatAmount(maximumAllowed, debt.currencyCode)} ${debt.currencyCode}.`,
      );
      return;
    }

    const result = editLinkedPayment({ entityType: 'debt', entityId: debt.id, paymentId: payment.id },
      { amount, date: cleanDate, note: note.trim() || undefined });
    if (!result.ok) { Alert.alert('Update failed', result.reason); return; }

    setEditingPayment(null);

    Alert.alert(
      'Updated',
      'The payment and its linked account transaction were updated.',
    );
  };

  const getStatus = (debt: Debt) => {
    const remaining = getRemainingAmount(debt);

    if (remaining <= 0) {
      return {
        label: 'Settled',
        color: '#059669',
        background: '#D1FAE5',
      };
    }

    if (getPaidAmount(debt) > 0) {
      return {
        label: 'Partial',
        color: '#D97706',
        background: '#FEF3C7',
      };
    }

    return {
      label: 'Open',
      color: '#64748B',
      background: '#F1F5F9',
    };
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={moduleColors.finance} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {confirmation}
      <View {...swipe.panHandlers}>
      {params.debtId !== undefined && (
        <Card variant="filled">
          <AppText>{visibleDebts.length ? 'Showing the debt linked to your transaction.' : 'The linked debt is unavailable in this tab. No other debt has been selected.'}</AppText>
          <AppButton title="View all debts" variant="ghost" onPress={() => router.replace('/finance/debts')} />
        </Card>
      )}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={23} color={colors.text} />
        </Pressable>

        <View style={styles.headerText}>
          <AppText variant="h1">Debts</AppText>
          <AppText variant="caption" color="textSecondary">
            Manage money owed to you and money you owe
          </AppText>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'receivable' }} onPress={() => setActiveTab('receivable')}
          style={[
            styles.tab,
            activeTab === 'receivable' && styles.receivableTabActive,
          ]}
        >
          <Ionicons
            name="arrow-down-circle-outline"
            size={18}
            color={activeTab === 'receivable' ? '#059669' : colors.textSecondary}
          />
          <AppText
            style={[
              styles.tabText,
              activeTab === 'receivable' && { color: '#059669' },
            ]}
          >
            Receivable
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'payable' }} onPress={() => setActiveTab('payable')}
          style={[
            styles.tab,
            activeTab === 'payable' && styles.payableTabActive,
          ]}
        >
          <Ionicons
            name="arrow-up-circle-outline"
            size={18}
            color={activeTab === 'payable' ? '#DC2626' : colors.textSecondary}
          />
          <AppText
            style={[
              styles.tabText,
              activeTab === 'payable' && { color: '#DC2626' },
            ]}
          >
            Payable
          </AppText>
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        {([
          { label: 'Total', key: 'total' as const, color: colors.text },
          { label: activeTab === 'receivable' ? 'Collected' : 'Paid', key: 'paid' as const, color: activeTab === 'receivable' ? '#059669' : '#DC2626' },
          { label: 'Remaining', key: 'remaining' as const, color: activeTab === 'receivable' ? '#059669' : '#DC2626' },
        ]).map(metric => (
          <Card key={metric.key} style={styles.summaryCard}>
            <AppText variant="caption" color="textSecondary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{metric.label}</AppText>
            {(currencyTotals.length ? currencyTotals : [{ currencyCode: '', total: 0, paid: 0, remaining: 0 }]).map(item => (
              <View key={item.currencyCode} style={styles.summaryCurrency}>
                <AppText style={[styles.summaryAmount, { color: metric.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {formatAmount(item[metric.key], item.currencyCode)}
                </AppText>
                {item.currencyCode ? <AppText variant="caption" color="textSecondary" numberOfLines={1}>{item.currencyCode}</AppText> : null}
              </View>
            ))}
          </Card>
        ))}
      </View>

      <AppButton
        title={activeTab === 'receivable' ? 'Add receivable' : 'Add payable'}
        accentColor={activeTab === 'receivable' ? '#059669' : '#DC2626'}
        leftIcon={<Ionicons name="add" size={20} color="#fff" />}
        onPress={openAddDebt}
      />

      <View style={styles.sectionHeader}>
        <AppText variant="h2">
          {activeTab === 'receivable' ? 'Money owed to you' : 'Money you owe'}
        </AppText>

        <AppText variant="caption" color="textSecondary">
          {visibleDebts.length}{' '}
          {visibleDebts.length === 1 ? 'record' : 'records'}
        </AppText>
      </View>

      {visibleDebts.length === 0 ? (
        <Card variant="filled">
          <View style={styles.emptyState}>
            <Ionicons
              name="wallet-outline"
              size={34}
              color={colors.textSecondary}
            />
            <AppText color="textSecondary" align="center">
              {activeTab === 'receivable'
                ? 'No receivables yet. Add money someone owes you.'
                : 'No payables yet. Add money you owe someone.'}
            </AppText>
          </View>
        </Card>
      ) : (
        visibleDebts.map((debt) => {
          const paid = getPaidAmount(debt);
          const remaining = getRemainingAmount(debt);
          const status = getStatus(debt);
          const expanded = expandedDebtId === debt.id;

          return (
            <Card key={debt.id} style={styles.debtCard}>
              <Pressable
                onPress={() =>
                  setDetailDebtId(debt.id)
                }
                accessibilityRole="button" accessibilityLabel={'Details for ' + debt.personName}
                style={styles.debtMain}
              >
                <View style={styles.debtTopRow}>
                  <View style={styles.debtNameContainer}>
                    <AppText style={styles.personName}>
                      {debt.personName}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {formatDate(debt.date)}
                      {debt.dueDate ? ` · Due ${formatDate(debt.dueDate)}` : ''}
                    </AppText>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: status.background },
                    ]}
                  >
                    <AppText
                      style={[styles.statusText, { color: status.color }]}
                    >
                      {status.label}
                    </AppText>
                  </View>
                </View>

                <View style={styles.amountRow}>
                  <View style={styles.amountColumn}>
                    <AppText variant="caption" color="textSecondary">
                      Remaining
                    </AppText>
                    <AppText style={styles.remainingAmount}>
                      {formatAmount(remaining, debt.currencyCode)} {debt.currencyCode}
                    </AppText>
                  </View>

                  <View style={styles.amountColumnRight}>
                    <AppText variant="caption" color="textSecondary">
                      Original
                    </AppText>
                    <AppText style={styles.originalAmount}>
                      {formatAmount(debt.amount, debt.currencyCode)} {debt.currencyCode}
                    </AppText>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${
                          debt.amount > 0
                            ? Math.min(100, (paid / debt.amount) * 100)
                            : 0
                        }%`,
                        backgroundColor:
                          activeTab === 'receivable' ? '#059669' : '#DC2626',
                      },
                    ]}
                  />
                </View>

                <View style={styles.progressLabels}>
                  <AppText variant="caption" color="textSecondary">
                    Paid / collected: {formatAmount(paid, debt.currencyCode)}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">Details</AppText>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={(expanded ? 'Hide' : 'Show') + ' payment history for ' + debt.personName}
                accessibilityState={{ expanded }}
                onPress={() => setExpandedDebtId(expanded ? null : debt.id)}
                style={styles.historyToggle}
              >
                <AppText variant="caption" color="textSecondary">
                  Payment history ({debt.payments.length})
                </AppText>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textSecondary} />
              </Pressable>
              {expanded && (
                <View style={styles.quickHistory}>
                  {debt.payments.length === 0 ? (
                    <AppText variant="caption" color="textSecondary">No payments recorded yet.</AppText>
                  ) : debt.payments.map(payment => (
                    <View key={payment.id} style={styles.quickPayment}>
                      <View style={styles.quickPaymentRow}>
                        <AppText style={styles.paymentDate}>{formatDate(payment.date)}</AppText>
                        <AppText style={styles.paymentAmount}>{formatAmount(payment.amount, debt.currencyCode)} {debt.currencyCode}</AppText>
                      </View>
                      <FinanceActionButtons
                        label={'payment dated ' + formatDate(payment.date)}
                        onEdit={() => openEditPayment(debt, payment)}
                        onDelete={() => confirmDeletePayment(debt, payment)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Card>
          );
        })
      )}

      <AddDebtModal
        visible={debtModalVisible}
        direction={activeTab as DebtDirection}
        debt={editingDebt}
        currencyLocked={!!editingDebt && (!ready
          || (debts.find(debt => debt.id === editingDebt.id)?.payments ?? []).length > 0
          || transactions.some(transaction => transaction.linkedEntityId === editingDebt.id))}
        onClose={closeDebtModal}
        onSave={handleSaveDebt}
      />

      <ModalPayment
        visible={paymentDebt !== null}
        debt={paymentDebt}
        amount={paymentAmount}
        note={paymentNote}
        date={paymentDate}
        accountId={paymentAccountId}
        accounts={activeAccounts.filter(
          (account) =>
            account.currencyCode === paymentDebt?.currencyCode,
        )}
        onAmountChange={setPaymentAmount}
        onNoteChange={setPaymentNote}
        onDateChange={setPaymentDate}
        onAccountChange={setPaymentAccountId}
        onClose={closePayment}
        onConfirm={handleConfirmPayment}
      />

      <ModalEditPayment
        visible={editingPayment !== null}
        debt={editingPayment?.debt ?? null}
        payment={editingPayment?.payment ?? null}
        onClose={closeEditPayment}
        onSave={handleSavePaymentEdit}
      />
      <FinanceDetailsModal
        compact
        title={detailDebtId === null ? undefined : detailDebt?.personName ?? 'Debt unavailable'}
        subtitle={detailDebt ? 'Debt recorded on ' + formatDate(detailDebt.date) : undefined}
        onClose={() => setDetailDebtId(null)}
        metrics={detailDebt ? [
          { label: 'Remaining', value: formatAmount(getRemainingAmount(detailDebt), detailDebt.currencyCode) + ' ' + detailDebt.currencyCode },
          { label: 'Original', value: formatAmount(detailDebt.amount, detailDebt.currencyCode) + ' ' + detailDebt.currencyCode },
          { label: 'Paid / collected', value: formatAmount(getPaidAmount(detailDebt), detailDebt.currencyCode) + ' ' + detailDebt.currencyCode },
          { label: 'Type', value: detailDebt.direction === 'receivable' ? 'Receivable' : 'Payable' },
        ] : []}
        lines={detailDebt ? [...(detailDebt.dueDate ? ['Due: ' + formatDate(detailDebt.dueDate)] : []), ...(detailDebt.notes?.trim() ? ['Notes: ' + detailDebt.notes.trim()] : [])] : ['No unique debt is available.']}
      >
        {detailDebt && (
          <View style={{ gap: 12, paddingTop: 8 }}>
            {detailDebt.payments.length > 0 && (
              <View style={styles.paymentHistory}>
                <AppText style={styles.historyTitle}>Payment history</AppText>
                {detailDebt.payments.map(payment => (
                  <View key={payment.id} style={styles.paymentRow}>
                    <View style={styles.paymentInfo}>
                      <AppText style={styles.paymentDate}>{formatDate(payment.date)}</AppText>
                      {payment.note ? <AppText variant="caption" color="textSecondary">{payment.note}</AppText> : null}
                    </View>
                    <View style={styles.paymentActions}>
                      <AppText style={styles.paymentAmount}>{formatAmount(payment.amount, detailDebt.currencyCode)} {detailDebt.currencyCode}</AppText>
                      <FinanceActionButtons label={'payment dated ' + formatDate(payment.date)}
                        onEdit={() => { setDetailDebtId(null); openEditPayment(detailDebt, payment); }}
                        onDelete={() => confirmDeletePayment(detailDebt, payment)} />
                    </View>
                  </View>
                ))}
              </View>
            )}
            {getRemainingAmount(detailDebt) > 0 && (
              <Pressable accessibilityRole="button"
                onPress={() => { setDetailDebtId(null); openPayment(detailDebt); }}
                style={[styles.primaryAction, { backgroundColor: detailDebt.direction === 'receivable' ? '#059669' : '#DC2626' }]}>
                <Ionicons name={detailDebt.direction === 'receivable' ? 'download-outline' : 'card-outline'} size={17} color="#fff" />
                <AppText style={styles.primaryActionText}>{detailDebt.direction === 'receivable' ? 'Record collection' : 'Record payment'}</AppText>
              </Pressable>
            )}
            <FinanceActionButtons label={detailDebt.personName}
              onEdit={() => { setDetailDebtId(null); openEditDebt(detailDebt); }}
              onDelete={() => confirmDeleteDebt(detailDebt)} />
          </View>
        )}
      </FinanceDetailsModal>
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Record payment modal                                                       */
/* -------------------------------------------------------------------------- */

interface ModalPaymentProps {
  visible: boolean;
  debt: Debt | null;
  amount: string;
  note: string;
  date: string;
  accountId: string;
  accounts: ReturnType<typeof useLedgerStore.getState>['accounts'];
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

function ModalPayment({
  visible,
  debt,
  amount,
  note,
  date,
  accountId,
  accounts,
  onAmountChange,
  onNoteChange,
  onDateChange,
  onAccountChange,
  onClose,
  onConfirm,
}: ModalPaymentProps) {
  const { colors } = useTheme();

  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1, 12);
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
      12,
    );

    const firstCell = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1 - firstDay.getDay(),
      12,
    );

    return Array.from({ length: 42 }, (_, index) =>
      new Date(
        firstCell.getFullYear(),
        firstCell.getMonth(),
        firstCell.getDate() + index,
        12,
      ),
    );
  }, [calendarMonth]);

  if (!debt) return null;

  const isReceivable = debt.direction === 'receivable';

  const openCalendar = () => {
    const parsed = parseDate(date);
    const initialDate = parsed ?? new Date();

    setCalendarMonth(
      new Date(
        initialDate.getFullYear(),
        initialDate.getMonth(),
        1,
        12,
      ),
    );

    setCalendarVisible(true);
  };

  const selectCalendarDate = (selectedDate: Date) => {
    onDateChange(toDateString(selectedDate));
    setCalendarVisible(false);
  };

  const changeCalendarMonth = (amount: number) => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + amount,
          1,
          12,
        ),
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            <ScrollView
              style={styles.paymentScroll}
              contentContainerStyle={styles.paymentScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h2">
                    {isReceivable ? 'Record collection' : 'Record payment'}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {debt.personName}
                  </AppText>
                </View>

                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={23} color={colors.text} />
                </Pressable>
              </View>

              <AppText variant="caption" color="textSecondary">
                Remaining amount
              </AppText>
              <AppText style={styles.modalRemaining}>
                {formatAmount(getRemainingAmount(debt), debt.currencyCode)} {debt.currencyCode}
              </AppText>

              <AppText style={styles.fieldLabel}>Amount</AppText>
              <TextInput
                style={styles.modalInput}
                value={amount}
                onChangeText={onAmountChange}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor="#999"
              />

              <AppText style={styles.fieldLabel}>
                {isReceivable ? 'Collection date' : 'Payment date'}
              </AppText>

              <View style={styles.dateInputContainer}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color="#64748b"
                />

                <TextInput
                  style={styles.dateInput}
                  value={date}
                  onChangeText={onDateChange}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={10}
                />

                <Pressable
                  onPress={openCalendar}
                  style={styles.calendarButton}
                  accessibilityRole="button"
                  accessibilityLabel="Choose date from calendar"
                >
                  <Ionicons name="calendar" size={20} color="#059669" />
                </Pressable>
              </View>

              <AppText style={styles.helperText}>
                Format: YYYY-MM-DD
              </AppText>

              <AppText style={styles.fieldLabel}>Select account</AppText>

              {accounts.length === 0 ? (
                <AppText color="textSecondary">
                  No active account in {debt.currencyCode}.
                </AppText>
              ) : (
                <View style={styles.accountChoices}>
                  {accounts.map((account) => {
                    const selected = accountId === account.id;

                    return (
                      <Pressable
                        key={account.id}
                        onPress={() => onAccountChange(account.id)}
                        style={[
                          styles.accountChoice,
                          selected && styles.accountChoiceActive,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <AppText style={styles.accountChoiceName}>
                            {account.name}
                          </AppText>
                          <AppText variant="caption" color="textSecondary">
                            {account.currencyCode}
                          </AppText>
                        </View>

                        {selected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={moduleColors.finance}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <AppText style={styles.fieldLabel}>Note (optional)</AppText>
              <TextInput
                style={styles.modalInput}
                value={note}
                onChangeText={onNoteChange}
                placeholder="Add a note"
                placeholderTextColor="#999"
              />

              <View style={styles.warningBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <AppText style={styles.warningText}>
                  This action records an actual{' '}
                  {isReceivable ? 'collection' : 'payment'}. The selected
                  account balance will change.
                </AppText>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <AppText>Cancel</AppText>
              </Pressable>

              <Pressable
                onPress={onConfirm}
                disabled={accounts.length === 0}
                style={[
                  styles.confirmButton,
                  {
                    backgroundColor: isReceivable ? '#059669' : '#DC2626',
                    opacity: accounts.length === 0 ? 0.5 : 1,
                  },
                ]}
              >
                <AppText style={styles.confirmButtonText}>Confirm</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={calendarVisible && visible && debt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <AppText style={styles.calendarTitle}>
                {isReceivable ? 'Collection date' : 'Payment date'}
              </AppText>

              <Pressable
                onPress={() => setCalendarVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color="#333" />
              </Pressable>
            </View>

            <View style={styles.monthHeader}>
              <Pressable
                onPress={() => changeCalendarMonth(-1)}
                style={styles.monthArrow}
              >
                <Ionicons name="chevron-back" size={22} color="#334155" />
              </Pressable>

              <AppText style={styles.monthTitle}>
                {MONTH_NAMES[calendarMonth.getMonth()]}{' '}
                {calendarMonth.getFullYear()}
              </AppText>

              <Pressable
                onPress={() => changeCalendarMonth(1)}
                style={styles.monthArrow}
              >
                <Ionicons name="chevron-forward" size={22} color="#334155" />
              </Pressable>
            </View>

            <View style={styles.calendarGrid}>
              {WEEK_DAYS.map((day) => (
                <View key={day} style={styles.calendarDayHeader}>
                  <AppText style={styles.calendarDayHeaderText}>
                    {day}
                  </AppText>
                </View>
              ))}

              {calendarDays.map((day) => {
                const value = toDateString(day);
                const selected = date === value;
                const inCurrentMonth =
                  day.getMonth() === calendarMonth.getMonth();

                return (
                  <Pressable
                    key={value}
                    onPress={() => selectCalendarDate(day)}
                    style={[
                      styles.calendarDay,
                      selected && styles.calendarDaySelected,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.calendarDayText,
                        !inCurrentMonth && styles.calendarDayOutside,
                        selected && styles.calendarDayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <Pressable
                onPress={() => selectCalendarDate(new Date())}
                style={styles.todayButton}
              >
                <AppText style={styles.todayButtonText}>Today</AppText>
              </Pressable>

              <Pressable
                onPress={() => setCalendarVisible(false)}
                style={styles.calendarDoneButton}
              >
                <AppText style={styles.calendarDoneText}>Done</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit individual payment modal                                              */
/* -------------------------------------------------------------------------- */

interface ModalEditPaymentProps {
  visible: boolean;
  debt: Debt | null;
  payment: DebtPayment | null;
  onClose: () => void;
  onSave: (amount: string, date: string, note: string) => void;
}

function ModalEditPayment({
  visible,
  debt,
  payment,
  onClose,
  onSave,
}: ModalEditPaymentProps) {
  const { colors } = useTheme();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1, 12);
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
      12,
    );

    const firstCell = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1 - firstDay.getDay(),
      12,
    );

    return Array.from({ length: 42 }, (_, index) =>
      new Date(
        firstCell.getFullYear(),
        firstCell.getMonth(),
        firstCell.getDate() + index,
        12,
      ),
    );
  }, [calendarMonth]);

  // Refresh the modal fields whenever a different payment is opened.
  const paymentId = payment?.id;

  useMemo(() => {
    if (visible && payment) {
      setAmount(String(payment.amount));
      setDate(payment.date);
      setNote(payment.note ?? '');
    }
  }, [visible, paymentId]);

  if (!debt || !payment) return null;

  const maximumAllowed = getRemainingExcludingPayment(debt, payment.id);

  const openCalendar = () => {
    const parsed = parseDate(date);
    const initialDate = parsed ?? new Date();

    setCalendarMonth(
      new Date(
        initialDate.getFullYear(),
        initialDate.getMonth(),
        1,
        12,
      ),
    );

    setCalendarVisible(true);
  };

  const selectCalendarDate = (selectedDate: Date) => {
    setDate(toDateString(selectedDate));
    setCalendarVisible(false);
  };

  const changeCalendarMonth = (amountToChange: number) => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + amountToChange,
          1,
          12,
        ),
    );
  };

  const handleSave = () => {
    onSave(amount, date, note);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            <ScrollView
              style={styles.paymentScroll}
              contentContainerStyle={styles.paymentScrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h2">Edit payment</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {debt.personName}
                  </AppText>
                </View>

                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={23} color={colors.text} />
                </Pressable>
              </View>

              <AppText variant="caption" color="textSecondary">
                Maximum allowed for this payment
              </AppText>

              <AppText style={styles.modalRemaining}>
                {formatAmount(maximumAllowed, debt.currencyCode)} {debt.currencyCode}
              </AppText>

              <AppText style={styles.fieldLabel}>Amount</AppText>

              <TextInput
                style={styles.modalInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="Enter amount"
                placeholderTextColor="#999"
              />

              <AppText style={styles.fieldLabel}>Payment date</AppText>

              <View style={styles.dateInputContainer}>
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color="#64748b"
                />

                <TextInput
                  style={styles.dateInput}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={10}
                />

                <Pressable
                  onPress={openCalendar}
                  style={styles.calendarButton}
                  accessibilityRole="button"
                  accessibilityLabel="Choose payment date"
                >
                  <Ionicons name="calendar" size={20} color="#059669" />
                </Pressable>
              </View>

              <AppText style={styles.helperText}>
                Format: YYYY-MM-DD
              </AppText>

              <AppText style={styles.fieldLabel}>Note (optional)</AppText>

              <TextInput
                style={styles.modalInput}
                value={note}
                onChangeText={setNote}
                placeholder="Add a note"
                placeholderTextColor="#999"
              />

              <View style={styles.warningBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <AppText style={styles.warningText}>
                  This edits the selected payment and its existing account
                  transaction. It does not create a new account transaction.
                </AppText>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <AppText>Cancel</AppText>
              </Pressable>

              <Pressable
                onPress={handleSave}
                style={[
                  styles.confirmButton,
                  { backgroundColor: moduleColors.finance },
                ]}
              >
                <AppText style={styles.confirmButtonText}>
                  Save changes
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={calendarVisible && visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={styles.calendarOverlay}>
          <View style={styles.calendarModal}>
            <View style={styles.calendarHeader}>
              <AppText style={styles.calendarTitle}>
                Payment date
              </AppText>

              <Pressable
                onPress={() => setCalendarVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color="#333" />
              </Pressable>
            </View>

            <View style={styles.monthHeader}>
              <Pressable
                onPress={() => changeCalendarMonth(-1)}
                style={styles.monthArrow}
              >
                <Ionicons name="chevron-back" size={22} color="#334155" />
              </Pressable>

              <AppText style={styles.monthTitle}>
                {MONTH_NAMES[calendarMonth.getMonth()]}{' '}
                {calendarMonth.getFullYear()}
              </AppText>

              <Pressable
                onPress={() => changeCalendarMonth(1)}
                style={styles.monthArrow}
              >
                <Ionicons name="chevron-forward" size={22} color="#334155" />
              </Pressable>
            </View>

            <View style={styles.calendarGrid}>
              {WEEK_DAYS.map((day) => (
                <View key={day} style={styles.calendarDayHeader}>
                  <AppText style={styles.calendarDayHeaderText}>
                    {day}
                  </AppText>
                </View>
              ))}

              {calendarDays.map((day) => {
                const value = toDateString(day);
                const selected = date === value;
                const inCurrentMonth =
                  day.getMonth() === calendarMonth.getMonth();

                return (
                  <Pressable
                    key={value}
                    onPress={() => selectCalendarDate(day)}
                    style={[
                      styles.calendarDay,
                      selected && styles.calendarDaySelected,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.calendarDayText,
                        !inCurrentMonth && styles.calendarDayOutside,
                        selected && styles.calendarDayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <Pressable
                onPress={() => selectCalendarDate(new Date())}
                style={styles.todayButton}
              >
                <AppText style={styles.todayButtonText}>Today</AppText>
              </Pressable>

              <Pressable
                onPress={() => setCalendarVisible(false)}
                style={styles.calendarDoneButton}
              >
                <AppText style={styles.calendarDoneText}>Done</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  historyToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4 },
  quickHistory: { paddingHorizontal: 12, paddingBottom: 6, gap: 2 },
  quickPayment: { paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#94A3B855' },
  quickPaymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  tabs: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#fff',
  },
  receivableTabActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  payableTabActive: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 3,
    minHeight: 75,
    alignItems: 'center',
  },
  summaryCurrency: { alignItems: 'center', width: '100%', gap: 0 },
  summaryAmount: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 23,
    marginBottom: 11,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  debtCard: {
    marginBottom: 11,
  },
  debtMain: {
    gap: 12,
  },
  debtTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  debtNameContainer: {
    flex: 1,
    gap: 4,
  },
  personName: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountColumn: {
    flex: 1,
    gap: 3,
  },
  amountColumnRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  remainingAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  originalAmount: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    marginTop: 13,
    paddingTop: 13,
    gap: 13,
  },
  notesBox: {
    gap: 5,
  },
  paymentHistory: {
    gap: 9,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  paymentInfo: {
    flex: 1,
    gap: 3,
  },
  paymentDate: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  paymentActions: {
    alignItems: 'flex-end',
    gap: 7,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 9,
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  paymentModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '90%',
    flexShrink: 1,
  },
  paymentScroll: {
    flexShrink: 1,
  },
  paymentScrollContent: {
    paddingBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
    gap: 10,
  },
  modalRemaining: {
    fontSize: 21,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 13,
    marginBottom: 7,
  },
  modalInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#111',
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#fafafa',
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 9,
  },
  dateInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    paddingVertical: 9,
  },
  calendarButton: {
    padding: 5,
  },
  helperText: {
    fontSize: 11,
    color: '#888',
    marginTop: 5,
  },
  accountChoices: {
    gap: 5,
  },
  accountChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
  },
  accountChoiceActive: {
    borderColor: moduleColors.finance,
    backgroundColor: '#ECFDF5',
  },
  accountChoiceName: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: '#1E40AF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    paddingTop: 4,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  calendarOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 18,
  },
  calendarModal: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 17,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },
  monthArrow: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayHeader: {
    width: '14.2857%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  calendarDay: {
    width: '14.2857%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarDaySelected: {
    backgroundColor: '#059669',
  },
  calendarDayText: {
    fontSize: 13,
    color: '#1e293b',
  },
  calendarDayOutside: {
    color: '#cbd5e1',
  },
  calendarDayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 10,
  },
  todayButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  calendarDoneButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDoneText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
