const test = require('node:test');
const assert = require('node:assert/strict');
const { invariants, repository } = require('./documents-local-loader.cjs');
const ns = 'tomorrow:documents:v1:';
const pendingKey = ns + 'pending-import';
const indexKey = ns + 'index';
const key = id => ns + 'record:' + id;
const record = (id, hash = 'a'.repeat(64)) => ({ id, category: 'receipt', status: 'stored', source: 'picker', name: id + '.pdf', mimeType: 'application/pdf', byteSize: 12, vaultPath: 'documents/' + id + '.pdf', sha256: hash, createdAt: '2026-11-13T00:00:00.000Z', updatedAt: '2026-11-13T00:00:00.000Z' });
function harness(t) {
  const sentinels = [['tomorrow:finance', ' {"amount":"001.00"} '], ['tomorrow:ledger', '{"postingAllowed":false}'], ['tomorrow:balances', '0.00']];
  const map = new Map(sentinels), writes = [];
  let fault = null;
  const backend = () => ({ getItem: async k => map.get(k) ?? null, setItem: async (k, v) => {
    writes.push([k, v]);
    const mode = fault?.(k, v);
    if (mode === 'before') throw Error('before commit');
    map.set(k, mode === 'mismatch' ? '{}' : v);
    if (mode === 'after') throw Error('after commit');
  } });
  t.after(() => {
    for (const [k, v] of sentinels) assert.deepEqual(Buffer.from(map.get(k)), Buffer.from(v));
    assert.ok(writes.every(([k]) => k.startsWith(ns)));
  });
  return { map, writes, setFault: f => { fault = f; }, restart: () => repository().createDocumentRepository(backend()) };
}
const error = { ok: false, error: 'storage_error' };
test('valid fixtures and real validation reject malformed record before writes', async t => {
  const h = harness(t), r = record('one');
  assert.equal(invariants.validId(r.id), true); invariants.validateDocument(r);
  assert.deepEqual(await h.restart().createIfHashAbsent({ ...r, vaultPath: '../bad' }), { ok: false, error: 'invalid_data' });
  assert.equal(h.writes.length, 0);
});
for (const step of ['pending', 'record', 'index', 'clear']) {
  for (const when of ['before', 'after']) {
    test(`${step} write throws ${when} commit: restart remains safe`, async t => {
      const h = harness(t), r = record('one');
      h.setFault((k, v) => (step === 'pending' ? k === pendingKey && v !== 'null' : step === 'record' ? k === key('one') : step === 'index' ? k === indexKey : k === pendingKey && v === 'null') ? when : undefined);
      assert.deepEqual(await h.restart().createIfHashAbsent(r), error);
      h.setFault(null);
      const repo = h.restart();
      if (step === 'pending' && when === 'before') {
        assert.equal(h.map.has(key('one')), false);
        assert.equal((await repo.createIfHashAbsent(record('two'))).value.kind, 'created');
      } else if (step === 'pending' || (step === 'record' && when === 'before')) {
        const snapshot = [...h.map], count = h.writes.length;
        assert.deepEqual(await repo.create(record('two')), error);
        assert.deepEqual(await repo.createIfHashAbsent(record('two'), true), error);
        assert.deepEqual(await repo.recoverUnindexed('one'), error);
        assert.deepEqual([...h.map], snapshot); assert.equal(h.writes.length, count);
      } else {
        assert.deepEqual(await repo.recoverUnindexed('one'), { ok: true, value: r });
        const count = h.writes.length;
        assert.deepEqual(await h.restart().recoverUnindexed('one'), { ok: true, value: r });
        assert.equal(h.writes.length, count);
        assert.deepEqual(await h.restart().createIfHashAbsent(record('two')), { ok: true, value: { kind: 'duplicate', record: r } });
        assert.equal(h.map.has(key('two')), false);
      }
    });
  }
}
test('pending read-back mismatch prevents document write and blocks restart', async t => {
  const h = harness(t); h.setFault(k => k === pendingKey ? 'mismatch' : undefined);
  assert.deepEqual(await h.restart().createIfHashAbsent(record('one')), error);
  assert.equal(h.map.has(key('one')), false);
  h.setFault(null); const count = h.writes.length;
  assert.deepEqual(await h.restart().create(record('two')), error);
  assert.equal(h.writes.length, count);
});
test('independent-copy intent survives restart and recovery', async t => {
  const h = harness(t); assert.equal((await h.restart().createIfHashAbsent(record('one'))).ok, true);
  h.setFault(k => k === indexKey ? 'before' : undefined);
  assert.deepEqual(await h.restart().createIfHashAbsent(record('two'), true), error);
  assert.equal(JSON.parse(h.map.get(pendingKey)).saveIndependentCopy, true);
  h.setFault(null);
  assert.deepEqual(await h.restart().createIfHashAbsent(record('three'), true), error);
  assert.deepEqual(await h.restart().recoverUnindexed('two'), { ok: true, value: record('two') });
  assert.deepEqual(JSON.parse(h.map.get(indexKey)), ['one', 'two']);
});
test('false intent cannot be promoted by retry and recovery rejects duplicate hash', async t => {
  const h = harness(t); h.setFault(k => k === indexKey ? 'before' : undefined);
  assert.deepEqual(await h.restart().createIfHashAbsent(record('one')), error);
  h.setFault(null);
  h.map.set(key('other'), JSON.stringify(record('other'))); h.map.set(indexKey, '["other"]');
  const snapshot = [...h.map], count = h.writes.length;
  assert.deepEqual(await h.restart().createIfHashAbsent(record('two'), true), error);
  assert.deepEqual(await h.restart().recoverUnindexed('one'), { ok: false, error: 'duplicate' });
  assert.deepEqual([...h.map], snapshot); assert.equal(h.writes.length, count);
});
test('ordinary create with nullable hash recovers without changing intent', async t => {
  const h = harness(t), r = record('one', null);
  h.setFault(k => k === indexKey ? 'before' : undefined);
  assert.deepEqual(await h.restart().create(r), error);
  h.setFault(null);
  assert.deepEqual(await h.restart().recoverUnindexed('one'), { ok: true, value: r });
  assert.deepEqual(await h.restart().recoverUnindexed('one'), { ok: true, value: r });
});
for (const target of ['record', 'index']) test(`${target} read-back mismatch preserves pending and fails closed`, async t => {
  const h = harness(t);
  h.setFault(k => k === (target === 'record' ? key('one') : indexKey) ? 'mismatch' : undefined);
  assert.deepEqual(await h.restart().createIfHashAbsent(record('one')), error);
  assert.ok(h.map.get(pendingKey));
  h.setFault(null); const snapshot = [...h.map], count = h.writes.length;
  assert.deepEqual(await h.restart().createIfHashAbsent(record('two')), error);
  assert.deepEqual(await h.restart().recoverUnindexed('one'), error);
  assert.deepEqual([...h.map], snapshot); assert.equal(h.writes.length, count);
});
test('update cannot invalidate a pending record', async t => {
  const h = harness(t); h.setFault(k => k === indexKey ? 'after' : undefined);
  await h.restart().createIfHashAbsent(record('one')); h.setFault(null);
  const count = h.writes.length;
  assert.deepEqual(await h.restart().update({ ...record('one'), name: 'changed', updatedAt: '2026-11-13T01:00:00.000Z' }, record('one').updatedAt), error);
  assert.equal(h.writes.length, count);
  assert.equal((await h.restart().recoverUnindexed('one')).ok, true);
});
test('corrupt pending payloads block creation and recovery without writes', async t => {
  const h = harness(t);
  for (const raw of ['{', '{}', '[]', JSON.stringify({ version: 2, mode: 'hash', record: record('one'), saveIndependentCopy: false }), JSON.stringify({ version: 1, mode: 'hash', record: record('one'), saveIndependentCopy: 'yes' })]) {
    h.map.set(pendingKey, raw); const count = h.writes.length;
    assert.deepEqual(await h.restart().create(record('two')), error);
    assert.deepEqual(await h.restart().createIfHashAbsent(record('two')), error);
    assert.deepEqual(await h.restart().recoverUnindexed('one'), error);
    assert.equal(h.writes.length, count);
  }
});
test('wrong recovery ID and changed record preserve pending evidence', async t => {
  const h = harness(t); h.setFault(k => k === indexKey ? 'before' : undefined);
  await h.restart().createIfHashAbsent(record('one')); h.setFault(null);
  assert.deepEqual(await h.restart().recoverUnindexed('other'), { ok: false, error: 'conflict' });
  h.map.set(key('one'), JSON.stringify({ ...record('one'), name: 'changed.pdf' }));
  const snapshot = [...h.map], count = h.writes.length;
  assert.deepEqual(await h.restart().recoverUnindexed('one'), error);
  assert.deepEqual([...h.map], snapshot); assert.equal(h.writes.length, count);
});
for (const target of ['index', 'clear']) test(`recovery ${target} commit-then-throw is retryable`, async t => {
  const h = harness(t); h.setFault(k => k === indexKey ? 'before' : undefined);
  await h.restart().createIfHashAbsent(record('one'));
  h.setFault((k, v) => (target === 'index' ? k === indexKey : k === pendingKey && v === 'null') ? 'after' : undefined);
  assert.deepEqual(await h.restart().recoverUnindexed('one'), error);
  h.setFault(null);
  assert.deepEqual(await h.restart().recoverUnindexed('one'), { ok: true, value: record('one') });
  assert.deepEqual(JSON.parse(h.map.get(indexKey)), ['one']);
});
