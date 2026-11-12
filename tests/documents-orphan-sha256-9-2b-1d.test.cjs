const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// Always load current LOCAL source; compile in memory without emitting files.
const project = path.join(__dirname, '..');
const projectRequire = createRequire('D:/Mobile Apps/TomorrowApp/package.json');
const ts = projectRequire('typescript');
function load(relative, dependencies = {}) {
  const filename = path.join(project, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics ?? [], []);
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled.outputText)(
    module, module.exports,
    id => Object.hasOwn(dependencies, id) ? dependencies[id] : projectRequire(id),
  );
  return module.exports;
}

test('An orphaned SHA-256 record blocks a second import with the same hash.', async () => {
  const invariants = load('src/features/documents/domain/invariants.ts');
  // Dependency wiring supplies the actual local implementation, not a stub.
  const loadRepository = () => load('src/features/documents/storage/documentRepository.ts', {
    '../domain/invariants': invariants,
  });
  const { createDocumentRepository, DOCUMENTS_NAMESPACE: ns } = loadRepository();
  const indexKey = `${ns}index`;
  const recordKey = id => `${ns}record:${id}`;
  const fixture = id => ({
    id, category: 'receipt', status: 'stored', source: 'picker',
    name: `${id}.pdf`, mimeType: 'application/pdf', byteSize: 128,
    vaultPath: `documents/${id}.pdf`, sha256: 'a'.repeat(64),
    createdAt: '2026-11-13T00:00:00.000Z', updatedAt: '2026-11-13T00:00:00.000Z',
  });
  const first = fixture('orphan_doc1');
  const second = fixture('retry_doc2');
  for (const record of [first, second]) {
    assert.equal(invariants.validId(record.id), true);
    assert.doesNotThrow(() => invariants.validateDocument(record));
  }
  // Synthetic sentinels only: never open the app's actual Finance storage.
  const finance = [
    ['tomorrow:finance', '{ "sentinel": "finance", "amount": "001.00" }'],
    ['tomorrow:ledger', '{ "sentinel": "ledger", "postingAllowed": false }'],
    ['tomorrow:balances', '{ "sentinel": "balances", "amount": "0.00" }'],
  ];
  const map = new Map(finance);
  const writes = [];
  const financeBytes = () => finance.map(([key]) => [key, Buffer.from(map.get(key), 'utf8')]);
  const beforeFinance = financeBytes();
  let failIndex = true;
  const backend = () => ({
    getItem: async key => map.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push([key, value]);
      if (key === indexKey && failIndex) throw new Error('Simulated index write failure');
      map.set(key, value);
    },
  });
  const firstRepo = createDocumentRepository(backend());
  assert.deepEqual(await firstRepo.createIfHashAbsent(first), { ok: false, error: 'storage_error' });
  assert.equal(map.get(recordKey(first.id)), JSON.stringify(first));
  assert.equal(map.has(indexKey), false);
  assert.deepEqual(writes, [
    [ns + 'pending-import', JSON.stringify({ version: 1, mode: 'hash', record: first, saveIndependentCopy: false })],
    [recordKey(first.id), JSON.stringify(first)],
    [indexKey, JSON.stringify([first.id])],
  ]);
  assert.deepEqual(financeBytes(), beforeFinance);
  const beforeRetry = [...map.entries()];
  const writeCount = writes.length;

  // Restart: fresh module queue, backend object and repository; persisted bytes survive.
  failIndex = false;
  const restartedRepo = loadRepository().createDocumentRepository(backend());
  const result = await restartedRepo.createIfHashAbsent(second);
  assert.deepEqual(financeBytes(), beforeFinance, 'Finance sentinel bytes must remain identical');
  assert.ok(writes.every(([key]) => key.startsWith(ns)), 'Only Documents writes are permitted');
  assert.deepEqual({
    result,
    secondRecordExists: map.has(recordKey(second.id)),
    persistedEntries: [...map.entries()],
    retryWrites: writes.slice(writeCount),
  }, {
    result: { ok: false, error: 'storage_error' },
    secondRecordExists: false,
    persistedEntries: beforeRetry,
    retryWrites: [],
  }, 'Orphaned SHA-256 must fail closed after restart without creating a second record or writing storage');
});
