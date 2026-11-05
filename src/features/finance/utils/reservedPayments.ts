import type { FinanceData, LoanPayment } from '../types/finance';
import type { LedgerData } from '../types/ledger';
import type { PaymentOperationReceipt } from '../types/paymentOperations';

type LedgerSnapshot = Pick<LedgerData, 'accounts' | 'categories' | 'transactions' | 'transfers'>;

/** Reservation validation only; journal acknowledgement and exclusivity belong to the coordinator. */
export function reservedPaymentAvailable(receipt: PaymentOperationReceipt, finance: FinanceData, ledger: LedgerSnapshot): boolean {
  const ids = [receipt.paymentId, receipt.ledgerTransactionId].filter((id): id is string => id !== undefined);
  if (new Set(ids).size !== ids.length) return false;
  const occupied = (id: string | undefined) => id !== undefined && ids.includes(id);
  return ![...finance.debts, ...finance.loans].some(parent => occupied(parent.id)
    || parent.payments.some(payment => occupied(payment.id) || occupied(payment.ledgerTransactionId)))
    && !finance.loans.some(loan => occupied(loan.receiptTransactionId))
    && !ledger.transactions.some(tx => occupied(tx.id) || occupied(tx.linkedPaymentId))
    && ![...ledger.accounts, ...ledger.categories, ...ledger.transfers].some(row => occupied(row.id));
}

export function reservedPaymentFundingValid(receipt: PaymentOperationReceipt, finance: FinanceData, ledger: LedgerSnapshot): boolean {
  const request = receipt.request;
  const parents = request.entityType === 'debt' ? finance.debts : finance.loans;
  const matches = parents.filter(parent => parent.id === request.entityId);
  if (matches.length !== 1 || matches[0].currencyCode !== request.currencyCode) return false;
  if (request.entityType === 'debt' && finance.debts.find(debt => debt.id === request.entityId)?.direction !== request.direction) return false;
  const funding = request.funding;
  if (funding.kind === 'custom') return request.entityType === 'loan';
  const accounts = ledger.accounts.filter(account => account.id === funding.accountId);
  const type = request.entityType === 'debt' && request.direction === 'receivable' ? 'income' : 'expense';
  const categories = ledger.categories.filter(category => category.id === funding.categoryId);
  return accounts.length === 1 && !accounts[0].archived && accounts[0].currencyCode === request.currencyCode
    && (request.entityType !== 'loan' || accounts[0].type !== 'credit_card')
    && categories.length === 1 && categories[0].kind === type;
}

/** Verify the exact Finance reservation before deriving a dedicated cash transaction. */
export function reservedPaymentMatches(receipt: PaymentOperationReceipt, finance: FinanceData, ledger: LedgerSnapshot): boolean {
  if (!reservedPaymentFundingValid(receipt, finance, ledger)) return false;
  const request = receipt.request;
  if (request.funding.kind !== 'account') return false;
  const allPayments = [...finance.debts, ...finance.loans].flatMap(parent => parent.payments);
  const matches = allPayments.filter(payment => payment.id === receipt.paymentId);
  const parent = (request.entityType === 'debt' ? finance.debts : finance.loans).find(item => item.id === request.entityId);
  const payment = matches[0];
  if (matches.length !== 1 || !parent?.payments.includes(payment) || payment.ledgerTransactionId
    || payment.amount !== request.amount || payment.date !== request.date || payment.note !== request.note
    || payment.accountId !== request.funding.accountId) return false;
  if (request.entityType === 'loan' && ((payment as LoanPayment).paymentMode !== 'simple'
    || ((payment as LoanPayment).latePaymentFee ?? 0) !== request.latePaymentFee
    || (payment as LoanPayment).principalAmount !== undefined || (payment as LoanPayment).interestAmount !== undefined
    || (payment as LoanPayment).paymentMethodLabel !== undefined)) return false;
  const txId = receipt.ledgerTransactionId;
  return !ledger.transactions.some(tx => tx.id === receipt.paymentId)
    && !allPayments.some(item => item.ledgerTransactionId === receipt.paymentId)
    && !finance.loans.some(loan => loan.receiptTransactionId === receipt.paymentId)
    && txId !== receipt.paymentId
    && !allPayments.some(item => item.id === txId || item.ledgerTransactionId === txId)
    && !finance.loans.some(loan => loan.receiptTransactionId === txId)
    && ![...finance.debts, ...finance.loans, ...ledger.accounts, ...ledger.categories, ...ledger.transfers].some(row => row.id === txId)
    && !ledger.transactions.some(tx => tx.id === txId || tx.linkedPaymentId === txId);
}
