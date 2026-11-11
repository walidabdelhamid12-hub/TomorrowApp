const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const originalTs = require.extensions['.ts'];
const originalFetch = global.fetch;

Module._load = function (id, parent, main) {
  return originalLoad.call(
    this,
    id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id,
    parent,
    main
  );
};

require.extensions['.ts'] = (module, filename) =>
  module._compile(ts.transpileModule(
    fs.readFileSync(filename, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: filename
    }
  ).outputText, filename);

const {
  getHistoricalRate,
  createManualHistoricalRate
} = require('../src/services/historicalRates.ts');

Module._load = originalLoad;
require.extensions['.ts'] = originalTs;

afterEach(() => {
  global.fetch = originalFetch;
});

test('EGP returns identity rate without network', async () => {
  global.fetch = () => {
    throw new Error('Network should not be called');
  };
  const result = await getHistoricalRate('EGP', '2026-11-05');
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.rate, 1);
  assert.equal(result.snapshot.referenceCurrencyCode, 'EGP');
});

test('historical API response is accepted', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-05',
      rate: 54.502
    })
  });
  const result = await getHistoricalRate('USD', '2026-11-05');
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.rate, 54.502);
  assert.equal(result.snapshot.source, 'historical_api');
});

test('earlier published date is preserved', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-06',
      rate: 54.041
    })
  });
  const result = await getHistoricalRate('USD', '2026-11-08');
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.rateDate, '2026-11-08');
  assert.equal(result.snapshot.effectiveRateDate, '2026-11-06');
});

test('future effective date is rejected', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-09',
      rate: 54
    })
  });
  const result = await getHistoricalRate('USD', '2026-11-08');
  assert.equal(result.ok, false);
});

test('invalid API rate is rejected', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-05',
      rate: 0
    })
  });
  const result = await getHistoricalRate('USD', '2026-11-05');
  assert.equal(result.ok, false);
});

test('network failure is reported safely', async () => {
  global.fetch = async () => {
    throw new Error('Offline');
  };
  const result = await getHistoricalRate('USD', '2026-11-05');
  assert.equal(result.ok, false);
});

test('manual FX is accepted', () => {
  const result = createManualHistoricalRate(
    'USD', '2026-11-05', 55
  );
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.source, 'manual');
  assert.equal(result.snapshot.rate, 55);
});

test('invalid manual FX is rejected', () => {
  const result = createManualHistoricalRate(
    'USD', '2026-11-05', -10
  );
  assert.equal(result.ok, false);
});

test('EGP manual FX must equal one', () => {
  const result = createManualHistoricalRate(
    'EGP', '2026-11-05', 50
  );
  assert.equal(result.ok, false);
});

test('future transaction date is rejected', async () => {
  const result = await getHistoricalRate('USD', '2099-01-01');
  assert.equal(result.ok, false);
});
// STEP 1C.3D.4 WEEKEND TESTS

test('Saturday aggregated rate is preserved', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-07',
      rate: 54.137
    })
  });

  const result = await getHistoricalRate('USD', '2026-11-07');

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.rate, 54.137);
  assert.equal(result.snapshot.effectiveRateDate, '2026-11-07');
});

test('Sunday aggregated rate is preserved', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-08',
      rate: 54.041
    })
  });

  const result = await getHistoricalRate('USD', '2026-11-08');

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.effectiveRateDate, '2026-11-08');
});

test('Monday transaction accepts Sunday aggregate', async () => {
  const RealDate = Date;

  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super('2026-11-10T12:00:00Z');
      } else {
        super(...args);
      }
    }
  };

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        base: 'USD',
        quote: 'EGP',
        date: '2026-11-08',
        rate: 54.041
      })
    });

    const result = await getHistoricalRate('USD', '2026-11-09');

    assert.equal(result.ok, true);
    assert.equal(result.snapshot.rateDate, '2026-11-09');
    assert.equal(result.snapshot.effectiveRateDate, '2026-11-08');
  } finally {
    global.Date = RealDate;
  }
});

test('weekend API rejects rate dated after transaction', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-09',
      rate: 54.1
    })
  });

  const result = await getHistoricalRate('USD', '2026-11-08');

  assert.equal(result.ok, false);
});

test('provider metadata does not override aggregate date', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      base: 'USD',
      quote: 'EGP',
      date: '2026-11-08',
      rate: 54.041,
      providers: [
        { key: 'BAM', date: '2026-11-05', rate: 53.9 },
        { key: 'BDI', date: '2026-11-06', rate: 53.882 },
        { key: 'CBE', date: '2026-11-08', rate: 54.242 }
      ]
    })
  });

  const result = await getHistoricalRate('USD', '2026-11-08');

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.rate, 54.041);
  assert.equal(result.snapshot.effectiveRateDate, '2026-11-08');
});