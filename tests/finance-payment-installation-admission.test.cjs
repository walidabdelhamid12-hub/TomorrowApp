'use strict';
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
const base = Object.freeze({ journalVersion:'legacy', recoveryInstallation:'legacy', recoveryIssueCount:0, recoveryFindingCount:0, financePresent:true, ledgerPresent:true, financeHistoryEmpty:true, ledgerHistoryEmpty:true, writeQueueDrained:true, storageHealthy:true, exclusiveMutationGateHeld:true });
const cases = [
 ['bad journal',{journalVersion:'blocked'}],['existing V3',{journalVersion:'v3'}],
 ['blocked recovery',{recoveryInstallation:'blocked'}],['consistent recovery',{recoveryInstallation:'consistent'}],
 ['recovery issue',{recoveryIssueCount:1}],['recovery finding',{recoveryFindingCount:1}],
 ['negative issue count',{recoveryIssueCount:-1}],['NaN finding count',{recoveryFindingCount:NaN}],
 ['missing Finance',{financePresent:false}],['missing Ledger',{ledgerPresent:false}],
 ['Finance history',{financeHistoryEmpty:false}],['Ledger history',{ledgerHistoryEmpty:false}],
 ['pending write',{writeQueueDrained:false}],['unhealthy storage',{storageHealthy:false}],
 ['missing exclusive gate',{exclusiveMutationGateHeld:false}],
];
for (const [name, patch] of cases) test(name, () => {
 const result = inspect({...base,...patch});
 assert.equal(result.status,'denied');
 assert.equal(result.postingAllowed,false);
 assert.equal(result.readiness,'blocked');
 assert.equal(result.installationAuthorized,false);
});
for (const journalVersion of ['missing','legacy']) test('candidate '+journalVersion, () => {
 const result=inspect({...base,journalVersion});
 assert.equal(result.status,'preflight-candidate');
 assert.equal(result.installationAuthorized,false);
 assert.equal(result.postingAllowed,false);
 assert.equal(result.readiness,'blocked');
});
test('read-only input',()=>{const before=JSON.stringify(base);inspect(base);assert.equal(JSON.stringify(base),before)});
