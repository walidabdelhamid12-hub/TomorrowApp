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

import { AppButton, AppText, Card, DateField, Screen } from '@/components/ui';
import { AddAccountModal, type AddAccountFormData } from '@/features/finance/components/AddAccountModal';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
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
const remaining = (loan: Loan) => loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed'
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
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [accountId, setAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'account' | 'custom'>('account');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [showAddBank, setShowAddBank] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [note, setNote] = useState('');
  const [settlementMode, setSettlementMode] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Loan['payments'][number] | null>(null);
  const [closingLoan, setClosingLoan] = useState<Loan | null>(null);
  const [closureReason, setClosureReason] = useState('');

  const activeAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts]);
  const paymentAccounts = useMemo(() => activeAccounts
    .filter(a => a.currencyCode === selectedLoan?.currencyCode)
    .sort((a, b) => Number(b.type === 'bank') - Number(a.type === 'bank')),
    [activeAccounts, selectedLoan?.currencyCode]);
  const expenseCategory = categories.find(c => c.kind === 'expense' && c.id === 'cat_bills')
    ?? categories.find(c => c.kind === 'expense');

  const resetLoanForm = () => {
    setShowLoanForm(false); setLoanName(''); setLender(''); setPrincipal('');
    setTotal(''); setInstallment(''); setCount(''); setFirstDue(today()); setCurrency(baseCurrency);
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
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    setSelectedLoan(loan);
    setSettlementMode(early);
    setPaymentAmount(early ? String(remaining(loan)) : String(Math.min(loan.monthlyInstallment, remaining(loan))));
    setPaymentDate(today());
    setAccountId(matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setPaymentMethod('account');
    setCustomPaymentMethod('');
    setNote('');
  };

  const closePayment = () => { setSelectedLoan(null); setPaymentAmount(''); setNote(''); setSettlementMode(false); setEditingPayment(null); setPaymentMethod('account'); setCustomPaymentMethod(''); };

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
    if (!editingPayment && paymentMethod === 'account' && !expenseCategory) {
      Alert.alert('Expense category required', 'Add or restore an expense category before recording a loan payment. No payment has been recorded.');
      return;
    }
    const scheduledTotal = selectedLoan.totalRepaymentAmount ?? selectedLoan.monthlyInstallment * selectedLoan.numberOfInstallments;
    const outstanding = editingPayment ? Math.max(0, scheduledTotal - selectedLoan.payments.filter(p => p.id !== editingPayment.id).reduce((sum, p) => sum + p.amount, 0)) : remaining(selectedLoan);
    const account = paymentMethod === 'account' ? activeAccounts.find(a => a.id === accountId && a.currencyCode === selectedLoan.currencyCode && a.type !== 'credit_card') : undefined;
    const customLabel = customPaymentMethod.trim();
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding + 0.001 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(paymentDate) || (paymentMethod === 'account' && !account) || (paymentMethod === 'custom' && !customLabel)) {
      Alert.alert('Invalid payment', 'Check the amount, date and payment method. Select a matching account or enter a custom payment method.'); return;
    }
    if (editingPayment) {
      const txId = editingPayment.ledgerTransactionId;
      if (txId && !account) { Alert.alert('Payment method locked', 'This payment is linked to an account. Keep a registered account selected.'); return; }
      if (txId && account) {
        const previous = transactions.find(t => t.id === txId);
        const ok = updateTransaction(txId, { amount, accountId: account.id, date: paymentDate, note: note.trim() || `Loan payment: ${selectedLoan.name}` });
        if (!ok) { Alert.alert('Update failed', 'The linked account transaction could not be updated.'); return; }
        updateLoanPayment(selectedLoan.id, editingPayment.id, { amount, date: paymentDate, note: note.trim() || undefined, accountId: account.id, paymentMethodLabel: undefined, principalAmount: amount, interestAmount: 0 });
        const saved = useFinanceStore.getState().loans.find(l => l.id === selectedLoan.id)?.payments.find(p => p.id === editingPayment.id);
        if (!saved || saved.amount !== amount) { if (previous) updateTransaction(txId, { amount: previous.amount, accountId: previous.accountId, date: previous.date, note: previous.note }); Alert.alert('Update rejected', 'Account transaction was restored.'); return; }
      } else {
        updateLoanPayment(selectedLoan.id, editingPayment.id, { amount, date: paymentDate, note: note.trim() || undefined, accountId: undefined, paymentMethodLabel: customLabel, principalAmount: amount, interestAmount: 0 });
      }
      if (selectedLoan.settlementPaymentId === editingPayment.id) updateLoan(selectedLoan.id, { status: 'settled', settlementAmount: amount, settlementDate: paymentDate, settlementAccountId: account?.id, settlementNote: note.trim() || undefined });
      else { const paid = selectedLoan.payments.reduce((sum, p) => sum + (p.id === editingPayment.id ? amount : p.amount), 0); updateLoan(selectedLoan.id, { status: scheduledTotal - paid <= 0.001 ? 'completed' : 'active' }); }
      closePayment(); return;
    }
    const paymentId = addLoanPayment(selectedLoan.id, { amount, date: paymentDate, note: note.trim() || (settlementMode ? 'Early settlement' : undefined), principalAmount: amount, interestAmount: 0, ...(account ? { accountId: account.id } : { paymentMethodLabel: customLabel }) });
    if (!paymentId) { Alert.alert('Payment not saved', 'The loan store rejected this payment.'); return; }
    if (account) {
      const txId = addTransaction({ type: 'expense', amount, accountId: account.id, categoryId: expenseCategory!.id, purpose: 'loan_payment', linkedEntityType: 'loan', linkedEntityId: selectedLoan.id, linkedPaymentId: paymentId, date: paymentDate, note: note.trim() || `Loan payment: ${selectedLoan.name}` });
      if (!txId) { deleteLoanPayment(selectedLoan.id, paymentId); Alert.alert('Payment not posted', 'The account transaction failed; payment was rolled back.'); return; }
      updateLoanPayment(selectedLoan.id, paymentId, { ledgerTransactionId: txId });
    }
    if (settlementMode) updateLoan(selectedLoan.id, { status: 'settled', settlementAmount: amount, settlementDate: paymentDate, settlementAccountId: account?.id, settlementPaymentId: paymentId, settlementNote: note.trim() || undefined });
    else if (outstanding - amount <= 0.001) updateLoan(selectedLoan.id, { status: 'completed' });
    closePayment();
  };
  const openEditPayment = (loan: Loan, payment: Loan['payments'][number]) => {
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    if (payment.ledgerTransactionId && !matching.length) { Alert.alert('Cannot edit payment', 'No active account in the payment currency is available.'); return; }
    setSelectedLoan(loan); setEditingPayment(payment); setSettlementMode(false);
    setPaymentAmount(String(payment.amount)); setPaymentDate(payment.date);
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
      <AppButton title="Add loan" accentColor={moduleColors.finance} leftIcon={<Ionicons name="add" size={18} color={colors.onPrimary} />} onPress={() => setShowLoanForm(true)} />
      {loans.length === 0 ? <Card variant="filled"><AppText align="center" color="textSecondary">No loans recorded yet. Add your first loan.</AppText></Card> :
        loans.map(loan => {
          const paid = loan.payments.reduce((s, p) => s + p.amount, 0);
          const due = remaining(loan);
          return <Card key={loan.id} style={styles.loanCard}>
            <View style={styles.row}><View style={{ flex: 1 }}><AppText variant="h2">{loan.name}</AppText><AppText color="textSecondary" variant="caption">{loan.lenderName} · {loan.currencyCode}</AppText></View>
              <AppText style={{ color: loan.status === 'active' || !loan.status ? colors.warning : colors.success }}>{loan.status === 'settled' ? 'Settled' : loan.status === 'completed' ? 'Completed' : loan.status === 'closed' ? 'Closed without payment' : 'Active'}</AppText>
            </View>
            <View style={styles.metrics}>
              <View><AppText variant="caption" color="textSecondary">Original principal</AppText><AppText>{formatAmount(loan.principalAmount ?? 0)} {loan.currencyCode}</AppText></View>
              <View><AppText variant="caption" color="textSecondary">Contract total</AppText><AppText>{formatAmount(loan.totalRepaymentAmount ?? loan.monthlyInstallment * loan.numberOfInstallments)} {loan.currencyCode}</AppText></View>
              <View><AppText variant="caption" color="textSecondary">Remaining</AppText><AppText style={styles.remaining}>{formatAmount(due)} {loan.currencyCode}</AppText></View>
            </View>
            <AppText variant="caption" color="textSecondary">Paid: {formatAmount(paid)} {loan.currencyCode} · Installment: {formatAmount(loan.monthlyInstallment)} {loan.currencyCode}</AppText>
            <AppText variant="caption" color="textSecondary">Payments recorded: {loan.payments.length} · Scheduled installments remaining: {loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed' ? 0 : Math.max(0, loan.numberOfInstallments - loan.payments.length)} · First due {loan.firstDueDate}</AppText>
            {loan.status !== 'settled' && loan.status !== 'completed' && loan.status !== 'closed' && <View style={styles.actions}>
              <AppButton title="Record payment" fullWidth={false} onPress={() => openPayment(loan)} />
              <AppButton title="Early settlement" fullWidth={false} variant="outline" onPress={() => openPayment(loan, true)} />
              <AppButton title="Close without payment" fullWidth={false} variant="danger" onPress={() => { setClosingLoan(loan); setClosureReason(''); }} />
            </View>}
            {loan.status === 'closed' && <AppText color="warning">Closed without payment on {loan.closureDate}: {loan.closureReason}</AppText>}
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
                <View style={styles.row}><Pressable onPress={() => openEditPayment(loan, payment)} hitSlop={8}><Ionicons name="create-outline" size={16} color={moduleColors.finance} /></Pressable><Pressable onPress={() => confirmDeletePayment(loan, payment)} hitSlop={8}><Ionicons name="trash-outline" size={16} color={colors.danger} /></Pressable></View>
              </View>)}
            </View>}
          </Card>;
        })}
      <AddAccountModal visible={showAddBank} initialType="Bank" onClose={() => setShowAddBank(false)} onSave={(data: AddAccountFormData) => {
        if (!data.accountName.trim() || data.selectedType !== 'Bank' || !Number.isFinite(money(data.amount))) { Alert.alert('Bank details required', 'Enter a valid bank account name and balance.'); return; }
        const id = addAccount({ name: data.accountName.trim(), type: 'bank', currencyCode: data.selectedCurrency, initialBalance: money(data.amount) });
        setShowAddBank(false);
        if (selectedLoan && data.selectedCurrency === selectedLoan.currencyCode) { setAccountId(id); setPaymentMethod('account'); }
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
            </ScrollView>
            <View style={styles.actions}>
              <AppButton title="Save loan" onPress={saveLoan} />
              <AppButton title="Cancel" variant="outline" onPress={resetLoanForm} />
            </View>
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
              <Pressable onPress={() => { setPaymentMethod('custom'); setAccountId(''); setShowPaymentPicker(false); }} style={styles.pickerOption}>
                <AppText>Custom / مخصص</AppText>{paymentMethod === 'custom' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
              </Pressable>
            </ScrollView>
          </View>
        </View>
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
        <View style={styles.overlay}><Card style={styles.modal}>
          <AppText variant="h2">{editingPayment ? 'Edit payment' : settlementMode ? 'Early settlement' : 'Record installment'}</AppText>
          <AppText color="textSecondary">Outstanding: {selectedLoan ? formatAmount(remaining(selectedLoan)) + ' ' + selectedLoan.currencyCode : ''}</AppText>
          <Field label="Amount" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" />
          <DateField label="Payment date" value={paymentDate} onChange={setPaymentDate} />
          <Field label="Note" value={note} onChangeText={setNote} />
          <AppText style={{ fontWeight: '600' }}>Payment method</AppText>
          <Pressable onPress={() => setShowPaymentPicker(true)} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <AppText>{paymentMethod === 'custom' ? (customPaymentMethod.trim() || 'Custom / مخصص') : (activeAccounts.find(a => a.id === accountId)?.name ?? 'Select a registered account')}</AppText>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>
          <AppButton title="Add bank account" variant="outline" onPress={() => setShowAddBank(true)} />
          {paymentMethod === 'custom' && <Field label="Payment method name (e.g. Cash)" value={customPaymentMethod} onChangeText={setCustomPaymentMethod} />}
          <View style={styles.actions}><AppButton title={editingPayment ? 'Save changes' : settlementMode ? 'Confirm settlement' : 'Confirm payment'} onPress={confirmPayment} /><AppButton title="Cancel" variant="outline" onPress={closePayment} /></View>
        </Card></View>
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
  field: { gap: 5 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  accountChoice: { padding: 10, borderWidth: 1, borderColor: '#9996', borderRadius: 10 },
  dropdown: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBankChoice: { paddingVertical: 8, paddingHorizontal: 4 },
  pickerOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 },
  pickerPanel: { maxHeight: '75%', borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  pickerOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#9995' },
});
