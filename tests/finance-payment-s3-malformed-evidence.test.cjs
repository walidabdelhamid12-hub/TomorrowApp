'use strict';
/** S3 malformed-evidence regression tests: classifiers fail closed at runtime. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, name) {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/store', file + '.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports });
  return module.exports[name];
}
const admission = load('paymentInstallationAdmission', 'inspectInstallationAdmission');
const ack = load('paymentPersistenceAck', 'classifyPersistenceAck');
const goodAdmission = Object.freeze({
  journalVersion:'legacy', recoveryInstallation:'legacy', recoveryIssueCount:0, recoveryFindingCount:0,
  financePresent:true, ledgerPresent:true, financeHistoryEmpty:true, ledgerHistoryEmpty:true,
  writeQueueDrained:true, storageHealthy:true, exclusiveMutationGateHeld:true,
});
const goodAck = Object.freeze({
  key:'tomorrow:finance', generationId:'generation-1', writeIssued:true, writeAcknowledged:true,
  readbackAcknowledged:true, expectedRaw:'saved', actualRaw:'saved',
});
for (const invalid of ['future', '', null, undefined, 3, {}, true]) {
  test('rejects unsupported journal classification '+String(invalid), () => {
    const result = admission({...goodAdmission, journalVersion:invalid});
    assert.equal(result.status,'denied');
    assert.equal(result.installationAuthorized,false);
    assert.equal(result.postingAllowed,false);
  });
}
for (const field of ['writeIssued','writeAcknowledged','readbackAcknowledged']) {
  for (const invalid of ['true', 1, {}, null, undefined]) {
    test('rejects malformed ACK flag '+field+'='+String(invalid), () => {
      const result = ack({...goodAck, [field]:invalid});
      assert.notEqual(result.kind,'readback-verified');
    });
  }
}
for (const [field,value] of [
  ['key',null],['key',{}],['generationId',null],['generationId',{}],
  ['actualRaw',null],['actualRaw',{}],['expectedRaw',{}],
]) {
  test('rejects malformed ACK identity or bytes '+field+'='+String(value), () => {
    const result=ack({...goodAck,[field]:value});
    assert.notEqual(result.kind,'readback-verified');
  });
}
test('valid ACK is still only an observation',()=>{
  assert.equal(ack(goodAck).kind,'readback-verified');
  assert.equal(admission(goodAdmission).installationAuthorized,false);
});
