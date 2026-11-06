import type { CurrencyCode, EntityId, ISODate } from '@/features/finance/types/finance';

/** Plain unsigned decimal text in the currency's minor-unit precision. No floats or FX. */
export type InstallmentMoney = string;

/** Identifies the sole liability owner; these utilities never calculate Net Worth. */
export type InstallmentAccountingOwnership =
  | { readonly kind: 'standalone'; readonly liabilityOwner: 'installment_contract' }
  | { readonly kind: 'linked_loan'; readonly liabilityOwner: 'loan'; readonly loanId: EntityId }
  | { readonly kind: 'linked_debt'; readonly liabilityOwner: 'debt'; readonly debtId: EntityId };

export interface InstallmentScheduleItem {
  readonly id: EntityId;
  readonly contractId: EntityId;
  readonly kind: 'regular' | 'irregular' | 'down_payment';
  readonly dueDate: ISODate;
  readonly amount: InstallmentMoney;
}

export interface InstallmentContract {
  readonly id: EntityId;
  readonly currencyCode: CurrencyCode;
  /** Includes the optional down-payment row, exactly once. */
  readonly totalAmount: InstallmentMoney;
  readonly accountingOwnership: InstallmentAccountingOwnership;
  /** Explicit rows support equal or unequal amounts and arbitrary due dates. */
  readonly schedule: readonly InstallmentScheduleItem[];
}

interface InstallmentPaymentDetails {
  readonly contractId: EntityId;
  readonly installmentId: EntityId;
  readonly paymentReference: string;
  readonly amount: InstallmentMoney;
  readonly currencyCode: CurrencyCode;
  readonly paidOn: ISODate;
}

/** A candidate payment is never confirmation, regardless of any extra legacy fields. */
export interface InstallmentPaymentInput extends InstallmentPaymentDetails {
  readonly id: EntityId;
}

/**
 * Caller-supplied trust boundary: only pass independently verified evidence here.
 * This is a calculation input, not an authorization token or a posting permission.
 * Every field must match its candidate payment; a reference alone is insufficient.
 */
export interface InstallmentPaymentConfirmation extends InstallmentPaymentDetails {
  readonly evidenceId: EntityId;
  readonly paymentId: EntityId;
  readonly kind: 'trusted_confirmation';
}

export interface InstallmentCalculationInput {
  readonly contract: InstallmentContract;
  readonly payments: readonly InstallmentPaymentInput[];
  readonly trustedConfirmations: readonly InstallmentPaymentConfirmation[];
  /** Inclusive payment cutoff; an installment is overdue strictly before this date. */
  readonly asOf: ISODate;
}

export type InstallmentPaymentStatus = 'unpaid' | 'partial' | 'paid';
/** Calendar status is independent of payment status, even for a fully paid row. */
export type InstallmentDueDateStatus = 'upcoming' | 'due_today' | 'overdue';

export interface InstallmentBalance {
  readonly installment: InstallmentScheduleItem;
  readonly confirmedPaid: InstallmentMoney;
  readonly remaining: InstallmentMoney;
  readonly paymentStatus: InstallmentPaymentStatus;
  readonly dueDateStatus: InstallmentDueDateStatus;
}

export interface InstallmentCalculationResult {
  readonly currencyCode: CurrencyCode;
  readonly totalScheduled: InstallmentMoney;
  readonly confirmedPaid: InstallmentMoney;
  readonly remaining: InstallmentMoney;
  readonly overdue: InstallmentMoney;
  readonly nextUnpaid: InstallmentScheduleItem | null;
  readonly installments: readonly InstallmentBalance[];
}
