import { isValidISODate } from '../utils/input';
import { assertTransferSettlementEvidence } from '../utils/transferSettlement';
import type { LedgerData } from '../types/ledger';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (path: string): never => { throw new Error(`Invalid saved accounting evidence at ${path}; original storage retained.`); };
const schemas: Record<string, { strings: string[]; numbers?: string[]; nested?: string }> = {
  accounts: { strings: ['name', 'type', 'currencyCode', 'createdAt', 'updatedAt'], numbers: ['initialBalance'] },
  categories: { strings: ['name', 'kind', 'icon', 'color'] },
  transactions: { strings: ['type', 'currencyCode', 'accountId', 'categoryId', 'date', 'createdAt', 'updatedAt'], numbers: ['amount'] },
  transfers: { strings: ['fromAccountId', 'toAccountId', 'currencyCode', 'date', 'type', 'createdAt', 'updatedAt'], numbers: ['amount'] },
  assets: { strings: ['name', 'category', 'createdAt', 'updatedAt'], nested: 'entries' },
  debts: { strings: ['direction', 'personName', 'currencyCode', 'createdAt', 'updatedAt'], numbers: ['amount'], nested: 'payments' },
  loans: { strings: ['name', 'lenderName', 'currencyCode', 'firstDueDate', 'createdAt', 'updatedAt'], numbers: ['monthlyInstallment', 'numberOfInstallments'], nested: 'payments' },
  cheques: { strings: ['payeeName', 'currencyCode', 'dueDate', 'status', 'createdAt', 'updatedAt'], numbers: ['amount'] },
  payments: { strings: ['date'], numbers: ['amount'] },
  entries: { strings: ['date', 'createdAt'], numbers: ['amount'] },
};
const enums: Record<string, Record<string, readonly unknown[]>> = {
  accounts: { type: ['cash', 'bank', 'wallet', 'savings', 'credit_card'] },
  categories: { kind: ['income', 'expense'] },
  transactions: { type: ['income', 'expense'], entryType: ['normal', 'refund'] },
  transfers: { type: ['internal', 'credit_card_payment'] },
  assets: { category: ['local_currency', 'foreign_currency', 'gold', 'silver'] },
  debts: { direction: ['receivable', 'payable'] },
  cheques: { status: ['pending', 'paid', 'bounced', 'cancelled'] },
};
const moneyFields = new Set(['amount', 'initialBalance', 'creditLimit', 'originalAmount', 'accountFxRate',
  'fromAmount', 'toAmount', 'exchangeRate', 'principalAmount', 'interestAmount', 'latePaymentFee',
  'totalRepaymentAmount', 'monthlyInstallment', 'numberOfInstallments', 'receivedAmount', 'settlementAmount']);
function validateList(value: unknown, kind: string, path: string, paymentIds: Set<string>): void {
  if (!Array.isArray(value)) fail(path);
  const ids = new Set<string>();
  const schema = schemas[kind];
  for (const item of value as unknown[]) {
    if (!record(item) || typeof item.id !== 'string' || !item.id.trim()) fail(path);
    const row = item as Record<string, unknown>;
    const id = row.id as string;
    if (ids.has(id)) fail(`${path}.${id}.duplicate`);
    ids.add(id);
    if (kind === 'payments') {
      if (paymentIds.has(id)) fail(`${path}.${id}.duplicate-owner`);
      paymentIds.add(id);
    }
    for (const key of schema.strings.filter(key => !['createdAt', 'updatedAt', 'categoryId', 'personName', 'lenderName', 'name', 'firstDueDate', 'icon', 'color'].includes(key))) if (typeof row[key] !== 'string' || !(row[key] as string).trim()) fail(`${path}.${id}.${key}`);
    for (const key of schema.numbers ?? []) if (typeof row[key] !== 'number' || !Number.isFinite(row[key])) fail(`${path}.${id}.${key}`);
    for (const [key, field] of Object.entries(row)) {
      if ((schema.strings.includes(key) || key.endsWith('Id') || key.endsWith('CurrencyCode')
        || ['note', 'notes', 'paymentMethodLabel', 'depositMethodLabel'].includes(key))
        && typeof field !== 'string') fail(`${path}.${id}.${key}`);
      if (moneyFields.has(key) && (typeof field !== 'number' || !Number.isFinite(field))) fail(`${path}.${id}.${key}`);
      if (typeof field === 'number' && !Number.isFinite(field)) fail(`${path}.${id}.${key}`);
      if ((key === 'date' || key.endsWith('Date') || ['receivedAt', 'closureDate', 'firstDueDate'].includes(key))
        && field !== undefined && (typeof field !== 'string' || !isValidISODate(field))) fail(`${path}.${id}.${key}`);
      if (enums[kind]?.[key] && !enums[kind][key].includes(field)) fail(`${path}.${id}.${key}`);
      if (['historicalFx', 'accountFxSnapshot', 'directHistoricalFx'].includes(key)) {
        if (!record(field) || typeof field.rate !== 'number' || !Number.isFinite(field.rate) || field.rate <= 0
          || typeof field.rateDate !== 'string' || !isValidISODate(field.rateDate)) fail(`${path}.${id}.${key}`);
      }
    }
    if (['transactions', 'transfers', 'debts', 'cheques', 'payments'].includes(kind)
      && (row.amount as number) <= 0) fail(`${path}.${id}.amount`);
    if (['accounts', 'categories'].includes(kind) && row.archived !== undefined && typeof row.archived !== 'boolean') fail(`${path}.${id}.archived`);
    if (kind === 'categories' && row.isDefault !== undefined && typeof row.isDefault !== 'boolean') fail(`${path}.${id}.isDefault`);
    if (kind === 'assets') {
      if (['local_currency', 'foreign_currency'].includes(row.category as string) && typeof row.currencyCode !== 'string') fail(`${path}.${id}.currencyCode`);
      if (row.category === 'gold' && ![24, 22, 21, 18, 14].includes(row.karat as number)) fail(`${path}.${id}.karat`);
    }
    if (schema.nested) validateList(row[schema.nested], schema.nested, `${path}.${id}.${schema.nested}`, paymentIds);
  }
}

/** Validate without rewriting, filtering, rounding or repairing retained evidence. */
export function assertAccountingHydration(value: unknown, kind: 'finance' | 'ledger'): void {
  if (value === undefined) return; // No document on a new installation.
  if (!record(value)) fail(kind);
  const saved = value as Record<string, unknown>;
  const lists = kind === 'finance' ? ['assets', 'debts', 'loans', 'cheques'] : ['accounts', 'categories', 'transactions', 'transfers'];
  const allowed = [...lists, 'paymentJournal', 'paymentAccounting', ...(kind === 'finance' ? ['creationProvenance'] : [])];
  if (Object.keys(saved).some(key => !allowed.includes(key))) fail(`${kind}.unknown-field`);
  const paymentIds = new Set<string>();
  for (const key of lists) {
    // Old ledger versions predate transfers/categories. Explicit malformed values still fail.
    if (!(key in saved) && ['categories', 'transfers'].includes(key)) continue;
    validateList(saved[key], key, `${kind}.${key}`, paymentIds);
  }
  if (kind === 'ledger') assertTransferSettlementEvidence({ ...saved, transfers: saved.transfers ?? [], categories: saved.categories ?? [] } as unknown as LedgerData);
}
