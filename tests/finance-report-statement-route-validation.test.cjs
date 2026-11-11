const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Execute each screen's actual pure validation before hooks/store access.
for (const kind of ['income', 'expenses']) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/statement-' + kind + '.tsx'), 'utf8');
  const helpers = source.slice(source.indexOf('function single('), source.indexOf('/** Read-only'));
  const selection = source.slice(source.indexOf('  const from = single('), source.indexOf('  const ledgerReady'));
  const js = ts.transpileModule(helpers + '\n' + selection + '\nreturn valid;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const valid = new Function('params', js);
  const dates = { from: '2026-11-01', to: '2026-11-30' };
  test(kind + ': valid omitted and exact filters accepted', () => {
    assert.equal(valid(dates), true);
    assert.equal(valid({ ...dates, accountId: 'bank', categoryId: 'food' }), true);
  });
  for (const key of ['from', 'to', 'accountId', 'categoryId']) {
    test(kind + ': rejects ambiguous/empty ' + key + ' without broadening scope', () => {
      for (const value of [[], ['bank'], ['bank', 'other'], '', ' ']) {
        assert.equal(valid({ ...dates, [key]: value }), false);
      }
    });
  }
  test(kind + ': invalid and reversed calendar dates rejected', () => {
    assert.equal(valid({ ...dates, from: '2026-11-31' }), false);
    assert.equal(valid({ ...dates, from: '2026-12-01' }), false);
  });
}
