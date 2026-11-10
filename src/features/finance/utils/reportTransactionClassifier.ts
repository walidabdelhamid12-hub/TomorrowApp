import type { FinanceData } from '@/features/finance/types/finance';
import type { LedgerData, Transaction, Transfer } from '@/features/finance/types/ledger';
import type { PropertyContract, PropertyInstallment, PropertyInstallmentPayment } from '@/features/finance/types/propertyInstallments';
import { isProtectedTransaction, isVerifiedLoanReceipt, resolvePayment } from '@/features/finance/utils/paymentTransactionOwnership';

export type ReportTransactionKind =
  | 'income' | 'expense' | 'refund' | 'transfer' | 'credit_card_payment'
  | 'loan_receipt' | 'loan_payment' | 'debt_collection' | 'debt_payment'
  | 'property_installment_payment' | 'unknown';

export interface ReportClassification {
  id: string;
  kind: ReportTransactionKind;
  currencyCode: string;
  amount: number;
  /** Only these signed values enter ordinary income/expense reports. */
  incomeAmount: number;
  expenseAmount: number;
  reason: string;
  originalCurrencyCode?: string;
  categoryId?: string;
  originalAmount?: number;
}

export interface ReportClassificationContext {
  ledger: LedgerData;
  finance: FinanceData;
  property?: {
    contracts: readonly PropertyContract[];
    installments: readonly PropertyInstallment[];
    payments: readonly PropertyInstallmentPayment[];
  };
}

function result(tx: Transaction, kind: ReportTransactionKind, reason: string): ReportClassification {
  return {
    id: tx.id, kind, reason, currencyCode: tx.currencyCode, amount: tx.amount,
    incomeAmount: kind === 'income' ? tx.amount : 0,
    expenseAmount: kind === 'expense' ? tx.amount : kind === 'refund' ? -tx.amount : 0,
    originalAmount: tx.originalAmount,
    originalCurrencyCode: tx.originalCurrencyCode,
    categoryId: tx.categoryId,
  };
}

function propertyPaymentVerified(tx: Transaction, ctx: ReportClassificationContext): boolean {
  const property = ctx.property;
  if (!property || !tx.linkedPaymentId || !tx.linkedEntityId) return false;
  if (property.payments.filter(p => p.ledgerTransactionId === tx.id).length !== 1) return false;
  const payments = property.payments.filter(p => p.id === tx.linkedPaymentId && p.ledgerTransactionId === tx.id);
  if (payments.length !== 1) return false;
  const payment = payments[0];
  if (property.payments.filter(p => p.id === payment.id).length !== 1) return false;
  if (property.payments.filter(p => p.ledgerTransactionId === tx.id).length !== 1) return false;
  if (tx.linkedPaymentId !== payment.id) return false;
  const contract = property.contracts.filter(c => c.id === payment.contractId);
  const installment = property.installments.filter(i => i.id === payment.installmentId && i.contractId === payment.contractId);
  return contract.length === 1 && installment.length === 1
    && tx.linkedEntityType === 'property' && tx.linkedEntityId === payment.contractId
    && tx.type === 'expense' && tx.entryType !== 'refund' && !tx.relatedTransactionId
    && (tx.purpose === 'property_installment_payment' || tx.purpose === undefined)
    && tx.accountId === payment.accountId && tx.amount === payment.amount
    && tx.date === payment.date && tx.currencyCode === contract[0].currencyCode
    && ctx.ledger.transactions.filter(t => t.id === tx.id).length === 1
    && ctx.ledger.accounts.filter(a => a.id === tx.accountId && a.currencyCode === tx.currencyCode).length === 1;
}

/**
 * Pure, fail-closed classifier. Does not modify the ledger or authorize posting.
 * Unverified legacy ownership is UNKNOWN, never ordinary P&L.
 */
export function classifyReportTransaction(
  tx: Transaction,
  ctx: ReportClassificationContext,
): ReportClassification {
  const { ledger, finance } = ctx;
  if (ledger.transactions.filter(t => t.id === tx.id).length !== 1
    || ledger.transactions.find(t => t.id === tx.id) !== tx
    || !Number.isFinite(tx.amount) || tx.amount <= 0
    || ledger.accounts.filter(a => a.id === tx.accountId && a.currencyCode === tx.currencyCode).length !== 1) {
    return result(tx, 'unknown', 'Invalid or duplicate ledger transaction/account');
  }

  if (tx.entryType === 'refund') {
    const originals = ledger.transactions.filter(t => t.id === tx.relatedTransactionId);
    const original = originals[0];
    if (originals.length !== 1 || !original || original.type !== 'expense'
      || original.entryType === 'refund' || original.id === tx.id
      || isProtectedTransaction(original, finance) || isProtectedTransaction(tx, finance)
      || ledger.accounts.filter(a => a.id === original.accountId && a.currencyCode === original.currencyCode).length !== 1
      || tx.type !== 'expense') {
      return result(tx, 'unknown', 'Refund original missing, incompatible or protected');
    }
    if (original.purpose !== undefined && original.purpose !== 'normal'
      || original.relatedTransactionId || (original.entryType !== undefined && original.entryType !== 'normal')) {
      return result(tx, 'unknown', 'Refund original is not ordinary expense');
    }
    return {
      ...result(tx, 'refund', 'Verified refund of original expense'),
      categoryId: original.categoryId,
    };
  }

  const receipts = finance.loans.filter(loan => loan.receiptTransactionId === tx.id);
  if (receipts.length) {
    if (receipts.length === 1 && isVerifiedLoanReceipt(tx, receipts[0], finance, ledger)) {
      return result(tx, 'loan_receipt', 'Verified loan receipt');
    }
    return result(tx, 'unknown', 'Unverified loan receipt');
  }

  const references = [
    ...finance.loans.flatMap(loan => (loan.payments ?? []).filter(p => p.ledgerTransactionId === tx.id)
      .map(p => ({ entityType: 'loan' as const, entityId: loan.id, paymentId: p.id }))),
    ...finance.debts.flatMap(debt => (debt.payments ?? []).filter(p => p.ledgerTransactionId === tx.id)
      .map(p => ({ entityType: 'debt' as const, entityId: debt.id, paymentId: p.id }))),
  ];
  if (references.length === 1) {
    const verified = resolvePayment(references[0], finance, ledger);
    if (!verified || verified.transaction.id !== tx.id) return result(tx, 'unknown', 'Unverified linked payment');
    if (references[0].entityType === 'loan') return result(tx, 'loan_payment', 'Verified loan payment; split not inferred');
    return result(tx, verified.parent && 'direction' in verified.parent && verified.parent.direction === 'receivable'
      ? 'debt_collection' : 'debt_payment', 'Verified debt payment');
  }
  if (references.length > 1) return result(tx, 'unknown', 'Conflicting payment ownership');

  if (tx.linkedEntityType === 'property' || tx.purpose === 'property_installment_payment') {
    return propertyPaymentVerified(tx, ctx)
      ? result(tx, 'property_installment_payment', 'Verified property payment')
      : result(tx, 'unknown', 'Unverified property payment');
  }

  if (isProtectedTransaction(tx, finance) || (ctx.property?.payments.some(p => p.ledgerTransactionId === tx.id) ?? false)
    || (tx.purpose !== undefined && tx.purpose !== 'normal')
    || (tx.entryType !== undefined && tx.entryType !== 'normal')
    || tx.relatedTransactionId) {
    return result(tx, 'unknown', 'Protected or unsupported transaction evidence');
  }
  return result(tx, tx.type, 'Ordinary ledger transaction');
}

/** Transfers are separate ledger records, never ordinary P&L. */
export function classifyReportTransfer(transfer: Transfer): ReportTransactionKind {
  return transfer.type === 'credit_card_payment' ? 'credit_card_payment' : 'transfer';
}

/** Period filtering must happen AFTER classification against the full ledger. */
export function classifyReportTransactions(ctx: ReportClassificationContext): ReportClassification[] {
  return ctx.ledger.transactions.map(tx => classifyReportTransaction(tx, ctx));
}
