const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function load(relative, mocks = {}) {
  const code = fs.readFileSync(path.join(root, relative), 'utf8');
  const out = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal(out.diagnostics?.length ?? 0, 0);
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputText)(m, m.exports, id => mocks[id] || require(id));
  return m.exports;
}
const invariants = load('src/features/documents/domain/invariants.ts');
const { createDocumentRepository, DOCUMENTS_NAMESPACE: ns } = load('src/features/documents/storage/documentRepository.ts', { '../domain/invariants': invariants });
const date = '2026-11-13T00:00:00.000Z';
const record = (id, hash = 'a'.repeat(64)) => ({ id, category: 'receipt', status: 'stored', source: 'picker', name: `${id}.pdf`, mimeType: 'application/pdf', byteSize: 12, vaultPath: `documents/${id}.pdf`, sha256: hash, createdAt: date, updatedAt: date });
function storage() {
  const map = new Map([['tomorrow:ledger', 'KEEP']]);
  return { map, getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); } };
}
const recordKey = id => `${ns}record:${id}`;
const indexKey = `${ns}index`;
test('failed index write leaves recoverable orphan; explicit recovery restores list', async () => {
  const b = storage(); const originalSet = b.setItem; let fail = true;
  b.setItem = async (k, v) => { if (k === indexKey && fail) throw Error('simulated failure'); return originalSet(k, v); };
  const repo = createDocumentRepository(b);
  assert.equal((await repo.createIfHashAbsent(record('doc1'))).error, 'storage_error');
  assert.equal((await repo.list()).value.length, 0);
  fail = false;
  const recovered = await repo.recoverUnindexed('doc1');
  assert.equal(recovered.ok, true);
  assert.equal((await repo.list()).value.length, 1);
  assert.equal(b.map.get('tomorrow:ledger'), 'KEEP');
});
test('recovery refuses unknown ID and is idempotent for indexed ID', async () => {
  const repo = createDocumentRepository(storage());
  assert.equal((await repo.recoverUnindexed('missing')).error, 'not_found');
  await repo.createIfHashAbsent(record('doc1'));
  assert.equal((await repo.recoverUnindexed('doc1')).ok, true);
});
test('recovery refuses duplicate hash and does not mutate index', async () => {
  const b = storage(); const repo = createDocumentRepository(b);
  assert.equal((await repo.createIfHashAbsent(record('doc1'))).ok, true);
  const before = b.map.get(indexKey);
  b.map.set(recordKey('doc2'), JSON.stringify(record('doc2')));
  assert.equal((await repo.recoverUnindexed('doc2')).error, 'duplicate');
  assert.equal(b.map.get(indexKey), before);
});
test('recovery fails closed for corrupt orphan and index', async () => {
  const b = storage(); const repo = createDocumentRepository(b);
  b.map.set(recordKey('doc1'), '{bad');
  assert.equal((await repo.recoverUnindexed('doc1')).error, 'storage_error');
  b.map.set(recordKey('doc1'), JSON.stringify(record('doc1')));
  b.map.set(indexKey, '{bad');
  assert.equal((await repo.recoverUnindexed('doc1')).error, 'storage_error');
});
test('failed recovery index write never reports success and can retry', async () => {
  const b = storage(); b.map.set(recordKey('doc1'), JSON.stringify(record('doc1')));
  const base = b.setItem; let fail = true;
  b.setItem = async (k, v) => { if (k === indexKey && fail) throw Error('disk'); return base(k, v); };
  const repo = createDocumentRepository(b);
  assert.equal((await repo.recoverUnindexed('doc1')).error, 'storage_error');
  fail = false;
  assert.equal((await repo.recoverUnindexed('doc1')).ok, true);
});