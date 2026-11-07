'use strict';
/** Source-level safety regression for the dormant S3-E diagnostic bridge. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../src/features/finance/store', file), 'utf8');
const bridge = read('paymentInstallationDiagnostics.ts');
const runtime = read('paymentOperationRuntime.ts');
test('bridge uses existing read-only recovery snapshot',()=>{
 assert.match(bridge,/await runtime\.readRecoverySnapshot\(\)/);
 assert.match(bridge,/verifyPersistedPaymentAccounting\(raw\)/);
 assert.match(bridge,/classifyPaymentJournalVersion\(raw\['tomorrow:payment-operations'\]\)/);
});
test('bridge never claims a lease after snapshot release',()=>{
 assert.match(bridge,/exclusiveMutationGateHeld:\s*false/);
 assert.match(bridge,/writeQueueDrained:\s*false/);
 assert.match(bridge,/storageHealthy:\s*false/);
});
test('bridge does not claim historical emptiness',()=>{
 assert.match(bridge,/financeHistoryEmpty:\s*false/);
 assert.match(bridge,/ledgerHistoryEmpty:\s*false/);
});
test('bridge returns denial if a future classifier ever returns candidate',()=>{
 assert.match(bridge,/if \(result\.status !== 'denied'\)/);
 assert.match(bridge,/status:\s*'denied'/);
 assert.match(bridge,/installationAuthorized:\s*false/);
 assert.match(bridge,/postingAllowed:\s*false/);
 assert.match(bridge,/readiness:\s*'blocked'/);
});
test('bridge catches recovery snapshot errors without escalation',()=>{
 assert.match(bridge,/catch\s*\{/);
 assert.match(bridge,/Recovery snapshot or verification unavailable/);
});
test('bridge has no storage write or posting operations',()=>{
 assert.doesNotMatch(bridge,/\.setItem\s*\(|\.removeItem\s*\(|\.post\s*\(|\.install\s*\(/);
});
test('runtime snapshot uses exclusive lease and double read',()=>{
 assert.match(runtime,/readRecoverySnapshot\(\):/);
 assert.match(runtime,/return this\.exclusive\(async \(\) =>/);
 assert.match(runtime,/const first = await read\(\), second = await read\(\)/);
});
