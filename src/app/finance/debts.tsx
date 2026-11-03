
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
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
import { parseAmount } from '@/features/finance/utils/money';
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

const getPaidAmount = (debt: Debt) =>
  debt.payments.reduce((total, payment) => total + payment.amount, 0);

const getRemainingAmount = (debt: Debt) =>
  Math.max(0, debt.amount - getPaidAmount(debt));

const formatDate = (value?: string) => {
  if (!value) return 'No due date';

  const parts = value.split('-');

  if (parts.length !== 3) return value;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export default function DebtsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ direction?: string }>();
  const { colors } = useTheme();

  const financeReady = useFinanceHydrated();
  const ledgerReady = useLedgerHydrated();
  const ready = financeReady && ledgerReady;

  const debts = useFinanceStore((state) => state.debts);
  const addDebt = useFinanceStore((state) => state.addDebt);
  const updateDebt = useFinanceStore((state) => state.updateDebt);
  const deleteDebt = useFinanceStore((state) => state.deleteDebt);

  const addDebtPayment = useFinanceStore(
    (state) => state.addDebtPayment,
  );
  const deleteDebtPayment = useFinanceStore(
    (state) => state.deleteDebtPayment,
  );
  const updateDebtPayment = useFinanceStore(
    (state) => state.updateDebtPayment,
  );
  const linkDebtPaymentTransaction = useFinanceStore(
    (state) => state.linkDebtPaymentTransaction,
  );

  const accounts = useLedgerStore((state) => state.accounts);
  const categories = useLedgerStore((state) => state.categories);
  const addTransaction = useLedgerStore(
    (state) => state.addTransaction,
  );
  const updateTransaction = useLedgerStore(
    (state) => state.updateTransaction,
  );
  const removeTransaction = useLedgerStore(
    (state) => state.removeTransaction,
  );

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

  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);

  const visibleDebts = useMemo(
    () =>
      debts
        .filter((debt) => debt.direction === activeTab)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [debts, activeTab],
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
        ...values,
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
          `The debt amount cannot be less than the amount already paid (${formatAmount(alreadyPaid)}).`,
        );
        return;
      }

      updateDebt(editingDebt.id, data);
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

    const performDelete = () => deleteDebt(debt.id);

    if (Platform.OS === 'web') {
      if (window.confirm(message)) performDelete();
      return;
    }

    Alert.alert('Delete debt?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: performDelete,
      },
    ]);
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

    const amount = parseAmount(paymentAmount);

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

    if (amount > remaining + 0.000001) {
      Alert.alert(
        'Amount too large',
        `The remaining amount is ${formatAmount(remaining)} ${paymentDebt.currencyCode}.`,
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

    const paymentId = addDebtPayment(paymentDebt.id, {
      date: cleanPaymentDate,
      amount,
      note: paymentNote.trim() || undefined,
      accountId: account.id,
    });

    if (!paymentId) {
      Alert.alert(
        'Could not save payment',
        'The debt payment could not be created. No account transaction was added.',
      );
      return;
    }

    const transactionId = addTransaction({
      accountId: account.id,
      categoryId: category.id,
      amount,
      type: categoryKind,
      date: cleanPaymentDate,
      purpose:
        paymentDebt.direction === 'receivable'
          ? 'debt_collection'
          : 'debt_payment',
      linkedEntityType: 'debt',
      linkedEntityId: paymentDebt.id,
      linkedPaymentId: paymentId,
    });

    if (!transactionId) {
      deleteDebtPayment(paymentDebt.id, paymentId);

      Alert.alert(
        'Transaction not saved',
        'The account transaction could not be created. The debt payment was rolled back.',
      );
      return;
    }

    const paymentLinked = linkDebtPaymentTransaction(
      paymentDebt.id,
      paymentId,
      transactionId,
    );

    if (!paymentLinked) {
      // Roll back both sides if the newly posted transaction cannot be linked.
      removeTransaction(transactionId);
      deleteDebtPayment(paymentDebt.id, paymentId);

      Alert.alert(
        'Payment link failed',
        'The account transaction could not be linked to the debt payment. Both changes were rolled back.',
      );
      return;
    }

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
    const transactions = useLedgerStore.getState().transactions;

    // Recover a payment created by the earlier buggy flow only when there is
    // exactly one ledger entry with the complete matching debt/payment identity.
    const matchingTransactions = payment.ledgerTransactionId
      ? transactions.filter((item) => item.id === payment.ledgerTransactionId)
      : transactions.filter(
          (item) =>
            item.linkedEntityType === 'debt' &&
            item.linkedEntityId === debt.id &&
            item.linkedPaymentId === payment.id &&
            item.accountId === payment.accountId &&
            item.amount === payment.amount &&
            item.date === payment.date &&
            item.currencyCode === debt.currencyCode &&
            item.type ===
              (debt.direction === 'receivable' ? 'income' : 'expense') &&
            item.purpose ===
              (debt.direction === 'receivable'
                ? 'debt_collection'
                : 'debt_payment'),
        );

    if (matchingTransactions.length !== 1) {
      Alert.alert(
        'Cannot edit this payment',
        'A unique matching account transaction could not be verified. No changes were made.',
      );
      return;
    }

    const transaction = matchingTransactions[0];

    if (
      transaction.linkedEntityType !== 'debt' ||
      transaction.linkedEntityId !== debt.id ||
      transaction.linkedPaymentId !== payment.id ||
      transaction.accountId !== payment.accountId ||
      transaction.amount !== payment.amount ||
      transaction.date !== payment.date ||
      transaction.currencyCode !== debt.currencyCode ||
      transaction.type !==
        (debt.direction === 'receivable' ? 'income' : 'expense')
    ) {
      Alert.alert(
        'Payment link mismatch',
        'The linked account transaction could not be verified. No changes were made.',
      );
      return;
    }

    if (!payment.ledgerTransactionId) {
      const recovered = linkDebtPaymentTransaction(
        debt.id,
        payment.id,
        transaction.id,
      );

      if (!recovered) {
        Alert.alert(
          'Payment link recovery failed',
          'The account transaction was found but could not be safely linked. No changes were made.',
        );
        return;
      }
    }

    setEditingPayment({
      debt,
      payment: {
        ...payment,
        ledgerTransactionId: transaction.id,
      },
    });
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
    const amount = parseAmount(amountText);
    const cleanDate = date.trim();

    if (amount === null || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }

    if (!isValidDate(cleanDate)) {
      Alert.alert('Invalid date', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    // Calculate the maximum using every payment except the one being edited.
    const otherPaymentsTotal = debt.payments
      .filter((item) => item.id !== payment.id)
      .reduce((total, item) => total + item.amount, 0);

    const maximumAllowed = Math.max(
      0,
      debt.amount - otherPaymentsTotal,
    );

    if (amount > maximumAllowed + 0.000001) {
      Alert.alert(
        'Amount too large',
        `The maximum allowed for this payment is ${formatAmount(maximumAllowed)} ${debt.currencyCode}.`,
      );
      return;
    }

    if (!payment.ledgerTransactionId) {
      Alert.alert(
        'Cannot edit payment',
        'This payment has no linked account transaction.',
      );
      return;
    }

    // Read the latest transaction state before changing either store.
    const transaction = useLedgerStore
      .getState()
      .transactions.find(
        (item) => item.id === payment.ledgerTransactionId,
      );

    if (
      !transaction ||
      transaction.linkedEntityType !== 'debt' ||
      transaction.linkedEntityId !== debt.id ||
      transaction.linkedPaymentId !== payment.id ||
      transaction.accountId !== payment.accountId ||
      transaction.currencyCode !== debt.currencyCode
    ) {
      Alert.alert(
        'Payment link mismatch',
        'The account transaction could not be verified. No changes were made.',
      );
      return;
    }

    // Update the existing ledger entry. Never create a replacement transaction.
    const transactionUpdated = updateTransaction(
      transaction.id,
      {
        amount,
        date: cleanDate,
        note: note.trim() || undefined,
      },
    );

    if (!transactionUpdated) {
      Alert.alert(
        'Update failed',
        'The account transaction could not be updated. The debt payment was not changed.',
      );
      return;
    }

    // The payment record is updated only after its linked transaction succeeds.
    const paymentUpdated = updateDebtPayment(debt.id, payment.id, {
      amount,
      date: cleanDate,
      note: note.trim() || undefined,
    });

    if (!paymentUpdated) {
      // Restore the already-updated ledger entry if the debt record rejected
      // the change, keeping both persisted stores consistent.
      updateTransaction(transaction.id, {
        amount: transaction.amount,
        date: transaction.date,
        note: transaction.note,
      });
      Alert.alert(
        'Update failed',
        'The debt payment could not be updated. The account transaction was restored.',
      );
      return;
    }

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
          onPress={() => setActiveTab('receivable')}
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
          onPress={() => setActiveTab('payable')}
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
        <Card style={styles.summaryCard}>
          <AppText variant="caption" color="textSecondary">
            Total
          </AppText>

          {currencyTotals.length === 0 ? (
            <AppText style={styles.summaryAmount}>0</AppText>
          ) : (
            currencyTotals.map((item) => (
              <AppText key={item.currencyCode} style={styles.summaryAmount}>
                {item.currencyCode} {formatAmount(item.total)}
              </AppText>
            ))
          )}
        </Card>

        <Card style={styles.summaryCard}>
          <AppText variant="caption" color="textSecondary">
            Paid / Collected
          </AppText>

          {currencyTotals.length === 0 ? (
            <AppText style={[styles.summaryAmount, { color: '#059669' }]}>
              0
            </AppText>
          ) : (
            currencyTotals.map((item) => (
              <AppText
                key={item.currencyCode}
                style={[styles.summaryAmount, { color: '#059669' }]}
              >
                {item.currencyCode} {formatAmount(item.paid)}
              </AppText>
            ))
          )}
        </Card>

        <Card style={styles.summaryCard}>
          <AppText variant="caption" color="textSecondary">
            Remaining
          </AppText>

          {currencyTotals.length === 0 ? (
            <AppText
              style={[
                styles.summaryAmount,
                {
                  color: activeTab === 'receivable' ? '#059669' : '#DC2626',
                },
              ]}
            >
              0
            </AppText>
          ) : (
            currencyTotals.map((item) => (
              <AppText
                key={item.currencyCode}
                style={[
                  styles.summaryAmount,
                  {
                    color: activeTab === 'receivable' ? '#059669' : '#DC2626',
                  },
                ]}
              >
                {item.currencyCode} {formatAmount(item.remaining)}
              </AppText>
            ))
          )}
        </Card>
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
                  setExpandedDebtId(expanded ? null : debt.id)
                }
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
                      {formatAmount(remaining)} {debt.currencyCode}
                    </AppText>
                  </View>

                  <View style={styles.amountColumnRight}>
                    <AppText variant="caption" color="textSecondary">
                      Original
                    </AppText>
                    <AppText style={styles.originalAmount}>
                      {formatAmount(debt.amount)} {debt.currencyCode}
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
                    Paid / collected: {formatAmount(paid)}
                  </AppText>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </View>
              </Pressable>

              {expanded && (
                <View style={styles.expandedContent}>
                  {debt.notes ? (
                    <View style={styles.notesBox}>
                      <AppText variant="caption" color="textSecondary">
                        Notes
                      </AppText>
                      <AppText>{debt.notes}</AppText>
                    </View>
                  ) : null}

                  {debt.payments.length > 0 && (
                    <View style={styles.paymentHistory}>
                      <AppText style={styles.historyTitle}>
                        Payment history
                      </AppText>

                      {debt.payments.map((payment) => (
                        <View key={payment.id} style={styles.paymentRow}>
                          <View style={styles.paymentInfo}>
                            <AppText style={styles.paymentDate}>
                              {formatDate(payment.date)}
                            </AppText>

                            {payment.note ? (
                              <AppText
                                variant="caption"
                                color="textSecondary"
                              >
                                {payment.note}
                              </AppText>
                            ) : null}
                          </View>

                          <View style={styles.paymentActions}>
                            <AppText style={styles.paymentAmount}>
                              {formatAmount(payment.amount)} {debt.currencyCode}
                            </AppText>

                            <Pressable
                              onPress={() => openEditPayment(debt, payment)}
                              style={styles.editPaymentButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit payment dated ${formatDate(payment.date)}`}
                            >
                              <Ionicons
                                name="create-outline"
                                size={16}
                                color={moduleColors.finance}
                              />
                              <AppText style={styles.editPaymentText}>
                                Edit
                              </AppText>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.actionRow}>
                    {remaining > 0 && (
                      <Pressable
                        onPress={() => openPayment(debt)}
                        style={[
                          styles.primaryAction,
                          {
                            backgroundColor:
                              activeTab === 'receivable'
                                ? '#059669'
                                : '#DC2626',
                          },
                        ]}
                      >
                        <Ionicons
                          name={
                            activeTab === 'receivable'
                              ? 'download-outline'
                              : 'card-outline'
                          }
                          size={17}
                          color="#fff"
                        />
                        <AppText style={styles.primaryActionText}>
                          {activeTab === 'receivable'
                            ? 'Record collection'
                            : 'Record payment'}
                        </AppText>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() => openEditDebt(debt)}
                      style={styles.secondaryAction}
                    >
                      <Ionicons
                        name="create-outline"
                        size={18}
                        color={moduleColors.finance}
                      />
                    </Pressable>

                    <Pressable
                      onPress={() => confirmDeleteDebt(debt)}
                      style={styles.secondaryAction}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.danger}
                      />
                    </Pressable>
                  </View>
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
                {formatAmount(getRemainingAmount(debt))} {debt.currencyCode}
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

  const otherPaymentsTotal = debt.payments
    .filter((item) => item.id !== payment.id)
    .reduce((total, item) => total + item.amount, 0);

  const maximumAllowed = Math.max(
    0,
    debt.amount - otherPaymentsTotal,
  );

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
                {formatAmount(maximumAllowed)} {debt.currencyCode}
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
    paddingVertical: 12,
    gap: 5,
    minHeight: 90,
  },
  summaryAmount: {
    fontSize: 12,
    fontWeight: '800',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  editPaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  editPaymentText: {
    fontSize: 11,
    fontWeight: '700',
    color: moduleColors.finance,
  },
  actionRow: {
    flexDirection: 'row',
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
  secondaryAction: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
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
