import { addMonthsISO, roundMoney } from '@/features/finance/utils/finance';
import type { CurrencyCode, EntityId, ISODate } from '@/features/finance/types/finance';

/**
 * Real-estate contracts are independent of bank loans. No ledger balance is
 * changed by creating a contract, scheduling a due date, or marking it overdue.
 * Cash movement must be confirmed through a linked ledger operation later.
 */
export interface PropertyContract {
  id: EntityId;
  developerName: string;
  projectName: string;
  unitReference: string;
  currencyCode: CurrencyCode;
  contractPrice: number;
  contractDate: ISODate;
  notes?: string;
}

export type PropertyInstallmentKind =
  | 'down_payment'
  | 'regular'
  | 'handover'
  | 'maintenance'
  | 'other';

export interface PropertyInstallment {
  id: EntityId;
  contractId: EntityId;
  kind: PropertyInstallmentKind;
  dueDate: ISODate;
  amount: number;
  note?: string;
}

/** Payment records are evidence of confirmed payment, not scheduled obligations. */
export interface PropertyInstallmentPayment {
  id: EntityId;
  contractId: EntityId;
  installmentId: EntityId;
  date: ISODate;
  amount: number;
  accountId: EntityId;
  ledgerTransactionId: EntityId;
}

export interface RegularInstallmentPlan {
  contractId: EntityId;
  firstDueDate: ISODate;
  count: number;
  intervalMonths: number;
  totalAmount: number;
}

const units = (amount: number): number => Math.round((amount + Number.EPSILON) * 1000);
const fromUnits = (value: number): number => value / 1000;

function validDate(value: ISODate): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function validMoney(value: number): boolean {
  return Number.isFinite(value) && value > 0 && roundMoney(value) === value;
}

/**
 * Generate a draft schedule with exact three-decimal total reconciliation.
 * The final installment absorbs any remainder; none of these are payments.
 */
export function generateRegularInstallments(plan: RegularInstallmentPlan): PropertyInstallment[] {
  if (!plan.contractId.trim() || !validDate(plan.firstDueDate) ||
      !Number.isSafeInteger(plan.count) || plan.count < 1 || plan.count > 600 ||
      !Number.isSafeInteger(plan.intervalMonths) || plan.intervalMonths < 1 ||
      !validMoney(plan.totalAmount)) {
    throw new Error('Invalid installment plan');
  }
  const total = units(plan.totalAmount);
  if (!Number.isSafeInteger(total) || total < plan.count) {
    throw new Error('Installment total is too small for the number of payments');
  }
  const base = Math.floor(total / plan.count);
  const remainder = total - base * plan.count;
  return Array.from({ length: plan.count }, (_, index) => ({
    id: `draft_${index + 1}`,
    contractId: plan.contractId,
    kind: 'regular' as const,
    dueDate: addMonthsISO(plan.firstDueDate, index * plan.intervalMonths),
    amount: fromUnits(base + (index === plan.count - 1 ? remainder : 0)),
  }));
}

/** Amount paid is derived from linked confirmed payments, never a manual status. */
export function getPropertyInstallmentBalance(
  installment: PropertyInstallment,
  payments: readonly PropertyInstallmentPayment[],
): { paid: number; remaining: number; status: 'unpaid' | 'partial' | 'paid' } {
  const relevant = payments.filter(payment =>
    payment.contractId === installment.contractId && payment.installmentId === installment.id);
  const paidUnits = relevant.reduce((sum, payment) => {
    if (!validMoney(payment.amount) || !payment.ledgerTransactionId || !payment.accountId) {
      throw new Error('Invalid confirmed installment payment');
    }
    return sum + units(payment.amount);
  }, 0);
  const dueUnits = units(installment.amount);
  if (!validMoney(installment.amount) || paidUnits > dueUnits) {
    throw new Error('Invalid installment balance');
  }
  return {
    paid: fromUnits(paidUnits),
    remaining: fromUnits(dueUnits - paidUnits),
    status: paidUnits === 0 ? 'unpaid' : paidUnits === dueUnits ? 'paid' : 'partial',
  };
}
