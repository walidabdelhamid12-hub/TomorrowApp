import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { usePropertyInstallmentsStore } from '@/features/finance/store/usePropertyInstallmentsStore';
import { getPropertyInstallmentBalance } from '@/features/finance/types/propertyInstallments';
import { generateId, roundMoney } from '@/features/finance/utils/finance';
import { isValidISODate } from '@/features/finance/utils/input';

export type PropertyPaymentResult = { ok: true; paymentId: string } | { ok: false; reason: string };
export interface PropertyPaymentInput {
  contractId: string;
  installmentId: string;
  accountId: string;
  categoryId: string;
  amount: number;
  date: string;
}
let posting = false;

/**
 * Runtime rollback across three Zustand stores, not an atomic durable
 * transaction across AsyncStorage keys. Reconcile persisted links on startup
 * before enabling production posting.
 */
export function postPropertyInstallmentPayment(input: PropertyPaymentInput): PropertyPaymentResult {
  const propertyStore = usePropertyInstallmentsStore;
  const ledgerStore = useLedgerStore;
  if (posting || !propertyStore.persist.hasHydrated() || !ledgerStore.persist.hasHydrated()
    || !useFinanceStore.persist.hasHydrated()) {
    return { ok: false, reason: 'Payment data is not ready.' };
  }
  const property = propertyStore.getState();
  const ledger = ledgerStore.getState();
  const oldPayments = property.payments;
  const oldTransactions = ledger.transactions;
  posting = true;
  try {
    const contractMatches = property.contracts.filter(c => c.id === input.contractId);
    const installmentMatches = property.installments.filter(i =>
      i.id === input.installmentId && i.contractId === input.contractId);
    const accountMatches = ledger.accounts.filter(a => a.id === input.accountId);
    const categoryMatches = ledger.categories.filter(c => c.id === input.categoryId && c.kind === 'expense');
    const contract = contractMatches[0];
    const installment = installmentMatches[0];
    const account = accountMatches[0];
    if (contractMatches.length !== 1 || installmentMatches.length !== 1
      || accountMatches.length !== 1 || categoryMatches.length !== 1
      || account.archived || account.type === 'credit_card'
      || account.currencyCode !== contract.currencyCode
      || !isValidISODate(input.date) || !Number.isFinite(input.amount)
      || input.amount <= 0 || roundMoney(input.amount) !== input.amount
      || !Number.isSafeInteger(Math.round(input.amount * 1000))) {
      return { ok: false, reason: 'Invalid installment, account, category or amount.' };
    }
    // Existing or inconsistent references are never guessed or repaired during posting.
    if (property.payments.some(p => p.contractId === input.contractId &&
      (!ledger.transactions.some(t => t.id === p.ledgerTransactionId
        && t.linkedEntityType === 'property' && t.linkedEntityId === p.contractId
        && t.linkedPaymentId === p.id && t.accountId === p.accountId
        && t.amount === p.amount && t.date === p.date)))
      || ledger.transactions.some(t => t.linkedEntityType === 'property'
        && t.linkedEntityId === input.contractId
        && !property.payments.some(p => p.id === t.linkedPaymentId && p.ledgerTransactionId === t.id))) {
      return { ok: false, reason: 'Unresolved property payment linkage.' };
    }
    let remaining: number;
    try {
      remaining = getPropertyInstallmentBalance(installment, property.payments).remaining;
    } catch {
      return { ok: false, reason: 'Invalid existing payment history.' };
    }
    if (Math.round(input.amount * 1000) > Math.round(remaining * 1000)) {
      return { ok: false, reason: 'Payment exceeds remaining installment.' };
    }
    const paymentId = generateId('property_pay');
    let transactionId: string | null = null;
    try {
      transactionId = ledgerStore.getState().addPropertyPaymentTransaction({
        contractId: input.contractId, paymentId, accountId: input.accountId,
        categoryId: input.categoryId, amount: input.amount, date: input.date,
      });
      if (!transactionId) throw new Error('Ledger rejected payment');
      propertyStore.setState(s => ({ payments: [...s.payments, {
        id: paymentId, contractId: input.contractId, installmentId: input.installmentId,
        accountId: input.accountId, ledgerTransactionId: transactionId!,
        date: input.date, amount: input.amount,
      }] }));
      const tx = ledgerStore.getState().transactions.filter(t => t.id === transactionId);
      const saved = propertyStore.getState().payments.filter(p => p.id === paymentId);
      if (tx.length !== 1 || saved.length !== 1
        || tx[0].linkedEntityType !== 'property' || tx[0].linkedPaymentId !== paymentId
        || tx[0].linkedEntityId !== input.contractId || tx[0].amount !== input.amount
        || saved[0].ledgerTransactionId !== transactionId) throw new Error('Link verification failed');
      return { ok: true, paymentId };
    } catch {
      let restored = true;
      try { propertyStore.setState({ payments: oldPayments }); } catch { restored = false; }
      try { ledgerStore.setState({ transactions: oldTransactions }); } catch { restored = false; }
      return { ok: false, reason: restored
        ? 'Payment rejected; previous records restored.'
        : 'Rollback failed. Stop payments and inspect records.' };
    }
  } finally {
    posting = false;
  }
}
