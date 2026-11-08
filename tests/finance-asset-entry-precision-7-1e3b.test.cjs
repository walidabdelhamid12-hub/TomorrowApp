const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/components/AssetEntriesModal.tsx'), 'utf8');
const start = source.indexOf('const saveEditing = (entryId: string) => {');
const end = source.indexOf('\n  const confirmDelete =', start);
assert.ok(start >= 0 && end > start, 'Asset entry save handler not found');
const body = source.slice(start, end);

test('7.1E-3B asset entries use shared localized amount parser', () => {
  assert.match(source, /import \{ formatMoney, formatNumber, parseAmount \} from/);
  assert.match(body, /const parsedAmount = parseAmount\(amount\)/);
  assert.match(body, /parsedAmount === null/);
  assert.match(body, /parsedAmount < 0/);
  assert.doesNotMatch(body, /Number\(amount\)/);
});

test('7.1E-3B currency precision excludes metal weights', () => {
  assert.match(source, /asset.category === 'gold' \|\| asset.category === 'silver'/);
  assert.match(body, /!isMetal && !hasValidCurrencyPrecision\(amount, asset.currencyCode\)/);
  assert.match(body, /getCurrencyDecimals\(asset.currencyCode\)/);
});

test('7.1E-3B validation blocks invalid precision before saving', () => {
  const guard = body.indexOf('if (!isMetal && !hasValidCurrencyPrecision');
  const save = body.indexOf('onSave(asset.id, entryId, {');
  assert.ok(guard >= 0 && save > guard);
  assert.match(body.slice(guard, save), /Alert\.alert\('Invalid amount precision'/);
  assert.match(body.slice(guard, save), /return;/);
  assert.match(body.slice(guard, save), /Invalid date/);
});