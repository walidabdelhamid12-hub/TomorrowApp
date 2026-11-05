import { readPaymentAccountingMetadata, type PaymentAccountingMetadata } from './paymentRecovery';

export interface PaymentJournalMarker {
  readonly schemaVersion: 1;
  readonly generationId: string;
}
export interface PaymentJournalInstallation extends PaymentJournalMarker {
  readonly phase: 'initializing' | 'active';
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function readPaymentJournalMarker(value: unknown): PaymentJournalMarker {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.generationId !== 'string'
    || !value.generationId.trim() || value.generationId !== value.generationId.trim()
    || Object.keys(value).some(key => key !== 'schemaVersion' && key !== 'generationId')) {
    throw new Error('Invalid payment journal generation marker.');
  }
  return Object.freeze({ schemaVersion: 1, generationId: value.generationId });
}

export function readPaymentJournalInstallation(value: unknown): PaymentJournalInstallation {
  if (!object(value) || (value.phase !== 'initializing' && value.phase !== 'active')
    || Object.keys(value).some(key => !['schemaVersion', 'generationId', 'phase'].includes(key))) {
    throw new Error('Invalid payment journal installation metadata.');
  }
  return Object.freeze({ ...readPaymentJournalMarker({ schemaVersion: value.schemaVersion, generationId: value.generationId }), phase: value.phase });
}

/** Missing metadata remains legacy; malformed metadata is never discarded. */
export function paymentJournalMetadata(state: { paymentJournal?: unknown; paymentAccounting?: unknown }): {
  paymentJournal?: PaymentJournalMarker; paymentAccounting?: PaymentAccountingMetadata;
} {
  return { ...(state.paymentJournal === undefined ? {} : { paymentJournal: readPaymentJournalMarker(state.paymentJournal) }),
    ...(state.paymentAccounting === undefined ? {} : { paymentAccounting: readPaymentAccountingMetadata(state.paymentAccounting) }) };
}

export function assertAccountingStorageVersion(version: number): void {
  if (!Number.isInteger(version) || version < 0 || version > 2) throw new Error('Unsupported Finance/Ledger persistence version.');
}
