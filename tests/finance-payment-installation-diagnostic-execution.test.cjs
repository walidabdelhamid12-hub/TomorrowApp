'use strict';
/** S3-E executable mocked-port contract tests. No actual storage writes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname,'../src/features/finance/store/paymentInstallationDiagnostics.ts'),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({raw, readError, recoveryError, recovery, journal}={}) {
  const calls=[];
  const mocks={
    './paymentAccountingVerification':{verifyPersistedPaymentAccounting(value){calls.push('verify');if(recoveryError)throw recoveryError;return recovery??{installation:'legacy',globalIssues:[],findings:[]};}},
    './paymentJournalVersionDetection':{classifyPaymentJournalVersion(value){calls.push('journal');return journal??{kind:'legacy'};}},
    './paymentInstallationAdmission':{inspectInstallationAdmission(e){calls.push('admission');return e.exclusiveMutationGateHeld === false?{status:'denied',reason:'No held lease',postingAllowed:false,readiness:'blocked',installationAuthorized:false}:{status:'preflight-candidate',reason:'unsafe',postingAllowed:false,readiness:'blocked',installationAuthorized:false};}},
  };
  const mod={exports:{}};
  vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require(id){if(!mocks[id])throw Error('Unexpected dependency '+id);return mocks[id];}});
  const runtime={async readRecoverySnapshot(){calls.push('read');if(readError)throw readError;return raw??{'tomorrow:finance':'{}','tomorrow:ledger':'{}','tomorrow:payment-operations':null};}};
  return {inspect:mod.exports.inspectDormantPaymentInstallation,runtime,calls};
}
async function denied(h){
 const result=await h.inspect(h.runtime);
 assert.equal(result.status,'denied');
 assert.equal(result.postingAllowed,false);
 assert.equal(result.readiness,'blocked');
 assert.equal(result.installationAuthorized,false);
}
test('reads a snapshot then checks journal, recovery, admission',async()=>{
 const h=harness();await denied(h);assert.deepEqual(h.calls,['read','journal','verify','admission']);
});
test('snapshot rejection fails closed',async()=>{
 const h=harness({readError:new Error('interrupted')});await denied(h);assert.deepEqual(h.calls,['read']);
});
test('recovery parser rejection fails closed',async()=>{
 const h=harness({recoveryError:new Error('malformed')});await denied(h);
 assert.deepEqual(h.calls,['read','journal','verify']);
});
test('V3 observation remains denied',async()=>{
 const h=harness({journal:{kind:'v3'},recovery:{installation:'blocked',globalIssues:['conflict'],findings:[]}});await denied(h);
});
test('missing accounting documents remain denied',async()=>{
 const h=harness({raw:{'tomorrow:finance':null,'tomorrow:ledger':null,'tomorrow:payment-operations':null}});await denied(h);
});
test('bridge rejects even if admission dependency returns a candidate',async()=>{
 const h=harness();
 const result=await h.inspect(h.runtime);
 assert.equal(result.status,'denied');
});
