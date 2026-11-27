const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(file, mocks = {}) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const out = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputText)(m, m.exports, id => mocks[id] || require(id));
  return m.exports;
}
const { createDocumentRepository } = load('src/features/documents/storage/documentRepository.ts', {
  '../domain/invariants': {
    validId: id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id),
    validateDocument: r => { if (!r || !r.id || !r.sha256) throw Error('invalid'); },
  },
});
const hash = 'a'.repeat(64);
const record = id => ({ id, sha256: hash, createdAt: '2026-11-13T00:00:00.000Z', updatedAt: '2026-11-13T00:00:00.000Z' });
function storage() {
  const map = new Map();
  return { map, getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); } };
}
test('concurrent identical hashes yield one created and one duplicate', async () => {
  const backend = storage();
  const repo = createDocumentRepository(backend);
  const results = await Promise.all([repo.createIfHashAbsent(record('doc1')), repo.createIfHashAbsent(record('doc2'))]);
  assert.deepEqual(results.map(r => r.ok && r.value.kind).sort(), ['created', 'duplicate']);
  assert.equal((await repo.list()).value.length, 1);
});
test('explicit independent copy permits second record', async () => {
  const repo = createDocumentRepository(storage());
  assert.equal((await repo.createIfHashAbsent(record('doc1'))).value.kind, 'created');
  assert.equal((await repo.createIfHashAbsent(record('doc2'), true)).value.kind, 'created');
  assert.equal((await repo.list()).value.length, 2);
});
test('invalid override fails closed', async () => {
  const repo = createDocumentRepository(storage());
  assert.equal((await repo.createIfHashAbsent(record('doc1'), 'yes')).error, 'invalid_data');
});
test('index write failure is reported, never claimed successful', async () => {
  const backend = storage();
  const set = backend.setItem;
  backend.setItem = async (k, v) => { if (k.endsWith(':index')) throw Error('disk failure'); await set(k, v); };
  const repo = createDocumentRepository(backend);
  assert.equal((await repo.createIfHashAbsent(record('doc1'))).error, 'storage_error');
  assert.equal(backend.map.has('tomorrow:documents:v1:record:doc1'), true);
});
test('corrupt indexed record blocks new import', async () => {
  const backend = storage();
  backend.map.set('tomorrow:documents:v1:index', JSON.stringify(['doc1']));
  backend.map.set('tomorrow:documents:v1:record:doc1', JSON.stringify({ id: 'doc1', sha256: null }));
  assert.equal((await createDocumentRepository(backend).createIfHashAbsent(record('doc2'))).error, 'storage_error');
});