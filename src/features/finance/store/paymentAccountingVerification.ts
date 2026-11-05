import type { FinanceData, LoanPayment } from '../types/finance';
import type { LedgerData } from '../types/ledger';
import {
  entityKey, freezeEvidence, object, readPaymentAccountingMetadata, readRecoveryJournalV3, requireEvidence as check,
  sameEvidence as equal, text, validateHeader, validatePayment, validateTransaction,
  type EntityRef, type ParentAccountingEvidence, type ParentHeaderEvidence, type PaymentValue,
  type RecoveryJournalV3, type RecoveryOperationReceipt, type RevisionHead, type ExpectedPaymentTransaction,
} from '../types/paymentRecovery';
import { readPaymentOperationJournal, type PaymentOperationReceipt } from '../types/paymentOperations';
import { assertAccountingStorageVersion, readPaymentJournalMarker } from '../types/paymentJournalInstallation';
import { roundMoney } from '../utils/finance';
import type { PaymentOperationRuntime, PaymentPersistenceKey } from './paymentOperationRuntime';
import { readCreationProvenanceMetadataV1, type CreationProvenanceMetadataV1 } from '../types/creationProvenance';

/** Shared strict Finance evidence reader. No issuance, normalization, or eligibility. */
export function readFinanceCreationProvenance(state: Record<string, unknown>): { creationProvenance?: CreationProvenanceMetadataV1 } {
  if (!Object.hasOwn(state, 'creationProvenance')) return {};
  const metadata = readCreationProvenanceMetadataV1(state.creationProvenance);
  const marker = readPaymentJournalMarker(state.paymentJournal);
  check(Array.isArray(state.debts) && Array.isArray(state.loans), 'Missing provenance ownership containers.');
  for (const { attestation, disposition } of metadata.entries) {
    check(attestation.generationId === marker.generationId, 'Creation provenance generation conflict.');
    const rows = state[attestation.entity.entityType === 'debt' ? 'debts' : 'loans'] as unknown[];
    const owners = rows.filter(row => object(row) && row.id === attestation.entity.entityId);
    check(owners.length === (disposition === 'deleted' ? 0 : 1), 'Creation provenance ownership conflict.');
    // Validate the persisted owner before legacy Finance normalization can replace
    // a missing/corrupt loan payment container with an empty array.
    for (const owner of owners) {
      check(object(owner) && Object.hasOwn(owner, 'payments') && Array.isArray(owner.payments),
        'Missing or invalid provenance-owned payment history.');
      for (const payment of owner.payments) {
        validatePayment(payment, attestation.entity.entityType);
      }
    }
  }
  // Payment identities belong to the entire Finance document, including unmanaged
  // parents. Unreadable history cannot establish global ownership uniqueness.
  const paymentIds = new Set<string>();
  for (const parent of [...state.debts, ...state.loans]) {
    check(object(parent) && Object.hasOwn(parent, 'payments') && Array.isArray(parent.payments),
      'Missing or invalid payment ownership history.');
    for (const payment of parent.payments) {
      check(object(payment) && text(payment.id), 'Invalid payment ownership identity.');
      check(!paymentIds.has(payment.id), 'Duplicate payment ownership.');
      paymentIds.add(payment.id);
    }
  }
  return { creationProvenance: metadata };
}

export type RecoveryClassification = 'verified-current' | 'verified-superseded' | 'verified-reversed'
  | 'prepared-unapplied' | 'prepared-partial' | 'prepared-accounting-matches' | 'needs-review' | 'blocked';
export interface RecoveryFinding {
  readonly operationId?: string; readonly entity?: EntityRef;
  readonly classification: RecoveryClassification; readonly reason: string;
  readonly postingAllowed: false;
}
export interface AccountingRecoveryResult {
  readonly postingAllowed: false; readonly readiness: 'blocked';
  readonly installation: 'legacy' | 'consistent' | 'blocked';
  readonly globalIssues: readonly string[]; readonly findings: readonly RecoveryFinding[];
}
const pick = (v: object, keys: string[]) => Object.fromEntries(keys.filter(k => Object.hasOwn(v, k)).map(k => [k, (v as Record<string, unknown>)[k]]));
const terms = ['currencyCode', 'principalAmount', 'totalRepaymentAmount', 'monthlyInstallment', 'numberOfInstallments', 'receivedAmount'];
const lifecycle = ['status', 'settlementAmount', 'settlementDate', 'settlementAccountId', 'settlementPaymentId', 'settlementNote', 'closureDate', 'closureReason'];
const transactionFields = ['id', 'type', 'entryType', 'purpose', 'amount', 'currencyCode', 'accountId', 'categoryId', 'relatedTransactionId', 'linkedEntityType', 'linkedEntityId', 'linkedPaymentId', 'date', 'note'];

export function projectParent(row: Record<string, unknown>, kind: 'debt' | 'loan'): ParentAccountingEvidence {
  const allowed = kind === 'debt' ? ['id', 'direction', 'personName', 'amount', 'currencyCode', 'date', 'dueDate', 'notes', 'payments', 'createdAt', 'updatedAt']
    : ['id', 'name', 'lenderName', 'firstDueDate', 'notes', 'payments', 'createdAt', 'updatedAt', ...terms, ...lifecycle, 'depositAccountId', 'depositMethodLabel', 'receivedAt', 'receiptTransactionId'];
  check(Object.keys(row).every(k => allowed.includes(k)), 'Unsupported parent evidence fields.');
  check(Array.isArray(row.payments), 'Missing historical payments.');
  const header = kind === 'debt'
    ? { entityType: kind, entityId: row.id, ...pick(row, ['direction', 'amount', 'currencyCode']) }
    : { entityType: kind, entityId: row.id, terms: pick(row, terms), lifecycle: pick(row, lifecycle),
      ...pick(row, ['depositAccountId', 'depositMethodLabel', 'receivedAt', 'receiptTransactionId']) };
  validateHeader(header);
  row.payments.forEach(p => validatePayment(p, kind));
  return { ...header, payments: row.payments as PaymentValue[] };
}
const headerOf = (p: ParentAccountingEvidence): ParentHeaderEvidence => {
  const { payments: _payments, ...header } = p; return header;
};
const currency = (h: ParentHeaderEvidence) => h.entityType === 'debt' ? h.currencyCode : h.terms.currencyCode;
const total = (h: ParentHeaderEvidence) => h.entityType === 'debt' ? h.amount
  : roundMoney(h.terms.totalRepaymentAmount ?? h.terms.monthlyInstallment * h.terms.numberOfInstallments);
const paid = (p: readonly PaymentValue[]) => roundMoney(p.reduce((sum, item) => sum + item.amount, 0));

function parseAccounting(raw: string | null, kind: 'finance' | 'ledger'): Record<string, unknown> | null {
  if (raw === null) return null;
  const envelope: unknown = JSON.parse(raw);
  check(object(envelope) && Object.keys(envelope).every(k => ['version', 'state'].includes(k)) && typeof envelope.version === 'number' && object(envelope.state), 'Invalid accounting envelope.');
  assertAccountingStorageVersion(envelope.version);
  const state = envelope.state;
  const arrays = kind === 'finance' ? ['assets', 'debts', 'loans', 'cheques'] : ['accounts', 'categories', 'transactions', 'transfers'];
  check(Object.keys(state).every(k => [...arrays, 'paymentJournal', 'paymentAccounting', ...(kind === 'finance' ? ['creationProvenance'] : [])].includes(k)), 'Unsupported accounting fields.');
  for (const key of arrays) {
    check(Array.isArray(state[key]), `Missing ${key} container.`);
    const ids = new Set<string>();
    for (const row of state[key]) {
      check(object(row) && text(row.id) && !ids.has(row.id), `Invalid/duplicate ${key} identity.`); ids.add(row.id);
    }
  }
  if ('paymentJournal' in state) readPaymentJournalMarker(state.paymentJournal);
  if ('paymentAccounting' in state) readPaymentAccountingMetadata(state.paymentAccounting);
  if (kind === 'finance') {
    readFinanceCreationProvenance(state);
    for (const key of ['debts', 'loans']) for (const row of state[key] as Record<string, unknown>[]) projectParent(row, key === 'debts' ? 'debt' : 'loan');
  } else {
    for (const tx of state.transactions as Record<string, unknown>[]) {
      check(Object.keys(tx).every(k => [...transactionFields, 'createdAt', 'updatedAt'].includes(k)), 'Unsupported transaction fields.');
      validateTransaction(pick(tx, transactionFields));
    }
    for (const a of state.accounts as Record<string, unknown>[]) check(text(a.currencyCode)
      && ['cash', 'bank', 'wallet', 'savings', 'credit_card'].includes(a.type as string)
      && typeof a.initialBalance === 'number' && Number.isFinite(a.initialBalance)
      && (a.archived === undefined || typeof a.archived === 'boolean'), 'Invalid account evidence.');
    for (const c of state.categories as Record<string, unknown>[]) check(['income', 'expense'].includes(c.kind as string), 'Invalid category evidence.');
  }
  return state;
}
export function readRecoveryJournalDocument(raw: string | null): RecoveryJournalV3 {
  if (raw === null) return { receipts: [], baselines: [] };
  const v: unknown = JSON.parse(raw);
  check(object(v) && Object.keys(v).every(k => ['version', 'state'].includes(k)), 'Invalid journal envelope.');
  if (v.version === 3) return readRecoveryJournalV3(v.state);
  check(v.version === 1 || v.version === 2, 'Unsupported journal envelope.');
  const old = readPaymentOperationJournal(v.state);
  check(v.version !== 1 || !old.installation, 'V1 installation metadata is unsupported.');
  return { ...old, baselines: [] };
}

function validateOutcome(header: ParentHeaderEvidence, payment: PaymentValue | null, tx: ExpectedPaymentTransaction | null, r: RecoveryOperationReceipt) {
  const target = r.plan.target;
  if (!payment) { check(tx === null); return; }
  check(payment.id === target.paymentId);
  if (header.entityType === 'loan') {
    const p = payment as LoanPayment;
    check(p.paymentMode === 'simple' && p.principalAmount === undefined && p.interestAmount === undefined && p.latePaymentFee !== undefined, 'Unsupported repayment representation.');
  }
  if (target.ledgerTransactionId === undefined) {
    check(header.entityType === 'loan' && text((payment as LoanPayment).paymentMethodLabel) && payment.accountId === undefined && payment.ledgerTransactionId === undefined && tx === null, 'Custom funding conflicts with account cash.');
    return;
  }
  const type = header.entityType === 'debt' && header.direction === 'receivable' ? 'income' : 'expense';
  check(tx && payment.accountId === tx.accountId && payment.ledgerTransactionId === target.ledgerTransactionId
    && (payment as LoanPayment).paymentMethodLabel === undefined
    && tx.id === target.ledgerTransactionId && tx.type === type && tx.entryType === 'normal' && tx.relatedTransactionId === undefined
    && tx.currencyCode === currency(header) && tx.amount === roundMoney(payment.amount + ((payment as LoanPayment).latePaymentFee ?? 0))
    && tx.date === payment.date && tx.note === payment.note && tx.linkedEntityType === target.entityType
    && tx.linkedEntityId === target.entityId && tx.linkedPaymentId === target.paymentId
    && tx.purpose === (header.entityType === 'loan' ? 'loan_payment' : type === 'income' ? 'debt_collection' : 'debt_payment'), 'Invalid exact cash outcome.');
}

export interface DerivedOperation {
  readonly receipt: RecoveryOperationReceipt;
  readonly before: ParentAccountingEvidence; readonly after: ParentAccountingEvidence;
  readonly transactionsBefore: ReadonlyMap<string, ExpectedPaymentTransaction | null>;
  readonly transactionsAfter: ReadonlyMap<string, ExpectedPaymentTransaction | null>;
}
/** Pure journal projection, never a replay into accounting stores. */
export function deriveExpectedAccounting(journal: RecoveryJournalV3, entity: EntityRef): readonly DerivedOperation[] {
  const baselines = journal.baselines.filter(b => entityKey(b.parent) === entityKey(entity));
  check(baselines.length === 1, 'Missing/duplicate entity baseline.');
  const baseline = baselines[0];
  let parent = baseline.parent, head: RevisionHead | null = null;
  const chain = journal.receipts.filter((r): r is RecoveryOperationReceipt => 'schemaVersion' in r && entityKey(r.revision.entity) === entityKey(entity))
    .sort((a, b) => a.revision.after.revision - b.revision.after.revision);
  check(chain.length > 0, 'Orphaned baseline.');
  const transactions = new Map<string, ExpectedPaymentTransaction | null>();
  const paymentHeads = new Map<string, RecoveryOperationReceipt>();
  const result: DerivedOperation[] = [];
  for (const r of chain) {
    check(r.generationId === baseline.generationId && r.generationId === journal.installation?.generationId && r.baselineId === baseline.baselineId, 'Generation/baseline mismatch.');
    check(equal(r.revision.before, head) && (result.length === 0 || result[result.length - 1].receipt.state === 'completed'), 'Broken or unresolved revision predecessor.');
    const { delta: d, target } = r.plan;
    check(equal(headerOf(parent), d.parentBefore), 'Parent before-image mismatch.');
    const priorPayment = parent.payments.find(p => p.id === target.paymentId) ?? null;
    check(equal(priorPayment, d.paymentBefore), 'Payment before-image mismatch.');
    const previous = paymentHeads.get(target.paymentId);
    if (r.plan.kind === 'post') {
      check(!previous && priorPayment === null && d.transactionBefore === null && d.paymentAfter !== null, 'Posting identity collision.');
      const q = r.plan.request, p = d.paymentAfter;
      check(q.entityId === target.entityId && q.entityType === target.entityType && q.currencyCode === currency(d.parentBefore)
        && p.amount === q.amount && p.date === q.date && p.note === q.note, 'Request/payment mismatch.');
      check(q.entityType !== 'debt' || (d.parentBefore.entityType === 'debt' && q.direction === d.parentBefore.direction));
      if (q.funding.kind === 'account') check(target.ledgerTransactionId && p.accountId === q.funding.accountId && d.transactionAfter?.categoryId === q.funding.categoryId, 'Funding/category mismatch.');
      else check(!target.ledgerTransactionId && (p as LoanPayment).paymentMethodLabel === q.funding.methodLabel);
      if (q.entityType === 'loan') check((p as LoanPayment).latePaymentFee === q.latePaymentFee);
    } else {
      check(previous && previous.state === 'completed' && previous.plan.kind !== 'reverse' && equal(previous.plan.target, target), 'Missing exact payment predecessor.');
      check(r.plan.predecessorOperationId === previous.operationId && r.plan.originalOperationId === (previous.plan.kind === 'post' ? previous.operationId : previous.plan.originalOperationId), 'Wrong original/edit identity.');
      check(d.paymentBefore !== null && (r.plan.kind === 'reverse' ? d.paymentAfter === null && d.transactionAfter === null : d.paymentAfter !== null), 'Invalid edit/reversal outcome.');
      if (r.plan.kind === 'edit' && target.ledgerTransactionId) check(d.transactionBefore?.categoryId === d.transactionAfter?.categoryId, 'Unsupported category edit.');
    }
    if (target.ledgerTransactionId) {
      check(equal(transactions.get(target.ledgerTransactionId) ?? null, d.transactionBefore), 'Transaction predecessor mismatch.');
    } else check(d.transactionBefore === null && d.transactionAfter === null);
    validateOutcome(d.parentBefore, d.paymentBefore, d.transactionBefore, r);
    validateOutcome(d.parentAfter, d.paymentAfter, d.transactionAfter, r);
    const before = parent;
    const payments = parent.payments.filter(p => p.id !== target.paymentId);
    if (d.paymentAfter) payments.push(d.paymentAfter);
    // Payment array order has no accounting meaning. Normalize both persisted and derived images below.
    parent = { ...d.parentAfter, payments };
    check(Number.isFinite(total(d.parentAfter)) && total(d.parentAfter) > 0 && paid(payments) <= total(d.parentAfter), 'Overpayment/invalid contract.');
    if (d.parentBefore.entityType === 'debt') check(equal(d.parentBefore, d.parentAfter), 'Debt terms changed.');
    else {
      check(d.parentAfter.entityType === 'loan');
      const { lifecycle: oldLife, ...oldHeader } = d.parentBefore;
      const { lifecycle: newLife, ...newHeader } = d.parentAfter;
      check(equal(oldHeader, newHeader), 'Unjournaled loan terms/proceeds change.');
      check(oldLife.status !== 'closed' && (r.plan.kind !== 'post' || !['settled', 'completed'].includes(oldLife.status ?? 'active'))
        && (r.plan.kind !== 'edit' || oldLife.status !== 'settled'), 'Terminal loan mutation.');
      let expectedLife = { ...oldLife };
      const settlement = r.plan.kind === 'post' && r.plan.request.entityType === 'loan' && r.plan.request.settlement;
      if (settlement) {
        const p = d.paymentAfter!;
        expectedLife = { ...oldLife, status: 'settled', settlementAmount: p.amount, settlementDate: p.date,
          settlementPaymentId: p.id, ...(p.accountId === undefined ? {} : { settlementAccountId: p.accountId }),
          ...(p.note === undefined ? {} : { settlementNote: p.note }) };
      } else if (r.plan.kind === 'reverse' && oldLife.settlementPaymentId === target.paymentId) {
        expectedLife = { ...oldLife, status: 'active' };
        for (const key of ['settlementAmount', 'settlementDate', 'settlementAccountId', 'settlementPaymentId', 'settlementNote'] as const) delete expectedLife[key];
      } else {
        check(oldLife.status !== 'settled', 'Unrelated settled-loan reversal.');
        expectedLife.status = paid(payments) >= total(d.parentAfter) ? 'completed' : 'active';
      }
      check(equal(expectedLife, newLife), 'Incorrect lifecycle/settlement outcome.');
    }
    const transactionsBefore = new Map(transactions);
    if (target.ledgerTransactionId) transactions.set(target.ledgerTransactionId, d.transactionAfter);
    result.push({ receipt: r, before, after: parent, transactionsBefore, transactionsAfter: new Map(transactions) });
    head = r.revision.after; paymentHeads.set(target.paymentId, r);
  }
  return result;
}

const normalized = (p: ParentAccountingEvidence) => ({ ...p, payments: [...p.payments].sort((a, b) => a.id.localeCompare(b.id)) });
function matches(parent: ParentAccountingEvidence | undefined, expected: ParentAccountingEvidence, txs: ReadonlyMap<string, ExpectedPaymentTransaction | null>, ledger: LedgerData) {
  return !!parent && equal(normalized(parent), normalized(expected)) && [...txs].every(([id, tx]) =>
    equal(ledger.transactions.find(t => t.id === id) ? pick(ledger.transactions.find(t => t.id === id)!, transactionFields) : null, tx));
}
function finding(classification: RecoveryClassification, reason: string, entity?: EntityRef, operationId?: string): RecoveryFinding {
  return { classification, reason, entity, operationId, postingAllowed: false };
}
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

/** Accepts persisted bytes, not hydrated/normalized store state. Never writes. */
export function verifyPersistedPaymentAccounting(raw: Readonly<Record<PaymentPersistenceKey, string | null>>): AccountingRecoveryResult {
  const findings: RecoveryFinding[] = [], globalIssues: string[] = [];
  const result = (installation: AccountingRecoveryResult['installation']): AccountingRecoveryResult => freezeEvidence({ postingAllowed: false, readiness: 'blocked', installation, globalIssues, findings });
  try {
    const f = parseAccounting(raw['tomorrow:finance'], 'finance'), l = parseAccounting(raw['tomorrow:ledger'], 'ledger');
    const journal = readRecoveryJournalDocument(raw['tomorrow:payment-operations']);
    const generation = journal.installation?.generationId;
    if (!generation) {
      check(!f?.paymentJournal && !l?.paymentJournal && !f?.paymentAccounting && !l?.paymentAccounting
        && !f?.creationProvenance && journal.receipts.length === 0 && journal.baselines.length === 0, 'Missing journal installation with managed evidence.');
      for (const kind of ['debt', 'loan'] as const) for (const row of (f?.[kind === 'debt' ? 'debts' : 'loans'] ?? []) as Record<string, unknown>[]) {
        findings.push(finding('needs-review', 'Unmanaged legacy entity; no operation provenance assigned.', { entityType: kind, entityId: row.id as string }));
      }
      return result('legacy');
    }
    check(journal.installation?.phase === 'active' && f && l && object(f.paymentJournal) && object(l.paymentJournal)
      && f.paymentJournal.generationId === generation && l.paymentJournal.generationId === generation, 'Installation generation is missing, interrupted, or conflicting.');
    const finance = f as unknown as FinanceData, ledger = l as unknown as LedgerData;
    const parents = [...finance.debts.map(p => projectParent(p as unknown as Record<string, unknown>, 'debt')), ...finance.loans.map(p => projectParent(p as unknown as Record<string, unknown>, 'loan'))];
    const paymentIds = new Set<string>(), references = new Set<string>();
    for (const p of parents) for (const payment of p.payments) {
      check(!paymentIds.has(payment.id), 'Duplicate payment ownership.'); paymentIds.add(payment.id);
      if (payment.ledgerTransactionId) { check(!references.has(payment.ledgerTransactionId), 'Duplicate transaction ownership.'); references.add(payment.ledgerTransactionId); }
    }
    for (const loan of finance.loans) if (loan.receiptTransactionId) { check(!references.has(loan.receiptTransactionId), 'Loan receipt conflicts with payment ownership.'); references.add(loan.receiptTransactionId); }
    const cashOwners = new Set<string>();
    for (const tx of ledger.transactions) if (tx.linkedPaymentId) {
      check(!cashOwners.has(tx.linkedPaymentId), 'Duplicate Ledger payment ownership.'); cashOwners.add(tx.linkedPaymentId);
    }
    const legacy = journal.receipts.filter((r): r is PaymentOperationReceipt => !('schemaVersion' in r));
    const managed = journal.receipts.filter((r): r is RecoveryOperationReceipt => 'schemaVersion' in r);
    const claims = new Map<string, string>();
    for (const r of journal.receipts) {
      const target = 'schemaVersion' in r ? r.plan.target : { ...r.request, paymentId: r.paymentId, ledgerTransactionId: r.ledgerTransactionId };
      const root = 'schemaVersion' in r && r.plan.kind !== 'post' ? r.plan.originalOperationId : r.operationId;
      const owner = JSON.stringify([root, target.entityType, target.entityId, target.paymentId, target.ledgerTransactionId]);
      for (const id of [target.paymentId, target.ledgerTransactionId].filter((x): x is string => x !== undefined)) {
        check(!claims.has(id) || claims.get(id) === owner, 'Conflicting journal reservation ownership.'); claims.set(id, owner);
      }
    }
    const keys = new Set(managed.map(r => entityKey(r.revision.entity)));
    for (const b of journal.baselines) check(keys.has(entityKey(b.parent)) && b.generationId === generation, 'Orphaned or conflicting baseline.');
    for (const metadata of [finance.paymentAccounting, ledger.paymentAccounting]) for (const row of metadata?.entityHeads ?? []) check(keys.has(entityKey(row.entity)), 'Accounting head has no journal operation.');
    for (const r of legacy) findings.push(finding('needs-review', 'Legacy receipt has no versioned lifecycle/reversal evidence.', { entityType: r.request.entityType, entityId: r.request.entityId }, r.operationId));
    for (const key of keys) {
      const receipts = managed.filter(r => entityKey(r.revision.entity) === key), entity = receipts[0].revision.entity;
      try {
        check(!legacy.some(r => entityKey(r.request) === key), 'Legacy operation uncertainty overlaps this entity.');
        const chain = deriveExpectedAccounting(journal, entity), last = chain[chain.length - 1], r = last.receipt;
        if (chain[0].before.payments.length) findings.push(finding('needs-review', 'Baseline retains historical payments without certifying their operation provenance.', entity));
        const actual = parents.find(p => entityKey(p) === key);
        for (const step of chain) {
          const target = step.receipt.plan.target;
          const owned = parents.flatMap(p => p.payments.map(payment => ({ parent: p, payment }))).filter(x => x.payment.id === target.paymentId);
          check(owned.every(x => entityKey(x.parent) === key), 'Payment belongs to another parent.');
          const collisionIds = [target.paymentId, target.ledgerTransactionId].filter((id): id is string => !!id);
          check(![...finance.debts, ...finance.loans, ...ledger.accounts, ...ledger.categories, ...ledger.transfers].some(row => collisionIds.includes(row.id)), 'Reservation collides with another record.');
          check(!ledger.transactions.some(t => t.id === target.paymentId || (target.ledgerTransactionId !== undefined && t.linkedPaymentId === target.ledgerTransactionId)
            || t.relatedTransactionId === target.paymentId || (target.ledgerTransactionId !== undefined && t.relatedTransactionId === target.ledgerTransactionId)), 'Reservation/refund conflict.');
          check(!parents.some(p => p.payments.some(payment => payment.id !== target.paymentId && (payment.id === target.ledgerTransactionId || payment.ledgerTransactionId === target.ledgerTransactionId && target.ledgerTransactionId !== undefined || payment.ledgerTransactionId === target.paymentId))), 'Conflicting reserved ownership.');
          check(!finance.loans.some(p => collisionIds.includes(p.receiptTransactionId ?? '')), 'Reserved ID is a loan receipt.');
          const txClaimants = ledger.transactions.filter(t => t.linkedPaymentId === target.paymentId || t.id === target.ledgerTransactionId);
          check(txClaimants.every(t => t.id === target.ledgerTransactionId && t.linkedEntityType === entity.entityType && t.linkedEntityId === entity.entityId && t.linkedPaymentId === target.paymentId), 'Conflicting transaction tuple/custom cash.');
          check(txClaimants.length <= (target.ledgerTransactionId ? 1 : 0), 'Duplicate transaction tuple.');
        }
        // Parent-only ownership is ambiguous unless it is an independently verified loan receipt.
        for (const t of ledger.transactions.filter(t => t.linkedEntityId === entity.entityId && (!t.linkedPaymentId || t.linkedEntityType !== entity.entityType))) {
          const loan = finance.loans.find(p => p.id === entity.entityId);
          check(entity.entityType === 'loan' && loan?.receiptTransactionId === t.id && t.type === 'income' && t.amount === loan.receivedAmount && t.date === loan.receivedAt && t.currencyCode === loan.currencyCode && !t.linkedPaymentId && !t.relatedTransactionId && t.entryType !== 'refund' && (!t.purpose || t.purpose === 'normal'), 'Ambiguous parent-only cash ownership.');
        }
        const fHead = finance.paymentAccounting?.entityHeads.find(h => entityKey(h.entity) === key)?.head ?? null;
        const lHead = ledger.paymentAccounting?.entityHeads.find(h => entityKey(h.entity) === key)?.head ?? null;
        for (const h of [fHead, lHead]) check(h === null || chain.some(s => equal(s.receipt.revision.after, h)), 'Unknown accounting revision head.');
        const after = matches(actual, last.after, last.transactionsAfter, ledger);
        const beforeTxs = new Map(last.transactionsBefore);
        if (r.plan.target.ledgerTransactionId && !beforeTxs.has(r.plan.target.ledgerTransactionId)) beforeTxs.set(r.plan.target.ledgerTransactionId, r.plan.delta.transactionBefore);
        const before = matches(actual, last.before, beforeTxs, ledger);
        // Validate current and expected cash accounts/categories without using picker eligibility.
        for (const tx of [...last.transactionsBefore.values(), ...last.transactionsAfter.values()]) if (tx) {
          const account = ledger.accounts.filter(a => a.id === tx.accountId), category = ledger.categories.filter(c => c.id === tx.categoryId);
          check(account.length === 1 && account[0].currencyCode === tx.currencyCode && (entity.entityType !== 'loan' || account[0].type !== 'credit_card') && category.length === 1 && category[0].kind === tx.type, 'Account/category/currency conflict.');
        }
        let classification: RecoveryClassification;
        if (r.state === 'needsReview') classification = 'needs-review';
        else if (r.state === 'completed') {
          check(equal(fHead, r.revision.after) && equal(lHead, r.revision.after), 'Completed operation has missing/mismatched revision heads.');
          if (!after) classification = 'blocked';
          else classification = r.plan.kind === 'reverse' ? 'verified-reversed' : 'verified-current';
        } else if (equal(fHead, r.revision.before) && equal(lHead, r.revision.before) && before) classification = 'prepared-unapplied';
        else if (equal(fHead, r.revision.after) && equal(lHead, r.revision.after) && after) classification = 'prepared-accounting-matches';
        else {
          check([fHead, lHead].every(h => equal(h, r.revision.before) || equal(h, r.revision.after)), 'Prepared operation heads do not match its boundary.');
          classification = 'prepared-partial';
        }
        for (const step of chain.slice(0, -1)) findings.push(finding(classification.startsWith('verified-') ? 'verified-superseded' : 'needs-review', 'Historical transition requires a verified current chain.', entity, step.receipt.operationId));
        findings.push(finding(classification, after ? 'Exact persisted outcome observed.' : 'Accounting differs from the expected current outcome.', entity, r.operationId));
      } catch (e) { for (const r of receipts) findings.push(finding('blocked', message(e), entity, r.operationId)); }
    }
    for (const parent of parents) if (!keys.has(entityKey(parent)) && !legacy.some(r => entityKey(r.request) === entityKey(parent))) findings.push(finding('needs-review', 'Unmanaged historical entity; no operation provenance assigned.', parent));
    return result('consistent');
  } catch (e) { globalIssues.push(message(e)); return result('blocked'); }
}

/** Explicit readiness workflow; never bootstraps, repairs, or enables posting. */
export async function verifyPaymentAccountingRecovery(runtime: PaymentOperationRuntime): Promise<AccountingRecoveryResult> {
  try { return verifyPersistedPaymentAccounting(await runtime.readRecoverySnapshot()); }
  catch (e) { return freezeEvidence({ postingAllowed: false, readiness: 'blocked', installation: 'blocked', globalIssues: [message(e)], findings: [] }); }
}
