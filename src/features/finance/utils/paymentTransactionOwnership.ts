import type { DebtPayment, FinanceData, LoanPayment } from '@/features/finance/types/finance';
import type { LedgerData, Transaction } from '@/features/finance/types/ledger';
import { roundMoney } from '@/features/finance/utils/finance';

export interface PaymentRef {
  entityType: 'debt' | 'loan';
  entityId: string;
  paymentId: string;
}

const paymentPurposes = new Set([
  'debt_payment', 'debt_collection', 'loan_payment',
  'loan_principal_payment', 'loan_interest_payment',
]);

type OwnershipData = Pick<FinanceData, 'loans' | 'debts'>;

export function transactionReferences(finance: OwnershipData, id: string): number {
  return finance.debts.reduce((n, debt) => n + (debt.payments ?? [])
    .filter(p => p.ledgerTransactionId === id).length, 0)
    + finance.loans.reduce((n, loan) => n + (loan.payments ?? [])
      .filter(p => p.ledgerTransactionId === id).length
      + Number(loan.receiptTransactionId === id), 0);
}

/** Evidence is sufficient to lock a record, but never to guess its owner. */
export function isProtectedTransaction(tx: Transaction, finance: OwnershipData): boolean {
  return paymentPurposes.has(tx.purpose ?? '')
    || tx.linkedEntityType !== undefined || tx.linkedEntityId !== undefined
    || tx.linkedPaymentId !== undefined || transactionReferences(finance, tx.id) > 0;
}

/** Exact IDs only. No matching by note, amount, name or date to infer a link. */
export function resolvePayment(ref: PaymentRef, finance: FinanceData, ledger: LedgerData) {
  const parents = ref.entityType === 'debt' ? finance.debts : finance.loans;
  const matches = parents.filter(p => p.id === ref.entityId);
  if (matches.length !== 1) return null;
  const parent = matches[0];
  const payments = (parent.payments ?? []).filter(p => p.id === ref.paymentId);
  if (payments.length !== 1) return null;
  const payment: DebtPayment | LoanPayment = payments[0];
  const tuple = ledger.transactions.filter(t => t.linkedEntityType === ref.entityType
    && t.linkedEntityId === ref.entityId && t.linkedPaymentId === ref.paymentId);
  const candidates = payment.ledgerTransactionId
    ? ledger.transactions.filter(t => t.id === payment.ledgerTransactionId) : tuple;
  if (candidates.length !== 1 || tuple.some(t => t.id !== candidates[0].id)) return null;
  const tx = candidates[0];
  // Older split transactions cannot be collapsed into one cash movement.
  const debt = ref.entityType === 'debt' ? finance.debts.find(d => d.id === ref.entityId) : undefined;
  if (debt && debt.direction !== 'receivable' && debt.direction !== 'payable') return null;
  const expectedType = debt?.direction === 'receivable' ? 'income' : 'expense';
  const expectedPurpose = debt
    ? debt.direction === 'receivable' ? 'debt_collection' : 'debt_payment' : 'loan_payment';
  const fee = ref.entityType === 'loan' ? (payment as LoanPayment).latePaymentFee ?? 0 : 0;
  const amount = roundMoney(payment.amount + fee);
  const account = ledger.accounts.filter(a => a.id === payment.accountId);
  if (!Number.isFinite(payment.amount) || payment.amount <= 0 || !Number.isFinite(fee) || fee < 0
    || account.length !== 1 || account[0].currencyCode !== parent.currencyCode
    || tx.accountId !== payment.accountId || tx.currencyCode !== parent.currencyCode
    || tx.amount !== amount || tx.date !== payment.date || tx.type !== expectedType
    || (tx.entryType !== undefined && tx.entryType !== 'normal') || tx.relatedTransactionId
    || (tx.purpose !== undefined && tx.purpose !== 'normal' && tx.purpose !== expectedPurpose)
    || (tx.linkedEntityType !== undefined && tx.linkedEntityType !== ref.entityType)
    || (tx.linkedEntityId !== undefined && tx.linkedEntityId !== ref.entityId)
    || (tx.linkedPaymentId !== undefined && tx.linkedPaymentId !== ref.paymentId)
    || transactionReferences(finance, tx.id) !== Number(!!payment.ledgerTransactionId)
    || ledger.transactions.filter(t => t.id === tx.id).length !== 1) return null;
  return { parent, payment, transaction: tx };
}
