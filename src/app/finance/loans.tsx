import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppButton, AppText, Card, DateField, Screen } from '@/components/ui';
import { AddAccountModal, type AddAccountFormData } from '@/features/finance/components/AddAccountModal';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Loan, NewLoanInput } from '@/features/finance/types/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { parseAmount } from '@/features/finance/utils/money';
import { getLoanPaidAmount, getLoanRemainingAmount, getLoanTotal, roundMoney } from '@/features/finance/utils/finance';
import { moduleColors, useTheme } from '@/theme';

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const money = (value: string) => {
  const parsed = parseAmount(value);
  return parsed === null ? null : roundMoney(parsed);
};
const remaining = getLoanRemainingAmount;
export default function LoansScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const financeReady = useFinanceHydrated();
  const ledgerReady = useLedgerHydrated();
  const ready = financeReady && ledgerReady;
  const loans = useFinanceStore(s => s.loans);
  const addLoan = useFinanceStore(s => s.addLoan);
  const baseCurrency = useCurrencyStore(s => s.baseCurrency);
  const addAccount = useLedgerStore(s => s.addAccount);
  const updateLoan = useFinanceStore(s => s.updateLoan);
  const addLoanPayment = useFinanceStore(s => s.addLoanPayment);
  const updateLoanPayment = useFinanceStore(s => s.updateLoanPayment);
  const deleteLoanPayment = useFinanceStore(s => s.deleteLoanPayment);
  const accounts = useLedgerStore(s => s.accounts);
  const categories = useLedgerStore(s => s.categories);
  const addTransaction = useLedgerStore(s => s.addTransaction);
  const updateTransaction = useLedgerStore(s => s.updateTransaction);
  const removeTransaction = useLedgerStore(s => s.removeTransaction);
  const transactions = useLedgerStore(s => s.transactions);

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanName, setLoanName] = useState('');
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState('');
  const [total, setTotal] = useState('');
  const [installment, setInstallment] = useState('');
  const [count, setCount] = useState('');
  const [firstDue, setFirstDue] = useState(today());
  const [currency, setCurrency] = useState(baseCurrency);
  const [depositAccountId, setDepositAccountId] = useState('');
  const [depositMethod, setDepositMethod] = useState<'account' | 'custom'>('account');
  const [customDepositMethod, setCustomDepositMethod] = useState('');
  const [showDepositPicker, setShowDepositPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [latePaymentFee, setLatePaymentFee] = useState('0');
  const [paymentDate, setPaymentDate] = useState(today());
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'account' | 'custom'>('account');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [showAddBank, setShowAddBank] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [customChoiceFor, setCustomChoiceFor] = useState<'deposit' | 'payment' | null>(null);
  const [note, setNote] = useState('');
  const [settlementMode, setSettlementMode] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Loan['payments'][number] | null>(null);
  const [closingLoan, setClosingLoan] = useState<Loan | null>(null);
  const [closureReason, setClosureReason] = useState('');
  const [receivingLoan, setReceivingLoan] = useState<Loan | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [receivedDate, setReceivedDate] = useState(today());
  const [receiptAccountId, setReceiptAccountId] = useState('');
  const [receiptMethod, setReceiptMethod] = useState<'account' | 'custom'>('account');
  const [receiptMethodLabel, setReceiptMethodLabel] = useState('');

  const activeAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts]);
  const paymentAccounts = useMemo(() => activeAccounts
    .filter(a => a.currencyCode === selectedLoan?.currencyCode && a.type !== 'credit_card')
    .sort((a, b) => Number(b.type === 'bank') - Number(a.type === 'bank')),
    [activeAccounts, selectedLoan?.currencyCode]);
  const depositAccounts = useMemo(() => activeAccounts
    .filter(a => a.currencyCode === currency && a.type !== 'credit_card')
    .sort((a, b) => Number(b.type === 'bank') - Number(a.type === 'bank')),
    [activeAccounts, currency]);
  const expenseCategory = categories.find(c => c.kind === 'expense' && c.id === 'cat_bills')
    ?? categories.find(c => c.kind === 'expense');
  const incomeCategory = categories.find(c => c.kind === 'income' && c.id === 'cat_other_in')
    ?? categories.find(c => c.kind === 'income');

  const resetLoanForm = () => {
    setShowLoanForm(false); setLoanName(''); setLender(''); setPrincipal('');
    setTotal(''); setInstallment(''); setCount(''); setFirstDue(today()); setCurrency(baseCurrency);
    setDepositAccountId(''); setDepositMethod('account'); setCustomDepositMethod('');
  };

  const saveLoan = () => {
    const p = money(principal);
    const m = money(installment);
    const n = Number(count);
    const enteredTotal = total.trim() ? money(total) : null;
    const t = enteredTotal ?? (m !== null ? roundMoney(m * n) : null);
    if (!loanName.trim() || !lender.trim() || p === null || p <= 0 ||
      t === null || t < p || m === null || m <= 0 ||
      !Number.isInteger(n) || n < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
      Alert.alert('Check loan details', 'Enter the lender, loan name, valid principal, total repayment, installment, number of installments and first due date. Total repayment cannot be less than principal.');
      return;
    }
    const input: NewLoanInput = {
      name: loanName.trim(), lenderName: lender.trim(), principalAmount: p,
      totalRepaymentAmount: t, monthlyInstallment: m, numberOfInstallments: n,
      firstDueDate: firstDue, currencyCode: currency, status: 'active',
      ...(depositMethod === 'account' && depositAccountId
        ? { depositAccountId }
        : depositMethod === 'custom' && customDepositMethod.trim()
          ? { depositMethodLabel: customDepositMethod.trim() }
          : {}),
    };
    addLoan(input);
    resetLoanForm();
  };

  const openPayment = (loan: Loan, early = false) => {
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    setSelectedLoan(loan);
    setSettlementMode(early);
    const suggestedAmount = early ? remaining(loan) : Math.min(loan.monthlyInstallment, remaining(loan));
    setPaymentAmount(String(suggestedAmount));
    setLatePaymentFee('0');
    setPaymentDate(today());
    setAccountId(matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setPaymentMethod('account');
    setCustomPaymentMethod('');
    setNote('');
  };

  const closePayment = () => { setSelectedLoan(null); setPaymentAmount(''); setLatePaymentFee('0'); setNote(''); setSettlementMode(false); setEditingPayment(null); setPaymentMethod('account'); setCustomPaymentMethod(''); };

  const openReceiveLoan = (loan: Loan) => {
    if (loan.receivedAt || loan.receiptTransactionId) {
      Alert.alert('Already confirmed', 'The loan receipt has already been recorded.');
      return;
    }
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    const savedAccount = matching.find(a => a.id === loan.depositAccountId);
    setReceivingLoan(loan);
    setReceivedAmount(String(loan.principalAmount ?? 0));
    setReceivedDate(today());
    setReceiptAccountId(savedAccount?.id ?? matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setReceiptMethod(savedAccount ? 'account' : loan.depositMethodLabel ? 'custom' : 'account');
    setReceiptMethodLabel(loan.depositMethodLabel ?? '');
  };

  const confirmLoanReceived = () => {
    if (!receivingLoan) return;
    const current = useFinanceStore.getState().loans.find(l => l.id === receivingLoan.id);
    if (!current || current.receivedAt || current.receiptTransactionId) {
      Alert.alert('Already confirmed', 'This loan receipt has already been recorded.');
      setReceivingLoan(null);
      return;
    }
    const amount = money(receivedAmount);
    const account = receiptMethod === 'account'
      ? activeAccounts.find(a => a.id === receiptAccountId && a.currencyCode === receivingLoan.currencyCode && !a.archived && a.type !== 'credit_card')
      : undefined;
    const label = receiptMethodLabel.trim();
    const originalPrincipal = receivingLoan.principalAmount;
    if (amount === null || !Number.isFinite(amount) || amount <= 0 ||
      (originalPrincipal !== undefined && amount > originalPrincipal + 0.001) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) ||
      (receiptMethod === 'account' && !account) ||
      (receiptMethod === 'custom' && !label)) {
      Alert.alert('Check receipt details', 'Enter a valid received amount no greater than the original loan principal, a valid date, and a matching account or receipt method.');
      return;
    }
    if (receiptMethod === 'account' && !incomeCategory) {
      Alert.alert('Income category required', 'Add or restore an income category before confirming receipt. No account transaction has been created.');
      return;
    }
    let transactionId: string | undefined;
    if (account) {
      transactionId = addTransaction({
        type: 'income',
        amount,
        accountId: account.id,
        categoryId: incomeCategory!.id,
        linkedEntityType: 'loan',
        linkedEntityId: receivingLoan.id,
        date: receivedDate,
        note: `Loan received: ${receivingLoan.name}`,
      }) ?? undefined;
      if (!transactionId) {
        Alert.alert('Receipt not posted', 'The income transaction could not be created. The loan remains unconfirmed.');
        return;
      }
    }
    updateLoan(receivingLoan.id, {
      receivedAt: receivedDate,
      receivedAmount: amount,
      ...(account ? { receiptTransactionId: transactionId } : { depositMethodLabel: label, depositAccountId: undefined }),
    });
    const saved = useFinanceStore.getState().loans.find(l => l.id === receivingLoan.id);
    if (
      !saved?.receivedAt ||
      Math.abs((saved.receivedAmount ?? 0) - amount) > 0.001 ||
      (account && saved.receiptTransactionId !== transactionId) ||
      (!account && saved.depositMethodLabel !== label)
    ) {
      if (transactionId) removeTransaction(transactionId);
      Alert.alert('Receipt confirmation failed', 'The transaction was rolled back because the loan confirmation could not be saved.');
      return;
    }
    setReceivingLoan(null);
  };

  const confirmCloseWithoutPayment = () => {
    if (!closingLoan || !closureReason.trim()) {
      Alert.alert('Reason required', 'Enter a reason for closing this loan without a payment.');
      return;
    }
    Alert.alert('Close loan without payment?', 'This will remove the outstanding loan from net worth without creating an account transaction. The loan and its payment history will remain saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close loan', style: 'destructive', onPress: () => {
        updateLoan(closingLoan.id, { status: 'closed', closureDate: today(), closureReason: closureReason.trim() });
        setClosingLoan(null);
        setClosureReason('');
      } },
    ]);
  };

  const confirmPayment = () => {
    if (!selectedLoan) return;
    const amount = money(paymentAmount);
    const fee = latePaymentFee.trim() ? money(latePaymentFee) : 0;
    const cashAmount = amount !== null && fee !== null ? roundMoney(amount + fee) : null;
    if (!editingPayment && paymentMethod === 'account' && !expenseCategory) {
      Alert.alert('Expense category required', 'Add or restore an expense category before recording a loan payment. No payment has been recorded.');
      return;
    }
    const scheduledTotal = getLoanTotal(selectedLoan);
    const outstanding = editingPayment ? Math.max(0, scheduledTotal - getLoanPaidAmount({ ...selectedLoan, payments: selectedLoan.payments.filter(p => p.id !== editingPayment.id) })) : remaining(selectedLoan);
    const account = paymentMethod === 'account' ? activeAccounts.find(a => a.id === accountId && a.currencyCode === selectedLoan.currencyCode && a.type !== 'credit_card') : undefined;
    const customLabel = customPaymentMethod.trim();
    if (
      amount === null || amount <= 0 || amount > outstanding + 0.001 ||
      fee === null || !Number.isFinite(fee) || fee < 0 ||
      cashAmount === null || !Number.isFinite(cashAmount) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
      (paymentMethod === 'account' && !account) ||
      (paymentMethod === 'custom' && !customLabel)
    ) {
      Alert.alert('Invalid payment', 'Check the installment amount, late fee, date and payment method. The installment cannot exceed the remaining contract balance.');
      return;
    }
    if (editingPayment) {
      const txId = editingPayment.ledgerTransactionId;
      if (txId && !account) { Alert.alert('Payment method locked', 'This payment is linked to an account. Keep a registered account selected.'); return; }
      if (!txId && account) { Alert.alert('Payment method locked', 'This payment was recorded with a custom method. Keep the custom method selected when editing it.'); return; }
      const previous = txId ? transactions.find(t => t.id === txId) : undefined;
      if (txId && !previous) { Alert.alert('Update failed', 'The linked account transaction could not be found. No changes were made.'); return; }
      if (txId && account) {
        const ok = updateTransaction(txId, { amount: cashAmount, accountId: account.id, date: paymentDate, note: note.trim() || `Loan payment: ${selectedLoan.name}` });
        if (!ok) { Alert.alert('Update failed', 'The linked account transaction could not be updated.'); return; }
      }

      updateLoanPayment(selectedLoan.id, editingPayment.id, {
        amount,
        latePaymentFee: fee,
        paymentMode: 'simple',
        date: paymentDate,
        note: note.trim() || undefined,
        accountId: account?.id,
        paymentMethodLabel: account ? undefined : customLabel,
      });
      const saved = useFinanceStore.getState().loans
        .find(l => l.id === selectedLoan.id)?.payments
        .find(p => p.id === editingPayment.id);
      const paymentSaved = !!saved &&
        Math.abs(saved.amount - amount) <= 0.001 &&
        Math.abs((saved.latePaymentFee ?? 0) - fee) <= 0.001 &&
        saved.paymentMode === 'simple' &&
        saved.date === paymentDate;
      if (!paymentSaved) {
        if (txId && previous) {
          updateTransaction(txId, {
            amount: previous.amount,
            accountId: previous.accountId,
            date: previous.date,
            note: previous.note,
          });
        }
        Alert.alert('Update rejected', txId ? 'The account transaction was restored because the payment details were rejected.' : 'The payment details were rejected; the previous payment was kept.');
        return;
      }

      if (selectedLoan.settlementPaymentId === editingPayment.id) {
        updateLoan(selectedLoan.id, {
          status: 'settled',
          settlementAmount: amount,
          settlementDate: paymentDate,
          settlementAccountId: account?.id,
          settlementNote: note.trim() || undefined,
        });
      } else {
        const paid = getLoanPaidAmount({
          ...selectedLoan,
          payments: selectedLoan.payments.map((payment) =>
            payment.id === editingPayment.id
              ? { ...payment, amount }
              : payment
          ),
        });
        updateLoan(selectedLoan.id, {
          status: scheduledTotal - paid <= 0.001 ? 'completed' : 'active',
        });
      }
      closePayment(); return;
    }

    const paymentId = addLoanPayment(selectedLoan.id, {
      amount,
      latePaymentFee: fee,
      paymentMode: 'simple',
      date: paymentDate,
      note: note.trim() || (settlementMode ? 'Early settlement' : undefined),
      ...(account ? { accountId: account.id } : { paymentMethodLabel: customLabel }),
    });
    if (!paymentId) { Alert.alert('Payment not saved', 'The loan store rejected this payment.'); return; }
    if (account) {
      const txId = addTransaction({
        type: 'expense',
        amount: cashAmount,
        accountId: account.id,
        categoryId: expenseCategory!.id,
        purpose: 'loan_payment',
        linkedEntityType: 'loan',
        linkedEntityId: selectedLoan.id,
        linkedPaymentId: paymentId,
        date: paymentDate,
        note: note.trim() || `Loan payment: ${selectedLoan.name}`,
      });
      if (!txId) {
        deleteLoanPayment(selectedLoan.id, paymentId);
        Alert.alert('Payment not posted', 'The account transaction failed; payment was rolled back.');
        return;
      }
      updateLoanPayment(selectedLoan.id, paymentId, { ledgerTransactionId: txId });
      const linked = useFinanceStore.getState().loans
        .find(l => l.id === selectedLoan.id)?.payments
        .find(p => p.id === paymentId)?.ledgerTransactionId === txId;
      if (!linked) {
        removeTransaction(txId);
        deleteLoanPayment(selectedLoan.id, paymentId);
        Alert.alert('Payment not posted', 'The account link could not be saved; both records were rolled back.');
        return;
      }
    }
    if (settlementMode) updateLoan(selectedLoan.id, { status: 'settled', settlementAmount: amount, settlementDate: paymentDate, settlementAccountId: account?.id, settlementPaymentId: paymentId, settlementNote: note.trim() || undefined });
    else if (outstanding - amount <= 0.001) updateLoan(selectedLoan.id, { status: 'completed' });
    closePayment();
  };
  const openEditPayment = (loan: Loan, payment: Loan['payments'][number]) => {
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    if (payment.ledgerTransactionId && !matching.length) { Alert.alert('Cannot edit payment', 'No active account in the payment currency is available.'); return; }
    setSelectedLoan(loan); setEditingPayment(payment); setSettlementMode(false);
    setPaymentAmount(String(payment.amount));
    setLatePaymentFee(String(payment.latePaymentFee ?? 0));
    setPaymentDate(payment.date);
    setAccountId(payment.accountId && matching.some(a => a.id === payment.accountId) ? payment.accountId : matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setPaymentMethod(payment.ledgerTransactionId ? 'account' : 'custom'); setCustomPaymentMethod(payment.paymentMethodLabel ?? ''); setNote(payment.note ?? '');
  };
  const confirmDeletePayment = (loan: Loan, payment: Loan['payments'][number]) => {
    Alert.alert('Delete payment?', 'The linked account transaction will also be removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        if (payment.ledgerTransactionId) {
          try {
            removeTransaction(payment.ledgerTransactionId);
            if (useLedgerStore.getState().transactions.some(t => t.id === payment.ledgerTransactionId)) {
              Alert.alert('Cannot delete', 'The linked account transaction is protected or could not be removed. The loan payment was kept.');
              return;
            }
          } catch { Alert.alert('Cannot delete', 'The linked transaction could not be removed.'); return; }
        }
        deleteLoanPayment(loan.id, payment.id);
        if (loan.status === 'completed') {
          updateLoan(loan.id, { status: 'active' });
        } else if (loan.status === 'settled' && loan.settlementPaymentId === payment.id) {
          updateLoan(loan.id, {
            status: 'active', settlementAmount: undefined, settlementDate: undefined,
            settlementAccountId: undefined, settlementPaymentId: undefined, settlementNote: undefined,
          });
        }
      }},
    ]);
  };

  if (!ready) return <Screen><View style={styles.center}><ActivityIndicator color={moduleColors.finance} /></View></Screen>;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><AppText variant="h1">Loans</AppText><AppText variant="caption" color="textSecondary">{loans.length} loans</AppText></View>
      </View>
      <AppText color="textSecondary" style={{ marginBottom: 16 }}>
        Track money borrowed, confirm received funds, record repayments, and monitor your outstanding loan balance.
      </AppText>
      <AppButton title="Add loan" accentColor={moduleColors.finance} leftIcon={<Ionicons name="add" size={18} color={colors.onPrimary} />} onPress={() => setShowLoanForm(true)} />
      {loans.length === 0 ? <Card variant="filled"><AppText align="center" color="textSecondary">No loans recorded yet. Add your first loan.</AppText></Card> :
        loans.map(loan => {
          const paid = getLoanPaidAmount(loan);
          const due = remaining(loan);
          return <Card key={loan.id} style={styles.loanCard}>
            <View style={styles.row}><View style={{ flex: 1 }}><AppText variant="h2">{loan.name}</AppText><AppText color="textSecondary" variant="caption">{loan.lenderName} · {loan.currencyCode}</AppText></View>
              <AppText style={{ color: loan.status === 'active' || !loan.status ? colors.warning : colors.success }}>{loan.status === 'settled' ? 'Settled' : loan.status === 'completed' ? 'Completed' : loan.status === 'closed' ? 'Closed without payment' : 'Active'}</AppText>
            </View>
            <View style={styles.metrics}>
              <View><AppText variant="caption" color="textSecondary">Original principal</AppText><AppText>{formatAmount(loan.principalAmount ?? 0)} {loan.currencyCode}</AppText></View>
              <View><AppText variant="caption" color="textSecondary">Contract total</AppText><AppText>{formatAmount(getLoanTotal(loan))} {loan.currencyCode}</AppText></View>
              <View><AppText variant="caption" color="textSecondary">Remaining</AppText><AppText style={styles.remaining}>{formatAmount(due)} {loan.currencyCode}</AppText></View>
            </View>
            <AppText variant="caption" color="textSecondary">Paid: {formatAmount(paid)} {loan.currencyCode} · Installment: {formatAmount(loan.monthlyInstallment)} {loan.currencyCode}</AppText>
            <AppText variant="caption" color="textSecondary">Payments recorded: {loan.payments.length} · Scheduled installments remaining: {loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed' ? 0 : Math.max(0, loan.numberOfInstallments - loan.payments.length)} · First due {loan.firstDueDate}</AppText>
            {loan.receivedAt
              ? <AppText color="success" variant="caption">Received: {formatAmount(loan.receivedAmount ?? loan.principalAmount ?? 0)} {loan.currencyCode} on {loan.receivedAt}{loan.receiptTransactionId ? ' · Posted to account' : ' · Custom method'}</AppText>
              : <View style={styles.actions}><AppButton title="Confirm loan received" fullWidth={false} variant="outline" onPress={() => openReceiveLoan(loan)} /></View>}
            {loan.status !== 'settled' && loan.status !== 'completed' && loan.status !== 'closed' && <View style={styles.actions}>
              <AppButton title="Record payment" fullWidth={false} onPress={() => openPayment(loan)} />
              <AppButton title="Early settlement" fullWidth={false} variant="outline" onPress={() => openPayment(loan, true)} />
              <AppButton title="Close without payment" fullWidth={false} variant="danger" onPress={() => { setClosingLoan(loan); setClosureReason(''); }} />
            </View>}
            {loan.status === 'closed' && <AppText color="warning">Closed without payment on {loan.closureDate}: {loan.closureReason}</AppText>}
            {loan.status === 'settled' && (() => {
              const scheduled = getLoanTotal(loan);
              const paidBeforeSettlement = getLoanPaidAmount({
                ...loan,
                payments: loan.payments.filter(
                  payment => payment.id !== loan.settlementPaymentId
                ),
              });
              const saved = Math.max(0, scheduled - paidBeforeSettlement - (loan.settlementAmount ?? 0));
              return <View style={{ gap: 4 }}>
                <AppText color="success">Settlement: {formatAmount(loan.settlementAmount ?? 0)} {loan.currencyCode} on {loan.settlementDate}</AppText>
                {saved > 0.001 && <AppText color="success" variant="caption">Early settlement saving: {formatAmount(saved)} {loan.currencyCode}</AppText>}
              </View>;
            })()}
            {loan.payments.length > 0 && <View style={styles.history}><AppText style={{ fontWeight: '600' }}>Payment history</AppText>
              {loan.payments.map(payment => <View key={payment.id} style={styles.paymentRow}>
                <View style={{ flex: 1 }}><AppText>{formatAmount(payment.amount)} {loan.currencyCode}{(payment.latePaymentFee ?? 0) > 0 ? ` · Fee: ${formatAmount(payment.latePaymentFee!)} ${loan.currencyCode}` : ''}</AppText><AppText variant="caption" color="textSecondary">{payment.date} · {payment.note || 'Installment'}</AppText></View>
                <View style={styles.row}><Pressable onPress={() => openEditPayment(loan, payment)} hitSlop={8}><Ionicons name="create-outline" size={16} color={moduleColors.finance} /></Pressable><Pressable onPress={() => confirmDeletePayment(loan, payment)} hitSlop={8}><Ionicons name="trash-outline" size={16} color={colors.danger} /></Pressable></View>
              </View>)}
            </View>}
          </Card>;
        })}
      <AddAccountModal visible={showAddBank} initialType="Bank" onClose={() => setShowAddBank(false)} onSave={(data: AddAccountFormData) => {
        const initialBalance = money(data.amount);
        if (!data.accountName.trim() || data.selectedType !== 'Bank' || initialBalance === null) { Alert.alert('Bank details required', 'Enter a valid bank account name and balance.'); return; }
        const id = addAccount({ name: data.accountName.trim(), type: 'bank', currencyCode: data.selectedCurrency, initialBalance });
        setShowAddBank(false);
        if (selectedLoan && data.selectedCurrency === selectedLoan.currencyCode) { setAccountId(id); setPaymentMethod('account'); }
        else if (showLoanForm && data.selectedCurrency === currency) { setDepositAccountId(id); setDepositMethod('account'); }
      }} />
      <Modal visible={showLoanForm} transparent animationType="slide" onRequestClose={resetLoanForm}>
        <View style={styles.overlay}>
          <View style={[styles.loanFormModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">New loan</AppText>
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formFields} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              <Field label="Loan name" value={loanName} onChangeText={setLoanName} />
              <Field label="Lender / bank" value={lender} onChangeText={setLender} />
              <Field label="Original principal (amount borrowed)" value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" />
              <Field label="Total repayment (principal + interest)" value={total} onChangeText={setTotal} keyboardType="decimal-pad" />
              <Field label="Monthly installment (amount per month)" value={installment} onChangeText={setInstallment} keyboardType="decimal-pad" />
              <Field label="Number of installments (months)" value={count} onChangeText={setCount} keyboardType="number-pad" />
              <DateField label="First due date" value={firstDue} onChange={setFirstDue} />
              <AppText variant="caption" color="textSecondary">Loan currency</AppText>
              <Pressable onPress={() => setShowCurrencyPicker(true)} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <AppText>{currency}</AppText><Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
              <AppText variant="caption" color="textSecondary">Deposit to account / Where did you receive the loan?</AppText>
              <Pressable onPress={() => setShowDepositPicker(true)} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <AppText>{depositMethod === 'custom'
                  ? (customDepositMethod.trim() || 'Custom / مخصص')
                  : (activeAccounts.find(a => a.id === depositAccountId)?.name ?? 'Select a matching account')}</AppText>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
              {depositMethod === 'custom' && <Field label="Receipt method (e.g. Cash)" value={customDepositMethod} onChangeText={setCustomDepositMethod} />}
            </ScrollView>
            <View style={styles.actions}>
              <AppButton title="Save loan" onPress={saveLoan} />
              <AppButton title="Cancel" variant="outline" onPress={resetLoanForm} />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showDepositPicker} transparent animationType="fade" onRequestClose={() => setShowDepositPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDepositPicker(false)} />
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">Choose deposit method</AppText>
            <AppText variant="caption" color="textSecondary">Accounts in {currency}</AppText>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {depositAccounts.map(account => (
                <Pressable key={account.id} onPress={() => {
                  setDepositAccountId(account.id); setDepositMethod('account'); setShowDepositPicker(false);
                }} style={styles.pickerOption}>
                  <AppText>{account.name} · {account.currencyCode}{account.type === 'bank' ? ' · Bank' : ''}</AppText>
                  {depositMethod === 'account' && depositAccountId === account.id && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
                </Pressable>
              ))}
              {depositAccounts.length === 0 && <AppText color="textSecondary">No active matching accounts.</AppText>}
              <Pressable onPress={() => {
                setShowDepositPicker(false); setCustomChoiceFor('deposit');
              }} style={styles.pickerOption}>
                <AppText>Custom / مخصص</AppText>
                {depositMethod === 'custom' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={!!customChoiceFor} transparent animationType="fade" onRequestClose={() => setCustomChoiceFor(null)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCustomChoiceFor(null)} />
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">Custom method</AppText>
            <AppText variant="caption" color="textSecondary">Choose how you want to continue.</AppText>
            <Pressable onPress={() => {
              setCustomChoiceFor(null);
              setShowAddBank(true);
            }} style={styles.pickerOption}>
              <AppText>Add new bank account</AppText><Ionicons name="add-circle-outline" size={20} color={moduleColors.finance} />
            </Pressable>
            <Pressable onPress={() => {
              if (customChoiceFor === 'deposit') {
                setDepositMethod('custom'); setDepositAccountId('');
              } else {
                setPaymentMethod('custom'); setAccountId('');
              }
              setCustomChoiceFor(null);
            }} style={styles.pickerOption}>
              <AppText>Other / Something else</AppText><Ionicons name="wallet-outline" size={20} color={moduleColors.finance} />
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={showCurrencyPicker} transparent animationType="fade" onRequestClose={() => setShowCurrencyPicker(false)}>

        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCurrencyPicker(false)} />
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">Choose loan currency</AppText>
            {['OMR', 'EGP', 'SAR', 'AED', 'USD', 'EUR', 'GBP', 'JOD', 'QAR', 'KWD'].map(code => (
              <Pressable key={code} onPress={() => { setCurrency(code); setShowCurrencyPicker(false); }} style={styles.pickerOption}>
                <AppText>{code}</AppText>{currency === code && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
      <Modal visible={showPaymentPicker} transparent animationType="fade" onRequestClose={() => setShowPaymentPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPaymentPicker(false)} />
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">Choose payment method</AppText>
            <AppText variant="caption" color="textSecondary">Accounts in {selectedLoan?.currencyCode ?? ''}</AppText>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {paymentAccounts.map(account => (
                <Pressable key={account.id} onPress={() => { setAccountId(account.id); setPaymentMethod('account'); setShowPaymentPicker(false); }} style={styles.pickerOption}>
                  <AppText>{account.name} · {account.currencyCode}{account.type === 'bank' ? ' · Bank' : ''}</AppText>{paymentMethod === 'account' && accountId === account.id && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
                </Pressable>
              ))}
              {paymentAccounts.length === 0 && (
                <AppText color="textSecondary">No active registered accounts in this currency.</AppText>
              )}
              <Pressable onPress={() => { setShowPaymentPicker(false); setCustomChoiceFor('payment'); }} style={styles.pickerOption}>
                <AppText>Custom / مخصص</AppText>{paymentMethod === 'custom' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={!!receivingLoan} transparent animationType="slide" onRequestClose={() => setReceivingLoan(null)}>
        <View style={styles.overlay}><Card style={styles.modal}>
          <AppText variant="h2">Confirm loan received</AppText>
          <AppText color="textSecondary">This records the money only now, when you confirm it was actually received.</AppText>
          <Field label={`Amount received (${receivingLoan?.currencyCode ?? ''})`} value={receivedAmount} onChangeText={setReceivedAmount} keyboardType="decimal-pad" />
          <DateField label="Received date" value={receivedDate} onChange={setReceivedDate} />
          <AppText style={{ fontWeight: '600' }}>Deposit destination</AppText>
          <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
            {activeAccounts.filter(a => !a.archived && a.currencyCode === receivingLoan?.currencyCode && a.type !== 'credit_card').map(account => (
              <Pressable key={account.id} onPress={() => { setReceiptAccountId(account.id); setReceiptMethod('account'); }} style={styles.pickerOption}>
                <AppText>{account.name} · {account.currencyCode}</AppText>
                {receiptAccountId === account.id && receiptMethod === 'account' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setReceiptMethod('custom')} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <AppText>Other / Something else</AppText>
            {receiptMethod === 'custom' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
          </Pressable>
          {receiptMethod === 'custom' && <Field label="Receipt method (e.g. Cash)" value={receiptMethodLabel} onChangeText={setReceiptMethodLabel} />}
          <View style={styles.actions}>
            <AppButton title="Confirm receipt" onPress={confirmLoanReceived} />
            <AppButton title="Cancel" variant="outline" onPress={() => setReceivingLoan(null)} />
          </View>
        </Card></View>
      </Modal>
      <Modal visible={!!closingLoan} transparent animationType="fade" onRequestClose={() => setClosingLoan(null)}>
        <View style={styles.overlay}><Card style={styles.modal}>
          <AppText variant="h2">Close without payment</AppText>
          <AppText color="textSecondary">No money will be deducted from any account. The loan history will be kept.</AppText>
          <Field label="Reason (required)" value={closureReason} onChangeText={setClosureReason} />
          <View style={styles.actions}>
            <AppButton title="Confirm closure" variant="danger" onPress={confirmCloseWithoutPayment} />
            <AppButton title="Cancel" variant="outline" onPress={() => { setClosingLoan(null); setClosureReason(''); }} />
          </View>
        </Card></View>
      </Modal>
      <Modal visible={!!selectedLoan} transparent animationType="slide" onRequestClose={closePayment}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.paymentKeyboard}>
            <ScrollView style={styles.paymentScroll} contentContainerStyle={styles.paymentScrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator>
              <Card style={styles.modal}>
                <AppText variant="h2">{editingPayment ? 'Edit payment' : settlementMode ? 'Early settlement' : 'Record installment'}</AppText>
                <AppText color="textSecondary">Outstanding: {selectedLoan ? formatAmount(remaining(selectedLoan)) + ' ' + selectedLoan.currencyCode : ''}</AppText>
                <Field label={`Total payment (${selectedLoan?.currencyCode ?? ''})`} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" />
                <Field label={`Late payment fee (${selectedLoan?.currencyCode ?? ''}) — optional`} value={latePaymentFee} onChangeText={setLatePaymentFee} keyboardType="decimal-pad" />
                <AppText variant="caption" color="textSecondary">The late fee is added to the amount deducted from your account, but does not reduce the remaining loan balance.</AppText>
                <DateField label="Payment date" value={paymentDate} onChange={setPaymentDate} />
                <Field label="Note" value={note} onChangeText={setNote} />
                <AppText style={{ fontWeight: '600' }}>Payment method</AppText>
                <Pressable onPress={() => setShowPaymentPicker(true)} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <AppText>{paymentMethod === 'custom' ? (customPaymentMethod.trim() || 'Custom / مخصص') : (activeAccounts.find(a => a.id === accountId)?.name ?? 'Select a registered account')}</AppText>
                  <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                </Pressable>
                {paymentMethod === 'custom' && <Field label="Payment method name (e.g. Cash)" value={customPaymentMethod} onChangeText={setCustomPaymentMethod} />}
                <View style={styles.actions}><AppButton title={editingPayment ? 'Save changes' : settlementMode ? 'Confirm settlement' : 'Confirm payment'} onPress={confirmPayment} /><AppButton title="Cancel" variant="outline" onPress={closePayment} /></View>
              </Card>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'decimal-pad' | 'number-pad' }) {
  const { colors } = useTheme();
  return <View style={styles.field}><AppText variant="caption" color="textSecondary">{label}</AppText><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder="Tap here to enter" placeholderTextColor={colors.textSecondary} selectionColor={moduleColors.finance} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} /></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  loanCard: { marginTop: 9, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  remaining: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9995', paddingTop: 10, gap: 8 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', alignItems: 'center', padding: 12 },
  formScroll: { flexShrink: 1, minHeight: 0 },
  formFields: { gap: 8, paddingVertical: 6 },
  loanFormModal: { width: '100%', maxHeight: '94%', flexShrink: 1, borderRadius: 18, padding: 14, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  modal: { gap: 9 },
  paymentKeyboard: { width: '100%', maxHeight: '94%', flexShrink: 1 },
  paymentScroll: { flexGrow: 0, flexShrink: 1 },
  paymentScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 4 },
  field: { gap: 5 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  accountChoice: { padding: 10, borderWidth: 1, borderColor: '#9996', borderRadius: 10 },
  dropdown: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBankChoice: { paddingVertical: 8, paddingHorizontal: 4 },
  pickerOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 },
  pickerPanel: { maxHeight: '75%', borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  pickerOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#9995' },
});
