const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(
  root, 'src/features/finance/utils/crossCurrency.ts'
);
const source = fs.readFileSync(sourcePath, 'utf8');

const match = source.match(
  /export function calculateDirectHistoricalRate\([\s\S]*?\n\}/
);

assert.ok(match, 'Direct historical rate function must exist');

const transpiled = ts.transpileModule(
  match[0].replace('export function', 'function'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
  }
).outputText;

const isValidHistoricalFx = (fx, currency, date) =>
  !!fx &&
  fx.sourceCurrencyCode === currency &&
  fx.referenceCurrencyCode === 'EGP' &&
  fx.rateDate === date &&
  Number.isFinite(fx.rate) &&
  fx.rate > 0 &&
  (fx.source === 'manual' || fx.source === 'historical_api');

const calculateDirectHistoricalRate = new Function(
  'isValidHistoricalFx',
  transpiled + '\nreturn calculateDirectHistoricalRate;'
)(isValidHistoricalFx);

const snapshot = (currency, rate, date = '2026-11-09') => ({
  sourceCurrencyCode: currency,
  referenceCurrencyCode: 'EGP',
  rate,
  rateDate: date,
  source: 'historical_api',
});

test('OMR to USD display rate uses account/original', () => {
  const rate = calculateDirectHistoricalRate(
    snapshot('USD', 53.994),
    snapshot('OMR', 140.43),
    'USD',
    'OMR',
    '2026-11-09'
  );
  assert.ok(Math.abs(rate - 140.43 / 53.994) < 1e-12);
});

test('reverse direction produces reciprocal rate', () => {
  const forward = calculateDirectHistoricalRate(
    snapshot('USD', 53.994),
    snapshot('OMR', 140.43),
    'USD', 'OMR', '2026-11-09'
  );
  const reverse = calculateDirectHistoricalRate(
    snapshot('OMR', 140.43),
    snapshot('USD', 53.994),
    'OMR', 'USD', '2026-11-09'
  );
  assert.ok(Math.abs(forward * reverse - 1) < 1e-12);
});

test('rejects mismatched date', () => {
  assert.equal(
    calculateDirectHistoricalRate(
      snapshot('USD', 53.994, '2026-11-08'),
      snapshot('OMR', 140.43),
      'USD', 'OMR', '2026-11-09'
    ),
    null
  );
});

test('rejects zero or invalid rate', () => {
  for (const invalid of [0, -1, Infinity, NaN]) {
    assert.equal(
      calculateDirectHistoricalRate(
        snapshot('USD', invalid),
        snapshot('OMR', 140.43),
        'USD', 'OMR', '2026-11-09'
      ),
      null
    );
  }
});

test('rejects incorrect currency identity', () => {
  assert.equal(
    calculateDirectHistoricalRate(
      snapshot('EUR', 53.994),
      snapshot('OMR', 140.43),
      'USD', 'OMR', '2026-11-09'
    ),
    null
  );
});