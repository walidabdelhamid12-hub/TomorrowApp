const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/shareStatementPdf.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const pdfBytes = Buffer.from('%PDF-1.7\nPDF byte fixture\n%%EOF\n');
const base64 = pdfBytes.toString('base64');
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function harness(options = {}) {
  const events = [], files = [], shares = [];
  const started = deferred();
  const cache = { uri: 'file:///data/user/0/app/cache/' };
  class File {
    constructor(directory, name) {
      assert.equal(directory, cache);
      assert.match(name, /^tomorrow-statement-\d+\.pdf$/);
      this.uri = directory.uri + name;
      this.contents = null;
      files.push(this);
    }
    // Matches SDK 58: write is asynchronous; Base64 is decoded into PDF bytes.
    async write(content, writeOptions) {
      events.push('write-start');
      assert.deepEqual(writeOptions, { encoding: 'base64' });
      started.resolve();
      if (options.gate) await options.gate.promise;
      if (options.writeError) throw options.writeError;
      this.contents = options.empty ? Buffer.alloc(0) : Buffer.from(content, 'base64');
      events.push('write-done');
    }
    get exists() { events.push('exists'); return !options.missing && this.contents !== null; }
    get size() { events.push('size'); return this.contents?.length ?? 0; }
  }
  const mocks = {
    'expo-file-system': { File, Paths: { cache } },
    'expo-print': { printToFileAsync: async input => {
      events.push('print'); assert.deepEqual(input, { html: '<p>Statement</p>', base64: true });
      if (options.printError) throw options.printError;
      return { uri: 'file:///unreadable/print.pdf', base64: options.data === undefined ? base64 : options.data };
    } },
    'expo-sharing': {
      isAvailableAsync: async () => options.available !== false,
      shareAsync: async (uri, sharingOptions) => {
        events.push('share');
        assert.ok(events.includes('write-done'));
        assert.equal(uri, files[0].uri);
        assert.ok(uri.startsWith(cache.uri));
        assert.deepEqual(files[0].contents, pdfBytes);
        shares.push({ uri, sharingOptions });
        if (options.shareError) throw options.shareError;
        if (options.shareGate) await options.shareGate.promise;
      },
    },
  };
  const module = { exports: {} };
  new Function('module', 'exports', 'require', js)(module, module.exports, id => {
    assert.ok(Object.hasOwn(mocks, id), 'Export must not access ledger/stores: ' + id);
    return mocks[id];
  });
  return { run: () => module.exports.shareStatementPdf('<p>Statement</p>'), started, events, files, shares };
}

test('PDF waits for native asynchronous write before inspecting or sharing the file', async () => {
  const gate = deferred(), h = harness({ gate });
  let settled = false;
  const result = h.run().then(() => { settled = true; }, error => { settled = true; throw error; });
  // Observe any regression rejection without creating an unhandled promise.
  const observed = result.catch(error => error);
  await h.started.promise;
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(settled, false, 'Export must remain pending until the native write finishes');
    assert.deepEqual(h.events, ['print', 'write-start']);
  } finally { gate.resolve(); }
  const error = await observed;
  assert.equal(error, undefined);
  assert.deepEqual(h.events, ['print', 'write-start', 'write-done', 'exists', 'size', 'share']);
});

test('PDF writes binary bytes to app cache with a local URI and PDF sharing options', async () => {
  const h = harness(); await h.run();
  assert.deepEqual(h.files[0].contents, pdfBytes);
  assert.deepEqual(h.shares[0].sharingOptions, {
    mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share statement PDF',
  });
});

test('PDF write rejection propagates and never inspects or shares an unfinished file', async () => {
  const error = new Error('Native write failed: disk full'), h = harness({ writeError: error });
  await assert.rejects(h.run(), value => value === error);
  assert.deepEqual(h.events, ['print', 'write-start']); assert.equal(h.shares.length, 0);
});

for (const extra of [{ missing: true }, { empty: true }]) {
  test('PDF refuses missing/empty file after completed write: ' + JSON.stringify(extra), async () => {
    const h = harness(extra);
    await assert.rejects(h.run(), /Unable to prepare the PDF/);
    assert.ok(h.events.indexOf('exists') > h.events.indexOf('write-done'));
    assert.equal(h.shares.length, 0);
  });
}

for (const data of ['', null, 'bm90IGEgUERG']) {
  test('PDF refuses absent/invalid Print bytes before creating a file: ' + data, async () => {
    const h = harness({ data });
    await assert.rejects(h.run(), /PDF generation did not return valid PDF data/);
    assert.equal(h.files.length, 0); assert.equal(h.shares.length, 0);
  });
}

test('PDF unavailable sharing fails before generation or file creation', async () => {
  const h = harness({ available: false });
  await assert.rejects(h.run(), /File sharing is not available/);
  assert.deepEqual(h.events, []); assert.equal(h.files.length, 0);
});

test('PDF Print failure propagates before any cache write', async () => {
  const error = new Error('Print renderer failed'), h = harness({ printError: error });
  await assert.rejects(h.run(), value => value === error);
  assert.equal(h.files.length, 0); assert.equal(h.shares.length, 0);
});

test('PDF awaits sharing completion and propagates native sharing rejection', async () => {
  const gate = deferred(), h = harness({ shareGate: gate });
  let completed = false;
  const pending = h.run().then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.shares.length, 1); assert.equal(completed, false);
  gate.resolve(); await pending; assert.equal(completed, true);
  const error = new Error('Native sharing refused URI'), rejected = harness({ shareError: error });
  await assert.rejects(rejected.run(), value => value === error);
});
