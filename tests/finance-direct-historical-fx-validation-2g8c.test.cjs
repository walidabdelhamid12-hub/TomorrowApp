const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const file = path.join(
  __dirname,
  '../src/features/finance/utils/directHistoricalFx.ts',
);

const source = fs.readFileSync(file, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;

const moduleObject = { exports: {} };

const dependencies = {
  '../constants/currencies': {
    isSupportedCurrency: code =>
      ['EGP', 'OMR', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'JOD', 'QAR', 'KWD']
        .includes(code),
  },
  './input': {
    isValidISODate: value =>
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  },
};

new Function('require', 'module', 'exports', compiled)(
  name => {
    if (!(name in dependencies)) {
      throw new Error(`Unexpected dependency: ${name}`);
    }
    return dependencies[name];
  },
  moduleObject,
  moduleObject.exports,
);

const { isValidDirectHistoricalFx } = moduleObject.exports;

const valid = {
  accountCurrencyCode: 'OMR',
  transactionCurrencyCode: 'EUR',
  rate: 2.25,
  rateDate: '2026-11-10',
  source: 'manual',
};

const check = snapshot =>
  isValidDirectHistoricalFx(snapshot, 'OMR', 'EUR', '2026-11-10');

test('accepts valid manual direct rate', () => {
  assert.equal(check(valid), true);
});

test('accepts derived historical API rate', () => {
  assert.equal(check({
    ...valid,
    source: 'historical_api_derived',
  }), true);
});

test('rejects zero, negative and nonfinite rates', () => {
  for (const rate of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(check({ ...valid, rate }), false);
  }
});

test('rejects currency direction mismatch', () => {
  assert.equal(check({
    ...valid,
    accountCurrencyCode: 'EUR',
    transactionCurrencyCode: 'OMR',
  }), false);
});

test('rejects date mismatch', () => {
  assert.equal(check({
    ...valid,
    rateDate: '2026-11-09',
  }), false);
});

test('rejects unsupported currency and same-currency conversion', () => {
  assert.equal(
    isValidDirectHistoricalFx(valid, 'XYZ', 'EUR', '2026-11-10'),
    false,
  );
  assert.equal(
    isValidDirectHistoricalFx(valid, 'OMR', 'OMR', '2026-11-10'),
    false,
  );
});

test('rejects invalid source', () => {
  assert.equal(check({
    ...valid,
    source: 'unknown',
  }), false);
});

test('rejects missing snapshot and invalid date', () => {
  assert.equal(check(undefined), false);
  assert.equal(
    isValidDirectHistoricalFx(valid, 'OMR', 'EUR', 'bad-date'),
    false,
  );
});