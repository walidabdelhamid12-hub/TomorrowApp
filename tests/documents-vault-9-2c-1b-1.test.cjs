const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(rel) {
  const filename = path.resolve(root, rel);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function('module', 'exports', 'require', source.outputText)(mod, mod.exports, name => {
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
    throw new Error('Unexpected dependency: ' + name);
  });
  return mod.exports;
}
const { createLocalFileVault } = load('src/features/documents/vault/localFileVault.ts');
const { objectPath, stagingPath, isSafeVaultRelativePath } = load('src/features/documents/vault/vaultPaths.ts');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const uri = 'file:///picked/document.pdf';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fake(content = 'test content') {
  const files = new Map([[uri, Buffer.from(content)]]);
  const faults = {};
  const port = {
    async sourceExists(p) { return files.has(p); },
    async sourceSize(p) { return files.get(p)?.length ?? 0; },
    async exists(p) { return files.has(p); },
    async size(p) { return files.get(p)?.length ?? 0; },
    async digestSha256(p) { if (faults.digest) throw Error('digest'); return hash(files.get(p)); },
    async ensureParentDirectory() {},
    async copySourceNoOverwrite(from, to) {
      if (faults.copy) throw Error('copy');
      if (files.has(to)) throw Error('overwrite');
      const bytes = files.get(from);
      files.set(to, Buffer.from(faults.shortCopy ? bytes.subarray(0, bytes.length - 1) : bytes));
    },
    async moveNoOverwrite(from, to) {
      if (faults.move) throw Error('move');
      if (files.has(to)) { if (faults.noopMove) return; throw Error('overwrite'); }
      files.set(to, files.get(from)); files.delete(from);
      if (faults.corruptAfterMove) files.set(to, Buffer.from('tampered'));
    },
  };
  let n = 0;
  const vault = createLocalFileVault(port, { maxBytes: 1024, nextStageId: () => id(++n) });
  return { files, faults, port, vault };
}
const input = { sourceUri: uri, declaredMime: 'application/pdf' };
test('path validation and deterministic content path', () => {
  const h = hash('abc');
  assert.equal(objectPath(h, 'application/pdf'), `vault/objects/${h.slice(0,2)}/${h}.pdf`);
  assert.equal(isSafeVaultRelativePath(objectPath(h, 'application/pdf')), true);
  assert.equal(isSafeVaultRelativePath(stagingPath(id(1))), true);
  for (const p of ['../vault/a', 'vault/../a', 'vault%2fobjects/a', 'C:\\vault\\x', 'vault/objects/aa/../bad']) assert.equal(isSafeVaultRelativePath(p), false);
  assert.throws(() => objectPath('A'.repeat(64), 'application/pdf'));
  assert.throws(() => objectPath(h, 'text/plain'));
  assert.throws(() => stagingPath('../oops'));
});
test('successful store verified after promotion', async () => {
  const f = fake(); const r = await f.vault.store(input);
  assert.equal(r.ok, true); assert.equal(r.outcome, 'stored'); assert.equal(r.verified, true);
  assert.equal(r.sha256, hash('test content')); assert.equal(f.files.has(r.objectRelPath), true);
  assert.equal(f.files.has(stagingPath(id(1))), false);
});
test('duplicate verified, staging retained and original unchanged', async () => {
  const f = fake(); const a = await f.vault.store(input); const b = await f.vault.store(input);
  assert.equal(a.ok, true); assert.equal(b.outcome, 'duplicate');
  assert.equal(b.leftoverStageRelPath, stagingPath(id(2)));
  assert.equal(f.files.get(a.objectRelPath).toString(), 'test content');
});
test('missing, empty, too large and invalid input fail closed', async () => {
  assert.equal((await fake().vault.store({ ...input, declaredMime: 'text/plain' })).code, 'invalid_input');
  const missing = fake(); missing.files.delete(uri);
  assert.equal((await missing.vault.store(input)).code, 'source_missing');
  assert.equal((await fake('').vault.store(input)).code, 'source_empty');
  assert.equal((await fake('x'.repeat(1025)).vault.store(input)).code, 'size_exceeded');
  assert.throws(() => createLocalFileVault(fake().port, { maxBytes: 0, nextStageId: () => id(1) }));
});
test('copy failure and short copy never succeed', async () => {
  const a = fake(); a.faults.copy = true;
  assert.equal((await a.vault.store(input)).code, 'copy_failed');
  const b = fake(); b.faults.shortCopy = true;
  const r = await b.vault.store(input);
  assert.equal(r.code, 'size_mismatch'); assert.equal(b.files.has(r.stagedRelPath), true);
});
test('digest failure retains staging', async () => {
  const f = fake(); f.faults.digest = true;
  const r = await f.vault.store(input);
  assert.equal(r.code, 'hash_failed'); assert.equal(f.files.has(r.stagedRelPath), true);
});
test('conflicting existing target is preserved', async () => {
  const f = fake(); const target = objectPath(hash('test content'), 'application/pdf');
  f.files.set(target, Buffer.from('other content'));
  const r = await f.vault.store(input);
  assert.equal(r.code, 'integrity_conflict'); assert.equal(f.files.get(target).toString(), 'other content');
});
test('move failure retains staging', async () => {
  const f = fake(); f.faults.move = true;
  const r = await f.vault.store(input);
  assert.equal(r.code, 'promote_failed'); assert.equal(f.files.has(r.stagedRelPath), true);
});
test('post-promotion corruption is rejected', async () => {
  const f = fake(); f.faults.corruptAfterMove = true;
  const r = await f.vault.store(input);
  assert.equal(r.code, 'verify_failed');
});
test('concurrent imports serialize and do not overwrite', async () => {
  const f = fake(); const results = await Promise.all([f.vault.store(input), f.vault.store(input)]);
  assert.deepEqual(results.map(r => r.outcome), ['stored', 'duplicate']);
});
test('port exposes no deletion and vault sources have no forbidden imports', () => {
  const f = fake(); assert.equal(typeof f.port.delete, 'undefined');
  for (const name of ['vaultTypes', 'vaultPaths', 'vaultFileSystem', 'localFileVault']) {
    const source = fs.readFileSync(path.join(root, 'src/features/documents/vault', name + '.ts'), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*(finance|expo-file-system|documentRepository|scanner|ocr)/i);
  }
});
test('silent no-op move cannot claim successful promotion', async () => {
  const f = fake(); const originalMove = f.port.moveNoOverwrite;
  f.port.moveNoOverwrite = async (from, to) => {
    f.files.set(to, Buffer.from('racing writer'));
    f.faults.noopMove = true;
    await originalMove(from, to);
  };
  const r = await f.vault.store(input);
  assert.equal(r.code, 'promote_failed');
  assert.equal(f.files.get(objectPath(hash('test content'), 'application/pdf')).toString(), 'racing writer');
});
test('staging identifier collision cannot overwrite an existing staging file', async () => {
  const f = fake(); const stage = stagingPath(id(1)); f.files.set(stage, Buffer.from('older partial import'));
  const r = await f.vault.store(input);
  assert.equal(r.code, 'copy_failed');
  assert.equal(f.files.get(stage).toString(), 'older partial import');
});
