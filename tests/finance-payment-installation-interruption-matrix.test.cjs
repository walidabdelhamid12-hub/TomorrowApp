'use strict';
/**
 * S3-D fault-injection matrix for pure classifiers (not live storage tests).
 * No installer is invoked; every scenario must remain non-authorizing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, symbol) {
  const src = fs.readFileSync(path.join(__dirname, '../src/features/finance/store', file + '.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleShim = { exports: {} };
  vm.runInNewContext(js, { module: moduleShim, exports: moduleShim.exports });
  return moduleShim.exports[symbol];
}
const ack = load('paymentPersistenceAck', 'classifyPersistenceAck');
const admission = load('paymentInstallationAdmission', 'inspectInstallationAdmission');
const version = load('paymentJournalVersionDetection', 'classifyPaymentJournalVersion');
const observed = Object.freeze({
  key:'tomorrow:payment-operations', generationId:'generation-1',
  writeIssued:true, writeAcknowledged:true, readbackAcknowledged:true,
  expectedRaw:'{"version":3}', actualRaw:'{"version":3}',
});
const baseline = Object.freeze({
  journalVersion:'legacy', recoveryInstallation:'legacy',
  recoveryIssueCount:0, recoveryFindingCount:0,
  financePresent:true, ledgerPresent:true,
  financeHistoryEmpty:true, ledgerHistoryEmpty:true,
  writeQueueDrained:true, storageHealthy:true, exclusiveMutationGateHeld:true,
});
const faultMatrix = [
 ['preflight stopped before issuance', {writeIssued:false}, 'rejected'],
 ['crash after issuance before ACK', {writeAcknowledged:false}, 'uncertain'],
 ['write rejected after potential side effect', {writeAcknowledged:false,error:'backend rejected'}, 'uncertain'],
 ['write ACK received, crash before readback', {readbackAcknowledged:false}, 'uncertain'],
 ['readback failed after acknowledged write', {readbackAcknowledged:false,error:'read failed'}, 'uncertain'],
 ['readback result missing', {actualRaw:undefined}, 'uncertain'],
 ['readback key deleted', {actualRaw:null}, 'conflict'],
 ['readback stale bytes', {actualRaw:'{"version":2}'}, 'conflict'],
 ['readback torn bytes', {actualRaw:'{"version":3'}, 'conflict'],
 ['readback reformatted bytes', {actualRaw:'{ "version":3 }'}, 'conflict'],
 ['write ACK absent but readback matches', {writeAcknowledged:false}, 'uncertain'],
 ['invalid generation identity', {generationId:''}, 'conflict'],
 ['invalid key identity', {key:''}, 'conflict'],
 ['clean per-key readback', {}, 'readback-verified'],
];
for (const [name, change, expected] of faultMatrix) {
  test('persistence interruption: '+name, () => {
    const result = ack({...observed,...change});
    assert.equal(result.kind,expected);
    assert.equal(Object.hasOwn(result,'postingAllowed'),false);
  });
}
const recoveryMatrix = [
 ['journal initializing after interruption', {journalVersion:'v3'}],
 ['unsupported journal after partial write', {journalVersion:'blocked'}],
 ['generation mismatch detected by verifier', {recoveryInstallation:'blocked'}],
 ['recovery findings remain', {recoveryFindingCount:1}],
 ['recovery global issue remains', {recoveryIssueCount:1}],
 ['Finance missing after partial installation', {financePresent:false}],
 ['Ledger missing after partial installation', {ledgerPresent:false}],
 ['Finance history present', {financeHistoryEmpty:false}],
 ['Ledger history present', {ledgerHistoryEmpty:false}],
 ['outstanding writes after interruption', {writeQueueDrained:false}],
 ['sticky storage failure', {storageHealthy:false}],
 ['lost exclusive mutation gate', {exclusiveMutationGateHeld:false}],
];
for (const [name, change] of recoveryMatrix) {
  test('recovery interruption: '+name, () => {
    const result=admission({...baseline,...change});
    assert.equal(result.status,'denied');
    assert.equal(result.installationAuthorized,false);
    assert.equal(result.postingAllowed,false);
    assert.equal(result.readiness,'blocked');
  });
}
for (const [name,raw,kind] of [
  ['V3 after journal phase write','{"version":3,"state":{"installation":{"phase":"initializing"}}}','v3'],
  ['V3 after active journal write','{"version":3,"state":{"installation":{"phase":"active"}}}','v3'],
  ['truncated journal','{"version":3,"state":','blocked'],
  ['unsupported journal','{"version":4,"state":{}}','blocked'],
]) test('journal interruption: '+name,()=>{
  const classified=version(raw);
  assert.equal(classified.kind,kind);
  const result=admission({...baseline,journalVersion:classified.kind});
  assert.equal(result.status,'denied');
  assert.equal(result.installationAuthorized,false);
});
test('successful individual ACK is not installation authority',()=>{
  assert.equal(ack(observed).kind,'readback-verified');
  const result=admission(baseline);
  assert.equal(result.status,'preflight-candidate');
  assert.equal(result.installationAuthorized,false);
  assert.equal(result.postingAllowed,false);
  assert.equal(result.readiness,'blocked');
});
test('classifier inputs remain unchanged',()=>{
  const original=JSON.stringify([observed,baseline]);
  ack(observed);admission(baseline);
  assert.equal(JSON.stringify([observed,baseline]),original);
});
