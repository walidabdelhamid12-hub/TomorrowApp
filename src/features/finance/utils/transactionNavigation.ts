import type { FinanceData } from '@/features/finance/types/finance';
import type { Transaction } from '@/features/finance/types/ledger';

type OwnershipData = Pick<FinanceData, 'loans' | 'debts'>;
export type TransactionDestination =
  | { label: 'Manage loan'; href: { pathname: '/finance/loans'; params: { loanId: string } } }
  | { label: 'Manage debt'; href: { pathname: '/finance/debts'; params: { debtId: string; direction: 'receivable' | 'payable' } } };

/** Read-only navigation evidence. Never establishes or repairs an accounting link. */
export function getTransactionDestination(tx: Transaction, finance: OwnershipData): TransactionDestination | null {
  const owners = [
    ...finance.loans.map(parent => ({ kind: 'loan' as const, parent })),
    ...finance.debts.map(parent => ({ kind: 'debt' as const, parent })),
  ];
  const claims: typeof owners = [];
  if (tx.linkedEntityType !== undefined && tx.linkedEntityType !== 'loan' && tx.linkedEntityType !== 'debt') return null;
  if (tx.linkedEntityId !== undefined) {
    const matches = owners.filter(o => o.parent.id === tx.linkedEntityId
      && (tx.linkedEntityType === undefined || o.kind === tx.linkedEntityType));
    if (matches.length !== 1) return null;
    claims.push(matches[0]);
  }
  const reverse = owners.flatMap(owner => [
    ...(owner.parent.payments ?? []).filter(p => p.ledgerTransactionId === tx.id).map(() => owner),
    ...('receiptTransactionId' in owner.parent && owner.parent.receiptTransactionId === tx.id ? [owner] : []),
  ]);
  if (reverse.length > 1) return null;
  claims.push(...reverse);
  if (tx.linkedPaymentId !== undefined) {
    const matches = owners.flatMap(owner => (owner.parent.payments ?? [])
      .filter(p => p.id === tx.linkedPaymentId).map(payment => ({ owner, payment })));
    if (matches.length > 1 || matches.some(m => m.payment.ledgerTransactionId && m.payment.ledgerTransactionId !== tx.id)) return null;
    claims.push(...matches.map(m => m.owner));
  }
  const owner = claims[0];
  if (!owner || claims.some(o => o.kind !== owner.kind || o.parent.id !== owner.parent.id)
    || owners.filter(o => o.kind === owner.kind && o.parent.id === owner.parent.id).length !== 1
    || (tx.linkedEntityType !== undefined && tx.linkedEntityType !== owner.kind)
    || (tx.purpose?.startsWith('loan_') && owner.kind !== 'loan')
    || (tx.purpose?.startsWith('debt_') && owner.kind !== 'debt')) return null;
  if (owner.kind === 'loan') return { label: 'Manage loan', href: { pathname: '/finance/loans', params: { loanId: owner.parent.id } } };
  const debt = finance.debts.find(d => d.id === owner.parent.id)!;
  if (debt.direction !== 'receivable' && debt.direction !== 'payable') return null;
  return { label: 'Manage debt', href: { pathname: '/finance/debts', params: { debtId: debt.id, direction: debt.direction } } };
}

/** Unknown/duplicated route targets show no unrelated records. */
export function focusLinkedRecords<T extends { id: string }>(records: T[], id: string | string[] | undefined): T[] {
  if (id === undefined) return records;
  const matches = typeof id === 'string' ? records.filter(record => record.id === id) : [];
  return matches.length === 1 ? matches : [];
}
