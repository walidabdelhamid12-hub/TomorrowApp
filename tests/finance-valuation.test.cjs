const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = Module._load;
Module._load = function(id, parent, main) {
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { formatAmount } = require('../src/features/finance/utils/amountFormat.ts');
const { formatMoney, formatNumber, convertAmount } = require('../src/features/finance/utils/money.ts');
const { getGoldValueEGP, getSilverValueEGP, getAssetValueInBase } = require('../src/features/finance/utils/valuation.ts');
const { evaluateAssetRatio } = require('../src/features/finance/utils/assetDecimal.ts');
const { getAssetBalance, roundMoney } = require('../src/features/finance/utils/finance.ts');
const { getAccountBalance } = require('../src/features/finance/utils/ledger.ts');
const asset = (category, amount, fields = {}) => ({ id: 'asset', name: 'GOLD TEST', category, ...fields,
  entries: [{ id: 'entry', amount, date: '2026-11-04', createdAt: '2026-11-04' }] });

for (const [currency, boundaries] of [
  ['EGP', [[12254.5149, '12,254.51'], [12254.515, '12,254.52'], [12254.5151, '12,254.52'], [1.005, '1.01'], [2.675, '2.68']]],
  ['OMR', [[1.23449, '1.234'], [1.2345, '1.235'], [1.23451, '1.235']]],
  ['KWD', [[12254.51449, '12,254.514'], [12254.5145, '12,254.515'], [12254.51451, '12,254.515']]],
]) {
  for (const [value, expected] of boundaries) {
    for (const sign of [1, -1]) test(`${currency} decimal half-up ${sign * value} formats consistently`, () => {
      const display = sign < 0 ? '-' + expected : expected;
      assert.equal(formatAmount(sign * value, currency), display);
      assert.equal(formatMoney(sign * value, currency), display);
    });
  }
}
test('zero, signed zero and nonfinite fallbacks retain currency precision without negative zero', () => {
  for (const [code, expected] of [['EGP', '0.00'], ['OMR', '0.000'], ['KWD', '0.000']]) {
    for (const value of [0, -0, NaN, Infinity, -Infinity, -0.00001]) {
      assert.equal(formatAmount(value, code), expected);
      assert.equal(formatMoney(value, code), expected);
    }
  }
  assert.equal(formatNumber(2, 3), '2.000'); // physical quantity formatting is separate
});

test('GOLD TEST: two grams of 21K at 7002.58 displays 12254.52 in both formatter paths', () => {
  const gold = asset('gold', 2, { karat: 21 });
  const value = getAssetValueInBase(gold, 'EGP', { EGP: 1 }, 7002.58);
  assert.equal(value, 12254.515);
  assert.equal(formatMoney(value, 'EGP'), '12,254.52');
  assert.equal(formatAmount(value, 'EGP'), '12,254.52');
});
for (const [grams, karat, expected] of [[0.002, 21, '12.25'], [1, 18, '5,251.94'], [0.75, 24, '5,251.94'], [9, 22, '57,771.29']]) {
  test(`gold decimal ratio avoids binary/intermediate rounding at ${grams}g ${karat}K`, () => {
    const value = getGoldValueEGP(grams, karat, 7002.58);
    assert.equal(formatMoney(value, 'EGP'), expected);
    assert.equal(getAssetValueInBase(asset('gold', grams, { karat }), 'EGP', { EGP: 1 }, 7002.58), value);
  });
}
test('small silver quantities keep sub-mill currency precision until final display', () => {
  assert.equal(getSilverValueEGP(0.002, 6127.2575), 12.254515);
  assert.equal(formatMoney(getSilverValueEGP(0.002, 6127.2575), 'EGP'), '12.25');
  assert.equal(formatMoney(getSilverValueEGP(0.3, 3.35), 'EGP'), '1.01');
});
test('metal FX is evaluated as one decimal ratio without rounding EGP or converted value first', () => {
  const rates = { EGP: 1, OMR: 50 };
  const verified = ['EGP', 'OMR'];
  const value = getAssetValueInBase(asset('gold', 2, { karat: 21 }), 'OMR', rates, 7002.58, null, verified);
  assert.equal(value, 245.0903);
  assert.equal(formatMoney(value, 'OMR'), '245.090');
  const small = getAssetValueInBase(asset('gold', 0.002, { karat: 21 }), 'OMR', { EGP: 1, OMR: 100 }, 7002.58, null, verified);
  assert.equal(small, 0.12254515);
  assert.equal(formatMoney(small, 'OMR'), '0.123');
  const silver = getAssetValueInBase(asset('silver', 0.002), 'OMR', rates, null, 6127.2575, verified);
  assert.equal(silver, 0.2450903);
});
test('foreign-currency assets avoid double rounding and preserve verified-rate rules', () => {
  const fx = asset('foreign_currency', 1, { currencyCode: 'USD' });
  const rates = { USD: 12.2549, EGP: 1 };
  const result = getAssetValueInBase(fx, 'EGP', rates, null, null, ['USD', 'EGP']);
  assert.equal(result, 12.2549);
  assert.equal(formatMoney(result, 'EGP'), '12.25');
  assert.equal(getAssetValueInBase(fx, 'EGP', rates, null), null);
  assert.equal(getAssetValueInBase(fx, 'USD', {}, null), 1); // same currency needs no FX rate
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.equal(getAssetValueInBase(fx, 'EGP', { USD: bad, EGP: 1 }, null, null, ['USD', 'EGP']), null);
  }
});
test('unavailable metals, invalid inputs and overflowing valuations remain unavailable', () => {
  for (const price of [null, 0, -1, NaN, Infinity]) {
    assert.equal(getGoldValueEGP(2, 21, price), null);
    assert.equal(getSilverValueEGP(2, price), null);
  }
  assert.equal(getGoldValueEGP(NaN, 21, 7002.58), null);
  assert.equal(getGoldValueEGP(2, 0, 7002.58), null);
  assert.equal(getSilverValueEGP(1e308, 1e308), null);
});
test('decimal ratios handle exponents, negative values and tiny quantities without fixed decimal truncation', () => {
  assert.equal(evaluateAssetRatio([1e-30, 2]), 2e-30);
  assert.equal(evaluateAssetRatio([1e30, 2], [1e20]), 2e10);
  assert.equal(evaluateAssetRatio([-0.3, 3.35]), -1.005);
  assert.equal(evaluateAssetRatio([1], [0]), null);
  assert.equal(evaluateAssetRatio([0]), 0);
});
test('stored balances, asset entries and exchange rates are unchanged by valuation', () => {
  const gold = asset('gold', 0.002, { karat: 21 });
  const rates = { EGP: 1, USD: 50.12345 };
  const previous = structuredClone({ gold, rates });
  Object.freeze(gold.entries[0]); Object.freeze(gold.entries); Object.freeze(gold); Object.freeze(rates);
  getAssetValueInBase(gold, 'USD', rates, 7002.58, null, ['EGP', 'USD']);
  assert.deepEqual({ gold, rates }, previous);
  assert.equal(getAssetBalance(gold), 0.002);
});
test('ledger rounding, account balances and the shared non-asset conversion contract are unchanged', () => {
  assert.equal(roundMoney(12.2549), 12.255);
  assert.equal(convertAmount(1, 'USD', 'EGP', { USD: 12.2549, EGP: 1 }, ['USD', 'EGP']), 12.255);
  assert.equal(getAccountBalance({ id: 'a', initialBalance: 10 }, [{ accountId: 'a', type: 'expense', amount: 1.005 }]), 8.995);
});
