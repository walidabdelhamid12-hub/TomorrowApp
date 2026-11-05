import type { PaymentOperationJournalData } from '@/features/finance/types/paymentOperations';
import { readPaymentJournalMarker, assertAccountingStorageVersion, type PaymentJournalMarker } from '@/features/finance/types/paymentJournalInstallation';
import type { createPaymentOperationStore } from './usePaymentOperationStore';

/** No production binding is provided until shared tracked persistence is wired. */
export interface InstallationAccountingPort {
  readPersisted: () => Promise<string | null>;
  /** Must preserve the document and resolve only after its tracked write acknowledges. */
  acknowledgeMarker: (marker: PaymentJournalMarker) => Promise<void>;
}
type Snapshot = { present: boolean; marker?: PaymentJournalMarker; managedEvidence: boolean };
type Status = 'unchecked' | 'checking' | 'legacy' | 'initializing-journal' | 'marking-finance'
  | 'marking-ledger' | 'activating-journal' | 'metadata-ready' | 'blocked';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function readAccountingSnapshot(raw: string | null, kind: 'finance' | 'ledger'): Snapshot {
  if (raw === null) return { present: false, managedEvidence: false };
  const envelope: unknown = JSON.parse(raw);
  if (!object(envelope) || typeof envelope.version !== 'number' || !object(envelope.state)
    || Object.keys(envelope).some(key => key !== 'state' && key !== 'version')) throw new Error(`Invalid ${kind} storage envelope.`);
  assertAccountingStorageVersion(envelope.version);
  const state = envelope.state;
  const arrays = kind === 'finance' ? ['assets', 'debts', 'loans', 'cheques'] : ['accounts', 'categories', 'transactions', 'transfers'];
  if (Object.keys(state).some(key => key !== 'paymentJournal' && !arrays.includes(key))) throw new Error(`Unsupported ${kind} storage fields.`);
  for (const key of arrays) {
    if (envelope.version === 2 && !(key in state)) throw new Error(`Missing ${kind} ${key}.`);
    if (key in state && (!Array.isArray(state[key]) || !(state[key] as unknown[]).every(row =>
      object(row) && typeof row.id === 'string' && row.id.length > 0))) throw new Error(`Invalid ${kind} ${key}.`);
  }
  const evidence = (row: unknown) => object(row) && ('operationId' in row || 'paymentJournalGeneration' in row);
  const rows = kind === 'ledger' ? state.transactions ?? [] : [state.debts ?? [], state.loans ?? []].flat();
  if (kind === 'finance' && (rows as Record<string, unknown>[]).some(row => 'payments' in row
    && (!Array.isArray(row.payments) || !row.payments.every(payment => object(payment) && typeof payment.id === 'string' && payment.id.length > 0)))) {
    throw new Error('Invalid historical payment records require review.');
  }
  const managedEvidence = (rows as unknown[]).some(row => evidence(row)
    || (object(row) && Array.isArray(row.payments) && row.payments.some(evidence)));
  return { present: true, managedEvidence,
    ...('paymentJournal' in state ? { marker: readPaymentJournalMarker(state.paymentJournal) } : {}) };
}

/**
 * Explicit metadata-only bootstrap. No imports of accounting stores, direct
 * AsyncStorage writes, accounting repair, startup side effects, or posting.
 * A blocked attempt requires inspection and a fresh controller; never retry
 * uncertain writes in place. Metadata readiness never enables idempotent posting.
 */
export function createPaymentInstallationRecovery(options: {
  journal: ReturnType<typeof createPaymentOperationStore>;
  finance: InstallationAccountingPort;
  ledger: InstallationAccountingPort;
  createGenerationId: () => string;
  sharedPersistenceReady: () => boolean;
}) {
  let status: Status = 'unchecked';
  let error: unknown;
  let tail = Promise.resolve();
  const block = (reason: string): never => { throw new Error(reason); };
  const read = async () => {
    await options.journal.hydrate();
    const [finance, ledger] = await Promise.all([
      options.finance.readPersisted().then(raw => readAccountingSnapshot(raw, 'finance')),
      options.ledger.readPersisted().then(raw => readAccountingSnapshot(raw, 'ledger')),
    ]);
    const persisted = await options.journal.readPersisted();
    const journal = persisted.data ?? { receipts: [] };
    const source = persisted.source;
    return { finance, ledger, journal, source };
  };
  const classify = (snapshot: Awaited<ReturnType<typeof read>>): 'legacy' | 'metadata-ready' => {
    const { finance, ledger, journal, source } = snapshot;
    const installation = journal.installation;
    if (!installation) {
      if (finance.marker || ledger.marker) block('Missing/deleted journal installation metadata after accounting activation.');
      if (finance.managedEvidence || ledger.managedEvidence || journal.receipts.length) block('Unverified operation evidence cannot be treated as a legacy installation.');
      if (!['missing', 'legacy-v1', 'v2'].includes(source)) block('Journal hydration is not verified.');
      return 'legacy';
    }
    if (installation.phase !== 'active') block('Interrupted installation requires review; automatic resumption is disabled.');
    if (!finance.present || !ledger.present || finance.marker?.generationId !== installation.generationId
      || ledger.marker?.generationId !== installation.generationId) block('Missing or mismatched accounting journal generation.');
    if (journal.receipts.some(r => r.status !== 'completed' && r.status !== 'reversed')) block('Unresolved payment operations require recovery verification.');
    return 'metadata-ready';
  };
  const run = <T>(change: () => Promise<T>): Promise<T> => {
    const result = tail.then(async () => {
      if (status === 'blocked') throw error;
      try { return await change(); }
      catch (cause) { status = 'blocked'; error = cause; throw cause; }
    });
    tail = result.then(() => {}, () => {});
    return result;
  };
  return {
    getStatus: () => ({ status, error, postingAllowed: false as const }),
    check: () => run(async () => {
      status = 'checking';
      status = classify(await read());
      return { status, postingAllowed: false as const };
    }),
    bootstrap: () => run(async () => {
      // A production driver must prove it has installed the common tracked
      // writer. Phase 2A supplies no such driver or automatic caller.
      if (!options.sharedPersistenceReady()) block('Shared tracked persistence is not integrated; bootstrap is disabled.');
      const snapshot = await read();
      if (classify(snapshot) === 'metadata-ready') { status = 'metadata-ready'; return snapshot.journal; }
      const marker = readPaymentJournalMarker({ schemaVersion: 1, generationId: options.createGenerationId() });
      status = 'initializing-journal';
      await options.journal.beginInstallation(marker.generationId);
      status = 'marking-finance';
      await options.finance.acknowledgeMarker(marker);
      const finance = readAccountingSnapshot(await options.finance.readPersisted(), 'finance');
      if (finance.marker?.generationId !== marker.generationId) block('Finance marker acknowledgement could not be verified.');
      status = 'marking-ledger';
      await options.ledger.acknowledgeMarker(marker);
      const ledger = readAccountingSnapshot(await options.ledger.readPersisted(), 'ledger');
      if (ledger.marker?.generationId !== marker.generationId) block('Ledger marker acknowledgement could not be verified.');
      // Re-read both stores immediately before activation. Do not overwrite or
      // infer any accounting records, even if metadata installation is partial.
      const latest = await read();
      if (!latest.finance.present || !latest.ledger.present || latest.finance.marker?.generationId !== marker.generationId || latest.ledger.marker?.generationId !== marker.generationId
        || latest.journal.installation?.generationId !== marker.generationId || latest.journal.receipts.length) block('Installation changed before activation.');
      status = 'activating-journal';
      const active: PaymentOperationJournalData = await options.journal.activateInstallation(marker.generationId);
      status = classify(await read());
      return active;
    }),
  };
}
