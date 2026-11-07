'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, exportName) {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/store', name + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m, exports: m.exports });
  return m.exports[exportName];
}
const classify = load('paymentPersistenceAck', 'classifyPersistenceAck');
const base = Object.freeze({ key: 'tomorrow:finance', generationId: 'gen-1', writeIssued: true, writeAcknowledged: true, readbackAcknowledged: true, expectedRaw: '{"a":1}', actualRaw: '{"a":1}' });
const cases = [
 ['success', {}, 'readback-verified'],
 ['not issued', { writeIssued:false }, 'rejected'],
 ['not issued even with ACK', { writeIssued:false,writeAcknowledged:true }, 'rejected'],
 ['write no ACK', { writeAcknowledged:false }, 'uncertain'],
 ['write no ACK despite read', { writeAcknowledged:false,readbackAcknowledged:true }, 'uncertain'],
 ['read no ACK', { readbackAcknowledged:false }, 'uncertain'],
 ['read missing', { actualRaw:undefined }, 'uncertain'],
 ['read null', { actualRaw:null }, 'conflict'],
 ['read changed', { actualRaw:'{"a":2}' }, 'conflict'],
 ['different whitespace', { actualRaw:'{ "a":1 }' }, 'conflict'],
 ['empty key', { key:'' }, 'conflict'],
 ['blank key', { key:'  ' }, 'conflict'],
 ['empty generation', { generationId:'' }, 'conflict'],
 ['blank generation', { generationId:'  ' }, 'conflict'],
 ['stale diagnostic', { error:'old error' }, 'readback-verified'],
];
for (const [name, change, expected] of cases) test(name, () => assert.equal(classify({ ...base, ...change }).kind, expected));
test('read-only', () => { const before = JSON.stringify(base); classify(base); assert.equal(JSON.stringify(base), before); });
