
import type {
  CurrencyCode,
  EntityId,
  ISODate,
  Timestamps,
} from '@/features/finance/types/finance';

/* ------------------------------- Accounts -------------------------------- */

export type AccountType = 'cash' | 'bank' | 'wallet' | 'savings' | 'credit_card';

export interface Account extends Timestamps {
  id: EntityId;
  name: string;
  type: AccountType;
  currencyCode: CurrencyCode;
  /** Balance when the account was added. Current balance is derived. */
  initialBalance: number;
  /** Credit limit for credit-card accounts. Not an asset or cash balance. */
  creditLimit?: number;
  /** Hidden from pickers but kept so old transactions stay valid. */
  archived: boolean;
  /** Accent color (hex) for UI chips and charts. */
  color?: string;
  notes?: string;
}

export type NewAccountInput = Omit<
  Account,
  'id' | 'archived' | 'createdAt' | 'updatedAt'
> & { archived?: boolean };

export type AccountPatch = Partial<NewAccountInput>;

/* ------------------------------ Categories ------------------------------- */

export type TransactionType = 'income' | 'expense';

export interface Category {
  id: EntityId;
  name: string;
  kind: TransactionType;
  /** Ionicons name, e.g. "cart-outline". */
  icon: string;
  color: string;
  /** Seeded categories. They can be edited but not deleted. */
  isDefault: boolean;
}

export type NewCategoryInput = Omit<Category, 'id' | 'isDefault'>;
export type CategoryPatch = Partial<Omit<NewCategoryInput, 'kind'>>;

/* ------------------------------ Transactions ----------------------------- */

export type TransactionEntryType = 'normal' | 'refund';

export interface Transaction extends Timestamps {
  id: EntityId;
  type: TransactionType;
  /** Missing on old records; treated as a normal transaction. */
  entryType?: TransactionEntryType;
  /** Always positive. The accounting effect depends on type and entryType. */
  amount: number;
  /** Copied from the account when saved. */
  currencyCode: CurrencyCode;
  accountId: EntityId;
  categoryId: EntityId;
  /** Required for refunds; identifies the original expense. */
  relatedTransactionId?: EntityId;
  date: ISODate;
  note?: string;
}

export type NewTransactionInput = Omit<
  Transaction,
  'id' | 'currencyCode' | 'createdAt' | 'updatedAt'
>;

export type TransactionPatch = Partial<NewTransactionInput>;

/* -------------------------------- Transfers ------------------------------- */

export type TransferType = 'internal' | 'credit_card_payment';

/**
 * Persisted transfer.
 *
 * amount and currencyCode are retained for compatibility with
 * previously saved transfers. New transfers also populate them
 * with the source amount and source currency.
 */
export interface Transfer extends Timestamps {
  id: EntityId;
  fromAccountId: EntityId;
  toAccountId: EntityId;

  /** Legacy compatibility fields; source-side values for new transfers. */
  amount: number;
  currencyCode: CurrencyCode;

  /** Source amount and currency at the time of transfer. */
  fromAmount?: number;
  fromCurrencyCode?: CurrencyCode;

  /** Destination amount and currency at the time of transfer. */
  toAmount?: number;
  toCurrencyCode?: CurrencyCode;

  /** Destination currency units received per one source currency unit. */
  exchangeRate?: number;

  date: ISODate;
  type: TransferType;
  note?: string;
}

/** Required data for creating a new transfer. */
export interface NewTransferInput {
  fromAccountId: EntityId;
  toAccountId: EntityId;
  fromAmount: number;
  fromCurrencyCode: CurrencyCode;
  toAmount: number;
  toCurrencyCode: CurrencyCode;
  exchangeRate: number;
  date: ISODate;
  type: TransferType;
  note?: string;
}

/** All transfer fields, including both account IDs, can be edited. */
export type TransferPatch = Partial<NewTransferInput>;

/* ------------------------------ Persisted data --------------------------- */

export interface LedgerData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
}
