import { readCreationAttestationV1, type CreationAttestationV1 } from './creationProvenance';

/**
 * Structure and transition validation only. This module neither issues trusted
 * identities nor proves that an authorized runtime created supplied evidence.
 * Caller-provided evidence is never sufficient for trusted creation. An ACK
 * marker describes a writer's observation of one storage API acknowledgement;
 * parsing it proves neither that observation nor power-loss durability, caller
 * notification, payment eligibility, posting permission, or production activation.
 * Future issuance and V3 integration require separate authorization.
 */
export type CreationOperationStateV1 = 'prepared' | 'finance-ack-observed';

/** Data identifying the particular Finance write, not a receipt or capability. */
export interface CreationFinanceAckObservationV1 {
  readonly storageKey: 'tomorrow:finance';
  readonly writeId: string;
}

interface CreationOperationBindingV1 {
  readonly schemaVersion: 1;
  readonly operationId: string;
  /** Exact V1 image, entity, creation identity and generation; never issuance proof. */
  readonly attestation: CreationAttestationV1;
}

export type CreationOperationEvidenceV1 = CreationOperationBindingV1 & (
  Readonly<{ state: 'prepared' }>
  | Readonly<{ state: 'finance-ack-observed'; financeAck: CreationFinanceAckObservationV1 }>
);

/**
 * A single generation's retained reservation evidence, not a Journal V3 document.
 * Entries have no deletion state: retain them even if a future entity is deleted.
 * Absence of a live entity must never make a retained identity reusable.
 */
export interface CreationOperationEvidenceSetV1 {
  readonly schemaVersion: 1;
  readonly generationId: string;
  readonly entries: readonly CreationOperationEvidenceV1[];
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid creation operation evidence.');
}

/**
 * Descriptor-only copy, following the V1 provenance plain-data boundary.
 * Getters and serialization hooks are not called. Proxy reflection traps may
 * execute: this is not a sandbox against malicious JavaScript or raw writers.
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

function shape(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(keys.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => keys.includes(key)));
}

// Opaque identifiers follow the existing V1 convention; no normalization or
// prescribed UUID/prefix can turn an identifier into trusted authority.
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.trim() === value;

export function readCreationOperationEvidenceV1(value: unknown): CreationOperationEvidenceV1 {
  const copy = snapshot(value);
  check(copy && typeof copy === 'object' && !Array.isArray(copy));
  const state = (copy as Record<string, unknown>).state;
  check(state === 'prepared' || state === 'finance-ack-observed');
  shape(copy, ['schemaVersion', 'operationId', 'attestation', 'state',
    ...(state === 'finance-ack-observed' ? ['financeAck'] : [])]);
  check(copy.schemaVersion === 1 && text(copy.operationId));
  const attestation = readCreationAttestationV1(copy.attestation);
  if (state === 'finance-ack-observed') {
    shape(copy.financeAck, ['storageKey', 'writeId']);
    check(copy.financeAck.storageKey === 'tomorrow:finance' && text(copy.financeAck.writeId));
  }
  return Object.freeze({ ...copy, attestation }) as unknown as CreationOperationEvidenceV1;
}

export function readCreationOperationEvidenceSetV1(value: unknown): CreationOperationEvidenceSetV1 {
  const copy = snapshot(value);
  shape(copy, ['schemaVersion', 'generationId', 'entries']);
  check(copy.schemaVersion === 1 && text(copy.generationId) && Array.isArray(copy.entries));
  const operations = new Set<string>(), creations = new Set<string>(), entities = new Set<string>();
  const writes = new Set<string>();
  const entries = copy.entries.map(value => {
    const entry = readCreationOperationEvidenceV1(value), a = entry.attestation;
    check(a.generationId === copy.generationId);
    // Unlike V1 provenance's type/ID tuple, this reservation set forbids the same
    // entity ID across Debt and Loan. It does not inspect external/live records.
    check(!operations.has(entry.operationId) && !creations.has(a.creationId) && !entities.has(a.entity.entityId));
    operations.add(entry.operationId); creations.add(a.creationId); entities.add(a.entity.entityId);
    if (entry.state === 'finance-ack-observed') {
      check(!writes.has(entry.financeAck.writeId));
      writes.add(entry.financeAck.writeId);
    }
    return entry;
  });
  return Object.freeze({ schemaVersion: 1, generationId: copy.generationId, entries: Object.freeze(entries) });
}

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

/** Forward or identical transitions only; accepting data never authorizes the transition. */
export function readCreationOperationEvidenceTransitionV1(previous: unknown, next: unknown): CreationOperationEvidenceV1 {
  const before = readCreationOperationEvidenceV1(previous), after = readCreationOperationEvidenceV1(next);
  check(before.schemaVersion === after.schemaVersion && before.operationId === after.operationId
    && equal(before.attestation, after.attestation));
  if (before.state === 'finance-ack-observed') {
    check(after.state === 'finance-ack-observed' && equal(before.financeAck, after.financeAck));
  }
  return after;
}

/**
 * Retain every reservation; append only prepared entries. No replacement,
 * resurrection, replay or proof of global continuity across coherent rollback.
 * Entry order is immaterial. This set has no authority over external tombstones.
 */
export function readCreationOperationEvidenceSetTransitionV1(previous: unknown, next: unknown): CreationOperationEvidenceSetV1 {
  const before = readCreationOperationEvidenceSetV1(previous), after = readCreationOperationEvidenceSetV1(next);
  check(before.generationId === after.generationId);
  const retained = new Map(after.entries.map(entry => [entry.operationId, entry]));
  const existing = new Set(before.entries.map(entry => entry.operationId));
  for (const entry of before.entries) {
    const nextEntry = retained.get(entry.operationId);
    check(nextEntry);
    readCreationOperationEvidenceTransitionV1(entry, nextEntry);
  }
  for (const entry of after.entries) if (!existing.has(entry.operationId)) check(entry.state === 'prepared');
  return after;
}