'use strict';
/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Only the existing pure V1 schema may be imported. Any runtime, native storage,
// adapter or authority import fails instead of being replaced by a permissive mock.
const imports = [];
function loadSchema(name, dependencies = {}) {
  const filename = path.join(__dirname, '../src/features/finance/types', name + '.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', compiled)(module.exports, module, id => {
    imports.push(id);
    assert.ok(Object.hasOwn(dependencies, id), 'Unexpected schema dependency: ' + id);
    return dependencies[id];
  });
  return module.exports;
}
const provenance = loadSchema('creationProvenance');
const schema = loadSchema('creationOperationEvidence', { './creationProvenance': provenance });
const {
  readCreationOperationEvidenceV1: read,
  readCreationOperationEvidenceSetV1: readSet,
  readCreationOperationEvidenceTransitionV1: transition,
  readCreationOperationEvidenceSetTransitionV1: setTransition,
} = schema;
const clone = value => JSON.parse(JSON.stringify(value));

function evidence(kind = 'debt', state = 'prepared', suffix = '') {
  const entityId = 'entity' + suffix;
  const common = { entityType: kind, id: entityId, currencyCode: 'USD', payments: [],
    createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z' };
  return {
    schemaVersion: 1, operationId: 'operation' + suffix, state,
    attestation: {
      schemaVersion: 1, entity: { entityType: kind, entityId },
      creationId: 'creation' + suffix, generationId: 'generation',
      image: kind === 'debt'
        ? { ...common, direction: 'payable', personName: 'Person', amount: 100, date: '2026-11-06' }
        : { ...common, name: 'Loan', lenderName: 'Lender', principalAmount: 100,
            totalRepaymentAmount: 120, monthlyInstallment: 10, numberOfInstallments: 12,
            firstDueDate: '2026-12-06', status: 'active' },
    },
    ...(state === 'finance-ack-observed'
      ? { financeAck: { storageKey: 'tomorrow:finance', writeId: 'write' + suffix } } : {}),
  };
}
const document = (...entries) => ({ schemaVersion: 1, generationId: 'generation', entries });
function deeplyFrozen(value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(deeplyFrozen);
  }
}


// Snapshot every reachable own-property object separately. Descriptor values
// retain child identities, while each child's primitive values, descriptors and
// integrity flags are captured independently. Never evaluate accessors.
function captureInputGraph(root) {
  const snapshots = new Map();
  const visit = node => {
    if (!node || typeof node !== 'object' || snapshots.has(node)) return;
    const descriptors = Reflect.ownKeys(node).map(key =>
      [key, { ...Object.getOwnPropertyDescriptor(node, key) }]);
    snapshots.set(node, {
      prototype: Object.getPrototypeOf(node),
      descriptors,
      frozen: Object.isFrozen(node),
      sealed: Object.isSealed(node),
      extensible: Object.isExtensible(node),
    });
    for (const [, descriptor] of descriptors) if ('value' in descriptor) visit(descriptor.value);
  };
  visit(root);
  return {
    assertMutable() {
      for (const saved of snapshots.values()) {
        assert.equal(saved.frozen, false);
        assert.equal(saved.sealed, false);
        assert.equal(saved.extensible, true);
      }
    },
    assertUnchanged() {
      for (const [node, saved] of snapshots) {
        assert.strictEqual(Object.getPrototypeOf(node), saved.prototype);
        assert.equal(Object.isFrozen(node), saved.frozen);
        assert.equal(Object.isSealed(node), saved.sealed);
        assert.equal(Object.isExtensible(node), saved.extensible);
        assert.deepEqual(Reflect.ownKeys(node), saved.descriptors.map(([key]) => key));
        for (const [key, descriptor] of saved.descriptors) {
          const actual = Object.getOwnPropertyDescriptor(node, key);
          assert.deepEqual(Object.keys(actual), Object.keys(descriptor));
          for (const field of Object.keys(descriptor)) {
            // Strict identity catches replacement children; primitive snapshots
            // catch changed values even when the parent reference is unchanged.
            assert.strictEqual(actual[field], descriptor[field]);
          }
        }
      }
    },
  };
}

for (const kind of ['debt', 'loan']) for (const state of ['prepared', 'finance-ack-observed']) {
  test(kind + ' ' + state + ' round-trips as immutable data, compatible with V1', () => {
    const input = evidence(kind, state), before = clone(input), parsed = read(input);
    assert.deepEqual(parsed, before);
    assert.deepEqual(provenance.readCreationAttestationV1(parsed.attestation), input.attestation);
    assert.deepEqual(readSet(document(input)), document(input));
    assert.deepEqual(input, before);
    assert.equal(Object.isFrozen(input), false);
    deeplyFrozen(parsed);
    deeplyFrozen(readSet(document(input)));
    assert.notEqual(parsed, input);
    assert.notEqual(parsed.attestation, input.attestation);
    assert.notEqual(parsed.attestation.entity, input.attestation.entity);
    assert.notEqual(parsed.attestation.image.payments, input.attestation.image.payments);
    if (parsed.financeAck) assert.notEqual(parsed.financeAck, input.financeAck);
  });
}

for (const value of [undefined, null, true, 1, 'data', [], () => {}]) {
  test('rejects non-record evidence and sets: ' + String(value), () => {
    assert.throws(() => read(value));
    assert.throws(() => readSet(value));
  });
}

for (const [label, make, parse, keys] of [
  ['entry', () => evidence(), read, ['schemaVersion', 'operationId', 'attestation', 'state']],
  ['ack entry', () => evidence('debt', 'finance-ack-observed'), read,
    ['schemaVersion', 'operationId', 'attestation', 'state', 'financeAck']],
  ['set', () => document(evidence()), readSet, ['schemaVersion', 'generationId', 'entries']],
]) {
  for (const key of keys) test(label + ' rejects missing ' + key, () => {
    const x = make(); delete x[key]; assert.throws(() => parse(x));
  });
  test(label + ' rejects unknown fields and unsupported versions', () => {
    const x = make(); x.authorized = true; assert.throws(() => parse(x)); delete x.authorized;
    for (const version of [0, 2, '1', null, undefined]) {
      x.schemaVersion = version; assert.throws(() => parse(x));
    }
  });
}

for (const key of ['schemaVersion', 'entity', 'creationId', 'generationId', 'image']) {
  test('rejects missing V1 attestation ' + key, () => {
    const x = evidence(); delete x.attestation[key]; assert.throws(() => read(x));
  });
}

for (const value of ['', ' ', ' padded', 'padded ', null, undefined, 1, {}, []]) {
  for (const field of ['operationId', 'creationId', 'entityId', 'generationId', 'set-generation', 'writeId']) {
    test('rejects malformed ' + field + ': ' + JSON.stringify(value), () => {
      const x = evidence('debt', 'finance-ack-observed'), doc = document(x);
      if (field === 'operationId') x.operationId = value;
      if (field === 'creationId' || field === 'generationId') x.attestation[field] = value;
      if (field === 'entityId') x.attestation.entity.entityId = x.attestation.image.id = value;
      if (field === 'set-generation') doc.generationId = value;
      if (field === 'writeId') x.financeAck.writeId = value;
      assert.throws(() => readSet(doc));
    });
  }
}

for (const [name, change] of [
  ['kind', x => { x.attestation.entity.entityType = 'asset'; }],
  ['image kind mismatch', x => { x.attestation.entity.entityType = 'loan'; }],
  ['entity mismatch', x => { x.attestation.image.id = 'other'; }],
  ['image missing', x => { delete x.attestation.image; }],
  ['image unknown field', x => { x.attestation.image.authorized = true; }],
  ['invalid amount', x => { x.attestation.image.amount = 0; }],
  ['amount precision', x => { x.attestation.image.amount = 1.0001; }],
  ['invalid day', x => { x.attestation.image.date = '2026-02-30'; }],
  ['nonempty payments', x => { x.attestation.image.payments.push({ id: 'old' }); }],
  ['mismatched timestamp', x => { x.attestation.image.updatedAt = '2026-11-07T00:00:00.000Z'; }],
  ['attestation version', x => { x.attestation.schemaVersion = 2; }],
  ['unknown attestation field', x => { x.attestation.trusted = true; }],
  ['unknown entity field', x => { x.attestation.entity.extra = true; }],
]) test('rejects malformed or inconsistent ' + name, () => {
  const x = evidence(); change(x); assert.throws(() => read(x));
});

for (const [name, change] of [
  ['terminal loan', x => { x.attestation.image.status = 'completed'; }],
  ['receipt history', x => { x.attestation.image.receivedAmount = 100; }],
  ['invalid installments', x => { x.attestation.image.numberOfInstallments = 1.5; }],
  ['principal exceeds total', x => { x.attestation.image.principalAmount = 121; }],
  ['ambiguous funding', x => {
    x.attestation.image.depositAccountId = 'account'; x.attestation.image.depositMethodLabel = 'Cash';
  }],
]) test('rejects ' + name, () => {
  const x = evidence('loan'); change(x); assert.throws(() => read(x));
});

for (const state of ['completed', 'deleted', 'candidate', '', null, 1, undefined]) {
  test('rejects unsupported state ' + String(state), () => {
    const x = evidence(); x.state = state; assert.throws(() => read(x));
  });
}

test('prepared prohibits ACK evidence; observed ACK requires exact key and write identity', () => {
  const prepared = evidence(); prepared.financeAck = { storageKey: 'tomorrow:finance', writeId: 'w' };
  assert.throws(() => read(prepared));
  for (const modify of [
    x => { delete x.financeAck; },
    x => { delete x.financeAck.storageKey; },
    x => { delete x.financeAck.writeId; },
    x => { x.financeAck.storageKey = 'tomorrow:ledger'; },
    x => { x.financeAck.storageKey = 'tomorrow:payment-operations'; },
    x => { x.financeAck.durable = true; },
    x => { x.financeAck = true; },
    x => { x.financeAck = null; },
  ]) {
    const x = evidence('debt', 'finance-ack-observed'); modify(x); assert.throws(() => read(x));
  }
});

test('single-generation set accepts empty and distinct Debt/Loan reservations', () => {
  assert.deepEqual(readSet(document()), document());
  const doc = document(evidence(), evidence('loan', 'finance-ack-observed', '-loan'));
  assert.deepEqual(readSet(doc), doc);
});

for (const field of ['operation', 'creation', 'entity', 'write']) {
  test('set rejects duplicate ' + field + ' identities', () => {
    const a = evidence('debt', 'finance-ack-observed'), b = evidence('loan', 'finance-ack-observed', '-other');
    if (field === 'operation') b.operationId = a.operationId;
    if (field === 'creation') b.attestation.creationId = a.attestation.creationId;
    if (field === 'entity') b.attestation.entity.entityId = b.attestation.image.id = a.attestation.entity.entityId;
    if (field === 'write') b.financeAck.writeId = a.financeAck.writeId;
    assert.throws(() => readSet(document(a, b)));
  });
}

test('set rejects inconsistent generations, even when all entries agree with each other', () => {
  const doc = document(evidence(), evidence('loan', 'prepared', '-other'));
  doc.entries[1].attestation.generationId = 'other';
  assert.throws(() => readSet(doc));
  doc.entries[0].attestation.generationId = 'other';
  assert.throws(() => readSet(doc));
  doc.generationId = 'other';
  assert.deepEqual(readSet(doc), doc);
});

for (const kind of ['debt', 'loan']) {
  test(kind + ' forward and identical transitions accept data without authorizing it', () => {
    const prepared = evidence(kind), observed = evidence(kind, 'finance-ack-observed');
    assert.deepEqual(transition(prepared, observed), observed);
    assert.deepEqual(transition(prepared, prepared), prepared);
    assert.deepEqual(transition(observed, observed), observed);
    assert.throws(() => transition(observed, prepared));
  });
}

for (const [field, modify] of [
  ['operationId', x => { x.operationId = 'other'; }],
  ['creationId', x => { x.attestation.creationId = 'other'; }],
  ['entityId', x => { x.attestation.entity.entityId = x.attestation.image.id = 'other'; }],
  ['generationId', x => { x.attestation.generationId = 'other'; }],
  ['image amount', x => { x.attestation.image.amount = 101; }],
  ['image description', x => { x.attestation.image.personName = 'Changed'; }],
  ['image timestamp', x => {
    x.attestation.image.createdAt = x.attestation.image.updatedAt = '2026-11-07T00:00:00.000Z';
  }],
  ['optional field presence', x => { x.attestation.image.notes = ''; }],
]) test('transition rejects immutable ' + field + ' changes even in otherwise valid evidence', () => {
  const before = evidence(), next = clone(before); modify(next);
  assert.doesNotThrow(() => read(next));
  assert.throws(() => transition(before, next));
});

test('transition rejects entity kind replacement using a fully valid Loan image', () => {
  assert.throws(() => transition(evidence(), evidence('loan')));
});

test('observed ACK identity is immutable and cannot disappear', () => {
  const before = evidence('debt', 'finance-ack-observed'), next = clone(before);
  next.financeAck.writeId = 'later-write';
  assert.throws(() => transition(before, next));
  delete next.financeAck; assert.throws(() => transition(before, next));
});

test('transition equality ignores property order without normalizing field presence', () => {
  const before = evidence('debt', 'finance-ack-observed'), next = clone(before);
  next.attestation = Object.fromEntries(Object.entries(next.attestation).reverse());
  next.financeAck = Object.fromEntries(Object.entries(next.financeAck).reverse());
  assert.deepEqual(transition(before, next), next);
});

test('set transitions retain all entries, allow reordering, and append only prepared entries', () => {
  const a = evidence(), b = evidence('loan', 'prepared', '-other');
  const before = document(a), after = document(b, evidence('debt', 'finance-ack-observed'));
  assert.deepEqual(setTransition(before, after), after);
  assert.deepEqual(setTransition(after, document(...after.entries.toReversed())), document(...after.entries.toReversed()));
  assert.throws(() => setTransition(before, document()));
  assert.throws(() => setTransition(before, document(a, evidence('loan', 'finance-ack-observed', '-new'))));
});

test('sets reject replacement, changed generation and duplicate replacement entries', () => {
  const before = document(evidence());
  assert.throws(() => setTransition(before, document(evidence('loan', 'prepared', '-replacement'))));
  const renamed = clone(before); renamed.entries[0].operationId = 'replacement';
  assert.throws(() => setTransition(before, renamed));
  const changed = clone(before); changed.generationId = changed.entries[0].attestation.generationId = 'other';
  assert.throws(() => setTransition(before, changed));
  assert.throws(() => setTransition(before, document(evidence(), evidence())));
});

test('retained reservations cannot be dropped then reused, including after conceptual entity deletion', () => {
  const before = document(evidence('debt', 'finance-ack-observed'));
  // No live entity container or tombstone state is invented by this schema.
  // The reservation itself must remain retained after future entity deletion.
  assert.throws(() => setTransition(before, document()));
  const replacement = evidence('loan', 'prepared', '-new');
  replacement.attestation.entity.entityId = replacement.attestation.image.id = 'entity';
  assert.throws(() => setTransition(before, document(...before.entries, replacement)));
  const reusedCreation = evidence('loan', 'prepared', '-new');
  reusedCreation.attestation.creationId = 'creation';
  assert.throws(() => setTransition(before, document(...before.entries, reusedCreation)));
});

for (const kind of ['debt', 'loan']) for (const parser of ['entry', 'set']) {
  for (const mode of ['invalid-ack', 'nested-getter', 'invalid-image', 'nested-array']) {
    test(kind + ' rejected ' + mode + ' leaves the complete ' + parser + ' input graph unchanged', () => {
      const input = evidence(kind, 'finance-ack-observed');
      const parse = parser === 'entry' ? read : readSet;
      const wrap = entry => parser === 'entry' ? entry : document(entry);
      // A valid control differs only at the rejection site introduced below.
      assert.doesNotThrow(() => parse(wrap(input)));
      let invoked = false;
      if (mode === 'invalid-ack') input.financeAck.storageKey = 'tomorrow:ledger';
      if (mode === 'nested-getter') {
        Object.defineProperty(input.financeAck, 'writeId', {
          enumerable: true, configurable: true,
          get() { invoked = true; return 'write'; },
        });
      }
      if (mode === 'invalid-image') {
        if (kind === 'debt') input.attestation.image.amount = -1;
        else input.attestation.image.numberOfInstallments = 1.5;
      }
      if (mode === 'nested-array') {
        input.attestation.image.payments.push({ id: 'historical', amount: 1, date: '2026-11-06' });
      }
      const rejected = wrap(input);
      const before = captureInputGraph(rejected);
      // Includes the entry, attestation, entity, image, ACK, arrays and any
      // payment children; the capture itself must leave the fixture mutable.
      before.assertMutable();
      before.assertUnchanged();
      assert.equal(invoked, false);
      const expected = mode === 'invalid-image' || mode === 'nested-array'
        ? /^Invalid creation provenance evidence\.$/ : /^Invalid creation operation evidence\.$/;
      assert.throws(() => parse(rejected), error => error instanceof Error && expected.test(error.message));
      before.assertUnchanged();
      assert.equal(invoked, false);
    });
  }
}


for (const mode of ['getter', 'nested-getter', 'ack-getter', 'toJSON', 'array-toJSON',
  'function', 'prototype', 'date', 'cycle', 'symbol', 'hidden', 'sparse', 'undefined',
  'nan', 'infinity', 'array-property']) {
  test('rejects unsafe ' + mode + ' without executing hooks or modifying inputs', () => {
    const x = document(evidence('debt', 'finance-ack-observed'));
    let invoked = false;
    const hook = () => { invoked = true; return 'data'; };
    if (mode === 'getter') Object.defineProperty(x, 'entries', { enumerable: true, get: hook });
    if (mode === 'nested-getter') Object.defineProperty(x.entries[0].attestation.image, 'id', { enumerable: true, get: hook });
    if (mode === 'ack-getter') Object.defineProperty(x.entries[0].financeAck, 'writeId', { enumerable: true, get: hook });
    if (mode === 'toJSON') x.toJSON = hook;
    if (mode === 'array-toJSON') x.entries.toJSON = hook;
    if (mode === 'function') x.entries[0].attestation.image.notes = hook;
    if (mode === 'prototype') Object.setPrototypeOf(x.entries[0], { inherited: true });
    if (mode === 'date') x.entries[0].attestation.image.createdAt = new Date();
    if (mode === 'cycle') x.entries.push(x);
    if (mode === 'symbol') x[Symbol('hidden')] = true;
    if (mode === 'hidden') Object.defineProperty(x, 'hidden', { value: true });
    if (mode === 'sparse') x.entries = new Array(1);
    if (mode === 'undefined') x.entries[0].attestation.image.notes = undefined;
    if (mode === 'nan') x.entries[0].attestation.image.amount = NaN;
    if (mode === 'infinity') x.entries[0].attestation.image.amount = Infinity;
    if (mode === 'array-property') x.entries.extra = true;
    const before = captureInputGraph(x);
    before.assertMutable();
    before.assertUnchanged();
    assert.throws(() => readSet(x));
    assert.equal(invoked, false);
    before.assertUnchanged();
  });
}

test('null-prototype plain records are detached and special unknown keys are rejected', () => {
  const x = Object.assign(Object.create(null), evidence());
  assert.deepEqual(read(x), evidence());
  Object.defineProperty(x, '__proto__', { value: {}, enumerable: true });
  assert.throws(() => read(x));
});

test('parsed results and transitions are detached and deeply frozen without freezing callers', () => {
  const before = document(evidence()), next = document(evidence('debt', 'finance-ack-observed'));
  const originalBefore = clone(before), originalNext = clone(next);
  const parsed = setTransition(before, next);
  assert.deepEqual(before, originalBefore); assert.deepEqual(next, originalNext);
  assert.equal(Object.isFrozen(before.entries), false); assert.equal(Object.isFrozen(next.entries[0].financeAck), false);
  deeplyFrozen(parsed);
  next.entries[0].attestation.image.personName = 'Changed';
  next.entries[0].financeAck.writeId = 'later';
  assert.equal(parsed.entries[0].attestation.image.personName, 'Person');
  assert.equal(parsed.entries[0].financeAck.writeId, 'write');
  assert.throws(() => { parsed.entries[0].state = 'prepared'; }, TypeError);
  assert.throws(() => { parsed.entries.push(evidence()); }, TypeError);
  assert.throws(() => { parsed.entries[0].attestation.image.payments.push({}); }, TypeError);
  assert.deepEqual(before, originalBefore);
});

test('only pure validators are exported: no authority, storage, posting or readiness activation', () => {
  assert.deepEqual(imports, ['./creationProvenance']);
  assert.deepEqual(Object.keys(schema).sort(), [
    'readCreationOperationEvidenceV1', 'readCreationOperationEvidenceSetV1',
    'readCreationOperationEvidenceTransitionV1', 'readCreationOperationEvidenceSetTransitionV1',
  ].sort());
  const callerEvidence = evidence('debt', 'finance-ack-observed');
  const parsed = read(callerEvidence);
  // A caller can construct structurally valid ACK evidence. Acceptance only
  // validates data and must never be used as proof of issuance/ACK observation.
  assert.deepEqual(parsed, callerEvidence);
  for (const flag of ['authorized', 'trusted', 'postingAllowed', 'readiness', 'capability', 'durable']) {
    assert.equal(Object.hasOwn(parsed, flag), false);
    const forged = clone(callerEvidence); forged[flag] = true;
    assert.throws(() => read(forged));
  }
});