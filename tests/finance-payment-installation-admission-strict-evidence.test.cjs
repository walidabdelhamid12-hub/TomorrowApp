'use strict';
/** S3-C malformed runtime evidence must fail closed even when TypeScript is bypassed. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/store/paymentInstallationAdmission.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports });
const inspect = mod.exports.inspectInstallationAdmission;
const valid = Object.freeze({
 journalVersion:'legacy', recoveryInstallation:'legacy', recoveryIssueCount:0, recoveryFindingCount:0,
 financePresent:true, ledgerPresent:true, financeHistoryEmpty:true, ledgerHistoryEmpty:true,
 writeQueueDrained:true, storageHealthy:true, exclusiveMutationGateHeld:true,
});
const fields = ['financePresent','ledgerPresent','financeHistoryEmpty','ledgerHistoryEmpty','writeQueueDrained','storageHealthy','exclusiveMutationGateHeld'];
for (const field of fields) for (const bad of ['true',1,{},null,undefined]) {
 test(field+' rejects '+String(bad), () => {
   const result=inspect({...valid,[field]:bad});
   assert.equal(result.status,'denied');
   assert.equal(result.installationAuthorized,false);
   assert.equal(result.postingAllowed,false);
   assert.equal(result.readiness,'blocked');
 });
}
test('strict boolean evidence accepts a preflight candidate but never authorizes',()=>{
 const result=inspect(valid);
 assert.equal(result.status,'preflight-candidate');
 assert.equal(result.installationAuthorized,false);
 assert.equal(result.postingAllowed,false);
});
