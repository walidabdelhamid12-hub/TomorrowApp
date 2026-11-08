import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { FinanceDisclosure } from '@/features/finance/components/FinanceDisclosure';
import { canEditLoanPayment, canReverseLoanPayment } from '@/features/finance/utils/loanPaymentPolicy';
import { LoanDetails } from '@/features/finance/components/LoanDetails';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { confirmLoanReceipt, editLinkedPayment, postLinkedPayment, reverseLinkedPayment } from '@/features/finance/store/paymentOperations';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Loan, NewLoanInput } from '@/features/finance/types/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { getLoanPaidAmount, getLoanRemainingAmount, getLoanRemainingPrincipal, getLoanTotal, roundMoney } from '@/features/finance/utils/finance';
import { resolvePayment } from '@/features/finance/utils/paymentTransactionOwnership';
import { focusLinkedRecords } from '@/features/finance/utils/transactionNavigation';
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
  const params = useLocalSearchParams<{ loanId?: string }>();
  const { colors } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const financeReady = useFinanceHydrated();
  const ledgerReady = useLedgerHydrated();
  const ready = financeReady && ledgerReady;
  const loans = useFinanceStore(s => s.loans);
  const visibleLoans = focusLinkedRecords(loans, params.loanId);
  const addLoan = useFinanceStore(s => s.addLoan);
  const baseCurrency = useCurrencyStore(s => s.baseCurrency);
  const addAccount = useLedgerStore(s => s.addAccount);
  const updateLoan = useFinanceStore(s => s.updateLoan);
  const accounts = useLedgerStore(s => s.accounts);
  const transactions = useLedgerStore(s => s.transactions);
  const categories = useLedgerStore(s => s.categories);

  const [detailLoanId, setDetailLoanId] = useState<string | null>(null);
  const detailLoan = loans.filter(l => l.id === detailLoanId).length === 1 ? loans.find(l => l.id === detailLoanId) : undefined;
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
    if (![principal, installment, total].every(value => !value.trim() || hasValidCurrencyPrecision(value, currency))) {
      Alert.alert('Invalid amount precision', currency + ' allows up to ' + getCurrencyDecimals(currency) + ' decimal places. Please correct the amount before saving.');
      return;
    }
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
    if (!addLoan(input)) {
      Alert.alert('Cannot add loan', 'The loan was not saved. Check the details and try again.');
      return;
    }
    resetLoanForm();
  };

  const openPayment = (loan: Loan, early = false) => {
    if (loan.status === 'settled' || loan.status === 'closed' || loan.status === 'completed') return;
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
    if (!hasValidCurrencyPrecision(receivedAmount, receivingLoan.currencyCode)) {
      Alert.alert('Invalid amount precision', receivingLoan.currencyCode + ' allows up to ' + getCurrencyDecimals(receivingLoan.currencyCode) + ' decimal places. Please correct the amount before saving.');
      return;
    }
    const amount = money(receivedAmount);
    const account = receiptMethod === 'account'
      ? activeAccounts.find(a => a.id === receiptAccountId && a.currencyCode === receivingLoan.currencyCode && !a.archived && a.type !== 'credit_card')
      : undefined;
    const label = receiptMethodLabel.trim();
    const originalPrincipal = receivingLoan.principalAmount;
    if (amount === null || !Number.isFinite(amount) || amount <= 0 ||
      (originalPrincipal !== undefined && amount > originalPrincipal) ||
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
    const result = confirmLoanReceipt({ loanId: receivingLoan.id, amount, date: receivedDate,
      accountId: account?.id, categoryId: incomeCategory?.id, methodLabel: label });
    if (!result.ok) { Alert.alert('Receipt confirmation failed', result.reason); return; }
    setReceivingLoan(null);
  };

  const confirmCloseWithoutPayment = () => {
    if (!closingLoan || !closureReason.trim()) {
      Alert.alert('Reason required', 'Enter a reason for closing this loan without a payment.');
      return;
    }
    confirm('Close loan without payment?', 'This will remove the outstanding loan from net worth without creating an account transaction. The loan and its payment history will remain saved.', () => {
        updateLoan(closingLoan.id, { status: 'closed', closureDate: today(), closureReason: closureReason.trim() });
        setClosingLoan(null);
        setClosureReason('');
      }, 'Close loan');
  };

  const confirmPayment = () => {
    if (!selectedLoan) return;
    if (!hasValidCurrencyPrecision(paymentAmount, selectedLoan.currencyCode) || !hasValidCurrencyPrecision(latePaymentFee, selectedLoan.currencyCode)) {
      Alert.alert('Invalid amount precision', selectedLoan.currencyCode + ' allows up to ' + getCurrencyDecimals(selectedLoan.currencyCode) + ' decimal places. Please correct the amount before saving.');
      return;
    }
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
      amount === null || amount <= 0 || amount > outstanding ||
      fee === null || !Number.isFinite(fee) || fee < 0 ||
      cashAmount === null || !Number.isFinite(cashAmount) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
      (paymentMethod === 'account' && !account) ||
      (paymentMethod === 'custom' && !customLabel)
    ) {
      Alert.alert('Invalid payment', 'Check the installment amount, late fee, date and payment method. The installment cannot exceed the remaining contract balance.');
      return;
    }
    const ref = { entityType: 'loan' as const, entityId: selectedLoan.id, paymentId: editingPayment?.id ?? '' };
    const details = { amount, latePaymentFee: fee, date: paymentDate, accountId: account?.id,
      paymentMethodLabel: account ? undefined : customLabel, note: note.trim() || undefined };
    const result = editingPayment
      ? editLinkedPayment(ref, details)
      : postLinkedPayment({ ...details, entityType: 'loan', entityId: selectedLoan.id,
          categoryId: expenseCategory?.id, settlement: settlementMode });
    if (!result.ok) { Alert.alert('Payment not saved', result.reason); return; }
    closePayment();
  };
  const openEditPayment = (loan: Loan, payment: Loan['payments'][number]) => {
    const current = useFinanceStore.getState().loans.filter(l => l.id === loan.id);
    if (current.length !== 1 || !canEditLoanPayment(current[0])) { Alert.alert('Payment is read-only', 'Historical payments on settled or closed loans cannot be edited.'); return; }
    const linked = resolvePayment({ entityType: 'loan', entityId: loan.id, paymentId: payment.id },
      useFinanceStore.getState(), useLedgerStore.getState());
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    if (payment.ledgerTransactionId && !matching.length) { Alert.alert('Cannot edit payment', 'No active account in the payment currency is available.'); return; }
    setSelectedLoan(loan); setEditingPayment(payment); setSettlementMode(false);
    setPaymentAmount(String(payment.amount));
    setLatePaymentFee(String(payment.latePaymentFee ?? 0));
    setPaymentDate(payment.date);
    setAccountId(payment.accountId && matching.some(a => a.id === payment.accountId) ? payment.accountId : matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setPaymentMethod(payment.ledgerTransactionId || linked ? 'account' : 'custom'); setCustomPaymentMethod(payment.paymentMethodLabel ?? ''); setNote(payment.note ?? '');
  };
  const confirmDeletePayment = (loan: Loan, payment: Loan['payments'][number]) => {
    if (!canReverseLoanPayment(loan, payment.id)) return;
    const reversal = loan.status === 'settled';
    confirm(reversal ? 'Reverse settlement?' : 'Delete payment?', reversal ? 'This explicitly reopens the loan, restores its outstanding principal and removes the linked settlement transaction. Review the loan balance afterward.' : 'The linked account transaction will also be removed. This cannot be undone.', () => {
        const result = reverseLinkedPayment({ entityType: 'loan', entityId: loan.id, paymentId: payment.id });
        if (!result.ok) Alert.alert('Cannot delete payment', result.reason);
      }, reversal ? 'Reverse settlement' : 'Delete');
  };

  if (!ready) return <Screen><View style={styles.center}><ActivityIndicator color={moduleColors.finance} /></View></Screen>;

  return (
    <Screen scroll>
      {confirmation}
      <LoanDetails loanId={detailLoanId} loan={detailLoan} onClose={() => setDetailLoanId(null)} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={20} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><AppText variant="h1">Loans</AppText><AppText variant="caption" color="textSecondary">{loans.length} loans</AppText></View>
      </View>
      {params.loanId !== undefined && (
        <Card variant="filled">
          <AppText>{visibleLoans.length ? 'Showing the loan linked to your transaction.' : 'The linked loan is unavailable. No other loan has been selected.'}</AppText>
          <AppButton title="View all loans" variant="ghost" onPress={() => router.replace('/finance/loans')} />
        </Card>
      )}
      <AppText color="textSecondary" style={{ marginBottom: 16 }}>
        Track money borrowed, confirm received funds, record repayments, and monitor your outstanding loan balance.
      </AppText>
      <AppButton title="Add loan" accentColor={moduleColors.finance} leftIcon={<Ionicons name="add" size={18} color={colors.onPrimary} />} onPress={() => setShowLoanForm(true)} />
      {visibleLoans.length === 0 ? <Card variant="filled"><AppText align="center" color="textSecondary">{params.loanId !== undefined ? 'Return to transactions or view all loans.' : 'No loans recorded yet. Add your first loan.'}</AppText></Card> :
        visibleLoans.map(loan => {
          const paid = getLoanPaidAmount(loan);
          const due = remaining(loan);
          return <Card key={loan.id} variant="outlined" style={[styles.loanCard, { backgroundColor: colors.finance.liability.surface, borderColor: colors.finance.liability.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={'Details for ' + loan.name} onPress={() => setDetailLoanId(loan.id)} style={{ minHeight: 48, gap: 8 }}>
            <View style={styles.row}><View style={{ flex: 1 }}><AppText variant="bodyStrong">{loan.name}</AppText><AppText color="textSecondary" variant="caption">{loan.lenderName} · {loan.currencyCode}</AppText></View>
              <AppText style={{ color: loan.status === 'active' || !loan.status ? colors.finance.liability.accent : colors.finance.income.accent }}>{loan.status === 'settled' ? 'Settled' : loan.status === 'completed' ? 'Completed' : loan.status === 'closed' ? 'Closed without payment' : 'Active'}</AppText>
            </View>
            <View style={[styles.metrics, { backgroundColor: colors.surface, borderRadius: 12, padding: 8 }]}>
              <View style={styles.metric}><AppText variant="caption" color="textSecondary">Original principal</AppText><AppText>{(loan.receivedAmount ?? loan.principalAmount) === undefined ? 'Unknown' : formatAmount((loan.receivedAmount ?? loan.principalAmount)!, loan.currencyCode) + ' ' + loan.currencyCode}</AppText></View>
              <View style={styles.metric}><AppText variant="caption" color="textSecondary">Contractual total</AppText><AppText>{formatAmount(getLoanTotal(loan), loan.currencyCode)} {loan.currencyCode}</AppText></View>
              <View style={styles.metric}><AppText variant="caption" color="textSecondary">Remaining contractual</AppText><AppText style={styles.remaining}>{formatAmount(due, loan.currencyCode)} {loan.currencyCode}</AppText></View>
              <View style={styles.metric}><AppText variant="caption" color="textSecondary">Total paid</AppText><AppText>{formatAmount(paid, loan.currencyCode)} {loan.currencyCode}</AppText></View>
              <View style={styles.metric}><AppText variant="caption" color="textSecondary">Installment</AppText><AppText>{formatAmount(loan.monthlyInstallment, loan.currencyCode)}</AppText></View>
              <View style={styles.metric}><AppText variant="caption" color="textSecondary">Currency</AppText><AppText>{loan.currencyCode}</AppText></View>
            </View>
            <AppText variant="caption" color="textSecondary">Payments recorded: {loan.payments.length} · Remaining installment count (equivalent): {loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed' ? 0 : loan.monthlyInstallment > 0 ? Math.ceil(due / loan.monthlyInstallment) : 'Unknown'} · First due {loan.firstDueDate}</AppText>
            <AppText variant="caption">Remaining principal: {getLoanRemainingPrincipal(loan) === null ? 'Unknown — allocation required' : formatAmount(getLoanRemainingPrincipal(loan)!, loan.currencyCode) + ' ' + loan.currencyCode}</AppText>
            </Pressable>
            <FinanceDisclosure title="Deposit distribution">
              <AppText variant="caption" color="textSecondary">{loan.receivedAt ? 'Received: ' + formatAmount(loan.receivedAmount ?? loan.principalAmount ?? 0, loan.currencyCode) + ' ' + loan.currencyCode + ' on ' + loan.receivedAt : 'Receipt not confirmed'}</AppText>
              <AppText variant="caption">{loan.receiptTransactionId ? 'Posted to: ' + (accounts.find(a => a.id === (transactions.find(t => t.id === loan.receiptTransactionId)?.accountId ?? loan.depositAccountId))?.name ?? 'See linked receipt transaction') : loan.depositMethodLabel ?? 'No confirmed destination'}</AppText>
              {!loan.receivedAt && loan.status !== 'settled' && loan.status !== 'closed' && loan.status !== 'completed' && <AppButton title="Confirm loan received" variant="outline" onPress={() => openReceiveLoan(loan)} />}
            </FinanceDisclosure>
            {loan.status !== 'settled' && loan.status !== 'completed' && loan.status !== 'closed' && <View style={styles.actions}>
              <AppButton leftIcon={<Ionicons name="card-outline" size={18} color={colors.onPrimary} />} title="Record payment" fullWidth={false} onPress={() => openPayment(loan)} />
              <AppButton leftIcon={<Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />} title="Early settlement" fullWidth={false} variant="outline" onPress={() => openPayment(loan, true)} />
              <AppButton leftIcon={<Ionicons name="alert-circle-outline" size={18} color={colors.onPrimary} />} title="Close without payment" fullWidth={false} variant="danger" onPress={() => { setClosingLoan(loan); setClosureReason(''); }} />
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
                <AppText color={colors.finance.income.accent}>Settlement: {formatAmount(loan.settlementAmount ?? 0, loan.currencyCode)} {loan.currencyCode} on {loan.settlementDate}</AppText>
                {saved > 0.001 && <AppText color={colors.finance.income.accent} variant="caption">Early settlement saving: {formatAmount(saved, loan.currencyCode)} {loan.currencyCode}</AppText>}
              </View>;
            })()}
            <FinanceDisclosure title="Payment history" count={loan.payments.length}>
              {loan.payments.length === 0 && <AppText variant="caption" color="textSecondary">No payments recorded.</AppText>}
              {loan.payments.map(payment => <View key={payment.id} style={styles.paymentRow}>
                <View style={{ flex: 1 }}><AppText>{formatAmount(payment.amount, loan.currencyCode)} {loan.currencyCode}{(payment.latePaymentFee ?? 0) > 0 ? ` · Fee: ${formatAmount(payment.latePaymentFee!, loan.currencyCode)} ${loan.currencyCode}` : ''}</AppText><AppText variant="caption" color="textSecondary">{payment.date} · {payment.note || 'Installment'}</AppText></View>
                {(canEditLoanPayment(loan) || canReverseLoanPayment(loan, payment.id)) && <FinanceActionButtons label={'payment dated ' + payment.date}
                  onEdit={canEditLoanPayment(loan) ? () => openEditPayment(loan, payment) : undefined}
                  onDelete={canReverseLoanPayment(loan, payment.id) ? () => confirmDeletePayment(loan, payment) : undefined}
                  deleteTitle={loan.status === 'settled' ? 'Reverse settlement' : 'Delete'} />}
              </View>)}
            </FinanceDisclosure>
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
                <AppText color="textSecondary">Remaining contractual payments: {selectedLoan ? formatAmount(remaining(selectedLoan), selectedLoan.currencyCode) + ' ' + selectedLoan.currencyCode : ''}</AppText>
                {settlementMode && <AppText variant="caption" color="warning">Default: remaining contractual balance, not a lender settlement quote. Enter your agreed amount; fees are separate.</AppText>}
                <Field label={`Repayment amount, excluding fee (${selectedLoan?.currencyCode ?? ''})`} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" />
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
  back: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loanCard: { marginTop: 8, padding: 12, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '47%', flexGrow: 1, minWidth: 120, gap: 2 },
  remaining: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9995', paddingTop: 10, gap: 8 },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 4, gap: 4 },
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
