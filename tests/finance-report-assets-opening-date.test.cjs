/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    module._compile(output.outputText, filename);
  };
}
const { validateAssetOpeningDate, assetReportHistoryAvailable } =
  require('../src/features/finance/utils/assetOpeningDate.ts');
const asset = (entries = [], extra = {}) => ({
  id: 'a1', name: 'Gold', category: 'gold', karat: 24, entries, ...extra,
});
const entry = (id, date, amount) => ({ id, date, amount });
test('valid user-confirmed history date accepts same-day movement', () => {
  assert.deepEqual(validateAssetOpeningDate([asset([entry('e1', '2026-11-03', 10)])], 'a1', '2026-11-03'), { valid: true });
});
test('rejects malformed and impossible dates', () => {
  for (const date of ['2026-02-30', '2026-2-03', '2025-02-29']) {
    assert.equal(validateAssetOpeningDate([asset()], 'a1', date).valid, false);
  }
});
test('rejects date after recorded movements', () => {
  assert.equal(validateAssetOpeningDate([asset([entry('e1', '2026-11-02', 5)])], 'a1', '2026-11-03').valid, false);
});
test('rejects duplicate asset identities and invalid movement', () => {
  assert.equal(validateAssetOpeningDate([asset(), asset()], 'a1', '2026-11-03').valid, false);
  assert.equal(validateAssetOpeningDate([asset([entry('e1', '2026-02-30', 1)])], 'a1', '2026-11-03').valid, false);
});
test('historical availability is explicit and period-scoped', () => {
  assert.equal(assetReportHistoryAvailable(asset(), '2026-12-01'), false);
  assert.equal(assetReportHistoryAvailable(asset([], { openingBalanceDate: '2026-11-03' }), '2026-11-01'), false);
  assert.equal(assetReportHistoryAvailable(asset([], { openingBalanceDate: '2026-11-03' }), '2026-12-01'), true);
});
