import type { DebtPayment, LoanPayment, Loan } from './finance';
import type { Transaction } from './ledger';
import { isPaymentOperationRequest, isPaymentOperationReceipt, type PaymentOperationReceipt, type PaymentOperationRequest } from './paymentOperations';
import { readPaymentJournalInstallation, type PaymentJournalInstallation } from './paymentJournalInstallation';
import { roundMoney } from '../utils/finance';
import { isValidISODate } from '../utils/input';

export type EntityRef = Readonly<{ entityType: 'debt' | 'loan'; entityId: string }>;
export type RevisionHead = Readonly<{ revision: number; operationId: string }>;
export type AccountingTarget = EntityRef & Readonly<{ paymentId: string; ledgerTransactionId?: string }>;
export type LoanTermsEvidence = Readonly<Pick<Loan, 'currencyCode' | 'principalAmount' | 'totalRepaymentAmount' | 'monthlyInstallment' | 'numberOfInstallments' | 'receivedAmount'>>;
export type LoanLifecycleEvidence = Readonly<Pick<Loan, 'status' | 'settlementAmount' | 'settlementDate' | 'settlementAccountId' | 'settlementPaymentId' | 'settlementNote' | 'closureDate' | 'closureReason'>>;
export type ParentHeaderEvidence = Readonly<{ entityType: 'debt'; entityId: string; direction: 'payable' | 'receivable'; amount: number; currencyCode: string }>
  | Readonly<{ entityType: 'loan'; entityId: string; terms: LoanTermsEvidence; lifecycle: LoanLifecycleEvidence;
    depositAccountId?: string; depositMethodLabel?: string; receivedAt?: string; receiptTransactionId?: string }>;
export type PaymentValue = Readonly<DebtPayment | LoanPayment>;
export type ParentAccountingEvidence = ParentHeaderEvidence & Readonly<{ payments: readonly PaymentValue[] }>;
export type ExpectedPaymentTransaction = Readonly<Pick<Transaction, 'id' | 'type' | 'entryType' | 'purpose' | 'amount' | 'currencyCode' | 'accountId' | 'categoryId' | 'relatedTransactionId' | 'linkedEntityType' | 'linkedEntityId' | 'linkedPaymentId' | 'date' | 'note'>>;
export interface EntityAccountingBaseline {
  readonly schemaVersion: 1; readonly baselineId: string; readonly generationId: string;
  readonly parent: ParentAccountingEvidence;
}
export interface PaymentAccountingDelta {
  readonly parentBefore: ParentHeaderEvidence; readonly parentAfter: ParentHeaderEvidence;
  readonly paymentBefore: PaymentValue | null; readonly paymentAfter: PaymentValue | null;
  readonly transactionBefore: ExpectedPaymentTransaction | null; readonly transactionAfter: ExpectedPaymentTransaction | null;
}
type PlanBase = Readonly<{ target: AccountingTarget; delta: PaymentAccountingDelta }>;
export type RecoveryOperationPlan = PlanBase & (
  Readonly<{ kind: 'post'; request: PaymentOperationRequest }>
  | Readonly<{ kind: 'edit' | 'reverse'; originalOperationId: string; predecessorOperationId: string }>
);
export interface RecoveryOperationReceipt {
  readonly schemaVersion: 2; readonly operationId: string; readonly generationId: string; readonly baselineId: string;
  readonly revision: Readonly<{ entity: EntityRef; before: RevisionHead | null; after: RevisionHead }>;
  readonly plan: RecoveryOperationPlan; readonly state: 'prepared' | 'completed' | 'needsReview';
}
export interface RecoveryJournalV3 {
  readonly installation?: PaymentJournalInstallation;
  readonly baselines: readonly EntityAccountingBaseline[];
  readonly receipts: readonly (PaymentOperationReceipt | RecoveryOperationReceipt)[];
}
export interface PaymentAccountingMetadata {
  readonly schemaVersion: 1;
  readonly entityHeads: readonly Readonly<{ entity: EntityRef; head: RevisionHead }>[];
}

export const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v === v.trim();
export const entityKey = (v: EntityRef) => `${v.entityType}:${v.entityId}`;
export function requireEvidence(condition: unknown, message = 'Invalid recovery evidence.'): asserts condition {
  if (!condition) throw new Error(message);
}
function shape(v: unknown, required: string[], optional: string[] = []): asserts v is Record<string, unknown> {
  requireEvidence(object(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k)));
}
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const money = (v: unknown, positive = false) => number(v) && (v as number) >= (positive ? Number.MIN_VALUE : 0) && roundMoney(v as number) === v;
const date = (v: unknown) => typeof v === 'string' && isValidISODate(v);
function optional(v: Record<string, unknown>, fields: string[], valid: (x: unknown) => boolean) {
  fields.forEach(k => { if (k in v) requireEvidence(valid(v[k])); });
}
function entity(v: unknown): asserts v is EntityRef {
  shape(v, ['entityType', 'entityId']); requireEvidence(['debt', 'loan'].includes(v.entityType as string) && text(v.entityId));
}
function head(v: unknown): asserts v is RevisionHead {
  shape(v, ['revision', 'operationId']); requireEvidence(Number.isSafeInteger(v.revision) && (v.revision as number) > 0 && text(v.operationId));
}
export function freezeEvidence<T>(v: T, seen = new WeakSet<object>()): T {
  if (v && typeof v === 'object' && !seen.has(v)) {
    seen.add(v); Object.values(v).forEach(item => freezeEvidence(item, seen)); Object.freeze(v);
  }
  return v;
}
export function sameEvidence(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameEvidence(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameEvidence(a[k], b[k]));
}
export function readPaymentAccountingMetadata(v: unknown): PaymentAccountingMetadata {
  shape(v, ['schemaVersion', 'entityHeads']); requireEvidence(v.schemaVersion === 1 && Array.isArray(v.entityHeads));
  const seen = new Set<string>();
  for (const row of v.entityHeads) {
    shape(row, ['entity', 'head']); entity(row.entity); head(row.head);
    const key = entityKey(row.entity); requireEvidence(!seen.has(key)); seen.add(key);
  }
  return freezeEvidence(JSON.parse(JSON.stringify(v)) as PaymentAccountingMetadata);
}
export function validatePayment(v: unknown, kind: 'debt' | 'loan'): asserts v is PaymentValue {
  const loanFields = ['latePaymentFee', 'paymentMode', 'principalAmount', 'interestAmount', 'paymentMethodLabel'];
  shape(v, ['id', 'date', 'amount'], ['note', 'accountId', 'ledgerTransactionId', ...(kind === 'loan' ? loanFields : [])]);
  requireEvidence(text(v.id) && date(v.date) && money(v.amount, true));
  optional(v, ['note'], x => typeof x === 'string'); optional(v, ['accountId', 'ledgerTransactionId', 'paymentMethodLabel'], text);
  optional(v, ['latePaymentFee', 'principalAmount', 'interestAmount'], x => money(x));
  optional(v, ['paymentMode'], x => ['simple', 'split'].includes(x as string));
}
export function validateHeader(v: unknown): asserts v is ParentHeaderEvidence {
  requireEvidence(object(v));
  if (v.entityType === 'debt') {
    shape(v, ['entityType', 'entityId', 'direction', 'amount', 'currencyCode']);
    requireEvidence(text(v.entityId) && text(v.currencyCode) && money(v.amount, true) && ['payable', 'receivable'].includes(v.direction as string));
  } else {
    shape(v, ['entityType', 'entityId', 'terms', 'lifecycle'], ['depositAccountId', 'depositMethodLabel', 'receivedAt', 'receiptTransactionId']);
    requireEvidence(v.entityType === 'loan' && text(v.entityId));
    optional(v, ['depositAccountId', 'depositMethodLabel', 'receiptTransactionId'], text); optional(v, ['receivedAt'], date);
    shape(v.terms, ['currencyCode', 'monthlyInstallment', 'numberOfInstallments'], ['principalAmount', 'totalRepaymentAmount', 'receivedAmount']);
    requireEvidence(text(v.terms.currencyCode) && money(v.terms.monthlyInstallment, true) && Number.isSafeInteger(v.terms.numberOfInstallments) && (v.terms.numberOfInstallments as number) > 0);
    optional(v.terms, ['principalAmount', 'totalRepaymentAmount', 'receivedAmount'], x => money(x));
    shape(v.lifecycle, [], ['status', 'settlementAmount', 'settlementDate', 'settlementAccountId', 'settlementPaymentId', 'settlementNote', 'closureDate', 'closureReason']);
    optional(v.lifecycle, ['status'], x => ['active', 'completed', 'settled', 'closed'].includes(x as string));
    optional(v.lifecycle, ['settlementAmount'], x => money(x, true)); optional(v.lifecycle, ['settlementDate', 'closureDate'], date);
    optional(v.lifecycle, ['settlementAccountId', 'settlementPaymentId'], text);
    optional(v.lifecycle, ['settlementNote', 'closureReason'], x => typeof x === 'string');
  }
}
export function validateTransaction(v: unknown): asserts v is ExpectedPaymentTransaction {
  shape(v, ['id', 'type', 'amount', 'currencyCode', 'accountId', 'categoryId', 'date'], ['entryType', 'purpose', 'relatedTransactionId', 'linkedEntityType', 'linkedEntityId', 'linkedPaymentId', 'note']);
  requireEvidence(['income', 'expense'].includes(v.type as string) && money(v.amount, true) && date(v.date));
  ['id', 'currencyCode', 'accountId', 'categoryId'].forEach(k => requireEvidence(text(v[k])));
  optional(v, ['entryType'], x => ['normal', 'refund'].includes(x as string));
  optional(v, ['purpose'], x => ['normal', 'debt_payment', 'debt_collection', 'loan_payment', 'loan_principal_payment', 'loan_interest_payment', 'property_installment_payment'].includes(x as string));
  optional(v, ['linkedEntityType'], x => ['debt', 'loan', 'property'].includes(x as string));
  optional(v, ['relatedTransactionId', 'linkedEntityId', 'linkedPaymentId'], text); optional(v, ['note'], x => typeof x === 'string');
}
function receipt(v: unknown): asserts v is RecoveryOperationReceipt {
  shape(v, ['schemaVersion', 'operationId', 'generationId', 'baselineId', 'revision', 'plan', 'state']);
  requireEvidence(v.schemaVersion === 2 && text(v.operationId) && text(v.generationId) && text(v.baselineId) && ['prepared', 'completed', 'needsReview'].includes(v.state as string));
  shape(v.revision, ['entity', 'before', 'after']); entity(v.revision.entity); head(v.revision.after);
  if (v.revision.before !== null) head(v.revision.before);
  requireEvidence(v.revision.after.operationId === v.operationId && v.revision.after.revision === (v.revision.before?.revision ?? 0) + 1);
  requireEvidence(object(v.plan));
  shape(v.plan, ['kind', 'target', 'delta', ...(v.plan.kind === 'post' ? ['request'] : ['originalOperationId', 'predecessorOperationId'])]);
  requireEvidence(['post', 'edit', 'reverse'].includes(v.plan.kind as string));
  if (v.plan.kind === 'post') requireEvidence(isPaymentOperationRequest(v.plan.request));
  else requireEvidence(text(v.plan.originalOperationId) && text(v.plan.predecessorOperationId));
  shape(v.plan.target, ['entityType', 'entityId', 'paymentId'], ['ledgerTransactionId']);
  entity({ entityType: v.plan.target.entityType, entityId: v.plan.target.entityId });
  requireEvidence(text(v.plan.target.paymentId) && sameEvidence(v.revision.entity, { entityType: v.plan.target.entityType, entityId: v.plan.target.entityId }));
  optional(v.plan.target, ['ledgerTransactionId'], text);
  requireEvidence(v.plan.target.paymentId !== v.plan.target.ledgerTransactionId);
  const d = v.plan.delta;
  shape(d, ['parentBefore', 'parentAfter', 'paymentBefore', 'paymentAfter', 'transactionBefore', 'transactionAfter']);
  validateHeader(d.parentBefore); validateHeader(d.parentAfter);
  for (const h of [d.parentBefore, d.parentAfter]) requireEvidence(entityKey(h) === entityKey(v.revision.entity));
  for (const p of [d.paymentBefore, d.paymentAfter]) if (p !== null) { validatePayment(p, v.revision.entity.entityType); requireEvidence(p.id === v.plan.target.paymentId); }
  for (const t of [d.transactionBefore, d.transactionAfter]) if (t !== null) { validateTransaction(t); requireEvidence(t.id === v.plan.target.ledgerTransactionId); }
}
/** V3 is read-only in this phase. Legacy writers never receive this document. */
export function readRecoveryJournalV3(v: unknown): RecoveryJournalV3 {
  shape(v, ['baselines', 'receipts'], ['installation']); requireEvidence(Array.isArray(v.baselines) && Array.isArray(v.receipts));
  if ('installation' in v) readPaymentJournalInstallation(v.installation);
  const ids = new Set<string>(), entities = new Set<string>(), operations = new Set<string>();
  for (const b of v.baselines) {
    shape(b, ['schemaVersion', 'baselineId', 'generationId', 'parent']); requireEvidence(b.schemaVersion === 1 && text(b.baselineId) && text(b.generationId));
    requireEvidence(object(b.parent) && Array.isArray(b.parent.payments));
    const { payments, ...header } = b.parent; validateHeader(header);
    const paymentIds = new Set<string>();
    payments.forEach(p => { validatePayment(p, header.entityType); requireEvidence(!paymentIds.has(p.id)); paymentIds.add(p.id); });
    requireEvidence(!ids.has(b.baselineId) && !entities.has(entityKey(header))); ids.add(b.baselineId); entities.add(entityKey(header));
  }
  for (const r of v.receipts) {
    if (object(r) && 'schemaVersion' in r) receipt(r); else requireEvidence(isPaymentOperationReceipt(r));
    requireEvidence(object(r) && text(r.operationId) && !operations.has(r.operationId)); operations.add(r.operationId);
  }
  return freezeEvidence(JSON.parse(JSON.stringify(v)) as RecoveryJournalV3);
}
