import { roundMoney } from '@/features/finance/utils/finance';
import { isValidISODate } from '@/features/finance/utils/input';
import { readPaymentJournalInstallation, type PaymentJournalInstallation } from './paymentJournalInstallation';

export type PaymentOperationId = string;
type AccountFunding = Readonly<{ kind: 'account'; accountId: string; categoryId: string }>;
type CustomFunding = Readonly<{ kind: 'custom'; methodLabel: string }>;
type RequestBase = Readonly<{
  entityId: string; currencyCode: string; amount: number; date: string; note?: string;
}>;
/** Already normalized by the future coordinator; no amount/date deduplication. */
export type PaymentOperationRequest = RequestBase & (
  Readonly<{ entityType: 'debt'; direction: 'receivable' | 'payable'; funding: AccountFunding }>
  | Readonly<{ entityType: 'loan'; latePaymentFee: number; settlement: boolean; funding: AccountFunding | CustomFunding }>
);
export type PaymentOperationOutcome = Readonly<{ paymentId: string; ledgerTransactionId?: string }>;
export type PaymentOperationState = 'prepared' | 'completed' | 'reversing' | 'reversed' | 'needsReview';
export interface PaymentOperationReceipt {
  readonly operationId: PaymentOperationId;
  readonly request: PaymentOperationRequest;
  /** Reserved before accounting writes; these are not proof of a posted payment. */
  readonly paymentId: string;
  readonly ledgerTransactionId?: string;
  readonly status: PaymentOperationState;
  readonly outcome?: PaymentOperationOutcome;
}
export type PreparedPaymentOperation = Omit<PaymentOperationReceipt, 'status' | 'outcome'>;
export type PaymentOperationJournalData = {
  readonly receipts: readonly PaymentOperationReceipt[];
  readonly installation?: PaymentJournalInstallation;
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim();
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const money = (value: unknown, positive: boolean): value is number => typeof value === 'number'
  && Number.isFinite(value) && (positive ? value > 0 : value >= 0) && roundMoney(value) === value;

export function isPaymentOperationRequest(value: unknown): value is PaymentOperationRequest {
  if (!record(value) || !text(value.entityId) || !text(value.currencyCode)
    || !money(value.amount, true) || typeof value.date !== 'string' || !isValidISODate(value.date)
    || (value.note !== undefined && !text(value.note)) || !record(value.funding)) return false;
  const funding = value.funding;
  const account = funding.kind === 'account' && text(funding.accountId) && text(funding.categoryId)
    && keys(funding, ['kind', 'accountId', 'categoryId']);
  const custom = funding.kind === 'custom' && text(funding.methodLabel) && keys(funding, ['kind', 'methodLabel']);
  const common = ['entityType', 'entityId', 'currencyCode', 'amount', 'date', 'note', 'funding'];
  if (value.entityType === 'debt') return account
    && (value.direction === 'payable' || value.direction === 'receivable') && keys(value, [...common, 'direction']);
  return value.entityType === 'loan' && (account || custom) && money(value.latePaymentFee, false)
    && Number.isFinite(roundMoney(value.amount + value.latePaymentFee))
    && typeof value.settlement === 'boolean' && keys(value, [...common, 'latePaymentFee', 'settlement']);
}

/** Compare all explicit immutable fields, independent of object property order. */
export function paymentOperationRequestsMatch(a: PaymentOperationRequest, b: PaymentOperationRequest): boolean {
  if (!isPaymentOperationRequest(a) || !isPaymentOperationRequest(b)) return false;
  if (a.entityType !== b.entityType || a.entityId !== b.entityId || a.currencyCode !== b.currencyCode
    || a.amount !== b.amount || a.date !== b.date || a.note !== b.note || a.funding.kind !== b.funding.kind) return false;
  if (a.funding.kind === 'account') {
    if (b.funding.kind !== 'account' || a.funding.accountId !== b.funding.accountId || a.funding.categoryId !== b.funding.categoryId) return false;
  } else if (b.funding.kind !== 'custom' || a.funding.methodLabel !== b.funding.methodLabel) return false;
  return a.entityType === 'debt' ? b.entityType === 'debt' && a.direction === b.direction
    : b.entityType === 'loan' && a.latePaymentFee === b.latePaymentFee && a.settlement === b.settlement;
}

export function isPaymentOperationReceipt(value: unknown): value is PaymentOperationReceipt {
  if (!record(value) || !keys(value, ['operationId', 'request', 'paymentId', 'ledgerTransactionId', 'status', 'outcome'])
    || !text(value.operationId) || !text(value.paymentId) || !isPaymentOperationRequest(value.request)
    || typeof value.status !== 'string'
    || !['prepared', 'completed', 'reversing', 'reversed', 'needsReview'].includes(value.status)) return false;
  const account = value.request.funding.kind === 'account';
  if (account ? !text(value.ledgerTransactionId) : value.ledgerTransactionId !== undefined) return false;
  if (value.outcome !== undefined && (!record(value.outcome)
    || !keys(value.outcome, ['paymentId', 'ledgerTransactionId'])
    || value.outcome.paymentId !== value.paymentId || value.outcome.ledgerTransactionId !== value.ledgerTransactionId)) return false;
  if (value.status === 'prepared') return value.outcome === undefined;
  return value.status === 'needsReview' || value.outcome !== undefined;
}

/** Reject the entire document: never filter malformed entries into an empty journal. */
export function readPaymentOperationJournal(value: unknown): PaymentOperationJournalData {
  if (!record(value) || !keys(value, ['receipts', 'installation']) || !Array.isArray(value.receipts)
    || !value.receipts.every(isPaymentOperationReceipt)) throw new Error('Invalid payment operation journal.');
  for (const key of ['operationId', 'paymentId', 'ledgerTransactionId'] as const) {
    const ids = value.receipts.map(receipt => receipt[key]).filter(id => id !== undefined);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${key} in payment operation journal.`);
  }
  // Copy before freezing: callers cannot mutate original requests or saved receipts.
  const copy = JSON.parse(JSON.stringify(value)) as PaymentOperationJournalData;
  if ('installation' in value) {
    Object.defineProperty(copy, 'installation', { value: readPaymentJournalInstallation(value.installation), enumerable: true });
  }
  for (const receipt of copy.receipts) {
    Object.freeze(receipt.request.funding); Object.freeze(receipt.request);
    if (receipt.outcome) Object.freeze(receipt.outcome);
    Object.freeze(receipt);
  }
  Object.freeze(copy.receipts);
  return Object.freeze(copy);
}
