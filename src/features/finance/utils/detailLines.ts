import type { Loan, Debt } from '@/features/finance/types/finance';
import { getLoanRemainingPrincipal, getLoanRemainingAmount, getLoanTotal, getDebtRemaining, getDebtStatus } from '@/features/finance/utils/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
export function loanDetailLines(loan: Loan): string[] {
  const money = (v: number) => formatAmount(v, loan.currencyCode) + ' ' + loan.currencyCode;
  const principal = getLoanRemainingPrincipal(loan);
  return [ 'Lender: ' + loan.lenderName, 'Status: ' + (loan.status ?? 'active'),
    'Original principal: ' + ((loan.receivedAmount ?? loan.principalAmount) === undefined ? 'Unknown' : money((loan.receivedAmount ?? loan.principalAmount)!)),
    'Remaining principal: ' + (principal === null ? 'Unknown — allocation required' : money(principal)),
    'Contractual total: ' + money(getLoanTotal(loan)), 'Remaining contractual payments: ' + money(getLoanRemainingAmount(loan)),
    'Original installment count: ' + loan.numberOfInstallments, 'Installment amount: ' + money(loan.monthlyInstallment),
    'Remaining installment count (equivalent): ' + (loan.monthlyInstallment > 0 ? Math.ceil(getLoanRemainingAmount(loan) / loan.monthlyInstallment) : 'Unknown'),
    'First due: ' + loan.firstDueDate, 'Received: ' + (loan.receivedAt ?? 'Not confirmed'),
    'Created: ' + loan.createdAt, 'Updated: ' + loan.updatedAt, 'Settlement: ' + (loan.settlementDate ?? 'None'),
    'Closed: ' + (loan.closureDate ?? 'No'), loan.closureReason ?? '', loan.notes ?? '',
    'Simple repayments reduce principal proportionally to original principal / contractual total; late fees are excluded.',
    'Payment history', ...loan.payments.map(p => p.date + ' · ' + money(p.amount) + ' · Fee: ' + money(p.latePaymentFee ?? 0) + ' · ' + (p.note ?? '')) ];
}
export function debtDetailLines(debt: Debt): string[] {
  const money = (v: number) => formatAmount(v, debt.currencyCode) + ' ' + debt.currencyCode;
  return [debt.direction === 'receivable' ? 'Receivable — debtor' : 'Payable — creditor', 'Original: ' + money(debt.amount),
    'Outstanding: ' + money(getDebtRemaining(debt)), 'Status: ' + getDebtStatus(debt), 'Date: ' + debt.date, 'Due: ' + (debt.dueDate ?? 'Not set'),
    'Created: ' + debt.createdAt, 'Updated: ' + debt.updatedAt, debt.notes ?? '', 'Payment / collection history',
    ...debt.payments.map(p => p.date + ' · ' + money(p.amount) + ' · ' + (p.note ?? ''))];
}
