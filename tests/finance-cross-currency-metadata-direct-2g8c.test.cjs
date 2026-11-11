const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();

function load(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (cache.has(absolutePath)) return cache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const moduleObject = { exports: {} };
  cache.set(absolutePath, moduleObject);

  const mocks = {
    '../constants/currencies': {
      isSupportedCurrency: code =>
        ['EGP','OMR','USD','EUR','GBP','SAR','AED','JOD','QAR','KWD'].includes(code),
      getCurrencyDecimals: code =>
        ['OMR','KWD'].includes(code) ? 3 : 2,
    },
    './finance': {
      roundMoney: (value, decimals) => {
        const factor = 10 ** decimals;
        return Math.round((value + Number.EPSILON) * factor) / factor;
      },
    },
    './historicalFx': {
      isValidHistoricalFx: (snapshot, currency, date) =>
        !!snapshot &&
        snapshot.sourceCurrencyCode === currency &&
        snapshot.referenceCurrencyCode === 'EGP' &&
        snapshot.rateDate === date &&
        Number.isFinite(snapshot.rate) &&
        snapshot.rate > 0,
    },
    './input': {
      isValidISODate: value =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value,
    },
  };

  const localRequire = name => {
    if (name in mocks) return mocks[name];

    if (name === './directHistoricalFx') {
      return load('src/features/finance/utils/directHistoricalFx.ts');
    }

    throw new Error(`Unexpected dependency: ${name}`);
  };

  new Function('require', 'module', 'exports', compiled)(
    localRequire,
    moduleObject,
    moduleObject.exports,
  );

  return moduleObject.exports;
}

const { isValidCrossCurrencyMetadata } = load(
  'src/features/finance/utils/crossCurrencyMetadata.ts',
);

const manual = {
  amount: 10,
  currencyCode: 'OMR',
  date: '2026-11-10',
  originalAmount: 26,
  originalCurrencyCode: 'EUR',
  accountFxRate: 10 / 26,
  directHistoricalFx: {
    accountCurrencyCode: 'OMR',
    transactionCurrencyCode: 'EUR',
    rate: 2.6,
    rateDate: '2026-11-10',
    source: 'manual',
  },
};

const egpAnchor = (currency, rate) => ({
  sourceCurrencyCode: currency,
  referenceCurrencyCode: 'EGP',
  rate,
  rateDate: '2026-11-10',
  source: 'historical_api',
});

test('accepts manual direct conversion without EGP anchors', () => {
  assert.equal(isValidCrossCurrencyMetadata(manual), true);
});

test('accepts actual account amount override with effective rate', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    amount: 10.1,
    accountFxRate: 10.1 / 26,
  }), true);
});

test('rejects mixing manual direct with original EGP anchor', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    accountFxSnapshot: egpAnchor('EUR', 55),
  }), false);
});

test('rejects mixing manual direct with account EGP anchor', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    historicalFx: egpAnchor('OMR', 140),
  }), false);
});

test('rejects wrong currency, date and source', () => {
  for (const changes of [
    { accountCurrencyCode: 'USD' },
    { transactionCurrencyCode: 'USD' },
    { rateDate: '2026-11-09' },
    { source: 'historical_api_derived' },
  ]) {
    assert.equal(isValidCrossCurrencyMetadata({
      ...manual,
      directHistoricalFx: {
        ...manual.directHistoricalFx,
        ...changes,
      },
    }), false);
  }
});

test('rejects incomplete manual evidence', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    accountFxRate: undefined,
  }), false);

  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    originalAmount: undefined,
  }), false);
});

test('rejects invalid precision and inconsistent effective rate', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    amount: 10.1234,
  }), false);

  assert.equal(isValidCrossCurrencyMetadata({
    ...manual,
    accountFxRate: 0.5,
  }), false);
});

test('accepts legacy cross-currency evidence', () => {
  const originalFx = egpAnchor('EUR', 55);
  const accountFx = egpAnchor('OMR', 143);

  assert.equal(isValidCrossCurrencyMetadata({
    amount: 10,
    currencyCode: 'OMR',
    date: '2026-11-10',
    originalAmount: 26,
    originalCurrencyCode: 'EUR',
    accountFxRate: 10 / 26,
    accountFxSnapshot: originalFx,
    historicalFx: accountFx,
  }), true);
});

test('accepts ordinary same-currency metadata', () => {
  assert.equal(isValidCrossCurrencyMetadata({
    amount: 10,
    currencyCode: 'OMR',
    date: '2026-11-10',
  }), true);
});