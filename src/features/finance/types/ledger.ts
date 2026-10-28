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

export interface Transaction extends Timestamps {
  id: EntityId;
  type: TransactionType;
  /** Always positive. The sign comes from `type`. */
  amount: number;
  /** Copied from the account when saved. */
  currencyCode: CurrencyCode;
  accountId: EntityId;
  categoryId: EntityId;
  date: ISODate;
  note?: string;
}

export type NewTransactionInput = Omit<
  Transaction,
  'id' | 'currencyCode' | 'createdAt' | 'updatedAt'
>;
export type TransactionPatch = Partial<NewTransactionInput>;

/* ------------------------------ Persisted data --------------------------- */

export interface LedgerData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}