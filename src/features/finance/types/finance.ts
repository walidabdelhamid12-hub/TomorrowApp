/**
 * Finance module domain types.
 *
 * Conventions:
 * - Dates are ISO date strings ("YYYY-MM-DD").
 * - Timestamps are full ISO strings.
 * - Money is a number rounded to 3 decimals.
 */

/* -------------------------------------------------------------------------- */
/* Common types                                                               */
/* -------------------------------------------------------------------------- */

import type { PaymentJournalMarker } from './paymentJournalInstallation';

export type EntityId = string;
export type ISODate = string;
export type ISODateTime = string;
export type CurrencyCode = string;

export interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type DistributiveOmit<
  T,
  K extends PropertyKey
> = T extends unknown ? Omit<T, K> : never;

/* -------------------------------------------------------------------------- */
/* 1) Assets                                                                  */
/* -------------------------------------------------------------------------- */

export type AssetCategory =
  | 'local_currency'
  | 'foreign_currency'
  | 'gold'
  | 'silver';

export type GoldKarat = 24 | 22 | 21 | 18 | 14;

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

export interface SilverAsset extends AssetBase {
  category: 'silver';
}

export type Asset =
  | LocalCurrencyAsset
  | ForeignCurrencyAsset
  | GoldAsset
  | SilverAsset;

export type NewAssetInput = DistributiveOmit<
  Asset,
  'id' | 'entries' | 'createdAt' | 'updatedAt'
>;

export interface AssetPatch {
  name?: string;
  notes?: string;
  currencyCode?: CurrencyCode;
  karat?: GoldKarat;
}

export type NewAssetEntryInput = Omit<
  AssetEntry,
  'id' | 'createdAt'
>;

export type AssetEntryPatch = Partial<NewAssetEntryInput>;

/* -------------------------------------------------------------------------- */
/* 2) Debts                                                                   */
/* -------------------------------------------------------------------------- */

export type DebtDirection = 'receivable' | 'payable';
export type DebtStatus = 'open' | 'partial' | 'settled';

export interface DebtPayment {
  id: EntityId;
  date: ISODate;
  amount: number;
  note?: string;

  /** Account used for the confirmed payment or collection. */
  accountId?: EntityId;

  /** Ledger transaction created for this payment, if posted. */
  ledgerTransactionId?: EntityId;
}

export interface Debt extends Timestamps {
  id: EntityId;
  direction: DebtDirection;
  personName: string;
  amount: number;
  currencyCode: CurrencyCode;
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
/* 3) Loans and Cheques                                                       */
/* -------------------------------------------------------------------------- */

export type LoanStatus = 'active' | 'completed' | 'settled' | 'closed';

export interface LoanPayment {
  id: EntityId;
  date: ISODate;
  /** Contractual installment amount; late fees are stored separately. */
  amount: number;

  /** Optional late fee charged by the lender; does not reduce the loan balance. */
  latePaymentFee?: number;

  /** New simple payments do not split the installment into principal and interest. */
  paymentMode?: 'simple' | 'split';

  /** Principal portion retained for compatibility with older split-payment records. */
  principalAmount?: number;

  /** Interest portion retained for compatibility with older split-payment records. */
  interestAmount?: number;

  note?: string;

  /** Account used for the confirmed installment payment. */
  accountId?: EntityId;

  /** One-off custom payment method; does not affect a registered account balance. */
  paymentMethodLabel?: string;

  /** Ledger transaction created for this installment, if posted. */
  ledgerTransactionId?: EntityId;
}

export interface Loan extends Timestamps {
  id: EntityId;
  name: string;
  lenderName: string;

  /** Original loan principal. Optional for compatibility with old saved loans. */
  principalAmount?: number;

  /** Contractual total repayment amount (principal + interest). */
  totalRepaymentAmount?: number;

  /** Account where the loan proceeds were received, when registered. */
  depositAccountId?: EntityId;

  /** Custom description when proceeds were received outside a registered account. */
  depositMethodLabel?: string;

  /** Date and amount confirmed as actually received; absent means not confirmed. */
  receivedAt?: ISODate;
  receivedAmount?: number;

  /** Income transaction posted when proceeds were received into a registered account. */
  receiptTransactionId?: EntityId;

  /** Current lifecycle state; missing legacy values are treated as active. */
  status?: LoanStatus;

  /** Actual amount paid to close the loan early, when settled. */
  settlementAmount?: number;
  settlementDate?: ISODate;
  settlementAccountId?: EntityId;
  settlementPaymentId?: EntityId;
  settlementNote?: string;
  closureDate?: ISODate;
  closureReason?: string;

  currencyCode: CurrencyCode;
  monthlyInstallment: number;
  numberOfInstallments: number;
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

export type ChequeStatus =
  | 'pending'
  | 'paid'
  | 'bounced'
  | 'cancelled';

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
  paidDate?: ISODate;
  notes?: string;
}

export type NewChequeInput = Omit<
  Cheque,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'paidDate'
> & {
  status?: ChequeStatus;
};

export type ChequePatch = Partial<
  Omit<Cheque, 'id' | 'createdAt' | 'updatedAt'>
>;

/* -------------------------------------------------------------------------- */
/* 4) Persisted finance state                                                 */
/* -------------------------------------------------------------------------- */

export interface FinanceData {
  paymentJournal?: PaymentJournalMarker;
  assets: Asset[];
  debts: Debt[];
  loans: Loan[];
  cheques: Cheque[];
}
