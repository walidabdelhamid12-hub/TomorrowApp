'use strict';
/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
// Pure modules only: any accidental native/store dependency fails to load.
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} };
  cache.set(filename, mod);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require(id) {
    assert.ok(id.startsWith('.') || id.startsWith('@/'), 'Unexpected dependency: ' + id);
    const resolved = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(filename), id);
    assert.doesNotMatch(resolved, /[\\/]store[\\/]/);
    return load(resolved + '.ts');
  } }, { filename });
  return mod.exports;
}
const { readDormantV3InstallationTransition: read } = load(path.join(root,
  'src/features/finance/types/dormantV3Installation.ts'));
const state = phase => ({ baselines: [], receipts: [], ...(phase ? {
  installation: { schemaVersion: 1, generationId: 'g', phase },
} : {}) });

for (const [before, after] of [[undefined, 'initializing'], ['initializing', 'initializing'],
  ['initializing', 'active'], ['active', 'active']]) {
  test('valid metadata transition ' + before + ' -> ' + after + ' grants no authority', () => {
    const previous = state(before), next = state(after);
    const original = JSON.stringify([previous, next]);
    const result = read(previous, next);
    assert.equal(result.journal.installation.phase, after);
    assert.equal(result.postingAllowed, false);
    assert.equal(result.readiness, 'blocked');
    assert.equal(result.installationAuthorized, false);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.journal.installation));
    next.installation.generationId = 'changed';
    assert.equal(result.journal.installation.generationId, 'g');
    next.installation.generationId = 'g';
    assert.equal(JSON.stringify([previous, next]), original);
    assert.equal(Object.isFrozen(next), false);
  });
}
for (const [name, previous, next, reason] of [
  ['direct activation', state(), state('active'), /initialized first/],
  ['missing metadata', state(), state(), /cannot be removed or omitted/],
  ['metadata deletion', state('active'), state(), /cannot be removed or omitted/],
  ['phase regression', state('active'), state('initializing'), /cannot regress/],
  ['generation replacement', state('initializing'), { ...state('active'),
    installation: { schemaVersion: 1, generationId: 'other', phase: 'active' } }, /generation cannot change/],
  ['invalid phase', state(), state('ready'), /Invalid payment journal installation/],
  ['invalid V3 shape', state(), { ...state('initializing'), extra: true }, /Invalid recovery evidence/],
]) test('rejects ' + name + ' without modifying inputs', () => {
  const original = JSON.stringify([previous, next]);
  assert.throws(() => read(previous, next), reason);
  assert.equal(JSON.stringify([previous, next]), original);
});
for (const side of ['before', 'after']) test('rejects valid baseline history in ' + side, () => {
  const before = state('initializing'), after = state('active');
  (side === 'before' ? before : after).baselines.push({ schemaVersion: 1, baselineId: 'baseline',
    generationId: 'g', parent: { entityType: 'debt', entityId: 'debt', direction: 'payable',
      amount: 10, currencyCode: 'USD', payments: [] } });
  const original = JSON.stringify([before, after]);
  assert.throws(() => read(before, after), /empty V3 journal/);
  assert.equal(JSON.stringify([before, after]), original);
});

for (const side of ['before', 'after']) test('rejects valid legacy receipt history in ' + side, () => {
  const before = state('initializing'), after = state('active');
  (side === 'before' ? before : after).receipts.push({ operationId: 'operation', paymentId: 'payment',
    ledgerTransactionId: 'transaction', status: 'prepared', request: {
      entityType: 'debt', entityId: 'debt', direction: 'payable', currencyCode: 'USD',
      amount: 10, date: '2026-11-08', funding: { kind: 'account', accountId: 'account', categoryId: 'category' },
    } });
  const original = JSON.stringify([before, after]);
  assert.throws(() => read(before, after), /empty V3 journal/);
  assert.equal(JSON.stringify([before, after]), original);
});
