import { getCurrencyDecimals, isSupportedCurrency } from '@/features/finance/constants/currencies';
import type { CurrencyCode, EntityId, ISODate } from '@/features/finance/types/finance';
import type { InstallmentContract, InstallmentScheduleItem } from '@/features/finance/types/installments';
import { validateInstallmentContract } from '@/features/finance/utils/installments';

/**
 * Task 4 draft-only boundary. Never persists, posts, authorizes a payment,
 * updates Net Worth, or creates a loan/debt/cheque.
 */
export interface StandaloneInstallmentDraft {
  readonly id: EntityId;
  readonly name: string;
  readonly currencyCode: CurrencyCode;
  readonly totalAmount: string;
  readonly rows: readonly {
    readonly id: EntityId;
    readonly kind: InstallmentScheduleItem['kind'];
    readonly dueDate: ISODate;
    readonly amount: string;
  }[];
}

export interface ValidatedStandaloneInstallmentDraft {
  readonly name: string;
  readonly contract: InstallmentContract;
}

export function validateStandaloneInstallmentDraft(draft: StandaloneInstallmentDraft): ValidatedStandaloneInstallmentDraft {
  if (!draft || typeof draft !== 'object') throw new Error('Invalid installment draft');
  if (typeof draft.name !== 'string' || !draft.name.trim() || draft.name !== draft.name.trim()) {
    throw new Error('Contract name is required without surrounding whitespace');
  }
  if (draft.name.length > 120) throw new Error('Contract name is too long');
  if (typeof draft.currencyCode !== 'string' || !isSupportedCurrency(draft.currencyCode) ||
      draft.currencyCode !== draft.currencyCode.toUpperCase()) {
    throw new Error('Unsupported currency');
  }
  if (!Array.isArray(draft.rows)) throw new Error('Schedule rows are required');
  // Validate all amounts and the exact sum with the existing BigInt-based contract validator.
  // No rounding, automatic installment generation, or implicit down payment.
  const contract: InstallmentContract = {
    id: draft.id,
    currencyCode: draft.currencyCode,
    totalAmount: draft.totalAmount,
    accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' },
    schedule: draft.rows.map(row => ({
      id: row.id,
      contractId: draft.id,
      kind: row.kind,
      dueDate: row.dueDate,
      amount: row.amount,
    })),
  };
  validateInstallmentContract(contract);
  // Explicitly require supported precision, even for a valid zero-decimal currency.
  getCurrencyDecimals(draft.currencyCode);
  return {
    name: draft.name,
    contract: {
      ...contract,
      schedule: contract.schedule.map(row => ({ ...row })),
    },
  };
}
