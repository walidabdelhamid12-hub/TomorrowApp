/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length ?? 0, 0);
  const m = { exports: {} }; cache.set(relative, m.exports);
  new Function('module', 'exports', 'require', compiled.outputText)(m, m.exports, id => {
    if (id.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), id + '.ts')));
    return require(id);
  });
  cache.set(relative, m.exports); return m.exports;
}
const { createDocumentImporter } = load('src/features/documents/import/importDocument.ts');
const { createDocumentRepository } = load('src/features/documents/storage/documentRepository.ts');
const sha = 'a'.repeat(64);
const objectRelPath = `vault/objects/aa/${sha}.pdf`;
const stamp = '2026-11-13T00:00:00.000Z';
const input = id => ({ id, sourceUri: 'file:///sample.pdf', category: 'receipt', source: 'picker', name: 'sample.pdf', declaredMime: 'application/pdf', createdAt: stamp });
const vaultResult = { ok: true, outcome: 'stored', verified: true, sha256: sha, byteSize: 12, objectRelPath };
function harness(vaultResultOverride = vaultResult) {
  const map = new Map([['tomorrow:finance', 'KEEP']]);
  let calls = 0;
  const backend = { getItem: async k => map.get(k) ?? null, setItem: async (k, v) => { map.set(k, v); } };
  const repo = createDocumentRepository(backend);
  const vault = { store: async () => { calls++; return vaultResultOverride; } };
  return { map, repo, vault, importer: createDocumentImporter({ vault, repository: repo }), calls: () => calls };
}
test('new verified file creates a stored document with vault metadata', async () => {
  const h = harness(); const result = await h.importer.importDocument(input('doc1'));
  assert.equal(result.ok, true); assert.equal(result.kind, 'created'); assert.equal(result.record.vaultPath, objectRelPath);
  assert.equal(result.record.status, 'stored'); assert.equal(result.record.sha256, sha);
  assert.equal((await h.repo.list()).value.length, 1); assert.equal(h.map.get('tomorrow:finance'), 'KEEP');
});
test('same hash returns existing record and never registers second', async () => {
  const h = harness(); await h.importer.importDocument(input('doc1'));
  const result = await h.importer.importDocument(input('doc2'));
  assert.equal(result.ok, true); assert.equal(result.kind, 'duplicate'); assert.equal(result.record.id, 'doc1');
  assert.equal((await h.repo.list()).value.length, 1);
});
test('explicit independent copy creates another record referencing same object', async () => {
  const h = harness(); await h.importer.importDocument(input('doc1'));
  const result = await h.importer.importDocument({ ...input('doc2'), saveIndependentCopy: true });
  assert.equal(result.kind, 'created'); assert.equal(result.record.vaultPath, objectRelPath);
  assert.equal((await h.repo.list()).value.length, 2);
});
test('invalid input fails before any vault or repository write', async () => {
  const h = harness(); const result = await h.importer.importDocument({ ...input('doc1'), id: '../bad' });
  assert.equal(result.code, 'invalid_input'); assert.equal(h.calls(), 0); assert.equal((await h.repo.list()).value.length, 0);
});
test('unsupported MIME fails before vault call', async () => {
  const h = harness(); assert.equal((await h.importer.importDocument({ ...input('doc1'), declaredMime: 'text/plain' })).code, 'invalid_input');
  assert.equal(h.calls(), 0);
});
test('vault failure does not write metadata', async () => {
  const h = harness({ ok: false, code: 'copy_failed', stagedRelPath: 'vault/staging/example.part' });
  assert.equal((await h.importer.importDocument(input('doc1'))).code, 'vault_failed');
  assert.equal((await h.repo.list()).value.length, 0);
});
test('vault exception fails closed', async () => {
  const importer = createDocumentImporter({ vault: { store: async () => { throw Error('disk'); } }, repository: { createIfHashAbsent: async () => { throw Error('must not run'); } } });
  assert.equal((await importer.importDocument(input('doc1'))).code, 'vault_failed');
});
test('malformed vault success cannot be registered', async () => {
  const h = harness({ ...vaultResult, objectRelPath: 'vault/objects/wrong.pdf' });
  assert.equal((await h.importer.importDocument(input('doc1'))).detail, 'invalid_vault_result');
  assert.equal((await h.repo.list()).value.length, 0);
});
test('repository storage failure retains verified object evidence', async () => {
  const h = harness(); const importer = createDocumentImporter({ vault: h.vault, repository: { createIfHashAbsent: async () => ({ ok: false, error: 'storage_error' }) } });
  const result = await importer.importDocument(input('doc1'));
  assert.equal(result.ok, false); assert.equal(result.code, 'repository_failed'); assert.equal(result.evidence.sha256, sha);
  assert.equal(result.evidence.objectRelPath, objectRelPath); assert.equal(result.evidence.attemptedRecordId, 'doc1');
});
test('repository exception retains evidence and does not delete file', async () => {
  const importer = createDocumentImporter({ vault: { store: async () => vaultResult }, repository: { createIfHashAbsent: async () => { throw Error('failure'); } } });
  const result = await importer.importDocument(input('doc1'));
  assert.equal(result.code, 'repository_failed'); assert.equal(result.evidence.byteSize, 12);
});
test('vault duplicate can still create metadata when record is absent', async () => {
  const h = harness({ ...vaultResult, outcome: 'duplicate', leftoverStageRelPath: 'vault/staging/leftover.part' });
  const result = await h.importer.importDocument(input('doc1'));
  assert.equal(result.kind, 'created'); assert.equal(result.vaultOutcome, 'duplicate');
  assert.equal(result.leftoverStageRelPath, 'vault/staging/leftover.part');
});
test('invalid independent copy flag fails before writes', async () => {
  const h = harness(); assert.equal((await h.importer.importDocument({ ...input('doc1'), saveIndependentCopy: 'yes' })).code, 'invalid_input');
  assert.equal(h.calls(), 0);
});
test('repository inconsistent success is not reported as success', async () => {
  const importer = createDocumentImporter({ vault: { store: async () => vaultResult }, repository: { createIfHashAbsent: async () => ({ ok: true, value: { kind: 'created', record: { ...input('doc1'), sha256: sha, vaultPath: 'wrong' } } }) } });
  const result = await importer.importDocument(input('doc1'));
  assert.equal(result.code, 'repository_failed'); assert.equal(result.detail, 'invalid_result');
});
