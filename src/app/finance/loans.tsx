import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Loan, NewLoanInput } from '@/features/finance/types/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const money = (value: string) => Number(value.trim().replace(/,/g, ''));
const remaining = (loan: Loan) => loan.status === 'settled' || loan.status === 'completed'
  ? 0
  : Math.max(0, (loan.totalRepaymentAmount ?? loan.monthlyInstallment * loan.numberOfInstallments) - loan.payments.reduce((s, p) => s + p.amount, 0));

export default function LoansScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const financeReady = useFinanceHydrated();
  const ledgerReady = useLedgerHydrated();
  const ready = financeReady && ledgerReady;
  const loans = useFinanceStore(s => s.loans);
  const addLoan = useFinanceStore(s => s.addLoan);
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
  const [currency, setCurrency] = useState('OMR');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [settlementMode, setSettlementMode] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Loan['payments'][number] | null>(null);

  const activeAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts]);
  const expenseCategory = categories.find(c => c.kind === 'expense' && c.id === 'cat_bills')
    ?? categories.find(c => c.kind === 'expense');

  const resetLoanForm = () => {
    setShowLoanForm(false); setLoanName(''); setLender(''); setPrincipal('');
    setTotal(''); setInstallment(''); setCount(''); setFirstDue(today()); setCurrency('OMR');
  };

  const saveLoan = () => {
    const p = money(principal), t = total.trim() ? money(total) : money(installment) * money(count);
    const m = money(installment), n = Number(count);
    if (!loanName.trim() || !lender.trim() || !Number.isFinite(p) || p <= 0 ||
      !Number.isFinite(t) || t < p || !Number.isFinite(m) || m <= 0 ||
      !Number.isInteger(n) || n < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
      Alert.alert('Check loan details', 'Enter the lender, loan name, valid principal, total repayment, installment, number of installments and first due date. Total repayment cannot be less than principal.');
      return;
    }
    const input: NewLoanInput = {
      name: loanName.trim(), lenderName: lender.trim(), principalAmount: p,
      totalRepaymentAmount: t, monthlyInstallment: m, numberOfInstallments: n,
      firstDueDate: firstDue, currencyCode: currency, status: 'active',
    };
    addLoan(input);
    resetLoanForm();
  };

  const openPayment = (loan: Loan, early = false) => {
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode);
    if (!matching.length) {
      Alert.alert('No matching account', `Create or activate an account in ${loan.currencyCode} before recording a payment.`);
      return;
    }
    setSelectedLoan(loan);
    setSettlementMode(early);
    setPaymentAmount(early ? String(remaining(loan)) : String(Math.min(loan.monthlyInstallment, remaining(loan))));
    setPaymentDate(today());
    setAccountId(matching[0].id);
    setNote('');
  };

  const closePayment = () => { setSelectedLoan(null); setPaymentAmount(''); setNote(''); setSettlementMode(false); setEditingPayment(null); };

  const confirmPayment = () => {
    if (!selectedLoan) return;
    const amount = money(paymentAmount);
    if (!editingPayment && !expenseCategory) {
      Alert.alert('Expense category required', 'Add or restore an expense category before recording a loan payment. No payment has been recorded.');
      return;
    }
    const scheduledTotal = selectedLoan.totalRepaymentAmount ??
      selectedLoan.monthlyInstallment * selectedLoan.numberOfInstallments;
    const outstanding = editingPayment
      ? Math.max(0, scheduledTotal - selectedLoan.payments
          .filter(payment => payment.id !== editingPayment.id)
          .reduce((sum, payment) => sum + payment.amount, 0))
      : remaining(selectedLoan);
    const account = activeAccounts.find(a => a.id === accountId && a.currencyCode === selectedLoan.currencyCode);
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding + 0.001 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !account) {
      Alert.alert('Invalid payment', 'Check the amount, date and account. The account must use the loan currency and the payment cannot exceed the remaining contractual amount.');
      return;
    }
    if (editingPayment) {
      const accountTransactionId = editingPayment.ledgerTransactionId;
      if (!accountTransactionId) {
        Alert.alert('Cannot edit payment', 'This payment has no linked account transaction. Please keep its history unchanged.');
        return;
      }
      const principalAlreadyPaid = selectedLoan.payments
        .filter(p => p.id !== editingPayment.id)
        .reduce((sum, p) => sum + (p.principalAmount ?? p.amount), 0);
      const principalRoom = Math.max(0, (selectedLoan.principalAmount ?? amount) - principalAlreadyPaid);
      const nextPrincipal = Math.min(amount, principalRoom);
      const nextInterest = amount - nextPrincipal;
      const previousTransaction = transactions.find(t => t.id === accountTransactionId);
      const updated = updateTransaction(accountTransactionId, {
        amount, accountId: account.id, date: paymentDate,
        note: note.trim() || `Loan payment: ${selectedLoan.name}`,
      });
      if (!updated) {
        Alert.alert('Update failed', 'The linked account transaction could not be updated. The loan history was not changed.');
        return;
      }
      updateLoanPayment(selectedLoan.id, editingPayment.id, {
        amount, date: paymentDate, note: note.trim() || undefined,
        accountId: account.id, principalAmount: nextPrincipal,
        interestAmount: nextInterest,
      });
      const savedPayment = useFinanceStore.getState().loans
        .find(l => l.id === selectedLoan.id)?.payments.find(p => p.id === editingPayment.id);
      if (!savedPayment || savedPayment.amount !== amount) {
        if (previousTransaction) updateTransaction(accountTransactionId, {
          amount: previousTransaction.amount, accountId: previousTransaction.accountId,
          date: previousTransaction.date, note: previousTransaction.note,
        });
        Alert.alert('Update rejected', 'The loan store rejected the updated payment. The account transaction was restored.');
        return;
      }
      if (selectedLoan.settlementPaymentId === editingPayment.id) {
        updateLoan(selectedLoan.id, {
          status: 'settled',
          settlementAmount: amount,
          settlementDate: paymentDate,
          settlementAccountId: account.id,
          settlementNote: note.trim() || undefined,
        });
      } else {
        const scheduled = selectedLoan.totalRepaymentAmount ??
          selectedLoan.monthlyInstallment * selectedLoan.numberOfInstallments;
        const paidAfterEdit = selectedLoan.payments.reduce(
          (sum, p) => sum + (p.id === editingPayment.id ? amount : p.amount), 0
        );
        const dueAfterEdit = Math.max(0, scheduled - paidAfterEdit);
        updateLoan(selectedLoan.id, { status: dueAfterEdit <= 0.001 ? 'completed' : 'active' });
      }
      closePayment();
      return;
    }
    const paymentId = addLoanPayment(selectedLoan.id, {
      amount, date: paymentDate, note: note.trim() || (settlementMode ? 'Early settlement' : undefined),
      principalAmount: settlementMode ? 0 : Math.min(amount, Math.max(0, (selectedLoan.principalAmount ?? amount) - selectedLoan.payments.reduce((sum, p) => sum + (p.principalAmount ?? p.amount), 0))),
      interestAmount: settlementMode ? amount : Math.max(0, amount - Math.min(amount, Math.max(0, (selectedLoan.principalAmount ?? amount) - selectedLoan.payments.reduce((sum, p) => sum + (p.principalAmount ?? p.amount), 0)))),
      accountId: account.id,
    });
    if (!paymentId) {
      Alert.alert('Payment not saved', 'The loan store rejected this payment. No account transaction was created.');
      return;
    }
    const transactionId = addTransaction({
      type: 'expense', amount, accountId: account.id, categoryId: expenseCategory!.id,
      purpose: 'loan_principal_payment', linkedEntityType: 'loan',
      linkedEntityId: selectedLoan.id, linkedPaymentId: paymentId,
      date: paymentDate, note: note.trim() || `Loan payment: ${selectedLoan.name}`,
    });
    if (!transactionId) {
      deleteLoanPayment(selectedLoan.id, paymentId);
      Alert.alert('Payment not posted', 'The account transaction could not be created, so the loan payment was rolled back.');
      return;
    }
    updateLoanPayment(selectedLoan.id, paymentId, { ledgerTransactionId: transactionId });
    const nextRemaining = Math.max(0, outstanding - amount);
    if (settlementMode) {
      updateLoan(selectedLoan.id, {
        status: 'settled', settlementAmount: amount, settlementDate: paymentDate,
        settlementAccountId: account.id, settlementPaymentId: paymentId,
        settlementNote: note.trim() || undefined,
      });
    } else if (nextRemaining <= 0.001) {
      updateLoan(selectedLoan.id, { status: 'completed' });
    }
    closePayment();
  };

  const openEditPayment = (loan: Loan, payment: Loan['payments'][number]) => {
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode);
    if (!payment.ledgerTransactionId || !matching.length) {
      Alert.alert('Cannot edit payment', 'This payment is missing its linked account transaction or a matching active account.');
      return;
    }
    setSelectedLoan(loan);
    setEditingPayment(payment);
    setSettlementMode(false);
    setPaymentAmount(String(payment.amount));
    setPaymentDate(payment.date);
    setAccountId(payment.accountId && matching.some(a => a.id === payment.accountId) ? payment.accountId : matching[0].id);
    setNote(payment.note ?? '');
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
        <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={23} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><AppText variant="h1">Loans</AppText><AppText variant="caption" color="textSecondary">{loans.length} loans</AppText></View>
      </View>
      <AppButton title="Add loan" accentColor={moduleColors.finance} leftIcon={<Ionicons name="add" size={20} color={colors.onPrimary} />} onPress={() => setShowLoanForm(true)} />
      {loans.length === 0 ? <Card variant="filled"><AppText align="center" color="textSecondary">No loans recorded yet. Add your first loan.</AppText></Card> :
        loans.map(loan => {
          const paid = loan.payments.reduce((s, p) => s + p.amount, 0);
          const due = remaining(loan);
          return <Card key={loan.id} style={styles.loanCard}>
            <View style={styles.row}><View style={{ flex: 1 }}><AppText variant="h2">{loan.name}</AppText><AppText color="textSecondary" variant="caption">{loan.lenderName} · {loan.currencyCode}</AppText></View>
              <AppText style={{ color: loan.status === 'active' || !loan.status ? colors.warning : colors.success }}>{loan.status === 'settled' ? 'Settled' : loan.status === 'completed' ? 'Completed' : 'Active'}</AppText>
            </View>
            <View style={styles.metrics}>
              <View><AppText variant="caption" color="textSecondary">Contract total</AppText><AppText>{formatAmount(loan.totalRepaymentAmount ?? loan.monthlyInstallment * loan.numberOfInstallments)} {loan.currencyCode}</AppText></View>
              <View><AppText variant="caption" color="textSecondary">Paid</AppText><AppText>{formatAmount(paid)} {loan.currencyCode}</AppText></View>
              <View><AppText variant="caption" color="textSecondary">Remaining</AppText><AppText style={styles.remaining}>{formatAmount(due)} {loan.currencyCode}</AppText></View>
            </View>
            <AppText variant="caption" color="textSecondary">Installment: {formatAmount(loan.monthlyInstallment)} {loan.currencyCode} · {loan.numberOfInstallments} installments · First due {loan.firstDueDate}</AppText>
            {loan.status !== 'settled' && loan.status !== 'completed' && <View style={styles.actions}>
              <AppButton title="Record payment" fullWidth={false} onPress={() => openPayment(loan)} />
              <AppButton title="Early settlement" fullWidth={false} variant="outline" onPress={() => openPayment(loan, true)} />
            </View>}
            {loan.status === 'settled' && (() => {
              const scheduled = loan.totalRepaymentAmount ?? loan.monthlyInstallment * loan.numberOfInstallments;
              const paidBeforeSettlement = loan.payments
                .filter(payment => payment.id !== loan.settlementPaymentId)
                .reduce((sum, payment) => sum + payment.amount, 0);
              const saved = Math.max(0, scheduled - paidBeforeSettlement - (loan.settlementAmount ?? 0));
              return <View style={{ gap: 4 }}>
                <AppText color="success">Settlement: {formatAmount(loan.settlementAmount ?? 0)} {loan.currencyCode} on {loan.settlementDate}</AppText>
                {saved > 0.001 && <AppText color="success" variant="caption">Early settlement saving: {formatAmount(saved)} {loan.currencyCode}</AppText>}
              </View>;
            })()}
            {loan.payments.length > 0 && <View style={styles.history}><AppText style={{ fontWeight: '600' }}>Payment history</AppText>
              {loan.payments.map(payment => <View key={payment.id} style={styles.paymentRow}>
                <View style={{ flex: 1 }}><AppText>{formatAmount(payment.amount)} {loan.currencyCode}</AppText><AppText variant="caption" color="textSecondary">{payment.date} · {payment.note || 'Installment'}</AppText></View>
                <View style={styles.row}><Pressable onPress={() => openEditPayment(loan, payment)} hitSlop={8}><Ionicons name="create-outline" size={19} color={moduleColors.finance} /></Pressable><Pressable onPress={() => confirmDeletePayment(loan, payment)} hitSlop={8}><Ionicons name="trash-outline" size={19} color={colors.danger} /></Pressable></View>
              </View>)}
            </View>}
          </Card>;
        })}
      <Modal visible={showLoanForm} transparent animationType="slide" onRequestClose={resetLoanForm}>
        <View style={styles.overlay}><ScrollView contentContainerStyle={styles.modalWrap}><Card style={styles.modal}>
          <AppText variant="h2">New loan</AppText>
          <Field label="Loan name" value={loanName} onChangeText={setLoanName} />
          <Field label="Lender / bank" value={lender} onChangeText={setLender} />
          <Field label="Original principal" value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" />
          <Field label="Total repayment (including interest)" value={total} onChangeText={setTotal} keyboardType="decimal-pad" />
          <Field label="Monthly installment" value={installment} onChangeText={setInstallment} keyboardType="decimal-pad" />
          <Field label="Number of installments" value={count} onChangeText={setCount} keyboardType="number-pad" />
          <Field label="First due date (YYYY-MM-DD)" value={firstDue} onChangeText={setFirstDue} />
          <Field label="Currency code (e.g. OMR, EGP)" value={currency} onChangeText={setCurrency} />
          <View style={styles.actions}><AppButton title="Save loan" onPress={saveLoan} /><AppButton title="Cancel" variant="outline" onPress={resetLoanForm} /></View>
        </Card></ScrollView></View>
      </Modal>
      <Modal visible={!!selectedLoan} transparent animationType="slide" onRequestClose={closePayment}>
        <View style={styles.overlay}><Card style={styles.modal}>
          <AppText variant="h2">{editingPayment ? 'Edit payment' : settlementMode ? 'Early settlement' : 'Record installment'}</AppText>
          <AppText color="textSecondary">Outstanding: {selectedLoan ? formatAmount(remaining(selectedLoan)) + ' ' + selectedLoan.currencyCode : ''}</AppText>
          <Field label="Amount" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" />
          <Field label="Payment date (YYYY-MM-DD)" value={paymentDate} onChangeText={setPaymentDate} />
          <Field label="Note" value={note} onChangeText={setNote} />
          <AppText style={{ fontWeight: '600' }}>Pay from account</AppText>
          {activeAccounts.filter(a => a.currencyCode === selectedLoan?.currencyCode).map(account => <Pressable key={account.id} onPress={() => setAccountId(account.id)} style={[styles.accountChoice, accountId === account.id && { borderColor: moduleColors.finance, backgroundColor: colors.surface }]}><AppText>{account.name} · {account.currencyCode}{accountId === account.id ? ' ✓' : ''}</AppText></Pressable>)}
          <View style={styles.actions}><AppButton title={editingPayment ? 'Save changes' : settlementMode ? 'Confirm settlement' : 'Confirm payment'} onPress={confirmPayment} /><AppButton title="Cancel" variant="outline" onPress={closePayment} /></View>
        </Card></View>
      </Modal>
    </Screen>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'decimal-pad' | 'number-pad' }) {
  const { colors } = useTheme();
  return <View style={styles.field}><AppText variant="caption" color="textSecondary">{label}</AppText><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholderTextColor={colors.textSecondary} style={[styles.input, { color: colors.text, borderColor: colors.border }]} /></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  loanCard: { marginTop: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  remaining: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9995', paddingTop: 10, gap: 8 },
  paymentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 16 },
  modalWrap: { flexGrow: 1, justifyContent: 'center' },
  modal: { gap: 12, maxHeight: '95%' },
  field: { gap: 5 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  accountChoice: { padding: 12, borderWidth: 1, borderColor: '#9996', borderRadius: 10 },
});
