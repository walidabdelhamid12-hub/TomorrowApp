const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();
const adapterPath = path.join(root, 'src/features/documents/vault/expoVaultFileSystem.ts');
const pathsPath = path.join(root, 'src/features/documents/vault/vaultPaths.ts');

const records = new Map();
const calls = [];
const documentRoot = { uri: 'file:///app/documents' };
const sourceUri = 'content://provider/document/123';
const stage = 'vault/staging/00000000-0000-4000-8000-000000000001.part';
const hash = 'a'.repeat(64);
const object = `vault/objects/aa/${hash}.pdf`;
const full = relative => `${documentRoot.uri}/${relative}`;

class MockDirectory {
  constructor(...parts) {
    this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).join('/');
  }
  create(options) { calls.push(['mkdir', this.uri, options]); }
}
class MockFile {
  constructor(...parts) {
    this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).join('/');
  }
  get exists() { return records.has(this.uri); }
  get size() { return records.get(this.uri)?.size ?? 0; }
  get parentDirectory() { return new MockDirectory(this.uri.slice(0, this.uri.lastIndexOf('/'))); }
  async digest(algorithm) {
    calls.push(['digest', this.uri, algorithm]);
    if (!this.exists) throw Error('missing');
    return records.get(this.uri).digest;
  }
  async copy(destination, options) {
    calls.push(['copy', this.uri, destination.uri, options]);
    if (destination.exists) throw Error('overwrite');
    if (!this.exists) throw Error('missing');
    records.set(destination.uri, { ...records.get(this.uri) });
  }
  async move(destination, options) {
    calls.push(['move', this.uri, destination.uri, options]);
    if (destination.exists) throw Error('overwrite');
    if (!this.exists) throw Error('missing');
    records.set(destination.uri, records.get(this.uri));
    records.delete(this.uri);
  }
}
function transpile(filename) {
  return ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function evaluate(filename, dependencies) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', transpile(filename))(
    module, module.exports, name => {
      if (!(name in dependencies)) throw Error(`Unexpected import: ${name}`);
      return dependencies[name];
    }
  );
  return module.exports;
}
const vaultPaths = evaluate(pathsPath, {});
const { createExpoVaultFileSystem } = evaluate(adapterPath, {
  'expo-file-system': { File: MockFile, Directory: MockDirectory, Paths: { document: documentRoot } },
  './vaultPaths': vaultPaths,
});
const port = createExpoVaultFileSystem();
function reset() {
  records.clear();
  calls.length = 0;
  records.set(sourceUri, { size: 17, digest: hash });
}

test('source file and content URI can be queried', async () => {
  reset();
  assert.equal(await port.sourceExists(sourceUri), true);
  assert.equal(await port.sourceSize(sourceUri), 17);
  assert.equal(await port.sourceExists('file:///missing.pdf'), false);
  await assert.rejects(port.sourceSize('file:///missing.pdf'));
});
test('invalid source URI is rejected', async () => {
  reset();
  for (const uri of ['https://example.com/a', '../file', '', 'data:abc']) {
    await assert.rejects(port.sourceExists(uri));
  }
});
test('unsafe relative paths rejected before native access', async () => {
  reset();
  for (const relative of ['../outside', '/vault/staging/a.part', 'vault/../bad', 'vault%2fobjects/x']) {
    await assert.rejects(port.exists(relative));
    await assert.rejects(port.ensureParentDirectory(relative));
    await assert.rejects(port.digestSha256(relative));
  }
  assert.equal(calls.length, 0);
});
test('creates nested parent directory idempotently', async () => {
  reset();
  await port.ensureParentDirectory(object);
  assert.deepEqual(calls[0], ['mkdir', full('vault/objects/aa'), { idempotent: true, intermediates: true }]);
});
test('copy uses explicit overwrite false and retains source', async () => {
  reset();
  await port.copySourceNoOverwrite(sourceUri, stage);
  assert.equal(await port.exists(stage), true);
  assert.equal(await port.size(stage), 17);
  assert.equal(records.has(sourceUri), true);
  assert.deepEqual(calls[0], ['copy', sourceUri, full(stage), { overwrite: false }]);
});
test('existing copy destination is preserved', async () => {
  reset();
  records.set(full(stage), { size: 99, digest: 'b'.repeat(64) });
  await assert.rejects(port.copySourceNoOverwrite(sourceUri, stage));
  assert.equal(records.get(full(stage)).size, 99);
  assert.equal(calls.length, 0);
});
test('move uses explicit overwrite false and removes stage on success', async () => {
  reset();
  records.set(full(stage), { size: 17, digest: hash });
  await port.moveNoOverwrite(stage, object);
  assert.equal(await port.exists(stage), false);
  assert.equal(await port.exists(object), true);
  assert.deepEqual(calls[0], ['move', full(stage), full(object), { overwrite: false }]);
});
test('existing move destination is preserved', async () => {
  reset();
  records.set(full(stage), { size: 17, digest: hash });
  records.set(full(object), { size: 99, digest: 'b'.repeat(64) });
  await assert.rejects(port.moveNoOverwrite(stage, object));
  assert.equal(records.get(full(object)).size, 99);
  assert.equal(records.has(full(stage)), true);
  assert.equal(calls.length, 0);
});
test('SHA-256 digest uses native algorithm and normalizes case', async () => {
  reset();
  records.set(full(object), { size: 17, digest: hash.toUpperCase() });
  assert.equal(await port.digestSha256(object), hash);
  assert.deepEqual(calls[0], ['digest', full(object), 'SHA-256']);
});
test('unreadable or missing files fail closed', async () => {
  reset();
  await assert.rejects(port.size(stage));
  await assert.rejects(port.digestSha256(stage));
  records.set(full(stage), { size: Number.NaN, digest: hash });
  await assert.rejects(port.size(stage));
});
test('adapter has no delete capability', () => {
  assert.equal(typeof port.delete, 'undefined');
  assert.equal(typeof port.remove, 'undefined');
});