import { AccountDropdown } from '@/features/finance/components/AccountDropdown';
import { isValidISODate } from '@/features/finance/utils/input';
import { formPayload, submitFinanceForm, matchesUniqueRevision } from '@/features/finance/components/explicitFinanceForm';
import { acknowledgedFinanceHandler, afterFinanceSave } from '@/features/finance/components/acknowledgedFinanceHandler';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { FinanceModalHeader } from '@/features/finance/components/FinanceModalHeader';
import { FinanceChoiceDropdown, FINANCE_CURRENCY_CHOICES } from '@/features/finance/components/FinanceChoiceDropdown';
import { FormModal } from '@/features/finance/components/FormModal';
import { shouldStackFinanceFields } from '@/features/finance/utils/formLayout';
import { FinanceDateField as DateField } from '@/features/finance/components/FinanceDateField';
import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { canEditLoanPayment, canReverseLoanPayment } from '@/features/finance/utils/loanPaymentPolicy';
import { LoanDetails } from '@/features/finance/components/LoanDetails';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { AddAccountModal, type AddAccountFormData } from '@/features/finance/components/AddAccountModal';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { confirmLoanReceipt, editLinkedPayment, postLinkedPayment, reverseLinkedPayment } from '@/features/finance/store/paymentOperations';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Loan, NewLoanInput } from '@/features/finance/types/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals, getCurrencyFlag } from '@/features/finance/constants/currencies';
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
  const { t } = useAppLanguage();
  const params = useLocalSearchParams<{ loanId?: string }>();
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackFields = shouldStackFinanceFields(width, fontScale);
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

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [loanActionId, setLoanActionId] = useState<string | null>(null);
  const [detailLoanId, setDetailLoanId] = useState<string | null>(null);
  const detailLoan = loans.filter(l => l.id === detailLoanId).length === 1 ? loans.find(l => l.id === detailLoanId) : undefined;
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editName, setEditName] = useState('');
  const [editLender, setEditLender] = useState('');
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
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [latePaymentFee, setLatePaymentFee] = useState('');
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

  const openLoanEdit = (loan: Loan) => { setEditName(loan.name); setEditLender(loan.lenderName); setEditingLoan(loan); };
  const saveLoanMetadata = () => {
    if (!editingLoan || !editName.trim() || !editLender.trim()) return;
    const target = editingLoan;
    const patch = { name: editName.trim(), lenderName: editLender.trim() };
    return submitFinanceForm('loan.metadata.edit', formPayload('loan.metadata.edit', target.id, patch, { expectedUpdatedAt: target.updatedAt }), () => {
      const store = useFinanceStore.getState();
      if (!matchesUniqueRevision(store.loans, target.id, target.updatedAt)) return false;
      store.updateLoan(target.id, patch);
      const after = useFinanceStore.getState().loans.filter(l => l.id === target.id);
      if (after.length !== 1 || after[0].name !== patch.name || after[0].lenderName !== patch.lenderName) throw new Error('Loan metadata change was not accepted');
      return true;
    }, () => setEditingLoan(null), () => Alert.alert(t('Loan not saved', 'لم يتم حفظ القرض')));
  };
  const canDeleteDraftLoan = (loan: Loan) => (!loan.status || loan.status === 'active') && !loan.payments.length && !loan.receivedAt && loan.receivedAmount === undefined && !loan.receiptTransactionId && !transactions.some(tx => tx.linkedEntityId === loan.id);
  const deleteDraftLoan = (loan: Loan) => {
    if (!canDeleteDraftLoan(loan)) {
      Alert.alert(t('Loan cannot be deleted', 'لا يمكن حذف القرض'), t('Received, active funded, closed or financially linked loans cannot be deleted.', 'لا يمكن حذف قرض مستلم أو نشط تم تمويله أو مغلق أو مرتبط بحركات مالية.'));
      return;
    }
    confirm(t('Delete unreceived loan?', 'حذف قرض غير مستلم؟'), t('Only loans without receipt or payment records can be deleted.', 'يمكن حذف القرض الذي لا توجد له سجلات استلام أو سداد فقط.'), () => submitFinanceForm('loan.draft.delete', formPayload('loan.draft.delete', loan.id, {}, { expectedUpdatedAt: loan.updatedAt }), () => {
      const store = useFinanceStore.getState();
      if (!matchesUniqueRevision(store.loans, loan.id, loan.updatedAt)) return false;
      return store.deleteLoan(loan.id);
    }, () => undefined, () => Alert.alert(t('Loan deletion refused', 'تم رفض حذف القرض'))));
  };

  const resetLoanForm = () => {
    setShowLoanForm(false); setLoanName(''); setLender(''); setPrincipal('');
    setTotal(''); setInstallment(''); setCount(''); setFirstDue(today()); setCurrency(baseCurrency);
    setDepositAccountId(''); setDepositMethod('account'); setCustomDepositMethod('');
  };

  const saveLoan = () => {
    if (![principal, installment, total].every(value => !value.trim() || hasValidCurrencyPrecision(value, currency))) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صحيحة'), currency + ' allows up to ' + getCurrencyDecimals(currency) + ' decimal places. Please correct the amount before saving.'));
      return;
    }
    const p = money(principal);
    const m = money(installment);
    const n = Number(count);
    const enteredTotal = total.trim() ? money(total) : null;
    const repaymentTotal = enteredTotal ?? (m !== null ? roundMoney(m * n) : null);
    if (!loanName.trim() || !lender.trim() || p === null || p <= 0 ||
      repaymentTotal === null || repaymentTotal < p || m === null || m <= 0 ||
      !Number.isInteger(n) || n < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
      afterFinanceSave(() => Alert.alert(t('Check loan details', 'راجع بيانات القرض'), t('Enter the lender, loan name, valid principal, total repayment, installment, number of installments and first due date. Total repayment cannot be less than principal.', 'أدخل جهة الإقراض واسم القرض وأصل المبلغ وإجمالي السداد والقسط وعدد الأقساط وتاريخ أول استحقاق بشكل صحيح. لا يجوز أن يقل إجمالي السداد عن أصل القرض.')));
      return;
    }
    const input: NewLoanInput = {
      name: loanName.trim(), lenderName: lender.trim(), principalAmount: p,
      totalRepaymentAmount: repaymentTotal, monthlyInstallment: m, numberOfInstallments: n,
      firstDueDate: firstDue, currencyCode: currency, status: 'active',
      ...(depositMethod === 'account' && depositAccountId
        ? { depositAccountId }
        : depositMethod === 'custom' && customDepositMethod.trim()
          ? { depositMethodLabel: customDepositMethod.trim() }
          : {}),
    };
    return submitFinanceForm("src/app/finance/loans.tsx:134", formPayload('loan.create', null, input),
      () => addLoan(input) || null, resetLoanForm,
      () => Alert.alert(t('Cannot add loan', 'تعذر إضافة القرض'), t('The loan was not saved. Check the details and try again.', 'لم يُحفظ القرض. راجع البيانات وحاول مرة أخرى.')));
  
  };

  const openPayment = (loan: Loan, early = false) => {
    if (loan.status === 'settled' || loan.status === 'closed' || loan.status === 'completed') return;
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    setSelectedLoan(loan);
    setSettlementMode(early);
    const suggestedAmount = early ? remaining(loan) : Math.min(loan.monthlyInstallment, remaining(loan));
    setPaymentAmount(String(suggestedAmount));
    setLatePaymentFee('');
    setPaymentDate(today());
    setAccountId(matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setPaymentMethod('account');
    setCustomPaymentMethod('');
    setNote('');
  };

  const closePayment = () => { setSelectedLoan(null); setPaymentAmount(''); setLatePaymentFee(''); setNote(''); setSettlementMode(false); setEditingPayment(null); setPaymentMethod('account'); setCustomPaymentMethod(''); };

  const openReceiveLoan = (loan: Loan) => {
    if (loan.receivedAt || loan.receiptTransactionId) {
      Alert.alert(t('Already confirmed', 'تم التأكيد بالفعل'), t('The loan receipt has already been recorded.', 'تم تسجيل استلام القرض بالفعل.'));
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
    if (!hasValidCurrencyPrecision(receivedAmount, receivingLoan.currencyCode)) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صحيحة'), receivingLoan.currencyCode + ' allows up to ' + getCurrencyDecimals(receivingLoan.currencyCode) + ' decimal places. Please correct the amount before saving.'));
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
      afterFinanceSave(() => Alert.alert(t('Check receipt details', 'راجع بيانات الاستلام'), t('Enter a valid received amount no greater than the original loan principal, a valid date, and a matching account or receipt method.', 'أدخل مبلغ استلام صحيحًا لا يتجاوز أصل القرض وتاريخًا صحيحًا وحسابًا أو طريقة استلام مناسبة.')));
      return;
    }
    if (receiptMethod === 'account' && !incomeCategory) {
      afterFinanceSave(() => Alert.alert(t('Income category required', 'تصنيف الدخل مطلوب'), t('Add or restore an income category before confirming receipt. No account transaction has been created.', 'أضف تصنيف دخل أو استعده قبل تأكيد الاستلام. لم تُنشأ أي معاملة حساب.')));
      return;
    }
    const input = { loanId: receivingLoan.id, amount, date: receivedDate,
      accountId: account?.id, categoryId: incomeCategory?.id, methodLabel: label };
    return submitFinanceForm("src/app/finance/loans.tsx:199", formPayload('loan.receive', receivingLoan.id, input),
      () => {
        const result = confirmLoanReceipt(input);
        if (!result.ok) { afterFinanceSave(() => Alert.alert(t('Receipt confirmation failed', 'فشل تأكيد الاستلام'), result.reason)); return false; }
        return true;
      }, () => setReceivingLoan(null), () => {});
  
  };

  const confirmCloseWithoutPayment = () => {
    if (!closingLoan || !closureReason.trim()) {
      Alert.alert(t('Reason required', 'السبب مطلوب'), t('Enter a reason for closing this loan without a payment.', 'أدخل سبب إغلاق القرض دون سداد.'));
      return;
    }
    const targetId = closingLoan.id;
    const patch = { status: 'closed' as const, closureDate: today(), closureReason: closureReason.trim() };
    confirm('Close loan without payment?', 'This will remove the outstanding loan from net worth without creating an account transaction. The loan and its payment history will remain saved.', () => acknowledgedFinanceHandler("src/app/finance/loans.tsx:240", () => undefined, {
      payload: { operation: 'closeLoanWithoutPayment', targetId, patch },
      mutate: () => {
        const before = useFinanceStore.getState().loans.filter(item => item.id === targetId);
        if (before.length !== 1 || before[0].status === 'settled' || before[0].status === 'closed') return false;
        updateLoan(targetId, patch);
        const after = useFinanceStore.getState().loans.find(item => item.id === targetId);
        return after?.status === patch.status && after.closureDate === patch.closureDate && after.closureReason === patch.closureReason;
      },
      onCommitted: result => {
        if (result === true) { setClosingLoan(null); setClosureReason(''); }
        else Alert.alert(t('Cannot close loan', 'تعذر إغلاق القرض'));
      },
    })(), 'Close loan');
  };

  const confirmPayment = () => {
    if (!selectedLoan) return;
    if (!hasValidCurrencyPrecision(paymentAmount, selectedLoan.currencyCode) || !hasValidCurrencyPrecision(latePaymentFee, selectedLoan.currencyCode)) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صحيحة'), selectedLoan.currencyCode + ' allows up to ' + getCurrencyDecimals(selectedLoan.currencyCode) + ' decimal places. Please correct the amount before saving.'));
      return;
    }
    const amount = money(paymentAmount);
    const fee = latePaymentFee.trim() ? money(latePaymentFee) : 0;
    const cashAmount = amount !== null && fee !== null ? roundMoney(amount + fee) : null;
    if (!editingPayment && paymentMethod === 'account' && !expenseCategory) {
      afterFinanceSave(() => Alert.alert(t('Expense category required', 'تصنيف المصروف مطلوب'), t('Add or restore an expense category before recording a loan payment. No payment has been recorded.', 'أضف تصنيف مصروف أو استعده قبل تسجيل سداد القرض. لم تُسجل أي دفعة.')));
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
      afterFinanceSave(() => Alert.alert(t('Invalid payment', 'دفعة غير صحيحة'), t('Check the installment amount, late fee, date and payment method. The installment cannot exceed the remaining contract balance.', 'راجع قيمة القسط ورسوم التأخير والتاريخ وطريقة الدفع. لا يجوز أن يتجاوز القسط الرصيد المتبقي من العقد.')));
      return;
    }
    const ref = { entityType: 'loan' as const, entityId: selectedLoan.id, paymentId: editingPayment?.id ?? '' };
    const details = { amount, latePaymentFee: fee, date: paymentDate, accountId: account?.id,
      paymentMethodLabel: account ? undefined : customLabel, note: note.trim() || undefined };
    const post = { ...details, entityType: 'loan' as const, entityId: selectedLoan.id,
      categoryId: expenseCategory?.id, settlement: settlementMode };
    return submitFinanceForm("src/app/finance/loans.tsx:247", formPayload(editingPayment ? 'loan.payment.edit' : 'loan.payment.create',
      selectedLoan.id, editingPayment ? details : post, { paymentId: editingPayment?.id, currencyCode: selectedLoan.currencyCode }),
      () => {
        const result = editingPayment ? editLinkedPayment(ref, details) : postLinkedPayment(post);
        if (!result.ok) { afterFinanceSave(() => Alert.alert(t('Payment not saved', 'لم تُحفظ الدفعة'), result.reason)); return false; }
        return true;
      }, closePayment, () => {});
  
  };
  const openEditPayment = (loan: Loan, payment: Loan['payments'][number]) => {
    const current = useFinanceStore.getState().loans.filter(l => l.id === loan.id);
    if (current.length !== 1 || !canEditLoanPayment(current[0])) { Alert.alert(t('Payment is read-only', 'الدفعة للقراءة فقط'), t('Historical payments on settled or closed loans cannot be edited.', 'لا يمكن تعديل الدفعات السابقة للقروض المسددة أو المغلقة.')); return; }
    const linked = resolvePayment({ entityType: 'loan', entityId: loan.id, paymentId: payment.id },
      useFinanceStore.getState(), useLedgerStore.getState());
    const matching = activeAccounts.filter(a => a.currencyCode === loan.currencyCode && a.type !== 'credit_card');
    if (payment.ledgerTransactionId && !matching.length) { Alert.alert(t('Cannot edit payment', 'تعذر تعديل الدفعة'), t('No active account in the payment currency is available.', 'لا يوجد حساب نشط بعملة الدفعة.')); return; }
    setSelectedLoan(loan); setEditingPayment(payment); setSettlementMode(false);
    setPaymentAmount(String(payment.amount));
    setLatePaymentFee(payment.latePaymentFee ? String(payment.latePaymentFee) : '');
    setPaymentDate(payment.date);
    setAccountId(payment.accountId && matching.some(a => a.id === payment.accountId) ? payment.accountId : matching.find(a => a.type === 'bank')?.id ?? matching[0]?.id ?? '');
    setPaymentMethod(payment.ledgerTransactionId || linked ? 'account' : 'custom'); setCustomPaymentMethod(payment.paymentMethodLabel ?? ''); setNote(payment.note ?? '');
  };
  const confirmDeletePayment = (loan: Loan, payment: Loan['payments'][number]) => {
    if (!canReverseLoanPayment(loan, payment.id)) return;
    const reversal = loan.status === 'settled';
    const ref = { entityType: 'loan' as const, entityId: loan.id, paymentId: payment.id };
    confirm(reversal ? 'Reverse settlement?' : 'Delete payment?', reversal ? 'This explicitly reopens the loan, restores its outstanding principal and removes the linked settlement transaction. Review the loan balance afterward.' : 'The linked account transaction will also be removed. This cannot be undone.', () => acknowledgedFinanceHandler("src/app/finance/loans.tsx:302", () => undefined, {
      payload: { operation: 'reverseLinkedPayment', ...ref, reversal },
      mutate: () => reverseLinkedPayment(ref),
      onCommitted: value => {
        const result = value as ReturnType<typeof reverseLinkedPayment>;
        if (!result.ok) Alert.alert(t('Cannot delete payment', 'تعذر حذف الدفعة'), result.reason);
      },
    })(), reversal ? 'Reverse settlement' : 'Delete');
  };

  if (!ready) return <Screen><View style={styles.center}><ActivityIndicator color={moduleColors.finance} /></View></Screen>;

  return (
    <Screen scroll style={{ backgroundColor: '#F1F5F9' }}>
      {confirmation}
      <LoanDetails loanId={detailLoanId} loan={detailLoan} onClose={() => { setDetailLoanId(null); setLoanActionId(null); }}>
        {detailLoan && (() => { const loan = detailLoan; return <>
            {loan.status !== 'settled' && loan.status !== 'completed' && loan.status !== 'closed' && <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <AppButton title={t('Record payment', 'تسجيل دفعة')} accentColor="#1E293B" style={{ flex: 1 }} onPress={() => { setDetailLoanId(null); openPayment(loan); }} />
                <Pressable accessibilityRole="button" accessibilityLabel={t('More loan actions', 'المزيد من إجراءات القرض')} accessibilityState={{ expanded: loanActionId === loan.id }} onPress={() => setLoanActionId(loanActionId === loan.id ? null : loan.id)} style={{ minHeight: 52, minWidth: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D6B777', borderRadius: 12 }}><Ionicons name="ellipsis-horizontal" size={24} color={colors.text} /></Pressable>
              </View>
              {loanActionId === loan.id && <View style={{ gap: 8 }}>
                <AppButton title={t('Early settlement', 'السداد المبكر')} variant="outline" onPress={() => { setLoanActionId(null); setDetailLoanId(null); openPayment(loan, true); }} />
                <AppButton title={t('Close without payment', 'إغلاق دون دفع')} variant="danger" onPress={() => { setLoanActionId(null); setDetailLoanId(null); setClosingLoan(loan); setClosureReason(''); }} />
              </View>}
            </>}
            {loan.status === 'closed' && <AppText color="warning">{t('Closed without payment on', 'مغلق دون سداد بتاريخ')} {loan.closureDate}: {loan.closureReason}</AppText>}
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
                <AppText color={colors.finance.income.accent}>{t('Settlement', 'التسوية')}: {formatAmount(loan.settlementAmount ?? 0, loan.currencyCode)} {loan.currencyCode} {t('on', 'بتاريخ')} {loan.settlementDate}</AppText>
                {saved > 0.001 && <AppText color={colors.finance.income.accent} variant="caption">{t('Early settlement saving', 'الوفر من التسوية المبكرة')}: {formatAmount(saved, loan.currencyCode)} {loan.currencyCode}</AppText>}
              </View>;
            })()}
        </>; })()}
      </LoanDetails>
      <View style={financeChrome.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("Go back", "رجوع")} onPress={() => router.back()} style={financeChrome.back}><Ionicons name="arrow-back" size={20} color="#D6B777" /></Pressable>
        <View style={{ flex: 1 }}><AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{t("Loans", "القروض")}</AppText><AppText variant="caption" style={{ color: '#CBD5E1' }}>{loans.length} loans</AppText></View>
      </View>
      {params.loanId !== undefined && (
        <Card variant="filled">
          <AppText>{visibleLoans.length ? t('Showing the loan linked to your transaction.', 'يعرض القرض المرتبط بمعاملتك.') : t('The linked loan is unavailable. No other loan has been selected.', 'القرض المرتبط غير متاح. لم يتم اختيار أي قرض آخر.')}</AppText>
          <AppButton title={t("View all loans", "عرض كل القروض")} variant="ghost" onPress={() => router.replace('/finance/loans')} />
        </Card>
      )}
      <AppText color="textSecondary" style={{ marginBottom: 16 }}>
        {t(t('Track money borrowed, confirm received funds, record repayments, and monitor your outstanding loan balance.', 'تابع الأموال المقترضة، وأكد استلامها، وسجّل الدفعات، وراقب الرصيد المتبقي للقرض.'), 'تابع الأموال المقترضة، وأكد استلامها، وسجّل الدفعات، وراقب الرصيد المتبقي للقرض.')}
      </AppText>
      <AppButton title={t("Add loan", "إضافة قرض")} accentColor="#1E293B" leftIcon={<Ionicons name="add" size={18} color={colors.onPrimary} />} onPress={() => setShowLoanForm(true)} />
      {visibleLoans.length === 0 ? <Card variant="filled"><AppText align="center" color="textSecondary">{params.loanId !== undefined ? t('Return to transactions or view all loans.', 'ارجع إلى المعاملات أو اعرض كل القروض.') : t('No loans recorded yet. Add your first loan.', 'لا توجد قروض مسجلة بعد. أضف أول قرض.')}</AppText></Card> :
        visibleLoans.map(loan => {
          const due = remaining(loan);
          const depositKey = loan.id + ':deposit';
          const historyKey = loan.id + ':history';
          const toggleSection = (key: string) => setExpandedSections(previous => ({ ...previous, [key]: !previous[key] }));
          return <Card key={loan.id} variant="outlined" style={[styles.loanCard, { backgroundColor: colors.finance.account.surface, borderColor: colors.finance.account.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Details for', 'تفاصيل') + ' ' + loan.name} onPress={() => setDetailLoanId(loan.id)} style={{ minHeight: 48, gap: 8 }}>
            <View style={styles.row}>
              <Ionicons name="cash-outline" size={23} color={colors.finance.account.accent} />
              <View style={{ flex: 1, minWidth: 0 }}><AppText variant="bodyStrong">{loan.name}</AppText><AppText color="textSecondary" variant="caption">{loan.lenderName} · {getCurrencyFlag(loan.currencyCode)} {loan.currencyCode}</AppText></View>
              <AppText variant="caption" style={{ fontWeight: '700', color: loan.status === 'active' || !loan.status ? colors.finance.income.accent : colors.textSecondary }}>{loan.status === 'settled' ? t('Settled', 'تمت التسوية') : loan.status === 'completed' ? t('Completed', 'مكتمل') : loan.status === 'closed' ? t('Closed', 'مغلق') : t('Active', 'نشط')}</AppText>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
            <View style={[styles.metrics, { backgroundColor: colors.surface }]}>
              <View style={styles.metric}><AppText variant="caption" style={{ fontWeight: '700', flex: 1, minWidth: 0 }}>{t('Remaining principal', 'أصل القرض المتبقي')}</AppText><AppText variant="bodyStrong" color={colors.finance.expense.accent}>{getLoanRemainingPrincipal(loan) === null ? t('Unknown — allocation required', 'غير معروف — يلزم توزيع المبلغ') : formatAmount(getLoanRemainingPrincipal(loan)!, loan.currencyCode) + ' ' + getCurrencyFlag(loan.currencyCode) + ' ' + loan.currencyCode}</AppText></View>
              <View style={styles.metric}><AppText variant="caption" style={{ fontWeight: '700', flex: 1, minWidth: 0 }}>{t('Remaining installments', 'الأقساط المتبقية')}</AppText><AppText variant="bodyStrong">{loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed' ? 0 : loan.monthlyInstallment > 0 ? Math.ceil(due / loan.monthlyInstallment) : t('Unknown', 'غير معروف')}</AppText></View>
            </View>
            </Pressable>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <View style={{ flexGrow: 1, flexBasis: 160, flexShrink: 1 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('Toggle', 'توسيع أو طي') + ' ' + t('Deposit distribution', 'توزيع المبلغ المستلم')} accessibilityState={{ expanded: !!expandedSections[depositKey] }} onPress={() => toggleSection(depositKey)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppText variant="caption" style={{ fontWeight: '700', flexShrink: 1 }} color={colors.finance.account.accent}>{t('Deposit distribution', 'توزيع المبلغ المستلم')}</AppText><Ionicons name={expandedSections[depositKey] ? 'chevron-up' : 'chevron-down'} size={16} color={colors.finance.account.accent} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('Toggle', 'توسيع أو طي') + ' ' + t('Payment history', 'سجل الدفعات')} accessibilityState={{ expanded: !!expandedSections[historyKey] }} onPress={() => toggleSection(historyKey)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppText variant="caption" style={{ fontWeight: '700', flexShrink: 1 }} color={colors.finance.account.accent}>{t('Payment history', 'سجل الدفعات') + ' (' + loan.payments.length + ')'}</AppText><Ionicons name={expandedSections[historyKey] ? 'chevron-up' : 'chevron-down'} size={16} color={colors.finance.account.accent} />
                </Pressable>
              </View>
              <FinanceActionButtons label={loan.name} onEdit={() => openLoanEdit(loan)} onDelete={() => deleteDraftLoan(loan)} />
            </View>
            {!!expandedSections[depositKey] && <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 8, gap: 4 }}>
              <AppText variant="caption" color="textSecondary">{loan.receivedAt ? t('Received', 'تم الاستلام') + ': ' + formatAmount(loan.receivedAmount ?? loan.principalAmount ?? 0, loan.currencyCode) + ' ' + loan.currencyCode + ' ' + t('on', 'بتاريخ') + ' ' + loan.receivedAt : t('Receipt not confirmed', 'لم يتم تأكيد الاستلام')}</AppText>
              <AppText variant="caption">{loan.receiptTransactionId ? t('Posted to:', 'أُضيف إلى:') + ' ' + (accounts.find(a => a.id === (transactions.find(t => t.id === loan.receiptTransactionId)?.accountId ?? loan.depositAccountId))?.name ?? t('See linked receipt transaction', 'راجع معاملة الاستلام المرتبطة')) : loan.depositMethodLabel ?? t('No confirmed destination', 'لا يوجد وجهة استلام مؤكدة')}</AppText>
              {!loan.receivedAt && loan.status !== 'settled' && loan.status !== 'closed' && loan.status !== 'completed' && <AppButton title={t("Confirm loan received", "تأكيد استلام القرض")} variant="outline" onPress={() => openReceiveLoan(loan)} />}
            </View>}
            {!!expandedSections[historyKey] && <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 8, gap: 4 }}>
              {loan.payments.length === 0 && <AppText variant="caption" color="textSecondary">{t("No payments recorded.", "لم تُسجل دفعات بعد.")}</AppText>}
              {loan.payments.map(payment => <View key={payment.id} style={styles.paymentRow}>
                <View style={{ flex: 1 }}><AppText>{formatAmount(payment.amount, loan.currencyCode)} {loan.currencyCode}{(payment.latePaymentFee ?? 0) > 0 ? ` · ${t('Fee', 'رسوم')}: ${formatAmount(payment.latePaymentFee!, loan.currencyCode)} ${loan.currencyCode}` : ''}</AppText><AppText variant="caption" color="textSecondary">{payment.date} · {payment.note || t('Installment', 'قسط')}</AppText></View>
                {(canEditLoanPayment(loan) || canReverseLoanPayment(loan, payment.id)) && <FinanceActionButtons label={'payment dated ' + payment.date}
                  onEdit={canEditLoanPayment(loan) ? () => openEditPayment(loan, payment) : undefined}
                  onDelete={canReverseLoanPayment(loan, payment.id) ? () => confirmDeletePayment(loan, payment) : undefined}
                  deleteTitle={loan.status === 'settled' ? t('Reverse settlement', 'عكس التسوية') : t('Delete', 'حذف')} />}
              </View>)}
            </View>}
          </Card>;
        })}
      {editingLoan !== null && <FormModal visible={true} title={t('Edit loan name and lender', 'تعديل اسم القرض والمقرض')} onClose={() => setEditingLoan(null)}>
        <Field label={t('Loan name', 'اسم القرض')} value={editName} onChangeText={setEditName} />
        <Field label={t('Lender / bank', 'المقرض / البنك')} value={editLender} onChangeText={setEditLender} />
        <View style={{ flexDirection: 'row', gap: 8 }}><AppButton title={t('Save changes', 'حفظ التعديلات')} onPress={saveLoanMetadata} style={{ flex: 1 }} /><AppButton title={t('Cancel', 'إلغاء')} variant="outline" onPress={() => setEditingLoan(null)} style={{ flex: 1 }} /></View>
      </FormModal>}
      <AddAccountModal visible={showAddBank} initialType="Bank" onClose={() => setShowAddBank(false)} onSave={(data: AddAccountFormData) => {
        const initialBalance = money(data.amount);
        const openingDate = data.openingBalanceDate;
        if (!data.accountName.trim() || data.selectedType !== 'Bank' || initialBalance === null
          || !hasValidCurrencyPrecision(data.amount, data.selectedCurrency) || (openingDate !== undefined && !isValidISODate(openingDate))) {
          Alert.alert(t('Bank details required', 'بيانات البنك مطلوبة'), t('Enter a valid bank account name and balance.', 'أدخل اسم حساب بنكي ورصيدًا صحيحين.')); return;
        }
        const input = { name: data.accountName.trim(), type: 'bank' as const, currencyCode: data.selectedCurrency, initialBalance };
        return submitFinanceForm("src/app/finance/loans.tsx:385", formPayload('account.create', null, input, { openingDate }),
          () => addAccount(input, openingDate) || null,
          result => {
            if (typeof result !== 'string') return;
            setShowAddBank(false);
            if (selectedLoan && data.selectedCurrency === selectedLoan.currencyCode) { setAccountId(result); setPaymentMethod('account'); }
            else if (showLoanForm && data.selectedCurrency === currency) { setDepositAccountId(result); setDepositMethod('account'); }
          }, () => Alert.alert(t('Account not saved', 'لم يتم حفظ الحساب')));
  }} />
      <FormModal visible={showLoanForm} title={t("New loan", "قرض جديد")} onClose={resetLoanForm}>
            <View testID="loan-name-row" style={{ flexDirection: stackFields ? 'column' : 'row', gap: 12 }}>
              <View style={{ flex: stackFields ? 0 : 1 }}>
              <Field label={t("Loan name", "اسم القرض")} value={loanName} onChangeText={setLoanName} />
              </View><View style={{ flex: stackFields ? 0 : 1 }}>
              <Field label={t("Lender / bank", "المُقرض / البنك")} value={lender} onChangeText={setLender} />
              </View>
            </View>
            <View testID="loan-amount-row" style={{ flexDirection: stackFields ? 'column' : 'row', gap: 12 }}>
              <View style={{ flex: stackFields ? 0 : 1 }}>
              <Field label={t("Original principal (amount borrowed)", "أصل القرض (المبلغ المقترض)")} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" />
              </View><View style={{ flex: stackFields ? 0 : 1 }}>
              <Field label={t("Total repayment (principal + interest)", "إجمالي السداد (الأصل + الفائدة)")} value={total} onChangeText={setTotal} keyboardType="decimal-pad" />
              </View>
            </View>
            <View testID="loan-installment-row" style={{ flexDirection: stackFields ? 'column' : 'row', gap: 12 }}>
              <View style={{ flex: stackFields ? 0 : 1 }}>
              <Field label={t("Monthly installment (amount per month)", "القسط الشهري (المبلغ كل شهر)")} value={installment} onChangeText={setInstallment} keyboardType="decimal-pad" />
              </View><View style={{ flex: stackFields ? 0 : 1 }}>
              <Field label={t("Number of installments (months)", "عدد الأقساط (بالشهور)")} value={count} onChangeText={setCount} keyboardType="number-pad" />
              </View>
            </View>
              <DateField label={t("First due date", "تاريخ أول استحقاق")} value={firstDue} onChange={setFirstDue} pickerOnly />
              <FinanceChoiceDropdown label={t('Loan currency', 'عملة القرض')} value={currency}
                options={FINANCE_CURRENCY_CHOICES} onChange={setCurrency} />
              <AppText variant="label" style={{ fontWeight: '700' }} color="textSecondary">{t('Deposit to account / Where did you receive the loan?', 'الإيداع في الحساب / أين استلمت القرض؟')}</AppText>
              <Pressable onPress={() => setShowDepositPicker(true)} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <AppText>{depositMethod === 'custom'
                  ? (customDepositMethod.trim() || t('Custom', 'مخصص'))
                  : (activeAccounts.find(a => a.id === depositAccountId)?.name ?? t('Select a matching account', 'اختر حسابًا مطابقًا'))}</AppText>
                <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
              </Pressable>
              {depositMethod === 'custom' && <Field label={t("Receipt method (e.g. Cash)", "طريقة الاستلام (مثل النقد)")} value={customDepositMethod} onChangeText={setCustomDepositMethod} />}
            <View testID="loan-form-actions" style={{ flexDirection: stackFields ? 'column' : 'row', gap: 12 }}>
              <AppButton title={t("Save loan", "حفظ القرض")} onPress={saveLoan} style={{ flex: stackFields ? 0 : 1 }} />
              <AppButton title={t("Cancel", "إلغاء")} variant="outline" onPress={resetLoanForm} style={{ flex: stackFields ? 0 : 1 }} />
            </View>
      </FormModal>
      <Modal visible={showDepositPicker} transparent animationType="fade" onRequestClose={() => setShowDepositPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDepositPicker(false)} />
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">{t("Choose deposit method", "اختر طريقة الإيداع")}</AppText>
            <AppText variant="caption" color="textSecondary">{t("Accounts in", "الحسابات بعملة")} {currency}</AppText>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {depositAccounts.map(account => (
                <Pressable key={account.id} onPress={() => {
                  setDepositAccountId(account.id); setDepositMethod('account'); setShowDepositPicker(false);
                }} style={styles.pickerOption}>
                  <AppText>{account.name} · {account.currencyCode}{account.type === 'bank' ? ' · ' + t('Bank', 'بنك') : ''}</AppText>
                  {depositMethod === 'account' && depositAccountId === account.id && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
                </Pressable>
              ))}
              {depositAccounts.length === 0 && <AppText color="textSecondary">{t("No active matching accounts.", "لا توجد حسابات نشطة مطابقة.")}</AppText>}
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
            <AppText variant="h2">{t("Custom method", "طريقة مخصصة")}</AppText>
            <AppText variant="caption" color="textSecondary">{t("Choose how you want to continue.", "اختر طريقة المتابعة.")}</AppText>
            <Pressable onPress={() => {
              setCustomChoiceFor(null);
              setShowAddBank(true);
            }} style={styles.pickerOption}>
              <AppText>{t("Add new bank account", "إضافة حساب بنكي جديد")}</AppText><Ionicons name="add-circle-outline" size={20} color={moduleColors.finance} />
            </Pressable>
            <Pressable onPress={() => {
              if (customChoiceFor === 'deposit') {
                setDepositMethod('custom'); setDepositAccountId('');
              } else {
                setPaymentMethod('custom'); setAccountId('');
              }
              setCustomChoiceFor(null);
            }} style={styles.pickerOption}>
              <AppText>{t("Other / Something else", "أخرى / خيار آخر")}</AppText><Ionicons name="wallet-outline" size={20} color={moduleColors.finance} />
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={showPaymentPicker} transparent animationType="fade" onRequestClose={() => setShowPaymentPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPaymentPicker(false)} />
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="h2">{t("Choose payment method", "اختيار طريقة الدفع")}</AppText>
            <AppText variant="caption" color="textSecondary">Accounts in {selectedLoan?.currencyCode ?? ''}</AppText>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
              {paymentAccounts.map(account => (
                <Pressable key={account.id} onPress={() => { setAccountId(account.id); setPaymentMethod('account'); setShowPaymentPicker(false); }} style={styles.pickerOption}>
                  <AppText>{account.name} · {account.currencyCode}{account.type === 'bank' ? ' · ' + t('Bank', 'بنك') : ''}</AppText>{paymentMethod === 'account' && accountId === account.id && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
                </Pressable>
              ))}
              {paymentAccounts.length === 0 && (
                <AppText color="textSecondary">{t("No active registered accounts in this currency.", "لا توجد حسابات نشطة مسجلة بهذه العملة.")}</AppText>
              )}
              <Pressable onPress={() => { setShowPaymentPicker(false); setCustomChoiceFor('payment'); }} style={styles.pickerOption}>
                <AppText>Custom / مخصص</AppText>{paymentMethod === 'custom' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <FormModal visible={!!receivingLoan} title={t('Receive Loan', 'استلام القرض')} onClose={() => setReceivingLoan(null)} onBack={() => setReceivingLoan(null)} compactTitle>
        <Card style={{ borderWidth: 1, borderColor: '#D6B777', gap: 4 }}><AppText variant="bodyStrong">{receivingLoan?.name ?? ''}</AppText><AppText variant="caption">{t('Loan principal', 'أصل القرض')}</AppText><AppText variant="h2">{receivingLoan?.principalAmount === undefined ? t('Unknown', 'غير معروف') : formatAmount(receivingLoan.principalAmount, receivingLoan.currencyCode) + ' ' + receivingLoan.currencyCode}</AppText></Card>
        <View style={{ flexDirection: shouldStackFinanceFields(width, fontScale) ? 'column' : 'row', alignItems: 'stretch', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}><Field label={t('Amount', 'المبلغ') + ' (' + (receivingLoan?.currencyCode ?? '') + ')'} value={receivedAmount} onChangeText={setReceivedAmount} keyboardType="decimal-pad" /></View>
          <AccountDropdown label={t('Account', 'الحساب')} options={activeAccounts.filter(a => !a.archived && a.currencyCode === receivingLoan?.currencyCode && a.type !== 'credit_card')} value={receiptMethod === 'account' ? receiptAccountId : ''} onChange={id => { setReceiptAccountId(id); setReceiptMethod('account'); }} emptyMessage={t('No matching account', 'لا يوجد حساب مطابق')} />
        </View>
        <DateField label={t('Received date', 'تاريخ الاستلام')} value={receivedDate} onChange={setReceivedDate} pickerOnly />
        <Pressable onPress={() => setReceiptMethod(receiptMethod === 'custom' ? 'account' : 'custom')} style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}><AppText>{t('Other receipt method', 'طريقة استلام أخرى')}</AppText>{receiptMethod === 'custom' && <Ionicons name="checkmark" size={18} color={moduleColors.finance} />}</Pressable>
        {receiptMethod === 'custom' && <Field label={t('Receipt method', 'طريقة الاستلام')} value={receiptMethodLabel} onChangeText={setReceiptMethodLabel} />}
        <AppText variant="caption" color="textSecondary">{t('Confirm only after receiving the funds.', 'أكد فقط بعد استلام الأموال فعليًا.')}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <AppButton title={t('Cancel', 'إلغاء')} variant="outline" onPress={() => setReceivingLoan(null)} style={{ flex: 1 }} />
          <AppButton title={t('Confirm receipt', 'تأكيد الاستلام')} onPress={confirmLoanReceived} disabled={receiptMethod === 'account' ? !activeAccounts.some(a => a.id === receiptAccountId && a.currencyCode === receivingLoan?.currencyCode && !a.archived && a.type !== 'credit_card') : !receiptMethodLabel.trim()} style={{ flex: 1 }} />
        </View>
      </FormModal>
      <Modal visible={!!closingLoan} transparent animationType="fade" onRequestClose={() => setClosingLoan(null)}>
        <View style={styles.overlay}><Card style={styles.modal}>
          <View style={{ marginHorizontal: -16, marginTop: -16 }}><FinanceModalHeader title={t("Close without payment", "إغلاق دون دفع")} onClose={() => { setClosingLoan(null); setClosureReason(''); }} /></View>
          <AppText color="textSecondary">{t('No money will be deducted from any account. The loan history will be kept.', 'لن يُخصم أي مبلغ من أي حساب، وسيُحتفظ بسجل القرض.')}</AppText>
          <Field label={t("Reason (required)", "السبب (مطلوب)")} value={closureReason} onChangeText={setClosureReason} />
          <View style={styles.actions}>
            <AppButton title={t("Confirm closure", "تأكيد الإغلاق")} variant="danger" onPress={confirmCloseWithoutPayment} />
            <AppButton title={t("Cancel", "إلغاء")} variant="outline" onPress={() => { setClosingLoan(null); setClosureReason(''); }} />
          </View>
        </Card></View>
      </Modal>
      <FormModal visible={!!selectedLoan} title={editingPayment ? t('Edit payment', 'تعديل الدفعة') : settlementMode ? t('Early settlement', 'السداد المبكر') : t('Record installment', 'تسجيل قسط')} onClose={closePayment} onBack={closePayment} compactTitle>
        <Card variant="outlined" style={{ borderColor: colors.finance.liability.border, backgroundColor: colors.finance.liability.surface, padding: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}><AppText variant="bodyStrong">{selectedLoan?.name}</AppText><AppText variant="label" style={{ fontWeight: '700' }}>{t('Remaining contractual', 'المتبقي التعاقدي')}</AppText></View>
            <AppText variant="bodyStrong" color={colors.finance.expense.accent} style={{ flexShrink: 1, textAlign: 'right' }}>{selectedLoan ? formatAmount(remaining(selectedLoan), selectedLoan.currencyCode) + ' ' + selectedLoan.currencyCode : ''}</AppText>
          </View>
        </Card>
                {settlementMode && <AppText variant="caption" color="warning">Default: remaining contractual balance, not a lender settlement quote. Enter your agreed amount; fees are separate.</AppText>}
                <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: 8, alignItems: 'stretch' }}>
                  <View style={{ flex: stackFields ? 0 : 1, minWidth: 0 }}><Field label={`Repayment amount, excluding fee (${selectedLoan?.currencyCode ?? ''})`} value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" /></View>
                  <View style={{ flex: stackFields ? 0 : 1, minWidth: 0, gap: 5 }}><AppText style={{ fontWeight: '600' }}>{t('Account / method', 'الحساب / الطريقة')}</AppText>
                <Pressable onPress={() => setShowPaymentPicker(true)} style={[styles.dropdown, { minHeight: 52 }, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <AppText variant="bodyStrong" style={{ flex: 1, minWidth: 0 }}>{paymentMethod === 'custom' ? (customPaymentMethod.trim() || t('Custom', 'مخصص')) : (activeAccounts.find(a => a.id === accountId)?.name ?? t('Select a registered account', 'اختر حسابًا مسجلًا'))}</AppText>
                  <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                </Pressable></View>
                </View>
                <Field label={`Late payment fee (${selectedLoan?.currencyCode ?? ''}) — optional`} value={latePaymentFee} onChangeText={setLatePaymentFee} keyboardType="decimal-pad" />
                <AppText variant="caption" color="textSecondary">The late fee is added to the amount deducted from your account, but does not reduce the remaining loan balance.</AppText>
                <DateField label={t("Payment date", "تاريخ الدفع")} value={paymentDate} onChange={setPaymentDate} pickerOnly />
                <Field label={t('Note — optional', 'ملاحظة — اختيارية')} value={note} onChangeText={setNote} />
                {paymentMethod === 'custom' && <Field label={t("Payment method name (e.g. Cash)", "اسم طريقة الدفع (مثل النقد)")} value={customPaymentMethod} onChangeText={setCustomPaymentMethod} />}
        <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: 8 }}><AppButton title={editingPayment ? t('Save changes', 'حفظ التعديلات') : settlementMode ? t('Confirm settlement', 'تأكيد السداد') : t('Confirm payment', 'تأكيد الدفع')} onPress={confirmPayment} style={{ flex: stackFields ? 0 : 1 }} /><AppButton title={t("Cancel", "إلغاء")} variant="outline" onPress={closePayment} style={{ flex: stackFields ? 0 : 1 }} /></View>
      </FormModal>
    </Screen>
  );
}

function Field({ label, value, onChangeText, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'decimal-pad' | 'number-pad' }) {
  const { colors } = useTheme();
  return <View style={styles.field}><AppText variant="label" color="textSecondary" style={{ fontWeight: '700' }}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} placeholder="Tap here to enter" placeholderTextColor={colors.textSecondary} selectionColor="#D6B777" style={[styles.input, { color: colors.text, borderColor: '#D6B777', backgroundColor: colors.surface }]} /></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  back: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  loanCard: { marginTop: 8, padding: 10, gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  metrics: { borderRadius: 10, padding: 8, gap: 6 },
  metric: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  remaining: { fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9995', paddingTop: 10, gap: 8 },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 4, gap: 4 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end', alignItems: 'center' },
  formScroll: { flexShrink: 1, minHeight: 0 },
  formFields: { gap: 8, paddingVertical: 6 },
  loanFormModal: { width: '100%', maxHeight: '94%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 14, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  modal: { width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  paymentKeyboard: { width: '100%', maxHeight: '94%', flexShrink: 1 },
  paymentScroll: { flexGrow: 0, flexShrink: 1 },
  paymentScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 4 },
  field: { gap: 5 },
  input: { fontSize: 16, minHeight: 52, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  accountChoice: { padding: 10, borderWidth: 1, borderColor: '#9996', borderRadius: 10 },
  dropdown: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBankChoice: { paddingVertical: 8, paddingHorizontal: 4 },
  pickerOverlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 },
  pickerPanel: { maxHeight: '75%', borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  pickerOption: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#9995' },
});
