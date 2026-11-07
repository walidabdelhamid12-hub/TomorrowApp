/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = Module._load;
const defaultCalls = [];
const nativeAdapter = { getItem: async key => { defaultCalls.push(['get', key]); return null; }, setItem: async (...args) => { defaultCalls.push(['set', ...args]); } };
Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return nativeAdapter;
  // Zustand vanilla is real; only the native device adapter is replaced.
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { createInstallmentsStorage, installmentsStorage, INSTALLMENTS_STORAGE_KEY, INSTALLMENTS_SCHEMA_VERSION } = require('../src/features/finance/store/installmentsStorage.ts');
const stamp = '2028-01-01T00:00:00.000Z';
const draft = (id = 'a') => ({ name: 'Contract ' + id, contract: { id, currencyCode: 'OMR', totalAmount: '10.005',
  accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' },
  schedule: [{ id: 'down', contractId: id, kind: 'down_payment', amount: '0.001', dueDate: '2028-01-01' },
    { id: 'r1', contractId: id, kind: 'regular', amount: '10.004', dueDate: '2028-02-01' }] } });
const record = (id = 'a') => ({ ...draft(id), createdAt: stamp, updatedAt: stamp });
const envelope = contracts => JSON.stringify({ state: { contracts }, version: 1 });
function backend(initial = null) {
  return { raw: initial, calls: [],
    async getItem(key) { this.calls.push(['get', key]); return this.raw; },
    async setItem(key, raw) { this.calls.push(['set', key, raw]); this.raw = raw; },
  };
}
const sets = storage => storage.calls.filter(call => call[0] === 'set');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const make = storage => createInstallmentsStorage(storage, () => stamp);
function blocked(store, code) {
  assert.equal(store.getState().hydration, 'blocked');
  assert.equal(store.getState().error.code, code);
  assert.equal(store.getState().postingAllowed, false);
  assert.equal(store.getState().readiness, 'blocked');
}

test('module import and store construction perform no I/O and expose no setState', () => {
  assert.deepEqual(defaultCalls, []);
  const b = backend(); const s = make(b);
  assert.deepEqual(b.calls, []);
  assert.equal(s.setState, undefined);
  assert.equal(s.getState().hydration, 'idle');
  assert.equal(installmentsStorage.getState().postingAllowed, false);
  assert.equal(INSTALLMENTS_STORAGE_KEY, 'tomorrow:installments');
  assert.equal(INSTALLMENTS_SCHEMA_VERSION, 1);
});
test('premature writes reject instead of overwriting unhydrated storage', async () => {
  const b = backend(envelope([record()])); const s = make(b);
  assert.equal((await s.createContract(draft('b'))).error.code, 'not_hydrated');
  assert.deepEqual(b.calls, []);
});
test('missing storage hydrates without writing and create persists exact versioned metadata', async () => {
  const b = backend(); const s = make(b);
  assert.equal((await s.hydrate()).ok, true);
  assert.equal(sets(b).length, 0);
  const result = await s.createContract(draft());
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(b.raw), { version: 1, state: { contracts: [record()] } });
  assert.deepEqual(s.getState().contracts, [record()]);
  assert.equal(result.value.createdAt, stamp);
  assert.equal(result.value.updatedAt, stamp);
  assert.ok(b.calls.every(call => call[1] === 'tomorrow:installments'));
  assert.equal(s.getState().postingAllowed, false);
  assert.equal(s.getState().readiness, 'blocked');
});
test('real storage round trip through a fresh Zustand instance preserves schedules and ownership', async () => {
  const b = backend(); const first = make(b); await first.hydrate();
  await first.createContract(draft());
  const second = make(b); await second.hydrate();
  assert.deepEqual(second.getState().contracts, first.getState().contracts);
  assert.equal(sets(b).length, 1);
});
test('linked loan/debt metadata is preserved without creating or reading linked entities', async () => {
  const b = backend(); const s = make(b); await s.hydrate();
  const a = draft('loan'); a.contract.accountingOwnership = { kind: 'linked_loan', liabilityOwner: 'loan', loanId: 'l1' };
  const d = draft('debt'); d.contract.accountingOwnership = { kind: 'linked_debt', liabilityOwner: 'debt', debtId: 'd1' };
  assert.equal((await s.createContract(a)).ok, true);
  assert.equal((await s.createContract(d)).ok, true);
  const second = make(b); await second.hydrate();
  assert.deepEqual(second.getState().contracts.map(x => x.contract.accountingOwnership), [a.contract.accountingOwnership, d.contract.accountingOwnership]);
});
for (const [label, raw, code] of [
  ['invalid JSON', '{oops', 'invalid_data'], ['empty text', '', 'invalid_data'], ['null', 'null', 'invalid_data'],
  ['array', '[]', 'invalid_data'], ['future schema', JSON.stringify({ version: 2, state: { contracts: [] } }), 'unsupported_version'],
  ['old schema', JSON.stringify({ version: 0, state: { contracts: [] } }), 'unsupported_version'],
  ['string schema', JSON.stringify({ version: '1', state: { contracts: [] } }), 'unsupported_version'],
  ['missing version', JSON.stringify({ state: { contracts: [] } }), 'unsupported_version'],
  ['missing state', JSON.stringify({ version: 1 }), 'invalid_data'],
  ['bad collection', JSON.stringify({ version: 1, state: { contracts: {} } }), 'invalid_data'],
  ['extra payment data', JSON.stringify({ version: 1, state: { contracts: [], payments: [] } }), 'invalid_data'],
  ['extra envelope field', JSON.stringify({ version: 1, state: { contracts: [] }, postingAllowed: true }), 'invalid_data'],
]) test('malformed hydration blocks writes and preserves raw storage: ' + label, async () => {
  const b = backend(raw); const s = make(b); const result = await s.hydrate();
  assert.equal(result.ok, false); blocked(s, code);
  assert.equal((await s.createContract(draft())).ok, false);
  assert.equal(b.raw, raw); assert.equal(sets(b).length, 0);
});
for (const [label, change] of [
  ['invalid name', r => { r.name = ''; }], ['long name', r => { r.name = 'x'.repeat(121); }],
  ['untrimmed name', r => { r.name = ' name '; }], ['inconsistent total', r => { r.contract.totalAmount = '10'; }],
  ['duplicate installment', r => { r.contract.schedule[1].id = 'down'; }],
  ['invalid due date', r => { r.contract.schedule[0].dueDate = '2028-02-30'; }],
  ['invalid precision', r => { r.contract.schedule[0].amount = '0.0001'; }],
  ['numeric amount', r => { r.contract.totalAmount = 10.005; }],
  ['missing ownership', r => { delete r.contract.accountingOwnership; }],
  ['ambiguous ownership', r => { r.contract.accountingOwnership.loanId = 'l1'; }],
  ['wrong owner', r => { r.contract.accountingOwnership.liabilityOwner = 'loan'; }],
  ['extra contract data', r => { r.contract.payments = []; }],
  ['extra row data', r => { r.contract.schedule[0].paid = true; }],
  ['extra record data', r => { r.paid = true; }],
  ['bad timestamp', r => { r.createdAt = 'not-a-date'; }],
  ['rolled timestamp', r => { r.updatedAt = '2028-02-30T00:00:00.000Z'; }],
  ['noncanonical timestamp', r => { r.createdAt = '2028-01-01'; }],
  ['reversed timestamps', r => { r.updatedAt = '2027-01-01T00:00:00.000Z'; }],
]) test('invalid persisted record rejects the entire snapshot: ' + label, async () => {
  const bad = record('b'); change(bad);
  const b = backend(envelope([record(), bad])); const raw = b.raw; const s = make(b);
  assert.equal((await s.hydrate()).ok, false); blocked(s, 'invalid_data');
  assert.deepEqual(s.getState().contracts, []); assert.equal(b.raw, raw); assert.equal(sets(b).length, 0);
});
test('duplicate persisted contract IDs block hydration without deduplication', async () => {
  const b = backend(envelope([record(), record()])); const s = make(b);
  assert.equal((await s.hydrate()).ok, false); blocked(s, 'invalid_data'); assert.equal(sets(b).length, 0);
});
test('invalid create inputs and ownership changes never write', async () => {
  const b = backend(); const s = make(b); await s.hydrate();
  for (const bad of [{ ...draft(), name: '' }, { ...draft(), payments: [] }, { ...draft(), contract: { ...draft().contract, totalAmount: '2' } }]) {
    assert.equal((await s.createContract(bad)).error.code, 'invalid_input');
  }
  assert.equal(sets(b).length, 0);
  const created = await s.createContract(draft());
  const changed = draft(); changed.contract.accountingOwnership = { kind: 'linked_loan', liabilityOwner: 'loan', loanId: 'l1' };
  assert.equal((await s.updateContract(changed, created.value.updatedAt)).error.code, 'invalid_input');
  assert.equal(sets(b).length, 1);
});
test('create never silently replaces a duplicate contract', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  assert.equal((await s.createContract(draft())).error.code, 'duplicate_id');
  assert.equal(sets(b).length, 0);
});
test('update preserves creation timestamp and advances update timestamp even with a fixed clock', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  const changed = draft(); changed.name = 'Renamed';
  const result = await s.updateContract(changed, stamp);
  assert.equal(result.ok, true); assert.equal(result.value.createdAt, stamp);
  assert.equal(result.value.updatedAt, '2028-01-01T00:00:00.001Z');
  assert.equal(JSON.parse(b.raw).state.contracts[0].name, 'Renamed');
  assert.equal((await s.updateContract(draft(), stamp)).error.code, 'conflict');
  assert.equal((await s.updateContract(draft('missing'), stamp)).error.code, 'not_found');
  assert.equal((await s.updateContract(draft(), undefined)).error.code, 'invalid_input');
});
test('equivalent ownership field ordering does not prevent an update', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  const changed = draft(); changed.contract.accountingOwnership = { liabilityOwner: 'installment_contract', kind: 'standalone' };
  assert.equal((await s.updateContract(changed, stamp)).ok, true);
});
test('hydration read failure blocks writes and read-only retry recovers', async () => {
  const b = backend(envelope([record()])); const get = b.getItem; b.getItem = async () => { throw new Error('offline'); };
  const s = make(b); assert.equal((await s.hydrate()).ok, false); blocked(s, 'storage_read_failed');
  assert.equal((await s.createContract(draft('b'))).ok, false);
  b.getItem = get; assert.equal((await s.hydrate()).ok, true);
  assert.deepEqual(s.getState().contracts, [record()]); assert.equal(sets(b).length, 0);
});
test('failed rehydration retains the last acknowledged snapshot without exposing partial data', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  b.raw = '{bad'; assert.equal((await s.hydrate()).ok, false);
  assert.deepEqual(s.getState().contracts, [record()]);
  b.raw = envelope([record(), record('b')]); assert.equal((await s.hydrate()).ok, true);
  assert.equal(s.getState().contracts.length, 2); assert.equal(sets(b).length, 0);
});
test('rejected setItem cannot report success or publish unsaved records; explicit retry can recover', async () => {
  const b = backend(); const set = b.setItem; const s = make(b); await s.hydrate();
  b.setItem = async () => { throw new Error('disk full'); };
  const result = await s.createContract(draft());
  assert.equal(result.ok, false); blocked(s, 'storage_write_failed');
  assert.equal(b.raw, null); assert.deepEqual(s.getState().contracts, []);
  assert.equal((await s.createContract(draft('b'))).error.code, 'not_hydrated');
  b.setItem = set; await s.hydrate(); assert.equal((await s.createContract(draft())).ok, true);
});
test('write-then-reject remains a failed save; hydration discovers actual durable snapshot without replay', async () => {
  const b = backend(); const set = b.setItem; const s = make(b); await s.hydrate();
  b.setItem = async function(key, raw) { await set.call(this, key, raw); throw new Error('lost acknowledgement'); };
  assert.equal((await s.createContract(draft())).ok, false);
  assert.deepEqual(s.getState().contracts, []); assert.equal(sets(b).length, 1);
  await s.hydrate(); assert.deepEqual(s.getState().contracts, [record()]); assert.equal(sets(b).length, 1);
  assert.equal((await s.createContract(draft())).error.code, 'duplicate_id');
});
test('resolved but dropped storage writes fail readback verification', async () => {
  const b = backend(); b.setItem = async () => {}; const s = make(b); await s.hydrate();
  assert.equal((await s.createContract(draft())).ok, false); blocked(s, 'storage_verification_failed');
  assert.deepEqual(s.getState().contracts, []);
});
test('readback failure after acknowledged set blocks publishing until read-only recovery', async () => {
  const b = backend(); const get = b.getItem; const set = b.setItem; const s = make(b); await s.hydrate();
  b.setItem = async function(key, raw) { await set.call(this, key, raw); this.getItem = async () => { throw new Error('readback failed'); }; };
  assert.equal((await s.createContract(draft())).ok, false); blocked(s, 'storage_read_failed');
  assert.deepEqual(s.getState().contracts, []);
  b.getItem = get; await s.hydrate(); assert.deepEqual(s.getState().contracts, [record()]); assert.equal(sets(b).length, 1);
});
test('preflight read failure never calls setItem', async () => {
  const b = backend(); const s = make(b); await s.hydrate();
  b.getItem = async () => { throw new Error('cannot read'); };
  assert.equal((await s.createContract(draft())).ok, false); blocked(s, 'storage_read_failed'); assert.equal(sets(b).length, 0);
});
test('changed or removed durable data blocks a stale write without overwriting', async () => {
  for (const replacement of [null, envelope([record('external')]), '{corrupt']) {
    const b = backend(envelope([record()])); const s = make(b); await s.hydrate(); b.raw = replacement;
    assert.equal((await s.createContract(draft('b'))).ok, false); blocked(s, 'conflict');
    assert.equal(b.raw, replacement); assert.equal(sets(b).length, 0);
  }
});
test('hydration is single-flight and mutations while its read is pending are rejected', async () => {
  const gate = deferred(); const b = backend(); b.getItem = async key => { b.calls.push(['get', key]); return gate.promise; };
  const s = make(b); const first = s.hydrate(); const second = s.hydrate();
  assert.equal(first, second);
  assert.equal((await s.createContract(draft())).error.code, 'not_hydrated');
  gate.resolve(envelope([record()])); assert.equal((await first).ok, true);
  assert.equal(b.calls.length, 1); assert.deepEqual(s.getState().contracts, [record()]);
});
test('pending set acknowledgement never publishes a record or resolves save early', async () => {
  const started = deferred(), gate = deferred(); const b = backend(); const set = b.setItem; const s = make(b); await s.hydrate();
  b.setItem = async function(key, raw) { started.resolve(); await gate.promise; await set.call(this, key, raw); };
  let settled = false; const writing = s.createContract(draft()).then(result => { settled = true; return result; });
  await started.promise;
  assert.equal(settled, false); assert.equal(s.getState().writeStatus, 'writing'); assert.deepEqual(s.getState().contracts, []);
  gate.resolve(); assert.equal((await writing).ok, true); assert.equal(s.getState().contracts.length, 1);
});
test('concurrent creates serialize and retain both contracts; submitted inputs are captured', async () => {
  const b = backend(); const s = make(b); await s.hydrate(); const a = draft();
  const one = s.createContract(a); a.name = 'Mutated'; a.contract.schedule[0].amount = '999';
  const two = s.createContract(draft('b')); const results = await Promise.all([one, two]);
  assert.ok(results.every(result => result.ok));
  assert.deepEqual(s.getState().contracts.map(x => x.contract.id), ['a', 'b']);
  assert.equal(s.getState().contracts[0].name, 'Contract a');
  assert.deepEqual(JSON.parse(b.raw).state.contracts, s.getState().contracts);
});
test('concurrent duplicate creates admit one and reject the other', async () => {
  const b = backend(); const s = make(b); await s.hydrate();
  const results = await Promise.all([s.createContract(draft()), s.createContract(draft())]);
  assert.equal(results.filter(x => x.ok).length, 1); assert.equal(results.find(x => !x.ok).error.code, 'duplicate_id');
  assert.equal(sets(b).length, 1);
});
test('concurrent updates require an optimistic revision and cannot silently lose changes', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  const results = await Promise.all([s.updateContract({ ...draft(), name: 'First' }, stamp), s.updateContract({ ...draft(), name: 'Second' }, stamp)]);
  assert.equal(results[0].ok, true); assert.equal(results[1].error.code, 'conflict');
  assert.equal(s.getState().contracts[0].name, 'First'); assert.equal(sets(b).length, 1);
});
test('write failure prevents already queued writes from proceeding until hydration', async () => {
  const b = backend(); const s = make(b); await s.hydrate(); let attempts = 0;
  b.setItem = async () => { attempts++; throw new Error('disk full'); };
  const results = await Promise.all([s.createContract(draft()), s.createContract(draft('b'))]);
  assert.equal(results[0].error.code, 'storage_write_failed'); assert.equal(results[1].error.code, 'not_hydrated');
  assert.equal(attempts, 1); assert.deepEqual(s.getState().contracts, []);
});
test('rehydration queues behind an in-flight write and never replaces it with an old read', async () => {
  const started = deferred(), gate = deferred(); const b = backend(); const set = b.setItem; const s = make(b); await s.hydrate();
  b.setItem = async function(key, raw) { started.resolve(); await gate.promise; await set.call(this, key, raw); };
  const write = s.createContract(draft()); await started.promise;
  const hydration = s.hydrate();
  assert.equal((await s.createContract(draft('b'))).error.code, 'not_hydrated');
  gate.resolve(); assert.equal((await write).ok, true); assert.equal((await hydration).ok, true);
  assert.deepEqual(s.getState().contracts, [record()]);
});
test('two instances sharing one backend detect stale snapshots and recover without lost writes', async () => {
  const b = backend(); const a = make(b), c = make(b); await Promise.all([a.hydrate(), c.hydrate()]);
  const results = await Promise.all([a.createContract(draft()), c.createContract(draft('b'))]);
  assert.equal(results[0].ok, true); assert.equal(results[1].error.code, 'conflict');
  assert.deepEqual(JSON.parse(b.raw).state.contracts.map(x => x.contract.id), ['a']);
  await c.hydrate(); assert.equal((await c.createContract(draft('b'))).ok, true);
  await a.hydrate(); assert.equal(a.getState().contracts.length, 2);
});
test('subscriber failures cannot make a confirmed durable write look like a failed save', async () => {
  const b = backend(); const s = make(b); s.subscribe(() => { throw new Error('broken observer'); });
  assert.equal((await s.hydrate()).ok, true); assert.equal((await s.createContract(draft())).ok, true);
  assert.deepEqual(s.getState().contracts, [record()]);
});
test('public snapshots and successful result records cannot be mutated to bypass persistence', async () => {
  const b = backend(); const s = make(b); await s.hydrate(); const result = await s.createContract(draft());
  assert.ok(Object.isFrozen(s.getState())); assert.ok(Object.isFrozen(result.value.contract.schedule[0]));
  const before = b.raw;
  result.value.name = 'corrupt'; s.getState().postingAllowed = true;
  assert.throws(() => s.getState().contracts.push(record('b')));
  assert.equal(s.getState().contracts[0].name, 'Contract a'); assert.equal(s.getState().postingAllowed, false); assert.equal(b.raw, before);
});
test('malformed backend return values block hydration', async () => {
  const b = backend(); b.getItem = async () => undefined;
  const s = make(b); assert.equal((await s.hydrate()).ok, false); blocked(s, 'storage_read_failed');
});
test('invalid clock cannot persist invalid timestamps', async () => {
  const b = backend(); const s = createInstallmentsStorage(b, () => 'bad'); await s.hydrate();
  assert.equal((await s.createContract(draft())).ok, false); assert.equal(sets(b).length, 0);
});

// Task 6B-5: standalone deletion is revision-checked and read-back verified.
test('delete requires hydration and valid contract ID/revision without I/O', async () => {
  const b = backend(envelope([record()])); const s = make(b);
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'not_hydrated');
  assert.deepEqual(b.calls, []);
  await s.hydrate(); const before = b.calls.length;
  assert.equal((await s.deleteContract('', stamp)).error.code, 'invalid_input');
  assert.equal((await s.deleteContract('a', 'invalid')).error.code, 'invalid_input');
  assert.equal((await s.deleteContract('a', undefined)).error.code, 'invalid_input');
  assert.equal(b.calls.length, before);
});
test('delete removes only the selected standalone contract and persists after rehydration', async () => {
  const b = backend(envelope([record('a'), record('b')])); const s = make(b); await s.hydrate();
  assert.equal((await s.deleteContract('a', stamp)).ok, true);
  assert.deepEqual(s.getState().contracts, [record('b')]);
  assert.deepEqual(JSON.parse(b.raw).state.contracts, [record('b')]);
  assert.equal(s.getState().postingAllowed, false); assert.equal(s.getState().readiness, 'blocked');
  const fresh = make(b); assert.equal((await fresh.hydrate()).ok, true);
  assert.deepEqual(fresh.getState().contracts, [record('b')]);
});
test('delete rejects absent contracts and stale revisions without writing', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  assert.equal((await s.deleteContract('missing', stamp)).error.code, 'not_found');
  assert.equal((await s.deleteContract('a', '2027-01-01T00:00:00.000Z')).error.code, 'conflict');
  assert.equal(sets(b).length, 0); assert.deepEqual(s.getState().contracts, [record()]);
});
test('delete rejects a stale durable snapshot and preserves external data', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  b.raw = envelope([record(), record('b')]);
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'conflict');
  blocked(s, 'conflict'); assert.equal(sets(b).length, 0);
  assert.deepEqual(JSON.parse(b.raw).state.contracts, [record(), record('b')]);
});
test('delete setItem rejection never publishes a deleted record', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  b.setItem = async () => { throw new Error('disk full'); };
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'storage_write_failed');
  blocked(s, 'storage_write_failed'); assert.deepEqual(s.getState().contracts, [record()]);
  assert.deepEqual(JSON.parse(b.raw).state.contracts, [record()]);
});
test('delete dropped write fails verification and never reports success', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  b.setItem = async () => {};
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'storage_verification_failed');
  blocked(s, 'storage_verification_failed'); assert.deepEqual(s.getState().contracts, [record()]);
});
test('delete readback failure blocks mutations until rehydration', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  const original = b.getItem; let reads = 0;
  b.getItem = async function(key) { if (++reads === 2) throw new Error('readback'); return original.call(this, key); };
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'storage_read_failed');
  blocked(s, 'storage_read_failed');
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'not_hydrated');
  b.getItem = original; assert.equal((await s.hydrate()).ok, true);
  assert.deepEqual(s.getState().contracts, []);
});
test('concurrent deletes of one contract cannot both succeed', async () => {
  const b = backend(envelope([record()])); const s = make(b); await s.hydrate();
  const results = await Promise.all([s.deleteContract('a', stamp), s.deleteContract('a', stamp)]);
  assert.equal(results[0].ok, true); assert.equal(results[1].error.code, 'not_found');
  assert.equal(sets(b).length, 1);
});
test('delete during pending hydration is rejected without writing', async () => {
  const gate = deferred(); const b = backend(envelope([record()]));
  b.getItem = async () => gate.promise;
  const s = make(b); const loading = s.hydrate();
  assert.equal((await s.deleteContract('a', stamp)).error.code, 'not_hydrated');
  gate.resolve(envelope([record()])); assert.equal((await loading).ok, true);
  assert.equal(sets(b).length, 0);
});
test('delete refuses linked loan or debt contracts and keeps posting blocked', async () => {
  const linked = record('loan'); linked.contract.accountingOwnership = { kind: 'linked_loan', liabilityOwner: 'loan', loanId: 'loan-1' };
  const b = backend(envelope([linked, record('b')])); const s = make(b); await s.hydrate();
  assert.equal((await s.deleteContract('loan', stamp)).error.code, 'invalid_input');
  assert.equal(sets(b).length, 0);
  assert.deepEqual(s.getState().contracts, [linked, record('b')]);
  assert.equal(s.getState().postingAllowed, false); assert.equal(s.getState().readiness, 'blocked');
});
