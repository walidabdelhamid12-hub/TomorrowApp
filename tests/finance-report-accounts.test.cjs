/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const originalLoad = Module._load;

Module._load = function(request, parent, isMain) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return originalLoad.call(this, request, parent, isMain);
};

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = function(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
}

const { aggregateAccountsReport } = require(
  '../src/features/finance/utils/reportAccounts.ts'
);

const account = (overrides = {}) => ({
  id: 'bank',
  name: 'Bank',
  type: 'bank',
  currencyCode: 'EGP',
  initialBalance: 1000,
  archived: false,
  createdAt: '2026-11-10T12:00:00Z',
  updatedAt: '2026-11-10T12:00:00Z',
  ...overrides,
});

const ledger = (overrides = {}) => ({
  accounts: [account()],
  transfers: [],
  categories: [],
  ...overrides,
  transactions: (overrides.transactions ?? []).map(tx => ({ currencyCode: 'EGP', ...tx })),
});

const period = { from: '2026-11-10', to: '2026-11-30' };
const basis = [{ accountId: 'bank', openingBalanceDate: '2026-11-10' }];

test('unverified history is unavailable, never zero', () => {
  const result = aggregateAccountsReport(ledger(), period);
  assert.equal(result[0].status, 'historical_data_unavailable');
  assert.equal(result[0].openingBalance, null);
});

test('verified opening balance is available', () => {
  const result = aggregateAccountsReport(ledger(), period, basis);
  assert.equal(result[0].openingBalance, 1000);
  assert.equal(result[0].closingBalance, 1000);
  assert.equal(result[0].change, 0);
});

test('transactions on first day belong to period', () => {
  const data = ledger({
    transactions: [{
      id: 'income',
      accountId: 'bank',
      type: 'income',
      amount: 250,
      date: '2026-11-10',
    }],
  });

  const result = aggregateAccountsReport(data, period, basis);
  assert.equal(result[0].openingBalance, 1000);
  assert.equal(result[0].closingBalance, 1250);
  assert.equal(result[0].change, 250);
});

test('historical opening excludes earlier period movements', () => {
  const data = ledger({
    transactions: [
      { id: 'a', accountId: 'bank', type: 'expense',
        amount: 100, date: '2026-11-12' },
      { id: 'b', accountId: 'bank', type: 'income',
        amount: 50, date: '2026-11-22' },
    ],
  });

  const result = aggregateAccountsReport(
    data,
    { from: '2026-11-20', to: '2026-11-30' },
    basis,
  );

  assert.equal(result[0].openingBalance, 900);
  assert.equal(result[0].closingBalance, 950);
  assert.equal(result[0].change, 50);
});

test('transfers use actual source and destination amounts', () => {
  const data = ledger({
    accounts: [
      account(),
      account({
        id: 'usd',
        name: 'USD',
        currencyCode: 'USD',
        initialBalance: 10,
      }),
    ],
    transfers: [{
      id: 'transfer',
      fromAccountId: 'bank',
      toAccountId: 'usd',
      amount: 100,
      fromAmount: 100,
      toAmount: 2,
      date: '2026-11-15',
    }],
  });

  const result = aggregateAccountsReport(data, period, [
    ...basis,
    { accountId: 'usd', openingBalanceDate: '2026-11-10' },
  ]);

  assert.equal(result[0].closingBalance, 900);
  assert.equal(result[1].closingBalance, 12);
});

test('archived accounts remain in reports', () => {
  const result = aggregateAccountsReport(
    ledger({ accounts: [account({ archived: true })] }),
    period,
    basis,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].archived, true);
});

test('movements before baseline make history unavailable', () => {
  const data = ledger({
    transactions: [{
      id: 'old',
      accountId: 'bank',
      type: 'income',
      amount: 50,
      date: '2026-11-09',
    }],
  });

  const result = aggregateAccountsReport(data, period, basis);
  assert.equal(result[0].status, 'historical_data_unavailable');
});

test('period before baseline is unavailable', () => {
  const result = aggregateAccountsReport(
    ledger(),
    { from: '2026-11-01', to: '2026-11-09' },
    basis,
  );
  assert.equal(result[0].closingBalance, null);
});

test('duplicate baseline records fail closed', () => {
  const result = aggregateAccountsReport(
    ledger(), period, [...basis, ...basis],
  );
  assert.equal(result[0].status, 'historical_data_unavailable');
});

test('report never mutates ledger', () => {
  const data = ledger();
  const before = JSON.stringify(data);
  aggregateAccountsReport(data, period, basis);
  assert.equal(JSON.stringify(data), before);
});

test('unsupported account currency rejects whole amounts', () => {
  const data = ledger({
    accounts: [account({
      currencyCode: 'JPY',
      initialBalance: 1000,
    })],
    transactions: [{
      id: 'fraction',
      accountId: 'bank',
      type: 'income',
      amount: 1,
      date: '2026-11-12',
    }],
  });

  const result = aggregateAccountsReport(data, period, basis);

  assert.equal(result[0].status, 'historical_data_unavailable');
  assert.equal(result[0].closingBalance, null);
});

test('unsafe accumulated balances fail closed', () => {
  const large = Number.MAX_SAFE_INTEGER / 100;

  const data = ledger({
    accounts: [account({ initialBalance: 0 })],
    transactions: [
      {
        id: 'large-1',
        accountId: 'bank',
        type: 'income',
        amount: large,
        date: '2026-11-12',
      },
      {
        id: 'large-2',
        accountId: 'bank',
        type: 'income',
        amount: large,
        date: '2026-11-13',
      },
    ],
  });

  const result = aggregateAccountsReport(data, period, basis);

  assert.equal(result[0].status, 'historical_data_unavailable');
  assert.equal(result[0].closingBalance, null);
});

test('refund increases account balance once', () => {
  const data = ledger({
    transactions: [
      {
        id: 'purchase',
        accountId: 'bank',
        type: 'expense',
        amount: 100,
        date: '2026-11-12',
      },
      {
        id: 'refund',
        accountId: 'bank',
        type: 'expense',
        entryType: 'refund',
        relatedTransactionId: 'purchase',
        amount: 25,
        date: '2026-11-15',
      },
    ],
  });

  const result = aggregateAccountsReport(data, period, basis);

  assert.equal(result[0].openingBalance, 1000);
  assert.equal(result[0].closingBalance, 925);
  assert.equal(result[0].change, -75);
});
for (const currencyCode of ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'QAR', 'OMR', 'KWD', 'JOD']) {
  test(currencyCode + ' preserves supported precision and rejects excess precision', () => {
    const factor = ['OMR', 'KWD', 'JOD'].includes(currencyCode) ? 1000 : 100;
    const data = ledger({ accounts: [account({ currencyCode, initialBalance: 1 / factor })],
      transactions: [{ id: 'last', accountId: 'bank', currencyCode, type: 'income',
        amount: 2 / factor, date: period.to },
        { id: 'future', accountId: 'bank', currencyCode, type: 'expense', amount: 1, date: '2026-12-01' }] });
    const before = structuredClone(data);
    const row = aggregateAccountsReport(data, period, basis)[0];
    assert.equal(row.openingBalance, 1 / factor);
    assert.equal(row.closingBalance, 3 / factor);
    assert.equal(row.change, 2 / factor);
    assert.deepEqual(data, before);
    data.transactions[0].amount = 1 / (factor * 10);
    assert.equal(aggregateAccountsReport(data, period, basis)[0].status, 'historical_data_unavailable');
  });
}
test('invalid dates and inconsistent movements fail closed', () => {
  for (const extra of [{ date: '2026-02-30' }, { currencyCode: 'USD' }, { type: 'other' }, { amount: -1 }]) {
    const data = ledger({ transactions: [{ id: 'bad', accountId: 'bank', type: 'income', amount: 1, date: period.from, ...extra }] });
    assert.equal(aggregateAccountsReport(data, period, basis)[0].closingBalance, null);
  }
  assert.throws(() => aggregateAccountsReport(ledger(), { from: 'bad', to: period.to }, basis));
  assert.ok(aggregateAccountsReport(ledger({ accounts: [account(), account()] }), period, basis).every(row => row.closingBalance === null));
});
test('ambiguous cross-currency legacy and self transfers fail closed', () => {
  for (const destination of ['usd', 'bank']) {
    const data = ledger({ accounts: [account(), account({ id: 'usd', currencyCode: 'USD' })],
      transfers: [{ id: 't', fromAccountId: 'bank', toAccountId: destination, amount: 10, currencyCode: 'EGP', date: period.from }] });
    assert.equal(aggregateAccountsReport(data, period, basis)[0].closingBalance, null);
  }
});
test('intermediate overflow cannot be hidden by cancellation', () => {
  const data = ledger({ accounts: [account({ initialBalance: 90000000000000 })], transactions: [
    { id: 'a', accountId: 'bank', type: 'income', amount: 1000000000000, date: period.from },
    { id: 'b', accountId: 'bank', type: 'expense', amount: 1000000000000, date: period.to },
  ] });
  assert.equal(aggregateAccountsReport(data, period, basis)[0].closingBalance, null);
});
