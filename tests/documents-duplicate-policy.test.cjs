const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourcePath = path.join(__dirname, '../src/features/documents/import/duplicatePolicy.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0);
const moduleShim = { exports: {} };
new Function('module', 'exports', 'require', compiled.outputText)(moduleShim, moduleShim.exports, require);
const { decideDocumentDuplicate } = moduleShim.exports;
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const record = { id: 'doc1', sha256: hashA };
test('new hash is allowed', () => assert.equal(decideDocumentDuplicate(hashB, [record]).kind, 'new'));
test('same bytes are reported as duplicate', () => {
  const result = decideDocumentDuplicate(hashA, [record]);
  assert.equal(result.kind, 'duplicate');
  assert.equal(result.existing, record);
});
test('explicit independent copy is allowed', () => assert.equal(decideDocumentDuplicate(hashA, [record], true).kind, 'new'));
test('invalid fingerprint is rejected', () => assert.equal(decideDocumentDuplicate('invalid', []).kind, 'invalid'));
test('unknown existing fingerprint fails closed', () => assert.equal(decideDocumentDuplicate(hashB, [{ id: 'doc2', sha256: null }]).kind, 'invalid'));
test('invalid override is rejected', () => assert.equal(decideDocumentDuplicate(hashA, [], 'yes').kind, 'invalid'));