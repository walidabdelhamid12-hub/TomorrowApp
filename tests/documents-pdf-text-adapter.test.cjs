const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const filename = path.resolve(__dirname, '../src/features/documents/extraction/pdfTextAdapter.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(compiled, filename);
const { createPdfTextAdapter } = mod.exports;

const uri = 'file:///private/document.pdf';
const good = { ok: true, text: 'Invoice total 100 EGP', pageCount: 1, engine: 'test-engine' };
const engine = (extract = async () => good, supports = async () => true) =>
  ({ id: 'test-engine', supports, extract });

test('no engine fails closed without extraction', async () => {
  assert.deepEqual(await createPdfTextAdapter(null).extract(uri), { ok: false, reason: 'unavailable' });
});

test('non-local and malformed URIs are rejected before engine calls', async () => {
  let called = false;
  const adapter = createPdfTextAdapter(engine(async () => { called = true; return good; }));
  for (const value of ['https://example.com/a.pdf', 'content://external/file', '', 'file.pdf']) {
    assert.deepEqual(await adapter.extract(value), { ok: false, reason: 'unsupported' });
  }
  assert.equal(called, false);
});

test('unsupported engine declines file', async () => {
  const adapter = createPdfTextAdapter(engine(async () => { throw Error('should not extract'); }, async () => false));
  assert.deepEqual(await adapter.extract(uri), { ok: false, reason: 'unsupported' });
});

test('valid local text extraction is returned unchanged', async () => {
  assert.deepEqual(await createPdfTextAdapter(engine()).extract(uri), good);
});

test('empty text fails closed', async () => {
  assert.deepEqual(await createPdfTextAdapter(engine(async () => ({ ...good, text: '   ' }))).extract(uri),
    { ok: false, reason: 'empty_text' });
});

test('invalid page count and engine mismatch fail closed', async () => {
  for (const result of [
    { ...good, pageCount: 0 },
    { ...good, pageCount: 1001 },
    { ...good, pageCount: 1.5 },
    { ...good, engine: 'another-engine' },
    { ...good, text: 'a'.repeat(250001) }
  ]) {
    assert.deepEqual(await createPdfTextAdapter(engine(async () => result)).extract(uri),
      { ok: false, reason: 'engine_error' });
  }
});

test('engine exceptions fail closed', async () => {
  assert.deepEqual(await createPdfTextAdapter(engine(async () => { throw Error('read failed'); })).extract(uri),
    { ok: false, reason: 'engine_error' });
});

test('engine failure result is preserved without creating financial data', async () => {
  const result = { ok: false, reason: 'unreadable' };
  assert.deepEqual(await createPdfTextAdapter(engine(async () => result)).extract(uri), result);
});
