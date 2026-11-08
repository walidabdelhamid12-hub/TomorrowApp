const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/components/AddAssetModal.tsx'), 'utf8');
const start = source.indexOf('const handleSave = () => {');
const end = source.indexOf('\n  const isMetal =', start);
assert.ok(start >= 0 && end > start, 'Asset save handler not found');
const body = source.slice(start, end);

test('7.1E-3A currency assets use correct currency precision', () => {
  assert.match(body, /selectedType === 'local_currency' \|\| selectedType === 'foreign_currency'/);
  assert.match(body, /selectedType === 'local_currency' \? baseCurrency : selectedCurrency/);
  assert.match(body, /hasValidCurrencyPrecision\(amount, assetCurrency\)/);
  assert.match(body, /getCurrencyDecimals\(assetCurrency\)/);
});

test('7.1E-3A metals are excluded and invalid precision blocks save', () => {
  assert.match(body, /if \(isCurrencyAsset && !hasValidCurrencyPrecision\(amount, assetCurrency\)\)/);
  const guard = body.indexOf('if (isCurrencyAsset && !hasValidCurrencyPrecision');
  const save = body.indexOf('onSave({');
  assert.ok(guard >= 0 && save > guard);
  assert.match(body.slice(guard, save), /Alert\.alert\('Invalid amount precision'/);
  assert.match(body.slice(guard, save), /return;/);
});