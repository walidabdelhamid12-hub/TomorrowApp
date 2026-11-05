import type { FinanceData } from '../types/finance';
import type { LedgerData } from '../types/ledger';
import {
  readCreationImageV1, readCreationProvenanceMetadataTransitionV1,
  type CreationImageV1, type CreationProvenanceMetadataV1,
} from '../types/creationProvenance';
import { copyCoordinatorData } from './paymentRuntimeAuthorization';
import { entityKey, object, sameEvidence, type EntityRef } from '../types/paymentRecovery';
import { readFinanceCreationProvenance } from './paymentAccountingVerification';

type Ownership = Pick<LedgerData, 'transactions' | 'paymentJournal' | 'paymentAccounting'> & { hydrated: boolean };
const descriptive = ['personName', 'name', 'lenderName', 'notes', 'updatedAt'];
const obligations = (row: Record<string, unknown>) => Object.fromEntries(
  Object.entries(row).filter(([key]) => !descriptive.includes(key)),
);
const parents = (state: FinanceData, entity: EntityRef) =>
  (entity.entityType === 'debt' ? state.debts : state.loans).filter(p => p.id === entity.entityId);
const hasHead = (state: Pick<FinanceData, 'paymentAccounting'>, entity: EntityRef) =>
  state.paymentAccounting?.entityHeads.some(h => entityKey(h.entity) === entityKey(entity));
const hasCash = (ledger: Ownership, entity: EntityRef) => ledger.transactions.some(t => t.linkedEntityId === entity.entityId);
const matchingOwner = (finance: FinanceData, ledger?: Ownership): ledger is Ownership =>
  !!ledger?.hydrated && !!finance.paymentJournal && ledger.paymentJournal?.generationId === finance.paymentJournal.generationId;

/** Deterministic image construction, not trusted issuance. IDs/timestamps come from the input. */
export function buildCreationImageV1(kind: 'debt' | 'loan', record: unknown): CreationImageV1 {
  const data = copyCoordinatorData(record);
  if (!object(data) || Object.hasOwn(data, 'entityType')) throw new Error('Expected a plain domain record without a discriminator.');
  // Optional undefined domain properties are absent in persisted JSON; never
  // normalize monetary values, unknown fields, or required properties.
  const optional = kind === 'debt' ? ['dueDate', 'notes']
    : ['principalAmount', 'totalRepaymentAmount', 'depositAccountId', 'depositMethodLabel', 'notes'];
  const canonical = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== undefined || !optional.includes(key)));
  return readCreationImageV1({ ...canonical, entityType: kind });
}

// Compare a current record with its original creation image: updatedAt may change
// on descriptive edits, but it must still be a valid domain timestamp.
function currentImage(kind: 'debt' | 'loan', row: unknown) {
  const data = copyCoordinatorData(row);
  if (!object(data) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))
    || new Date(data.updatedAt).toISOString() !== data.updatedAt) throw new Error('Invalid update timestamp.');
  return buildCreationImageV1(kind, { ...data, updatedAt: data.createdAt });
}

/** Publicly supplied evidence cannot prove issuance, acknowledgement, or restore continuity. */
export function inspectCreationEligibility(finance: FinanceData, ledger: Ownership | undefined, entity: EntityRef) {
  const result = (baselineMatches: boolean, reason: string) => Object.freeze({ baselineMatches,
    eligible: false as const, postingAllowed: false as const, reason });
  try {
    const metadata = readFinanceCreationProvenance(finance as unknown as Record<string, unknown>).creationProvenance;
    if (!metadata || !matchingOwner(finance, ledger)) return result(false, 'Missing provenance or matching hydrated ownership evidence.');
    const entries = metadata.entries.filter(e => entityKey(e.attestation.entity) === entityKey(entity));
    const rows = parents(finance, entity);
    if (entries.length !== 1 || rows.length !== 1 || entries[0].disposition !== 'candidate') return result(false, 'No unique candidate owner.');
    if (hasHead(finance, entity) || hasHead(ledger, entity) || hasCash(ledger, entity)) return result(false, 'Existing accounting ownership.');
    const image = currentImage(entity.entityType, rows[0]);
    if (!sameEvidence(obligations(image as unknown as Record<string, unknown>),
      obligations(entries[0].attestation.image as unknown as Record<string, unknown>))) return result(false, 'Creation obligations changed.');
    return result(true, 'Baseline matches; trusted issuance, acknowledgement, and continuity are not established.');
  } catch { return result(false, 'Invalid or conflicting creation evidence.'); }
}

/** Preserve negative evidence in the same Finance mutation. Never adds attestations. */
export function preserveCreationLifecycle(previous: FinanceData, next: FinanceData, ledger?: Ownership): {
  creationProvenance?: CreationProvenanceMetadataV1;
} {
  const metadata = readFinanceCreationProvenance(previous as unknown as Record<string, unknown>).creationProvenance;
  if (!metadata) {
    if (Object.hasOwn(next, 'creationProvenance')) throw new Error('Domain mutations cannot issue creation provenance.');
    return {};
  }
  if (Object.hasOwn(next, 'creationProvenance') && !sameEvidence(next.creationProvenance, metadata)) {
    throw new Error('Domain mutations cannot replace creation evidence.');
  }
  const entries = metadata.entries.map(entry => {
    const entity = entry.attestation.entity, before = parents(previous, entity), after = parents(next, entity);
    let disposition = entry.disposition;
    if (after.length > 1) throw new Error('Ambiguous creation owner.');
    if (!after.length) {
      const oldRows = entity.entityType === 'debt' ? previous.debts : previous.loans;
      const newRows = entity.entityType === 'debt' ? next.debts : next.loans;
      if (before.length && newRows.some(p => !oldRows.some(old => old.id === p.id))) throw new Error('Creation identity cannot be replaced.');
      disposition = 'deleted';
    } else if (disposition === 'deleted') throw new Error('Deleted creation identities cannot be reused.');
    else if (disposition === 'candidate') {
      if (before[0]?.payments.length || after[0].payments.length || hasHead(previous, entity) || hasHead(next, entity)
        || (ledger && hasHead(ledger, entity))) disposition = 'consumed';
      else if (!sameEvidence(before[0], after[0])) {
        if (!matchingOwner(next, ledger) || hasCash(ledger, entity)) disposition = 'blocked';
        else {
          try {
            const current = currentImage(entity.entityType, after[0]);
            if (!sameEvidence(obligations(current as unknown as Record<string, unknown>),
              obligations(entry.attestation.image as unknown as Record<string, unknown>))) disposition = 'blocked';
          } catch { disposition = 'blocked'; }
        }
      }
    }
    return { ...entry, disposition };
  });
  const updated = readCreationProvenanceMetadataTransitionV1(metadata, { schemaVersion: 1, entries });
  const merged = { ...next, creationProvenance: updated };
  readFinanceCreationProvenance(merged as unknown as Record<string, unknown>);
  return { creationProvenance: updated };
}
