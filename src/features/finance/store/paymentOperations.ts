import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Loan, LoanPayment } from '@/features/finance/types/finance';
import { getDebtRemaining, getLoanPaidAmount, getLoanRemainingAmount, getLoanTotal, roundMoney } from '@/features/finance/utils/finance';
import { isValidISODate } from '@/features/finance/utils/input';
import { resolvePayment, type PaymentRef } from '@/features/finance/utils/paymentTransactionOwnership';

export type PaymentResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): PaymentResult => ({ ok: false, reason });
let running = false;

/** Synchronous runtime compensation, NOT a disk transaction across the two storage keys. */
function coordinate(change: () => boolean): PaymentResult {
  if (running || !useFinanceStore.persist.hasHydrated() || !useLedgerStore.persist.hasHydrated()) {
    return fail('Payment data is not ready. Please retry.');
  }
  const { loans, debts } = useFinanceStore.getState();
  const { transactions } = useLedgerStore.getState();
  running = true;
  try {
    try {
      if (change()) return { ok: true };
    } catch {
      // A store action/subscriber may throw after having already changed state.
    }
    let restored = true;
    try { useFinanceStore.setState({ loans, debts }); } catch { restored = false; }
    try { useLedgerStore.setState({ transactions }); } catch { restored = false; }
    return fail(restored
      ? 'The payment operation was rejected. Previous records were restored.'
      : 'Payment rollback failed. Stop making changes and review the saved records.');
  } finally { running = false; }
}

function activeAccount(id: string | undefined, currency: string, loan: boolean) {
  const matches = useLedgerStore.getState().accounts.filter(a => a.id === id);
  return matches.length === 1 && !matches[0].archived && matches[0].currencyCode === currency
    && (!loan || matches[0].type !== 'credit_card');
}

function noRefunds(id: string) {
  return !useLedgerStore.getState().transactions.some(t => t.relatedTransactionId === id);
}

function findCustomLoanPayment(ref: PaymentRef) {
  if (ref.entityType !== 'loan') return null;
  const state = useFinanceStore.getState();
  const loans = state.loans.filter(l => l.id === ref.entityId);
  const payments = loans.length === 1 ? loans[0].payments.filter(p => p.id === ref.paymentId) : [];
  const payment = payments[0];
  // An account-only legacy record is not proof of a custom payment.
  if (payments.length !== 1 || payment.ledgerTransactionId || payment.accountId
    || !payment.paymentMethodLabel?.trim()
    || useLedgerStore.getState().transactions.some(t => t.linkedEntityType === 'loan'
      && t.linkedEntityId === ref.entityId && t.linkedPaymentId === ref.paymentId)) return null;
  return { loan: loans[0], payment };
}

function updateLoanLifecycle(loan: Loan, paymentId: string, reverse: boolean) {
  const current = useFinanceStore.getState().loans.find(l => l.id === loan.id)!;
  let next = current;
  if (loan.settlementPaymentId === paymentId) {
    if (reverse) {
      next = { ...current, status: 'active' };
      delete next.settlementAmount; delete next.settlementDate;
      delete next.settlementAccountId; delete next.settlementPaymentId; delete next.settlementNote;
    } else {
      const p = current.payments.find(p => p.id === paymentId)!;
      next = { ...current, status: 'settled', settlementAmount: p.amount,
        settlementDate: p.date, settlementAccountId: p.accountId, settlementNote: p.note };
    }
  } else if (loan.status !== 'closed' && loan.status !== 'settled') {
    next = { ...current, status: getLoanPaidAmount(current) >= getLoanTotal(current) ? 'completed' : 'active' };
  }
  useFinanceStore.setState(s => ({ loans: s.loans.map(l => l.id === loan.id ? next : l) }));
}

export interface PaymentEdit {
  amount: number;
  date: string;
  note?: string;
  accountId?: string;
  latePaymentFee?: number;
  paymentMethodLabel?: string;
}

export function editLinkedPayment(ref: PaymentRef, edit: PaymentEdit): PaymentResult {
  return coordinate(() => {
    if (!Number.isFinite(edit.amount) || roundMoney(edit.amount) <= 0 || !isValidISODate(edit.date)) return false;
    const finance = useFinanceStore.getState();
    const ledger = useLedgerStore.getState();
    const linked = resolvePayment(ref, finance, ledger);
    const custom = linked ? null : findCustomLoanPayment(ref);
    if (!linked && !custom) return false;
    const payment = linked?.payment ?? custom!.payment;
    const parent = linked?.parent ?? custom!.loan;
    if (ref.entityType === 'debt') {
      const debt = finance.debts.find(d => d.id === ref.entityId)!;
      const remaining = getDebtRemaining({ ...debt, payments: debt.payments.filter(p => p.id !== ref.paymentId) });
      if (!Number.isFinite(remaining) || roundMoney(edit.amount) > remaining) return false;
    } else {
      const loan = parent as Loan;
      const remaining = roundMoney(getLoanTotal(loan)
        - getLoanPaidAmount({ ...loan, payments: loan.payments.filter(p => p.id !== ref.paymentId) }));
      if (!Number.isFinite(remaining) || roundMoney(edit.amount) > remaining) return false;
    }
    const accountId = edit.accountId ?? payment.accountId;
    if (linked && (!activeAccount(accountId, parent.currencyCode, ref.entityType === 'loan')
      || !noRefunds(linked.transaction.id)
      || !ledger.categories.some(c => c.id === linked.transaction.categoryId && c.kind === linked.transaction.type))) return false;
    if (custom && (edit.accountId || !edit.paymentMethodLabel?.trim())) return false;
    const amount = roundMoney(edit.amount);
    const fee = ref.entityType === 'loan' ? roundMoney(edit.latePaymentFee ?? (payment as LoanPayment).latePaymentFee ?? 0) : 0;
    if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(roundMoney(amount + fee))) return false;
    if (linked && !payment.ledgerTransactionId) {
      // Recover only the unique explicit tuple verified by resolvePayment.
      if (ref.entityType === 'debt') {
        if (!finance.linkDebtPaymentTransaction(ref.entityId, ref.paymentId, linked.transaction.id)) return false;
      } else {
        if (!finance.updateLoanPayment(ref.entityId, ref.paymentId, { ledgerTransactionId: linked.transaction.id })) return false;
      }
    }
    if (ref.entityType === 'debt') {
      if (accountId !== payment.accountId || !finance.updateDebtPayment(ref.entityId, ref.paymentId,
        { amount, date: edit.date, note: edit.note })) return false;
    } else {
      if (!finance.updateLoanPayment(ref.entityId, ref.paymentId, {
        amount, date: edit.date, note: edit.note, latePaymentFee: fee, paymentMode: 'simple',
        ...(linked ? { accountId } : { paymentMethodLabel: edit.paymentMethodLabel }),
      })) return false;
    }
    const latest = ref.entityType === 'debt' ? useFinanceStore.getState().debts : useFinanceStore.getState().loans;
    const saved = latest.find(p => p.id === ref.entityId)?.payments.find(p => p.id === ref.paymentId);
    if (!saved || saved.amount !== amount || saved.date !== edit.date
      || (edit.note !== undefined && saved.note !== edit.note)
      || (ref.entityType === 'loan' && ((saved as LoanPayment).latePaymentFee !== fee
        || (saved as LoanPayment).paymentMode !== 'simple' || saved.accountId !== accountId
        || (custom && (saved as LoanPayment).paymentMethodLabel !== edit.paymentMethodLabel)))) return false;
    // Preserve the existing note convention: an omitted note leaves the previous one.
    if (linked) {
      const next = { ...linked.transaction, amount: roundMoney(amount + fee), accountId: accountId!,
        date: edit.date, note: edit.note ?? linked.transaction.note, updatedAt: new Date().toISOString() };
      useLedgerStore.setState(s => ({ transactions: s.transactions.map(t => t.id === next.id ? next : t) }));
      if (!resolvePayment(ref, useFinanceStore.getState(), useLedgerStore.getState())) return false;
    }
    if (ref.entityType === 'loan') updateLoanLifecycle(parent as Loan, ref.paymentId, false);
    return true;
  });
}

export function reverseLinkedPayment(ref: PaymentRef): PaymentResult {
  return coordinate(() => {
    const finance = useFinanceStore.getState();
    const linked = resolvePayment(ref, finance, useLedgerStore.getState());
    const custom = linked ? null : findCustomLoanPayment(ref);
    if (!linked && !custom) return false;
    if (linked) {
      if (!noRefunds(linked.transaction.id)) return false;
      useLedgerStore.setState(s => ({ transactions: s.transactions.filter(t => t.id !== linked.transaction.id) }));
    }
    if (ref.entityType === 'debt') {
      if (!finance.deleteDebtPayment(ref.entityId, ref.paymentId, linked!.payment.ledgerTransactionId)) return false;
    } else {
      if (!finance.deleteLoanPayment(ref.entityId, ref.paymentId)) return false;
      updateLoanLifecycle((linked?.parent ?? custom!.loan) as Loan, ref.paymentId, true);
    }
    const parents = ref.entityType === 'debt' ? useFinanceStore.getState().debts : useFinanceStore.getState().loans;
    return !parents.find(p => p.id === ref.entityId)?.payments.some(p => p.id === ref.paymentId)
      && (!linked || !useLedgerStore.getState().transactions.some(t => t.id === linked.transaction.id));
  });
}

export interface PaymentPost extends PaymentEdit {
  entityType: 'debt' | 'loan';
  entityId: string;
  categoryId?: string;
  settlement?: boolean;
}

export function postLinkedPayment(input: PaymentPost): PaymentResult {
  return coordinate(() => {
    const finance = useFinanceStore.getState();
    const parents = input.entityType === 'debt' ? finance.debts : finance.loans;
    const matches = parents.filter(p => p.id === input.entityId);
    if (matches.length !== 1 || !isValidISODate(input.date) || !Number.isFinite(input.amount)
      || roundMoney(input.amount) <= 0) return false;
    const parent = matches[0];
    const isLoan = input.entityType === 'loan';
    if (isLoan) {
      const loan = parent as Loan;
      const remaining = getLoanRemainingAmount(loan);
      if (loan.status === 'settled' || loan.status === 'completed' || loan.status === 'closed'
        || !Number.isFinite(remaining) || roundMoney(input.amount) > remaining) return false;
    } else {
      const debt = finance.debts.find(d => d.id === parent.id)!;
      const remaining = getDebtRemaining(debt);
      if ((debt.direction !== 'receivable' && debt.direction !== 'payable')
        || !Number.isFinite(remaining) || roundMoney(input.amount) > remaining) return false;
    }
    const account = input.accountId;
    const fee = isLoan ? roundMoney(input.latePaymentFee ?? 0) : 0;
    if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(roundMoney(input.amount + fee))) return false;
    if (account ? !activeAccount(account, parent.currencyCode, isLoan)
      : !isLoan || !input.paymentMethodLabel?.trim()) return false;
    const type = !isLoan && finance.debts.find(d => d.id === input.entityId)!.direction === 'receivable' ? 'income' : 'expense';
    if (account && !useLedgerStore.getState().categories.some(c => c.id === input.categoryId && c.kind === type)) return false;
    const paymentInput = { amount: input.amount, date: input.date, note: input.note,
      ...(account ? { accountId: account } : { paymentMethodLabel: input.paymentMethodLabel }) };
    const paymentId = isLoan
      ? finance.addLoanPayment(parent.id, { ...paymentInput, latePaymentFee: fee, paymentMode: 'simple' })
      : finance.addDebtPayment(parent.id, paymentInput);
    if (!paymentId) return false;
    const savedParents = isLoan ? useFinanceStore.getState().loans : useFinanceStore.getState().debts;
    const savedPayment = savedParents.find(p => p.id === parent.id)?.payments.find(p => p.id === paymentId);
    if (!savedPayment || savedPayment.amount !== roundMoney(input.amount) || savedPayment.date !== input.date) return false;
    if (account) {
      const txId = useLedgerStore.getState().addTransaction({ amount: roundMoney(input.amount + fee),
        accountId: account, categoryId: input.categoryId!, date: input.date, note: input.note, type,
        purpose: isLoan ? 'loan_payment' : type === 'income' ? 'debt_collection' : 'debt_payment',
        linkedEntityType: input.entityType, linkedEntityId: parent.id, linkedPaymentId: paymentId });
      if (!txId) return false;
      if (isLoan) {
        if (!finance.updateLoanPayment(parent.id, paymentId, { ledgerTransactionId: txId })) return false;
      } else if (!finance.linkDebtPaymentTransaction(parent.id, paymentId, txId)) return false;
      const linked = resolvePayment({ entityType: input.entityType, entityId: parent.id, paymentId },
        useFinanceStore.getState(), useLedgerStore.getState());
      if (!linked?.payment.ledgerTransactionId) return false;
    }
    if (isLoan) {
      if (input.settlement) {
        finance.updateLoan(parent.id, { status: 'settled', settlementAmount: roundMoney(input.amount),
          settlementDate: input.date, settlementAccountId: account, settlementPaymentId: paymentId, settlementNote: input.note });
        const saved = useFinanceStore.getState().loans.find(l => l.id === parent.id);
        if (saved?.status !== 'settled' || saved.settlementPaymentId !== paymentId) return false;
      } else updateLoanLifecycle(parent as Loan, paymentId, false);
    }
    return true;
  });
}

/** Receipts share the loan-owned transaction lock; failed confirmation must still roll back. */
export function confirmLoanReceipt(input: {
  loanId: string; amount: number; date: string; accountId?: string; categoryId?: string; methodLabel?: string;
}): PaymentResult {
  return coordinate(() => {
    const finance = useFinanceStore.getState();
    const loans = finance.loans.filter(l => l.id === input.loanId);
    const loan = loans[0];
    if (loans.length !== 1 || loan.receivedAt || loan.receiptTransactionId
      || !Number.isFinite(input.amount) || roundMoney(input.amount) <= 0 || !isValidISODate(input.date)
      || (loan.principalAmount !== undefined && input.amount > loan.principalAmount)
      || useLedgerStore.getState().transactions.some(t => t.linkedEntityType === 'loan'
        && t.linkedEntityId === loan.id && !t.linkedPaymentId)) return false;
    if (input.accountId ? !activeAccount(input.accountId, loan.currencyCode, true) : !input.methodLabel?.trim()) return false;
    const txId = input.accountId ? useLedgerStore.getState().addTransaction({ type: 'income',
      amount: input.amount, accountId: input.accountId, categoryId: input.categoryId!, date: input.date,
      linkedEntityType: 'loan', linkedEntityId: loan.id, note: `Loan received: ${loan.name}` }) : undefined;
    if (input.accountId && !txId) return false;
    finance.updateLoan(loan.id, { receivedAt: input.date, receivedAmount: input.amount,
      ...(txId ? { receiptTransactionId: txId } : { depositMethodLabel: input.methodLabel, depositAccountId: undefined }) });
    const saved = useFinanceStore.getState().loans.find(l => l.id === loan.id);
    return saved?.receivedAt === input.date && saved.receivedAmount === roundMoney(input.amount)
      && (txId ? saved.receiptTransactionId === txId : saved.depositMethodLabel === input.methodLabel);
  });
}
