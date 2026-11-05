'use strict';
/* global __dirname */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), load = Module._load;
let native, session;
Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: native };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const V = () => require('../src/features/finance/store/paymentAccountingVerification.ts');
const S = () => require('../src/features/finance/types/paymentRecovery.ts');
const F = 'tomorrow:finance', L = 'tomorrow:ledger', J = 'tomorrow:payment-operations';
const clone = v => JSON.parse(JSON.stringify(v));
const day = '2026-11-05', marker = { schemaVersion: 1, generationId: 'g' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const envelope = (state, version = 2) => JSON.stringify({ version, state });
function fixture({ loan = false, custom = false, amount = 25, fee = 0, settlement = false, total = 100 } = {}) {
  const entity = { entityType: loan ? 'loan' : 'debt', entityId: 'parent' };
  const header = loan ? { ...entity, terms: { currencyCode: 'USD', totalRepaymentAmount: total, monthlyInstallment: 10, numberOfInstallments: 10 }, lifecycle: { status: 'active' } }
    : { ...entity, direction: 'payable', amount: total, currencyCode: 'USD' };
  const target = { ...entity, paymentId: 'p', ...(custom ? {} : { ledgerTransactionId: 't' }) };
  const payment = { id: 'p', amount, date: day, ...(loan ? { paymentMode: 'simple', latePaymentFee: fee } : {}),
    ...(custom ? { paymentMethodLabel: 'Outside' } : { accountId: 'a', ledgerTransactionId: 't' }) };
  const tx = custom ? null : { id: 't', type: 'expense', entryType: 'normal', purpose: loan ? 'loan_payment' : 'debt_payment',
    accountId: 'a', categoryId: 'out', amount: amount + fee, currencyCode: 'USD', date: day,
    linkedEntityType: entity.entityType, linkedEntityId: 'parent', linkedPaymentId: 'p' };
  const after = clone(header);
  if (loan) after.lifecycle = settlement ? { status: 'settled', settlementAmount: amount, settlementDate: day,
    settlementPaymentId: 'p', ...(custom ? {} : { settlementAccountId: 'a' }) } : { status: amount === total ? 'completed' : 'active' };
  const request = { ...entity, currencyCode: 'USD', amount, date: day,
    funding: custom ? { kind: 'custom', methodLabel: 'Outside' } : { kind: 'account', accountId: 'a', categoryId: 'out' },
    ...(loan ? { latePaymentFee: fee, settlement } : { direction: 'payable' }) };
  const receipt = { schemaVersion: 2, operationId: 'op', generationId: 'g', baselineId: 'base',
    revision: { entity, before: null, after: { revision: 1, operationId: 'op' } }, state: 'completed',
    plan: { kind: 'post', target, request, delta: { parentBefore: header, parentAfter: after, paymentBefore: null, paymentAfter: payment, transactionBefore: null, transactionAfter: tx } } };
  const journal = { installation: { ...marker, phase: 'active' }, baselines: [{ schemaVersion: 1, baselineId: 'base', generationId: 'g', parent: { ...header, payments: [] } }], receipts: [receipt] };
  const finance = { paymentJournal: marker, paymentAccounting: { schemaVersion: 1, entityHeads: [{ entity, head: receipt.revision.after }] }, assets: [], debts: [], loans: [], cheques: [] };
  const ledger = { paymentJournal: marker, paymentAccounting: clone(finance.paymentAccounting), accounts: [{ id: 'a', name: 'Bank', type: 'bank', currencyCode: 'USD', archived: false, initialBalance: 1000 }],
    categories: [{ id: 'out', name: 'Other', kind: 'expense' }], transactions: tx ? [clone(tx)] : [], transfers: [] };
  const x = { entity, header, after, payment, tx, receipt, journal, finance, ledger };
  setParent(x, { ...after, payments: [clone(payment)] });
  return x;
}
function setParent(x, p) {
  const { entityType, entityId, ...rest } = clone(p);
  const row = entityType === 'loan' ? { id: entityId, ...rest.terms, ...rest.lifecycle,
    ...Object.fromEntries(Object.entries(rest).filter(([k]) => !['terms', 'lifecycle'].includes(k))) } : { id: entityId, ...rest };
  x.finance[entityType === 'loan' ? 'loans' : 'debts'] = [row];
}
function raw(x) { return { [F]: envelope(x.finance), [L]: envelope(x.ledger), [J]: envelope(x.journal, 3) }; }
const verify = x => V().verifyPersistedPaymentAccounting(raw(x));
const last = result => result.findings.at(-1)?.classification;
const verified = result => result.findings.some(f => f.classification.startsWith('verified-'));
function assertClosed(result) { assert.equal(result.postingAllowed, false); assert.equal(result.readiness, 'blocked'); result.findings.forEach(f => assert.equal(f.postingAllowed, false)); }

for (const [name, options] of [['debt', {}], ['ordinary loan', { loan: true }], ['final loan', { loan: true, amount: 100 }],
  ['loan with fee', { loan: true, fee: 4 }], ['settlement', { loan: true, amount: 65, settlement: true }], ['custom loan', { loan: true, custom: true, fee: 3 }],
  ['custom settlement', { loan: true, custom: true, settlement: true }]]) {
  test(`V3 verifies completed ${name} without mutation`, () => {
    const x = fixture(options), before = JSON.stringify(x);
    const result = verify(x); assert.equal(last(result), 'verified-current', JSON.stringify(result)); assertClosed(result);
    assert.deepEqual(verify(x), result); assert.equal(JSON.stringify(x), before);
  });
}
test('receivable debt validates income/category direction', () => {
  const x = fixture(); x.header.direction = x.after.direction = x.receipt.plan.request.direction = 'receivable';
  x.receipt.plan.delta.parentBefore.direction = x.receipt.plan.delta.parentAfter.direction = 'receivable';
  x.journal.baselines[0].parent.direction = x.finance.debts[0].direction = 'receivable';
  x.tx.type = x.ledger.transactions[0].type = 'income'; x.tx.purpose = x.ledger.transactions[0].purpose = 'debt_collection'; x.ledger.categories[0].kind = 'income';
  assert.equal(last(verify(x)), 'verified-current');
});
for (const [name, mutate] of [
  ['missing Finance payment', x => { x.finance.debts[0].payments = []; }],
  ['missing Ledger transaction', x => { x.ledger.transactions = []; }],
  ['wrong account', x => { x.ledger.transactions[0].accountId = 'wrong'; }],
  ['wrong category', x => { x.ledger.transactions[0].categoryId = 'wrong'; }],
  ['wrong amount', x => { x.ledger.transactions[0].amount++; }],
  ['wrong date', x => { x.ledger.transactions[0].date = '2026-11-04'; }],
  ['wrong currency', x => { x.ledger.transactions[0].currencyCode = 'EUR'; }],
  ['wrong direction', x => { x.ledger.transactions[0].type = 'income'; }],
  ['edited payment', x => { x.finance.debts[0].payments[0].amount++; }],
  ['duplicate payment', x => { x.finance.debts[0].payments.push(clone(x.payment)); }],
  ['duplicate transaction', x => { x.ledger.transactions.push(clone(x.tx)); }],
  ['conflicting tuple', x => { x.ledger.transactions.push({ ...x.tx, id: 'other' }); }],
  ['missing Finance head', x => { delete x.finance.paymentAccounting; }],
  ['missing Ledger head', x => { delete x.ledger.paymentAccounting; }],
  ['unknown head', x => { x.finance.paymentAccounting.entityHeads[0].head.operationId = 'unknown'; }],
  ['refund reference', x => { x.ledger.transactions.push({ ...x.tx, id: 'refund', entryType: 'refund', relatedTransactionId: 't', linkedPaymentId: 'other' }); }],
  ['cross-parent payment', x => { x.finance.debts.push({ ...clone(x.finance.debts[0]), id: 'other' }); }],
]) test(`recovery blocks ${name}`, () => { const x = fixture(); mutate(x); const r = verify(x); assert.equal(verified(r), false, JSON.stringify(r)); assertClosed(r); });

for (const [name, mutate] of [
  ['fee mismatch', x => { x.finance.loans[0].payments[0].latePaymentFee++; }],
  ['status mismatch', x => { x.finance.loans[0].status = 'completed'; }],
  ['settlement metadata mismatch', x => { x.finance.loans[0].settlementPaymentId = 'other'; }],
  ['terms edited', x => { x.finance.loans[0].totalRepaymentAmount++; }],
]) test(`loan recovery blocks ${name}`, () => { const x = fixture({ loan: true, fee: 2, settlement: name.startsWith('settlement') }); mutate(x); assert.equal(verified(verify(x)), false); });
test('custom payment rejects explicitly owned unintended cash', () => {
  const x = fixture({ loan: true, custom: true });
  x.ledger.transactions = [fixture({ loan: true }).tx]; assert.equal(verified(verify(x)), false);
});

for (const boundary of ['journal-only', 'payment', 'transaction', 'finance-head', 'ledger-head', 'full-accounting']) {
  test(`prepared posting at ${boundary} stays unresolved`, () => {
    const x = fixture(); x.receipt.state = 'prepared';
    if (boundary !== 'full-accounting') {
      delete x.finance.paymentAccounting; delete x.ledger.paymentAccounting;
      if (boundary === 'journal-only') x.finance.debts[0].payments = [];
      else delete x.finance.debts[0].payments[0].ledgerTransactionId;
      if (['journal-only', 'payment'].includes(boundary)) x.ledger.transactions = [];
      if (['finance-head', 'ledger-head'].includes(boundary)) x[boundary === 'finance-head' ? 'finance' : 'ledger'].paymentAccounting = { schemaVersion: 1, entityHeads: [{ entity: x.entity, head: x.receipt.revision.after }] };
    }
    const r = verify(x); assert.equal(last(r), boundary === 'journal-only' ? 'prepared-unapplied' : boundary === 'full-accounting' ? 'prepared-accounting-matches' : 'prepared-partial', JSON.stringify(r)); assertClosed(r);
  });
}
function successor(x, kind) {
  const previous = x.journal.receipts.at(-1), original = x.journal.receipts[0];
  const d = clone(previous.plan.delta), beforePayment = d.paymentAfter, beforeTx = d.transactionAfter;
  const nextPayment = kind === 'reverse' ? null : { ...beforePayment, amount: 30 };
  const nextTx = kind === 'reverse' ? null : beforeTx && { ...beforeTx, amount: 30 + (nextPayment.latePaymentFee ?? 0) };
  let parentAfter = clone(d.parentAfter);
  if (kind === 'reverse' && x.entity.entityType === 'loan') parentAfter.lifecycle = { status: 'active' };
  const r = { schemaVersion: 2, operationId: `${kind}-${x.journal.receipts.length}`, generationId: 'g', baselineId: 'base', state: 'completed',
    revision: { entity: x.entity, before: previous.revision.after, after: { revision: previous.revision.after.revision + 1, operationId: `${kind}-${x.journal.receipts.length}` } },
    plan: { kind, target: clone(original.plan.target), originalOperationId: original.operationId, predecessorOperationId: previous.operationId,
      delta: { parentBefore: d.parentAfter, parentAfter, paymentBefore: beforePayment, paymentAfter: nextPayment, transactionBefore: beforeTx, transactionAfter: nextTx } } };
  x.journal.receipts.push(r); setParent(x, { ...parentAfter, payments: nextPayment ? [nextPayment] : [] });
  x.ledger.transactions = nextTx ? [clone(nextTx)] : [];
  for (const store of [x.finance, x.ledger]) store.paymentAccounting.entityHeads[0].head = clone(r.revision.after);
  return r;
}
for (const kind of ['post', 'edit', 'reverse']) test(`completed ${kind} with correct heads and incorrect accounting is blocked`, () => {
  const x = fixture({ loan: true });
  const r = kind === 'post' ? x.receipt : successor(x, kind);
  assert.equal(r.state, 'completed');
  for (const state of [x.finance, x.ledger]) assert.deepEqual(state.paymentAccounting.entityHeads[0].head, r.revision.after);
  // Keep valid ownership and schema so this reaches the accounting-image comparison.
  if (kind === 'reverse') x.finance.loans[0].status = 'completed';
  else x.finance.loans[0].payments[0].amount++;
  const result = verify(x);
  assert.equal(result.installation, 'consistent');
  assert.equal(result.findings.find(f => f.operationId === r.operationId).classification, 'blocked');
  assertClosed(result);
});
test('explicit review state retains needs-review with otherwise matching accounting', () => {
  const x = fixture(); x.receipt.state = 'needsReview';
  assert.equal(last(verify(x)), 'needs-review');
});
for (const custom of [false, true]) test(`explicit edit/reversal fixture chain verifies, custom=${custom}`, () => {
  const x = fixture({ loan: true, custom }); successor(x, 'edit'); successor(x, 'edit');
  let r = verify(x); assert.deepEqual(r.findings.map(f => f.classification), ['verified-superseded', 'verified-superseded', 'verified-current']);
  successor(x, 'reverse'); r = verify(x); assert.equal(last(r), 'verified-reversed', JSON.stringify(r));
  assert.equal(r.findings.slice(0, -1).every(f => f.classification === 'verified-superseded'), true);
});
test('settlement reversal verifies reopened lifecycle and retained tombstone', () => {
  const x = fixture({ loan: true, settlement: true }); successor(x, 'reverse'); assert.equal(last(verify(x)), 'verified-reversed');
  x.journal.receipts.at(-1).state = 'prepared'; assert.equal(last(verify(x)), 'prepared-accounting-matches');
});
test('later final repayment supersedes earlier lifecycle without changing its receipt', () => {
  const x = fixture({ loan: true }), original = JSON.stringify(x.receipt);
  const next = clone(x.receipt); next.operationId = 'final'; next.revision = { entity: x.entity, before: x.receipt.revision.after, after: { revision: 2, operationId: 'final' } };
  next.plan.target.paymentId = 'p2'; next.plan.target.ledgerTransactionId = 't2'; next.plan.request.amount = 75;
  next.plan.delta.parentBefore = clone(x.after); next.plan.delta.parentAfter.lifecycle.status = 'completed';
  next.plan.delta.paymentAfter = { ...next.plan.delta.paymentAfter, id: 'p2', amount: 75, ledgerTransactionId: 't2' };
  next.plan.delta.transactionAfter = { ...next.plan.delta.transactionAfter, id: 't2', linkedPaymentId: 'p2', amount: 75 };
  x.journal.receipts.push(next); x.finance.loans[0].payments.push(clone(next.plan.delta.paymentAfter)); x.finance.loans[0].status = 'completed';
  x.ledger.transactions.push(clone(next.plan.delta.transactionAfter));
  for (const state of [x.finance, x.ledger]) state.paymentAccounting.entityHeads[0].head = next.revision.after;
  const result = verify(x); assert.deepEqual(result.findings.map(f => f.classification), ['verified-superseded', 'verified-current'], JSON.stringify(result));
  assert.equal(JSON.stringify(x.receipt), original);
});
for (const boundary of ['before', 'ledger-removed', 'payment-removed', 'lifecycle-only', 'full-accounting']) test(`prepared settlement reversal ${boundary} never verifies absence as success`, () => {
  const x = fixture({ loan: true, settlement: true }), r = successor(x, 'reverse'); r.state = 'prepared';
  if (boundary !== 'full-accounting') {
    for (const state of [x.finance, x.ledger]) state.paymentAccounting.entityHeads[0].head = clone(r.revision.before);
    setParent(x, { ...r.plan.delta.parentBefore, payments: [r.plan.delta.paymentBefore] });
    x.ledger.transactions = [clone(r.plan.delta.transactionBefore)];
    if (boundary === 'ledger-removed') { x.ledger.transactions = []; x.ledger.paymentAccounting.entityHeads[0].head = clone(r.revision.after); }
    if (boundary === 'payment-removed') x.finance.loans[0].payments = [];
    if (boundary === 'lifecycle-only') x.finance.loans[0].status = 'active';
  }
  const result = verify(x); assert.equal(verified(result), false);
  assert.equal(last(result), boundary === 'before' ? 'prepared-unapplied' : boundary === 'full-accounting' ? 'prepared-accounting-matches' : 'prepared-partial', JSON.stringify(result));
});
test('custom repayment coexists with an independently linked loan receipt and ordinary cash', () => {
  const x = fixture({ loan: true, custom: true });
  for (const h of [x.header, x.after, x.receipt.plan.delta.parentBefore, x.receipt.plan.delta.parentAfter, x.journal.baselines[0].parent]) {
    h.receivedAt = day; h.receiptTransactionId = 'receipt'; h.terms.receivedAmount = 100;
  }
  x.finance.loans[0].receivedAt = day; x.finance.loans[0].receiptTransactionId = 'receipt'; x.finance.loans[0].receivedAmount = 100;
  x.ledger.categories.push({ id: 'in', kind: 'income' });
  x.ledger.transactions = [{ id: 'receipt', type: 'income', amount: 100, accountId: 'a', categoryId: 'in', currencyCode: 'USD', date: day, linkedEntityType: 'loan', linkedEntityId: 'parent' },
    { id: 'ordinary', type: 'expense', amount: 20, accountId: 'a', categoryId: 'out', currencyCode: 'USD', date: day }];
  assert.equal(last(verify(x)), 'verified-current');
});
test('incorrect immutable lifecycle or cash delta never becomes self-justifying evidence', () => {
  for (const mode of ['lifecycle', 'cash', 'fee', 'split', 'funding']) {
    const x = fixture({ loan: true });
    if (mode === 'lifecycle') { x.receipt.plan.delta.parentAfter.lifecycle.status = 'completed'; x.finance.loans[0].status = 'completed'; }
    if (mode === 'cash') { x.tx.amount++; x.ledger.transactions[0].amount++; }
    if (mode === 'fee') { x.payment.latePaymentFee++; x.finance.loans[0].payments[0].latePaymentFee++; }
    if (mode === 'split') { x.payment.paymentMode = 'split'; x.finance.loans[0].payments[0].paymentMode = 'split'; }
    if (mode === 'funding') x.receipt.plan.request.funding.accountId = 'other';
    assert.equal(verified(verify(x)), false, mode);
  }
});
test('interrupted edit is partial and never supersedes verified history', () => {
  const x = fixture(); const r = successor(x, 'edit'); r.state = 'prepared'; x.ledger.transactions = [clone(r.plan.delta.transactionBefore)];
  const result = verify(x); assert.equal(last(result), 'prepared-partial'); assert.equal(verified(result), false);
});
for (const [name, mutate] of [
  ['generation', x => { x.ledger.paymentJournal = { ...marker, generationId: 'other' }; }],
  ['revision gap', x => { x.receipt.revision.after.revision = 2; }],
  ['missing baseline', x => { x.journal.baselines = []; }],
  ['unknown head operation', x => { x.finance.paymentAccounting.entityHeads[0].head.operationId = 'missing'; }],
  ['wrong request fee', x => { x.receipt.plan.request.latePaymentFee = 8; }],
  ['malformed baseline', x => { x.journal.baselines[0].parent.payments = null; }],
  ['unknown schema field', x => { x.receipt.extra = true; }],
  ['future receipt', x => { x.receipt.schemaVersion = 9; }],
]) test(`strict evidence blocks ${name}`, () => { const x = fixture({ loan: true }); mutate(x); assert.equal(verified(verify(x)), false); });
test('broken edit identity and unresolved predecessor are blocked', () => {
  for (const field of ['originalOperationId', 'predecessorOperationId']) { const x = fixture(); successor(x, 'edit').plan[field] = 'wrong'; assert.equal(verified(verify(x)), false); }
  const x = fixture(); successor(x, 'edit'); x.receipt.state = 'prepared'; assert.equal(verified(verify(x)), false);
});
test('legacy receipts remain unchanged and entity uncertainty is scoped', () => {
  const x = fixture(); const old = { operationId: 'old', request: { ...x.receipt.plan.request, entityId: 'legacy' }, paymentId: 'old-p', ledgerTransactionId: 'old-t', status: 'completed', outcome: { paymentId: 'old-p', ledgerTransactionId: 'old-t' } };
  x.journal.receipts.push(old); const bytes = JSON.stringify(x);
  const result = verify(x); assert.equal(result.installation, 'consistent'); assert.equal(result.findings.find(f => f.operationId === 'old').classification, 'needs-review');
  assert.equal(result.findings.find(f => f.operationId === 'op').classification, 'verified-current'); assert.equal(JSON.stringify(x), bytes);
});
test('V1/V2 readers preserve old receipts, reversed absence never verifies', () => {
  const x = fixture();
  const old = { operationId: 'old', request: x.receipt.plan.request, paymentId: 'p', ledgerTransactionId: 't', status: 'reversed', outcome: { paymentId: 'p', ledgerTransactionId: 't' } };
  const v1 = envelope({ receipts: [old] }, 1); assert.deepEqual(V().readRecoveryJournalDocument(v1).receipts, [old]);
  delete x.finance.paymentAccounting; delete x.ledger.paymentAccounting; x.finance.debts[0].payments = []; x.ledger.transactions = [];
  const bytes = raw(x); bytes[J] = envelope({ installation: x.journal.installation, receipts: [old] });
  assert.equal(last(V().verifyPersistedPaymentAccounting(bytes)), 'needs-review');
});
test('unmanaged historical payments are not assigned operation provenance', () => {
  const x = fixture(); x.finance.debts.push({ id: 'historical', direction: 'payable', amount: 100, currencyCode: 'USD', payments: [{ id: 'historic-payment', amount: 10, date: day }] });
  const result = verify(x); assert.equal(result.installation, 'consistent'); assert.equal(result.findings.find(f => f.entity?.entityId === 'historical').classification, 'needs-review'); assertClosed(result);
});
test('unsupported/malformed documents and deleted journal block globally', () => {
  for (const value of ['no-json', envelope({}, 99), envelope({ receipts: [] }, 3), null]) {
    const bytes = raw(fixture()); bytes[J] = value; const result = V().verifyPersistedPaymentAccounting(bytes); assert.equal(result.installation, 'blocked'); assertClosed(result);
  }
});

async function actual(x = fixture(), configure) {
  if (session) await session.runtime.close();
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.join(root, 'src', 'features', 'finance'))) delete require.cache[file];
  const data = new Map(Object.entries(raw(x))), events = [];
  native = { data, events, getItem: async k => { events.push(['get', k]); return data.get(k) ?? null; },
    setItem: async (k, v) => { events.push(['set', k]); data.set(k, v); }, removeItem: async k => { events.push(['remove', k]); data.delete(k); } };
  configure?.(native);
  const mod = require('../src/features/finance/store/paymentOperationRuntime.ts'), runtime = mod.createPaymentOperationRuntime(native);
  mod.installPaymentRuntimeBeforeStores(runtime);
  const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
  const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
  session = { runtime, finance, ledger, native };
  await Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  return session;
}
afterEach(async () => { if (session) await session.runtime.close(); session = undefined; });
test('actual bound stores verify V3 repeatedly with zero writes or journal hydration', async () => {
  const s = await actual(), bytes = [...native.data];
  for (let i = 0; i < 3; i++) { const result = await V().verifyPaymentAccountingRecovery(s.runtime); assert.equal(last(result), 'verified-current', JSON.stringify(result)); assertClosed(result); }
  assert.deepEqual([...native.data], bytes); assert.equal(native.events.some(e => e[0] !== 'get'), false);
  assert.equal(s.runtime.journal.getStatus().phase, 'unhydrated');
  assert.deepEqual(s.finance.getState().paymentAccounting, JSON.parse(native.data.get(F)).state.paymentAccounting);
});
for (const mode of ['external', 'domain', 'hydrate', 'adapter', 'options-storage', 'journal', 'clear', 'configuration']) test(`snapshot rejects ${mode} interference before writes`, async () => {
  const s = await actual(), gate = deferred(), entered = deferred(), get = native.getItem;
  native.getItem = async key => { if (key === F) { entered.resolve(); await gate.promise; } return get(key); };
  const checking = V().verifyPaymentAccountingRecovery(s.runtime); await entered.promise;
  const before = s.finance.getState();
  if (mode === 'external') assert.throws(() => s.finance.setState({ debts: [] }), /excludes/);
  if (mode === 'domain') assert.throws(() => s.finance.getState().clearAssets(), /excludes/);
  if (mode === 'hydrate') assert.throws(() => s.finance.persist.rehydrate(), /excludes/);
  if (mode === 'adapter') assert.throws(() => s.runtime.persistence.storage.setItem(F, '{}'), /excludes/);
  if (mode === 'options-storage') assert.throws(() => s.finance.persist.getOptions().storage.setItem(F, {}), /excludes/);
  if (mode === 'journal') await assert.rejects(s.runtime.journal.hydrate(), /excludes/);
  if (mode === 'clear') assert.throws(() => s.finance.persist.clearStorage(), /excludes/);
  if (mode === 'configuration') assert.throws(() => s.finance.persist.setOptions({ name: 'other' }), /excludes/);
  assert.equal(s.finance.getState(), before); gate.resolve(); const result = await checking;
  assert.equal(result.installation, 'blocked'); assert.equal(native.events.some(e => e[0] !== 'get'), false);
  assert.equal(s.runtime.getStatus().failures.length, 0, 'admission rejection must not poison persistence');
});
test('snapshot drains pending accounting acknowledgements before persisted reads', async () => {
  const s = await actual(), gate = deferred(), set = native.setItem;
  native.setItem = async (k, v) => { await gate.promise; await set(k, v); };
  s.finance.setState({ assets: [] });
  const reads = native.events.filter(e => e[0] === 'get').length;
  let done = false; const checking = V().verifyPaymentAccountingRecovery(s.runtime).then(r => { done = true; return r; });
  await tick(); assert.equal(done, false); assert.equal(native.events.filter(e => e[0] === 'get').length, reads);
  gate.resolve(); assert.equal(last(await checking), 'verified-current');
});
for (const waitingFor of ['hydration', 'persistence']) {
  for (const conflict of [false, true]) test(`snapshot acquisition drains ordinary mutation during ${waitingFor}, generation conflict=${conflict}`, async () => {
    const s = await actual(), firstGate = deferred(), firstEntered = deferred(), mutationGate = deferred(), mutationEntered = deferred();
    const get = native.getItem, set = native.setItem;
    native.getItem = async key => {
      if (waitingFor === 'hydration' && key === F) { firstEntered.resolve(); await firstGate.promise; }
      return get(key);
    };
    native.setItem = async (key, value) => {
      if (waitingFor === 'persistence' && key === F) { firstEntered.resolve(); await firstGate.promise; }
      if (key === L) { mutationEntered.resolve(); await mutationGate.promise; }
      return set(key, value);
    };
    let hydrating, snapshot;
    try {
      if (waitingFor === 'hydration') hydrating = s.finance.persist.rehydrate();
      else s.finance.getState().clearAssets();
      await firstEntered.promise;
      let settled = false;
      snapshot = s.runtime.readRecoverySnapshot().then(bytes => { settled = true; return bytes; });
      await tick(); assert.equal(settled, false);
      // Ordinary domain mutation is accepted while acquisition drains earlier work.
      s.ledger.getState().updateAccount('a', { name: 'Changed during acquisition' });
      if (conflict) s.ledger.setState({ paymentJournal: { ...marker, generationId: 'other' } });
      await mutationEntered.promise;
      assert.equal(s.ledger.getState().accounts[0].name, 'Changed during acquisition');
      assert.notEqual(JSON.parse(native.data.get(L)).state.accounts[0].name, 'Changed during acquisition');
      firstGate.resolve(); await hydrating; await tick();
      assert.equal(settled, false, 'snapshot must await the accepted mutation acknowledgement');
      mutationGate.resolve();
      const bytes = await snapshot;
      for (const key of [F, L, J]) assert.equal(bytes[key], native.data.get(key));
      assert.equal(JSON.parse(bytes[L]).state.accounts[0].name, 'Changed during acquisition');
      const result = V().verifyPersistedPaymentAccounting(bytes);
      if (conflict) {
        assert.equal(result.installation, 'blocked');
        assert.equal(verified(result), false);
        assert.match(result.globalIssues.join(' '), /generation/i);
      } else {
        for (const key of [F, L]) assert.equal(JSON.parse(bytes[key]).state.paymentJournal.generationId, 'g');
        assert.equal(JSON.parse(bytes[J]).state.installation.generationId, 'g');
        assert.equal(last(result), 'verified-current');
      }
      assertClosed(result);
    } finally {
      firstGate.resolve(); mutationGate.resolve();
      await Promise.allSettled([hydrating, snapshot]);
    }
  });
}
test('explicit installation workflow requires the matching bound runtime', async () => {
  const s = await actual();
  const { createPaymentInstallationRecovery } = require('../src/features/finance/store/paymentOperationRecovery.ts');
  const options = { journal: s.runtime.journal, finance: { readPersisted: () => native.getItem(F), acknowledgeMarker: async () => { throw new Error('must not write'); } },
    ledger: { readPersisted: () => native.getItem(L), acknowledgeMarker: async () => { throw new Error('must not write'); } }, createGenerationId: () => 'unused', sharedPersistenceReady: () => true };
  assert.equal((await createPaymentInstallationRecovery(options).verifyAccounting()).installation, 'blocked');
  const result = await createPaymentInstallationRecovery({ ...options, accountingRuntime: s.runtime }).verifyAccounting();
  assert.equal(last(result), 'verified-current'); assertClosed(result); assert.equal(native.events.some(e => e[0] !== 'get'), false);
});
test('exposed roots, nested records, frozen input children and initial state resist mutation', async () => {
  const s = await actual(); const state = s.finance.getState();
  assert.throws(() => { state.debts = []; }, TypeError);
  assert.throws(() => { state.debts[0].payments[0].amount = 999; }, TypeError);
  assert.throws(() => s.ledger.getState().transactions.push({}), TypeError);
  assert.throws(() => { s.finance.getInitialState().assets.push({}); }, TypeError);
  const shallow = Object.freeze({ debts: [{ id: 'frozen', payments: [] }] });
  s.finance.setState(shallow); await s.runtime.persistence.flush(F);
  assert.throws(() => shallow.debts.push({}), TypeError);
});
test('subscriber mutation interference invalidates a reentrant snapshot', async () => {
  const s = await actual(), entered = deferred(), gate = deferred(), get = native.getItem;
  let checking;
  const off = s.finance.subscribe(() => { checking = V().verifyPaymentAccountingRecovery(s.runtime); });
  s.finance.setState({ assets: [] }); off();
  native.getItem = async key => { if (key === F) { entered.resolve(); await gate.promise; } return get(key); };
  await entered.promise; assert.throws(() => s.ledger.setState({ transfers: [] }), /excludes/); gate.resolve();
  assert.equal((await checking).installation, 'blocked');
});
test('snapshot drains active hydration and rejects new hydration admission', async () => {
  const s = await actual(), entered = deferred(), gate = deferred(), get = native.getItem;
  native.getItem = async key => { if (key === F) { entered.resolve(); await gate.promise; } return get(key); };
  const hydrating = s.finance.persist.rehydrate(); await entered.promise;
  const checking = V().verifyPaymentAccountingRecovery(s.runtime); await tick();
  assert.throws(() => s.ledger.persist.rehydrate(), /excludes/); gate.resolve(); await hydrating;
  assert.equal((await checking).installation, 'blocked');
});
test('storage read failure, inconsistent readbacks, and acknowledgement uncertainty fail closed', async () => {
  for (const mode of ['read', 'change', 'ack']) {
    const s = await actual();
    if (mode === 'read') native.getItem = async () => { throw new Error('read failed'); };
    if (mode === 'change') { let reads = 0; const get = native.getItem; native.getItem = async key => { const value = await get(key); return key === F && ++reads > 1 ? value + ' ' : value; }; }
    if (mode === 'ack') { const set = native.setItem; native.setItem = async (k, v) => { await set(k, v); throw new Error('lost ack'); }; s.finance.setState({ assets: [] }); await assert.rejects(s.runtime.persistence.flush(F)); }
    const result = await V().verifyPaymentAccountingRecovery(s.runtime); assert.equal(result.installation, 'blocked', mode); assertClosed(result);
  }
});
test('pure schema parser rejects unknown and duplicate metadata without filtering', () => {
  assert.throws(() => S().readPaymentAccountingMetadata({ schemaVersion: 2, entityHeads: [] }));
  const x = fixture(); x.finance.paymentAccounting.entityHeads.push(clone(x.finance.paymentAccounting.entityHeads[0]));
  assert.equal(verify(x).installation, 'blocked');
});
