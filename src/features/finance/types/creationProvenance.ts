import type { Debt, Loan } from './finance';

/** Retained evidence only. Parsing never establishes acknowledgement or eligibility. */
export type CreationDisposition = 'candidate' | 'blocked' | 'consumed' | 'deleted';
export type DebtCreationImageV1 = Readonly<Omit<Debt, 'payments'> & {
  entityType: 'debt'; payments: readonly [];
}>;
export type LoanCreationImageV1 = Readonly<Omit<Loan,
  'payments' | 'status' | 'receivedAt' | 'receivedAmount' | 'receiptTransactionId'
  | 'settlementAmount' | 'settlementDate' | 'settlementAccountId' | 'settlementPaymentId'
  | 'settlementNote' | 'closureDate' | 'closureReason'> & {
  entityType: 'loan'; status: 'active'; payments: readonly [];
}>;
export type CreationImageV1 = DebtCreationImageV1 | LoanCreationImageV1;
export interface CreationAttestationV1 {
  readonly schemaVersion: 1;
  readonly entity: Readonly<{ entityType: 'debt' | 'loan'; entityId: string }>;
  readonly creationId: string;
  readonly generationId: string;
  readonly image: CreationImageV1;
}
export interface CreationProvenanceEntryV1 {
  readonly attestation: CreationAttestationV1;
  readonly disposition: CreationDisposition;
}
export interface CreationProvenanceMetadataV1 {
  readonly schemaVersion: 1;
  readonly entries: readonly CreationProvenanceEntryV1[];
}

function check(value: unknown): asserts value {
  if (!value) throw new Error('Invalid creation provenance evidence.');
}

/**
 * Trusted plain-object boundary, not a JavaScript sandbox: Proxy reflection traps
 * may execute. Copy data descriptors without invoking getters or serialization hooks.
 */
function snapshot(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
  check(typeof value === 'object' && value !== null && !seen.has(value));
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  check(prototype === (array ? Array.prototype : Object.prototype) || prototype === null);
  seen.add(value);
  const pairs: [string, unknown][] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(typeof key === 'string' && key !== 'toJSON' && descriptor?.enumerable && 'value' in descriptor);
    if (array) check(/^(0|[1-9]\d*)$/.test(key) && Number(key) < (value as unknown[]).length);
    pairs.push([key, snapshot(descriptor.value, seen)]);
  }
  seen.delete(value);
  if (array) {
    check(pairs.length === (value as unknown[]).length);
    const result = new Array(pairs.length);
    for (const [key, item] of pairs) result[Number(key)] = item;
    return Object.freeze(result);
  }
  return Object.freeze(Object.fromEntries(pairs));
}

function shape(value: unknown, required: string[], optional: string[] = []): asserts value is Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => [...required, ...optional].includes(key)));
}
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.trim() === v;
// Same three-decimal rule as utils/finance.roundMoney; keep this pure schema
// independent of the application utility module and its runtime dependencies.
const roundMoney = (v: number): number => Math.round((v + Number.EPSILON) * 1000) / 1000;
const money = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  && v > 0 && roundMoney(v) === v;
const day = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const timestamp = (v: unknown): boolean => typeof v === 'string' && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString() === v;

function validateImage(value: unknown): asserts value is CreationImageV1 {
  shape(value, ['entityType', 'id', 'currencyCode', 'payments', 'createdAt', 'updatedAt'],
    ['direction', 'personName', 'amount', 'date', 'dueDate', 'notes', 'name', 'lenderName',
      'principalAmount', 'totalRepaymentAmount', 'monthlyInstallment', 'numberOfInstallments',
      'firstDueDate', 'depositAccountId', 'depositMethodLabel', 'status']);
  const common = ['entityType', 'id', 'currencyCode', 'payments', 'createdAt', 'updatedAt'];
  check(text(value.id) && text(value.currencyCode) && Array.isArray(value.payments) && value.payments.length === 0);
  check(timestamp(value.createdAt) && value.createdAt === value.updatedAt);
  if ('notes' in value) check(typeof value.notes === 'string');
  if (value.entityType === 'debt') {
    shape(value, [...common, 'direction', 'personName', 'amount', 'date'], ['dueDate', 'notes']);
    check(['payable', 'receivable'].includes(value.direction as string) && text(value.personName)
      && money(value.amount) && day(value.date));
    if ('dueDate' in value) check(day(value.dueDate));
  } else {
    shape(value, [...common, 'name', 'lenderName', 'monthlyInstallment', 'numberOfInstallments', 'firstDueDate', 'status'],
      ['principalAmount', 'totalRepaymentAmount', 'depositAccountId', 'depositMethodLabel', 'notes']);
    check(value.entityType === 'loan' && value.status === 'active' && text(value.name) && text(value.lenderName)
      && money(value.monthlyInstallment) && Number.isSafeInteger(value.numberOfInstallments)
      && (value.numberOfInstallments as number) > 0 && day(value.firstDueDate));
    for (const key of ['principalAmount', 'totalRepaymentAmount']) if (key in value) check(money(value[key]));
    // Round only a derived obligation, never supplied monetary fields or the image.
    const total = value.totalRepaymentAmount ?? roundMoney(value.monthlyInstallment * (value.numberOfInstallments as number));
    check(money(total) && (value.principalAmount === undefined || total >= (value.principalAmount as number)));
    check(!('depositAccountId' in value && 'depositMethodLabel' in value));
    for (const key of ['depositAccountId', 'depositMethodLabel']) if (key in value) check(text(value[key]));
  }
}
function validateAttestation(value: unknown): asserts value is CreationAttestationV1 {
  shape(value, ['schemaVersion', 'entity', 'creationId', 'generationId', 'image']);
  check(value.schemaVersion === 1 && text(value.creationId) && text(value.generationId));
  shape(value.entity, ['entityType', 'entityId']);
  validateImage(value.image);
  check(value.entity.entityType === value.image.entityType && value.entity.entityId === value.image.id);
}
function validateEntry(value: unknown): asserts value is CreationProvenanceEntryV1 {
  shape(value, ['attestation', 'disposition']); validateAttestation(value.attestation);
  check(['candidate', 'blocked', 'consumed', 'deleted'].includes(value.disposition as string));
}
export function readCreationImageV1(value: unknown): CreationImageV1 {
  const copy = snapshot(value); validateImage(copy); return copy;
}
export function readCreationAttestationV1(value: unknown): CreationAttestationV1 {
  const copy = snapshot(value); validateAttestation(copy); return copy;
}
export function readCreationProvenanceMetadataV1(value: unknown): CreationProvenanceMetadataV1 {
  const copy = snapshot(value);
  shape(copy, ['schemaVersion', 'entries']); check(copy.schemaVersion === 1 && Array.isArray(copy.entries));
  const creations = new Set<string>(), entities = new Set<string>();
  for (const entry of copy.entries) {
    validateEntry(entry);
    const a = entry.attestation, entity = JSON.stringify([a.entity.entityType, a.entity.entityId]);
    check(!creations.has(a.creationId) && !entities.has(entity));
    creations.add(a.creationId); entities.add(entity);
  }
  return copy as unknown as CreationProvenanceMetadataV1;
}
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}
/** Validate a retained entry, never mutate or certify it. Same-state transitions are idempotent. */
export function readCreationProvenanceTransitionV1(previous: unknown, next: unknown): CreationProvenanceEntryV1 {
  const before = snapshot(previous), after = snapshot(next);
  validateEntry(before); validateEntry(after);
  check(equal(before.attestation, after.attestation));
  const allowed: Record<CreationDisposition, readonly CreationDisposition[]> = {
    candidate: ['candidate', 'blocked', 'consumed', 'deleted'],
    blocked: ['blocked', 'deleted'], consumed: ['consumed', 'deleted'], deleted: ['deleted'],
  };
  check(allowed[before.disposition].includes(after.disposition));
  return after;
}
/** Existing evidence cannot disappear; only new candidate attestations may be appended. */
export function readCreationProvenanceMetadataTransitionV1(previous: unknown, next: unknown): CreationProvenanceMetadataV1 {
  const before = readCreationProvenanceMetadataV1(previous), after = readCreationProvenanceMetadataV1(next);
  const existing = new Set(before.entries.map(e => e.attestation.creationId));
  for (const entry of before.entries) {
    const retained = after.entries.find(e => e.attestation.creationId === entry.attestation.creationId);
    check(retained); readCreationProvenanceTransitionV1(entry, retained);
  }
  for (const entry of after.entries) if (!existing.has(entry.attestation.creationId)) check(entry.disposition === 'candidate');
  return after;
}
