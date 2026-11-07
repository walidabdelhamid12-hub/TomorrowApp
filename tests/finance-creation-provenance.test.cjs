'use strict';
/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/features/finance/types/creationProvenance.ts');
// The schema has type-only imports: load it without application/runtime initialization.
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const schema = { exports: {} };
new Function('exports', 'module', compiled)(schema.exports, schema);
const { readCreationImageV1: image, readCreationAttestationV1: attestation,
  readCreationProvenanceMetadataV1: metadata, readCreationProvenanceTransitionV1: transition,
  readCreationProvenanceMetadataTransitionV1: metadataTransition } = schema.exports;
const clone = value => JSON.parse(JSON.stringify(value));
function entry(kind = 'debt', disposition = 'candidate') {
  const common = { entityType: kind, id: 'entity', currencyCode: 'USD', payments: [],
    createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' };
  return { disposition, attestation: { schemaVersion: 1, entity: { entityType: kind, entityId: 'entity' },
    creationId: 'creation', generationId: 'generation', image: kind === 'debt'
      ? { ...common, direction: 'payable', personName: 'Person', amount: 100, date: '2026-11-06' }
      : { ...common, name: 'Loan', lenderName: 'Lender', principalAmount: 100, totalRepaymentAmount: 120,
        monthlyInstallment: 10, numberOfInstallments: 12, firstDueDate: '2026-12-06', status: 'active' } } };
}
const document = (...entries) => ({ schemaVersion: 1, entries });

for (const kind of ['debt', 'loan']) test(`${kind} creation evidence round-trips without certification`, () => {
  const input = entry(kind), parsed = metadata(document(input));
  assert.deepEqual(parsed, document(input));
  assert.deepEqual(image(input.attestation.image), input.attestation.image);
  assert.equal(parsed.entries[0].disposition, 'candidate');
  assert.equal(JSON.stringify(parsed).includes('acknowledged'), false);
  assert.equal(JSON.stringify(parsed).includes('postingAllowed'), false);
});
for (const [name, change] of [
  ['schema version', x => { x.schemaVersion = 2; }],
  ['unknown metadata field', x => { x.extra = true; }],
  ['missing entries', x => { delete x.entries; }],
  ['unknown entry field', x => { x.entries[0].extra = true; }],
  ['acknowledgement flag', x => { x.entries[0].attestation.acknowledged = true; }],
  ['attestation version', x => { x.entries[0].attestation.schemaVersion = 2; }],
  ['blank creation ID', x => { x.entries[0].attestation.creationId = ' '; }],
  ['padded generation', x => { x.entries[0].attestation.generationId = ' g'; }],
  ['missing generation', x => { delete x.entries[0].attestation.generationId; }],
  ['entity mismatch', x => { x.entries[0].attestation.entity.entityId = 'other'; }],
  ['type mismatch', x => { x.entries[0].attestation.entity.entityType = 'loan'; }],
  ['unknown entity field', x => { x.entries[0].attestation.entity.extra = true; }],
  ['unknown disposition', x => { x.entries[0].disposition = 'eligible'; }],
]) test(`rejects ${name}`, () => {
  const x = document(entry()); change(x); assert.throws(() => metadata(x));
});
for (const [name, change] of [
  ['payments', x => { x.payments.push({ id: 'old' }); }],
  ['missing payments', x => { delete x.payments; }],
  ['unknown field', x => { x.provenance = true; }],
  ['cross-kind field', x => { x.lenderName = 'Wrong'; }],
  ['zero amount', x => { x.amount = 0; }],
  ['nonfinite amount', x => { x.amount = Infinity; }],
  ['excess precision', x => { x.amount = 1.0001; }],
  ['impossible date', x => { x.date = '2026-02-30'; }],
  ['invalid timestamp', x => { x.createdAt = 'yesterday'; }],
  ['updated image', x => { x.updatedAt = '2026-11-07T00:00:00.000Z'; }],
  ['bad direction', x => { x.direction = 'unknown'; }],
]) test(`debt image rejects ${name}`, () => {
  const x = entry().attestation.image; change(x); assert.throws(() => image(x));
});
for (const [name, change] of [
  ['received history', x => { x.receivedAmount = 100; }],
  ['receipt history', x => { x.receiptTransactionId = 'cash'; }],
  ['settlement history', x => { x.settlementPaymentId = 'paid'; }],
  ['terminal status', x => { x.status = 'completed'; }],
  ['fractional installments', x => { x.numberOfInstallments = 1.5; }],
  ['unsafe installments', x => { x.numberOfInstallments = Number.MAX_SAFE_INTEGER + 1; }],
  ['principal exceeds total', x => { x.principalAmount = 121; }],
  ['invalid first due date', x => { x.firstDueDate = '2026-13-01'; }],
  ['ambiguous funding', x => { x.depositAccountId = 'a'; x.depositMethodLabel = 'Cash'; }],
]) test(`loan image rejects ${name}`, () => {
  const x = entry('loan').attestation.image; change(x); assert.throws(() => image(x));
});
test('loan optional terms and funding retain exact field presence', () => {
  const x = entry('loan').attestation.image; delete x.principalAmount; delete x.totalRepaymentAmount;
  x.depositMethodLabel = 'Cash'; x.notes = '';
  assert.deepEqual(image(x), x);
  x.principalAmount = undefined; assert.throws(() => image(x));
});
for (const [installment, count, total] of [
  [0.1, 3, 0.3], [0.007, 3, 0.021], [0.333, 3, 0.999],
  [0.001, 1001, 1.001], [1.005, 3, 3.015],
]) {
  test(`derived loan total ${installment} x ${count} validates as ${total} without rewriting the image`, () => {
    const x = entry('loan').attestation.image;
    x.monthlyInstallment = installment; x.numberOfInstallments = count;
    x.principalAmount = total; delete x.totalRepaymentAmount;
    const before = clone(x), parsed = image(x);
    assert.deepEqual(parsed, before); assert.deepEqual(x, before);
    assert.equal(Object.hasOwn(parsed, 'totalRepaymentAmount'), false);
    // The rounded derived obligation covers exactly total, but not total + 0.001.
    x.principalAmount = Math.round((total + 0.001) * 1000) / 1000;
    assert.throws(() => image(x));
  });
  test(`explicit loan total ${total} remains accepted and unchanged`, () => {
    const x = entry('loan').attestation.image;
    x.monthlyInstallment = installment; x.numberOfInstallments = count;
    x.principalAmount = total; x.totalRepaymentAmount = total;
    assert.deepEqual(image(x), x);
  });
}
for (const [name, value] of [
  ['zero', 0], ['negative', -0.1], ['NaN', NaN], ['infinite', Infinity],
  ['string', '0.1'], ['over-precision', 0.1001],
]) test(`omitted total does not normalize an invalid ${name} installment`, () => {
  const x = entry('loan').attestation.image;
  delete x.totalRepaymentAmount; delete x.principalAmount;
  x.monthlyInstallment = value; x.numberOfInstallments = 3;
  assert.throws(() => image(x));
});
for (const value of [0, -0.3, NaN, Infinity, '0.3', 0.3001, 0.1 * 3]) {
  test(`explicit invalid total ${String(value)} is rejected rather than rounded`, () => {
    const x = entry('loan').attestation.image;
    x.monthlyInstallment = 0.1; x.numberOfInstallments = 3;
    x.principalAmount = 0.3; x.totalRepaymentAmount = value;
    assert.throws(() => image(x)); assert.equal(x.totalRepaymentAmount, value);
  });
}
test('overflowing omitted total fails closed', () => {
  const x = entry('loan').attestation.image;
  delete x.totalRepaymentAmount; delete x.principalAmount;
  x.monthlyInstallment = 1e300; x.numberOfInstallments = Number.MAX_SAFE_INTEGER;
  assert.throws(() => image(x));
});
for (const collision of ['creation', 'entity']) test(`duplicate ${collision} ownership rejects across generations`, () => {
  const a = entry(), b = entry(); b.attestation.generationId = 'another-generation';
  if (collision === 'creation') { b.attestation.entity.entityId = 'other'; b.attestation.image.id = 'other'; }
  else b.attestation.creationId = 'another-creation';
  assert.throws(() => metadata(document(a, b)));
});
test('entity ownership is a type/ID tuple; creation identities are globally unique in the document', () => {
  const a = entry(), b = entry('loan'); b.attestation.creationId = 'another-creation';
  assert.equal(metadata(document(a, b)).entries.length, 2);
});
for (const mode of ['getter', 'toJSON', 'function', 'prototype', 'cycle', 'symbol', 'hidden', 'sparse', 'array-hook']) {
  test(`rejects executable or unsupported ${mode} without running hooks`, () => {
    const x = document(entry()); let invoked = false;
    const hook = () => { invoked = true; return []; };
    if (mode === 'getter') Object.defineProperty(x, 'entries', { enumerable: true, get: hook });
    if (mode === 'toJSON') x.toJSON = hook;
    if (mode === 'function') x.entries[0].attestation.image.notes = hook;
    if (mode === 'prototype') Object.setPrototypeOf(x, { inherited: true });
    if (mode === 'cycle') x.entries.push(x);
    if (mode === 'symbol') x[Symbol('hidden')] = true;
    if (mode === 'hidden') Object.defineProperty(x, 'hidden', { value: true });
    if (mode === 'sparse') x.entries = new Array(1);
    if (mode === 'array-hook') x.entries.toJSON = hook;
    assert.throws(() => metadata(x)); assert.equal(invoked, false);
  });
}
const states = ['candidate', 'blocked', 'consumed', 'deleted'];
for (const before of states) for (const after of states) test(`disposition ${before} -> ${after}`, () => {
  const a = entry('debt', before), b = entry('debt', after);
  const permitted = before === after || before === 'candidate' || after === 'deleted';
  if (permitted) assert.equal(transition(a, b).disposition, after);
  else assert.throws(() => transition(a, b));
});
for (const field of ['creationId', 'generationId', 'image', 'entity']) test(`transitions reject changed attestation ${field}`, () => {
  const a = entry(), b = entry('debt', 'blocked');
  if (field === 'image') b.attestation.image.amount = 101;
  else if (field === 'entity') { b.attestation.entity.entityId = 'other'; b.attestation.image.id = 'other'; }
  else b.attestation[field] = 'other';
  assert.throws(() => transition(a, b));
});
test('parsing detaches and deeply freezes attestations without freezing caller data', () => {
  const input = entry().attestation, result = attestation(input);
  assert.equal(Object.isFrozen(input), false);
  input.image.amount = 200; assert.equal(result.image.amount, 100);
  for (const value of [result, result.entity, result.image, result.image.payments]) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { result.image.amount = 300; }, TypeError);
  assert.throws(() => { result.image.payments.push({}); }, TypeError);
});
test('attestation equality ignores object property order', () => {
  const a = entry(), b = clone(a); b.attestation = Object.fromEntries(Object.entries(b.attestation).reverse());
  assert.deepEqual(transition(a, b), b);
});
test('metadata transition retains negative evidence and admits only new candidate entries', () => {
  const before = document(entry('debt', 'blocked'));
  assert.throws(() => metadataTransition(before, document()));
  const next = entry('loan'); next.attestation.creationId = 'new';
  assert.equal(metadataTransition(before, document(...before.entries, next)).entries.length, 2);
  next.disposition = 'consumed'; assert.throws(() => metadataTransition(before, document(...before.entries, next)));
  assert.equal(metadataTransition(before, document(entry('debt', 'deleted'))).entries[0].disposition, 'deleted');
});
