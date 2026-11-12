const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { repository, invariants } = require('./documents-local-loader.cjs');

const ns = 'tomorrow:documents:v1:';
const pendingKey = ns + 'pending-import';
const indexKey = ns + 'index';
const recordKey = id => ns + 'record:' + id;
const storageError = { ok: false, error: 'storage_error' };
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
function record(id, hash = 'a'.repeat(64)) {
  const value = {
    id, category: 'receipt', status: 'stored', source: 'picker', name: id + '.pdf',
    mimeType: 'application/pdf', byteSize: 128, vaultPath: 'documents/' + id + '.pdf', sha256: hash,
    createdAt: '2026-11-13T00:00:00.000Z', updatedAt: '2026-11-13T00:00:00.000Z',
  };
  assert.equal(invariants.validId(id), true);
  invariants.validateDocument(value);
  return value;
}
function harness(t, sameBackend = false) {
  // Load exactly once: both repository instances must share the actual module queue.
  const { createDocumentRepository } = repository();
  const sentinels = [
    ['tomorrow:finance', ' {"amount":"001.00"} '],
    ['tomorrow:ledger', '{"postingAllowed":false}'],
    ['tomorrow:balances', '{"amount":"0.00"}'],
  ];
  const map = new Map(sentinels), requests = [], history = [], tasks = [];
  let fault = null;
  function wrapper(actor) {
    function enqueue(kind, key, value) {
      return new Promise((resolve, reject) => requests.push({ actor, kind, key, value, resolve, reject }));
    }
    return { getItem: key => enqueue('get', key), setItem: (key, value) => enqueue('set', key, value) };
  }
  const a = wrapper('A'), b = sameBackend ? a : wrapper('B');
  if (!sameBackend) assert.notEqual(a, b);
  const repoA = createDocumentRepository(a), repoB = createDocumentRepository(b);
  function start(operation) {
    const task = { settled: false };
    tasks.push(task);
    task.promise = operation().then(value => { task.value = value; task.settled = true; }, error => { task.error = error; task.settled = true; });
    return task;
  }
  async function release(request) {
    assert.ok(request, 'scheduler requires an observable storage request');
    requests.splice(requests.indexOf(request), 1);
    history.push({ actor: request.actor, kind: request.kind, key: request.key, value: request.value });
    try {
      if (request.kind === 'get') request.resolve(map.get(request.key) ?? null);
      else {
        map.set(request.key, request.value);
        if (fault && fault(request)) { fault = null; throw Error('Storage committed, then threw'); }
        request.resolve();
      }
    } catch (error) { request.reject(error); }
    // Event-loop checkpoint drains promise continuations; never a time-based sleep.
    await checkpoint();
  }
  async function advance(actor, stop) {
    await checkpoint();
    for (let steps = 0; steps < 200; steps++) {
      const request = requests.find(r => r.actor === actor);
      if (!request || stop(request)) return request;
      await release(request);
    }
    throw Error('Scheduler exceeded bounded operation count');
  }
  async function finish() {
    await checkpoint();
    for (let steps = 0; steps < 1000; steps++) {
      if (tasks.every(task => task.settled)) {
        assert.equal(requests.length, 0);
        for (const task of tasks) if (task.error) throw task.error;
        return;
      }
      const request = requests.find(r => r.actor === 'A') ?? requests[0];
      assert.ok(request, 'unsettled repository operation without a runnable storage request');
      await release(request);
    }
    throw Error('Scheduler exceeded bounded operation count');
  }
  async function run(operation) { const task = start(operation); await finish(); return task.value; }
  async function overlap(first, second, stop = r => r.kind === 'set' && r.key === pendingKey) {
    const firstTask = start(first);
    assert.ok(await advance('A', stop), 'first operation reaches the held boundary');
    const secondTask = start(second);
    // Before the fix B can pass stale checks. After the fix it cannot enter storage yet.
    await advance('B', stop);
    await finish();
    return [firstTask.value, secondTask.value];
  }
  function state(expected, pending = null) {
    assert.deepEqual(JSON.parse(map.get(indexKey) ?? '[]'), expected.map(r => r.id));
    assert.deepEqual([...map.keys()].filter(k => k.startsWith(ns + 'record:')).sort(), expected.map(r => recordKey(r.id)).sort());
    for (const value of expected) assert.deepEqual(JSON.parse(map.get(recordKey(value.id))), value);
    assert.deepEqual(JSON.parse(map.get(pendingKey) ?? 'null'), pending);
  }
  t.after(async () => {
    await finish();
    for (const [key, value] of sentinels) assert.deepEqual(Buffer.from(map.get(key)), Buffer.from(value));
    assert.ok(history.every(event => event.key.startsWith(ns)), 'repository never accesses Finance sentinels');
  });
  return { map, requests, history, repoA, repoB, start, advance, finish, run, overlap, state, setFault: predicate => { fault = predicate; } };
}
function created(value) { return { ok: true, value: { kind: 'created', record: value } }; }
function duplicate(value) { return { ok: true, value: { kind: 'duplicate', record: value } }; }

test('distinct wrappers: identical hashes create exactly one record', async t => {
  const h = harness(t), a = record('one'), b = record('two');
  const results = await h.overlap(() => h.repoA.createIfHashAbsent(a), () => h.repoB.createIfHashAbsent(b));
  assert.deepEqual(results, [created(a), duplicate(a)]);
  h.state([a]);
});
test('distinct wrappers: different hashes preserve both index entries', async t => {
  const h = harness(t), a = record('one'), b = record('two', 'b'.repeat(64));
  assert.deepEqual(await h.overlap(() => h.repoA.createIfHashAbsent(a), () => h.repoB.createIfHashAbsent(b)), [created(a), created(b)]);
  h.state([a, b]);
});
test('distinct wrappers: recovery cannot enter an active import lifecycle', async t => {
  const h = harness(t), a = record('one');
  const importing = h.start(() => h.repoA.createIfHashAbsent(a));
  const held = await h.advance('A', r => r.kind === 'set' && r.key === indexKey);
  assert.ok(held); assert.equal(JSON.parse(h.map.get(pendingKey)).record.id, a.id);
  const recovery = h.start(() => h.repoB.recoverUnindexed(a.id));
  await checkpoint();
  const enteredEarly = h.requests.some(r => r.actor === 'B');
  await h.finish();
  assert.equal(enteredEarly, false, 'recovery waits for the import to release the module queue');
  assert.deepEqual(importing.value, created(a));
  assert.deepEqual(recovery.value, { ok: true, value: a }); h.state([a]);
});
test('distinct wrappers: pending recovery finishes before a new import can reserve intent', async t => {
  const h = harness(t), a = record('one'), b = record('two', 'b'.repeat(64));
  h.setFault(r => r.key === recordKey(a.id));
  assert.deepEqual(await h.run(() => h.repoA.createIfHashAbsent(a)), storageError);
  const recovering = h.start(() => h.repoA.recoverUnindexed(a.id));
  assert.ok(await h.advance('A', r => r.kind === 'set' && r.key === indexKey));
  const importing = h.start(() => h.repoB.createIfHashAbsent(b));
  await checkpoint(); const enteredEarly = h.requests.some(r => r.actor === 'B');
  await h.finish();
  assert.equal(enteredEarly, false, 'new import cannot observe or replace recovery intent');
  assert.deepEqual(recovering.value, { ok: true, value: a });
  assert.deepEqual(importing.value, created(b)); h.state([a, b]);
});
test('distinct wrappers: explicit independent copy is preserved while ordinary retry deduplicates', async t => {
  const h = harness(t), base = record('base'), copy = record('copy'), retry = record('retry');
  assert.deepEqual(await h.run(() => h.repoA.createIfHashAbsent(base)), created(base));
  assert.deepEqual(await h.overlap(() => h.repoA.createIfHashAbsent(copy, true), () => h.repoB.createIfHashAbsent(retry)), [created(copy), duplicate(base)]);
  const intents = h.history.filter(r => r.kind === 'set' && r.key === pendingKey && r.value !== 'null').map(r => JSON.parse(r.value));
  assert.equal(intents.find(r => r.record.id === copy.id).saveIndependentCopy, true);
  assert.equal(intents.some(r => r.record.id === retry.id), false); h.state([base, copy]);
});
for (const step of ['pending', 'record', 'index', 'clear']) {
  test(`distinct wrappers: ${step} commit-then-throw releases queue but preserves durable safety`, async t => {
    const h = harness(t), a = record('one'), b = record('two', 'b'.repeat(64));
    h.setFault(r => step === 'pending' ? r.key === pendingKey && r.value !== 'null' : step === 'record' ? r.key === recordKey(a.id) : step === 'index' ? r.key === indexKey : r.key === pendingKey && r.value === 'null');
    const results = await h.overlap(() => h.repoA.createIfHashAbsent(a), () => h.repoB.createIfHashAbsent(b));
    assert.deepEqual(results[0], storageError);
    if (step === 'clear') {
      assert.deepEqual(results[1], created(b)); h.state([a, b]);
    } else {
      assert.deepEqual(results[1], storageError);
      assert.equal(h.map.has(recordKey(b.id)), false);
      const intent = JSON.parse(h.map.get(pendingKey));
      assert.deepEqual(intent, { version: 1, mode: 'hash', record: a, saveIndependentCopy: false });
      if (step === 'pending') {
        assert.equal(h.map.has(recordKey(a.id)), false);
        assert.equal(h.map.has(indexKey), false);
        assert.deepEqual(await h.run(() => h.repoB.recoverUnindexed(a.id)), storageError);
      } else {
        assert.deepEqual(JSON.parse(h.map.get(recordKey(a.id))), a);
        assert.deepEqual(JSON.parse(h.map.get(indexKey) ?? '[]'), step === 'index' ? [a.id] : []);
        assert.deepEqual(await h.run(() => h.repoB.recoverUnindexed(a.id)), { ok: true, value: a }); h.state([a]);
      }
    }
  });
}
test('distinct wrappers: interrupted independent copy retains intent through recovery and retry', async t => {
  const h = harness(t), base = record('base'), copy = record('copy'), retry = record('retry');
  await h.run(() => h.repoA.createIfHashAbsent(base));
  h.setFault(r => r.key === indexKey);
  assert.deepEqual(await h.overlap(() => h.repoA.createIfHashAbsent(copy, true), () => h.repoB.createIfHashAbsent(retry, true)), [storageError, storageError]);
  assert.equal(JSON.parse(h.map.get(pendingKey)).saveIndependentCopy, true);
  assert.deepEqual(await h.run(() => h.repoB.recoverUnindexed(copy.id)), { ok: true, value: copy });
  assert.deepEqual(await h.run(() => h.repoA.createIfHashAbsent(retry)), duplicate(base)); h.state([base, copy]);
});
test('distinct wrappers: repeated concurrent recovery and retries do not duplicate records', async t => {
  const h = harness(t), a = record('one');
  h.setFault(r => r.key === recordKey(a.id));
  assert.deepEqual(await h.run(() => h.repoA.createIfHashAbsent(a)), storageError);
  const results = await h.overlap(() => h.repoA.recoverUnindexed(a.id), () => h.repoB.recoverUnindexed(a.id), r => r.kind === 'set' && r.key === indexKey);
  assert.deepEqual(results, [{ ok: true, value: a }, { ok: true, value: a }]);
  const indexWrites = h.history.filter(r => r.kind === 'set' && r.key === indexKey);
  assert.equal(indexWrites.length, 1, 'only first recovery appends the index');
  assert.deepEqual(await h.run(() => h.repoB.recoverUnindexed(a.id)), { ok: true, value: a });
  assert.deepEqual(await h.run(() => h.repoA.createIfHashAbsent(record('retry'))), duplicate(a)); h.state([a]);
});
test('same backend object: two repositories retain serialization', async t => {
  const h = harness(t, true), a = record('one'), b = record('two', 'b'.repeat(64));
  assert.deepEqual(await h.overlap(() => h.repoA.createIfHashAbsent(a), () => h.repoB.createIfHashAbsent(b)), [created(a), created(b)]); h.state([a, b]);
});
test('ordinary ID-based create permits matching hashes and keeps both records', async t => {
  const h = harness(t), a = record('one'), b = record('two');
  assert.deepEqual(await h.overlap(() => h.repoA.create(a), () => h.repoB.create(b)), [{ ok: true, value: a }, { ok: true, value: b }]);
  assert.deepEqual(await h.run(() => h.repoB.create(a)), { ok: false, error: 'duplicate' }); h.state([a, b]);
});
test('distinct wrappers: same document ID cannot overwrite the first ordinary create', async t => {
  const h = harness(t), a = record('one'), b = { ...a, name: 'other.pdf' };
  assert.deepEqual(await h.overlap(() => h.repoA.create(a), () => h.repoB.create(b)), [{ ok: true, value: a }, { ok: false, error: 'duplicate' }]); h.state([a]);
});
test('distinct wrappers: concurrent timestamp updates reject the stale writer', async t => {
  const h = harness(t), initial = record('one');
  await h.run(() => h.repoA.createIfHashAbsent(initial));
  const first = { ...initial, name: 'first.pdf', updatedAt: '2026-11-13T01:00:00.000Z' };
  const second = { ...initial, name: 'second.pdf', updatedAt: '2026-11-13T02:00:00.000Z' };
  const results = await h.overlap(() => h.repoA.update(first, initial.updatedAt), () => h.repoB.update(second, initial.updatedAt), r => r.kind === 'set' && r.key === recordKey(initial.id));
  assert.deepEqual(results, [{ ok: true, value: first }, { ok: false, error: 'conflict' }]); h.state([first]);
});
