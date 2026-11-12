const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const localRequire = require('node:module').createRequire('D:/Mobile Apps/TomorrowApp/package.json');
const ts = localRequire('typescript');
function load(relative, dependencies = {}) {
  const filename = path.join(__dirname, '..', relative);
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.deepEqual(out.diagnostics ?? [], []);
  const module = { exports: {} };
  new Function('module', 'exports', 'require', out.outputText)(module, module.exports,
    id => Object.hasOwn(dependencies, id) ? dependencies[id] : localRequire(id));
  return module.exports;
}
const invariants = load('src/features/documents/domain/invariants.ts');
const repository = () => load('src/features/documents/storage/documentRepository.ts', { '../domain/invariants': invariants });
module.exports = { invariants, repository, foundation: { ...invariants, ...repository() } };
