/**
 * Finance module domain types.
 *
 * Conventions:
 * - Dates are ISO date strings ("YYYY-MM-DD") so they sort lexicographically
 *   and map directly to calendar libraries. Timestamps are full ISO strings.
 * - Money is a plain number rounded to 3 decimals (OMR baisa precision).
 */

export type EntityId = string;
/** "YYYY-MM-DD" */
export type ISODate = string;
/** Full ISO timestamp, e.g. "2026-10-28T09:30:00.000Z" */
export type ISODateTime = string;
/** ISO 4217 code, e.g. "OMR", "USD", "EUR" */
export type CurrencyCode = string;

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Omit that works across each member of a union. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/* -------------------------------------------------------------------------- */
/* 1) Assets (Local currency / Foreign currency / Gold)                       */
/* -------------------------------------------------------------------------- */

export type AssetCategory = 'local_currency' | 'foreign_currency' | 'gold';

export type GoldKarat = 24 | 22 | 21 | 18 | 14;

/**
 * A dated movement on an asset. This is what links assets to the calendar:
 * every entry belongs to a specific date.
 * Positive amount = added, negative amount = withdrawn.
 * Unit: currency amount for currencies, grams for gold.
 */
export interface AssetEntry {
  id: EntityId;
  date: ISODate;
  amount: number;
  note?: string;
  createdAt: ISODateTime;
}

interface AssetBase extends Timestamps {
  id: EntityId;
  name: string;
  notes?: string;
  entries: AssetEntry[];
}

export interface LocalCurrencyAsset extends AssetBase {
  category: 'local_currency';
  currencyCode: CurrencyCode;
}

export interface ForeignCurrencyAsset extends AssetBase {
  category: 'foreign_currency';
  currencyCode: CurrencyCode;
}

export interface GoldAsset extends AssetBase {
  category: 'gold';
  karat: GoldKarat;
}

export type Asset = LocalCurrencyAsset | ForeignCurrencyAsset | GoldAsset;

/** Category is fixed after creation. Entries are added separately. */
export type NewAssetInput = DistributiveOmit<
  Asset,
  'id' | 'entries' | 'createdAt' | 'updatedAt'
>;

/** Fields that do not apply to the asset's category are ignored. */
export interface AssetPatch {
  name?: string;
  notes?: string;
  currencyCode?: CurrencyCode; // currency assets only
  karat?: GoldKarat; // gold only
}

export type NewAssetEntryInput = Omit<AssetEntry, 'id' | 'createdAt'>;
export type AssetEntryPatch = Partial<NewAssetEntryInput>;

/* -------------------------------------------------------------------------- */
/* 2) Debts (دائن / مدين)                                                      */
/* -------------------------------------------------------------------------- */

/** receivable = they owe me (دائن). payable = I owe them (مدين). */
export type DebtDirection = 'receivable' | 'payable';

/** Derived from payments, never stored. */
export type DebtStatus = 'open' | 'partial' | 'settled';

/** A (partial) repayment, either received or paid out depending on direction. */
export interface DebtPayment {
  id: EntityId;
  date: ISODate;
  amount: number;
  note?: string;
}

export interface Debt extends Timestamps {
  id: EntityId;
  direction: DebtDirection;
  personName: string;
  /** Original amount. */
  amount: number;
  currencyCode: CurrencyCode;
  /** Date the debt was created. */
  date: ISODate;
  dueDate?: ISODate;
  notes?: string;
  payments: DebtPayment[];
}

export type NewDebtInput = Omit<
  Debt,
  'id' | 'payments' | 'createdAt' | 'updatedAt'
>;
export type DebtPatch = Partial<NewDebtInput>;

export type NewDebtPaymentInput = Omit<DebtPayment, 'id'>;
export type DebtPaymentPatch = Partial<NewDebtPaymentInput>;

/* -------------------------------------------------------------------------- */
/* 3) Long-term commitments: Loans and Cheques                                */
/* -------------------------------------------------------------------------- */

export type LoanStatus = 'active' | 'completed';

export interface LoanPayment {
  id: EntityId;
  /** Date the installment was actually paid. */
  date: ISODate;
  amount: number;
  note?: string;
}

/**
 * A loan paid in equal monthly installments.
 * Total = monthlyInstallment * numberOfInstallments.
 * Next due date = firstDueDate + (paid installments) months.
 */
export interface Loan extends Timestamps {
  id: EntityId;
  name: string;
  lenderName: string;
  currencyCode: CurrencyCode;
  monthlyInstallment: number;
  numberOfInstallments: number;
  /** Due date of the first installment. Later ones fall on the same day each month. */
  firstDueDate: ISODate;
  notes?: string;
  payments: LoanPayment[];
}

export type NewLoanInput = Omit<
  Loan,
  'id' | 'payments' | 'createdAt' | 'updatedAt'
>;
export type LoanPatch = Partial<NewLoanInput>;

export type NewLoanPaymentInput = Omit<LoanPayment, 'id'>;
export type LoanPaymentPatch = Partial<NewLoanPaymentInput>;

/** "overdue" is derived (pending and past due), so it is not stored. */
export type ChequeStatus = 'pending' | 'paid' | 'bounced' | 'cancelled';

/** A cheque I issued and must pay. */
export interface Cheque extends Timestamps {
  id: EntityId;
  chequeNumber?: string;
  payeeName: string;
  bankName?: string;
  amount: number;
  currencyCode: CurrencyCode;
  issueDate?: ISODate;
  dueDate: ISODate;
  status: ChequeStatus;
  /** Set when status becomes 'paid'. */
  paidDate?: ISODate;
  notes?: string;
}

export type NewChequeInput = Omit<
  Cheque,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'paidDate'
> & { status?: ChequeStatus };
export type ChequePatch = Partial<Omit<Cheque, 'id' | 'createdAt' | 'updatedAt'>>;

/* -------------------------------------------------------------------------- */
/* Persisted state shape                                                      */
/* -------------------------------------------------------------------------- */

export interface FinanceData {
  baseCurrency: CurrencyCode;
  assets: Asset[];
  debts: Debt[];
  loans: Loan[];
  cheques: Cheque[];
}