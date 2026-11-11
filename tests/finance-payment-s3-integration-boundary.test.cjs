'use strict';
/**
 * S3 integration boundary audit: source-level regression checks only.
 * This is NOT a runtime persistence or crash test and never enables V3.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const store = read('src/features/finance/store/usePaymentOperationStore.ts');
const runtime = read('src/features/finance/store/paymentOperationRuntime.ts');
const verifier = read('src/features/finance/store/paymentAccountingVerification.ts');
const persistence = read('src/features/finance/store/financePersistence.ts');
const admission = read('src/features/finance/store/paymentInstallationAdmission.ts');
const ack = read('src/features/finance/store/paymentPersistenceAck.ts');
const version = read('src/features/finance/store/paymentJournalVersionDetection.ts');

test('legacy journal store remains V2 and rejects V3 hydration', () => {
  assert.match(store, /const VERSION\s*=\s*2\s*;/);
  assert.match(store, /!\[1, VERSION\]\.includes\(/);
});
test('V3 forensic reader is separate from legacy hydration', () => {
  assert.match(verifier, /export function readRecoveryJournalDocument\(/);
  assert.match(verifier, /readRecoveryJournalV3/);
});
test('recovery verification is persistently blocked', () => {
  assert.match(verifier, /postingAllowed:\s*false;\s*readonly readiness:\s*'blocked'/);
  assert.match(verifier, /postingAllowed:\s*false, readiness:\s*'blocked'/);
});
test('runtime exposes exclusive snapshot and forensic drain', () => {
  assert.match(runtime, /exclusive<T>\(/);
  assert.match(runtime, /readRecoverySnapshot\(\)/);
  assert.match(runtime, /readForensicSnapshot\(\)/);
  assert.match(runtime, /this\.persistence\.settle\(key\)/);
});
test('storage failure is sticky and uncertain for writes', () => {
  assert.match(persistence, /get uncertain\(\): boolean/);
  assert.match(persistence, /queue\.failure\s*\?\?=/);
  assert.match(persistence, /const settle = \(key: string\)/);
});
test('S3 primitives are dormant pure functions', () => {
  assert.match(version, /export function classifyPaymentJournalVersion\(/);
  assert.match(ack, /export function classifyPersistenceAck\(/);
  assert.match(admission, /export function inspectInstallationAdmission\(/);
  for (const source of [version, ack, admission]) {
    assert.doesNotMatch(source, /AsyncStorage|setItem\s*\(|removeItem\s*\(|\.persist\.rehydrate\s*\(/);
  }
});
test('S3-C never grants installation or posting', () => {
  assert.match(admission, /installationAuthorized:\s*false/);
  assert.match(admission, /postingAllowed:\s*false/);
  assert.match(admission, /readiness:\s*'blocked'/);
  assert.doesNotMatch(admission, /installationAuthorized:\s*true/);
});
test('S3 classification is not wired to production runtime yet', () => {
  for (const name of ['classifyPaymentJournalVersion','classifyPersistenceAck','inspectInstallationAdmission']) {
    assert.equal(runtime.includes(name), false, 'unexpected runtime integration: ' + name);
    assert.equal(store.includes(name), false, 'unexpected store integration: ' + name);
  }
});
