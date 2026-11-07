import type { Transaction } from '@/features/finance/types/ledger';
import type { TransactionDestination } from '@/features/finance/utils/transactionNavigation';

/** Display only: never changes the persisted category or accounting classification. */
export function getTransactionDescription(
  tx: Transaction, categoryName: string | undefined, destination: TransactionDestination | null,
): string {
  const purposeLabels: Record<string, string> = {
    loan_payment: 'Loan payment',
    loan_principal_payment: 'Loan principal payment',
    loan_interest_payment: 'Loan interest payment',
    debt_payment: 'Debt payment',
    debt_collection: 'Debt collection',
  };
  let label = purposeLabels[tx.purpose ?? ''];
  if (!label && destination?.href.pathname === '/finance/loans') {
    label = tx.type === 'income' ? 'Loan received' : 'Loan payment';
  } else if (!label && destination?.href.pathname === '/finance/debts') {
    label = destination.href.params.direction === 'receivable' ? 'Debt collection' : 'Debt payment';
  }
  label ??= tx.note?.trim() || categoryName || 'Uncategorized';
  return (tx.entryType === 'refund' ? 'Refund · ' : '') + label;
}
