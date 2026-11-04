import type { Loan } from '@/features/finance/types/finance';

export function canEditLoanPayment(loan: Loan): boolean {
  return loan.status !== 'settled' && loan.status !== 'closed';
}

/** Only the explicit, tested settlement reversal may reopen a settled loan. */
export function canReverseLoanPayment(loan: Loan, paymentId: string): boolean {
  return loan.status !== 'closed' && (loan.status !== 'settled' || loan.settlementPaymentId === paymentId);
}
