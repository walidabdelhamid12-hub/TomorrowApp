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

// Task 8.3A: cash movements and exact balance reconciliation.
const cashTx = (id, type, amount, extra = {}) => ({
  id, accountId: 'bank', currencyCode: 'EGP', type, amount, date: period.from, ...extra,
});
const cashTransfer = (extra = {}) => ({
  id: 'move', fromAccountId: 'bank', toAccountId: 'other',
  amount: 40, currencyCode: 'EGP', date: period.from, type: 'internal', ...extra,
});
const allBases = (data, date = basis[0].openingBalanceDate) => data.accounts.map(a => ({
  accountId: a.id, openingBalanceDate: date,
}));
const assertReconciled = row => {
  assert.equal(row.status, 'available');
  assert.equal(row.reconciled, true);
  assert.deepEqual(row.diagnostics, []);
  const u = row.minorUnits;
  assert.equal(BigInt(u.closingBalance) - BigInt(u.openingBalance), BigInt(u.change));
  assert.equal(BigInt(u.income) - BigInt(u.expenses) + BigInt(u.refunds)
    + BigInt(u.transfersIn) - BigInt(u.transfersOut), BigInt(u.change));
};
const assertUnavailable = row => {
  assert.equal(row.status, 'historical_data_unavailable');
  assert.equal(row.reconciled, false);
  for (const key of ['openingBalance','closingBalance','change','movements','minorUnits','movementCount']) {
    assert.equal(row[key], null);
  }
  assert.ok(row.diagnostics.length > 0);
  assert.equal(row.diagnostics[0].reason, row.reason);
};

test('8.3A opening, period breakdown, and closing use all cash movements', () => {
  const data = ledger({ accounts: [account(), account({ id: 'other', initialBalance: 0 })],
    transactions: [
      cashTx('prior', 'income', 100, { date: '2026-11-11' }),
      cashTx('loan-receipt', 'income', 50, { date: '2026-11-12', linkedEntityType: 'loan', linkedEntityId: 'loan' }),
      cashTx('purchase', 'expense', 20, { date: '2026-11-20' }),
      cashTx('loan-payment', 'expense', 10, { date: '2026-11-25', purpose: 'loan_payment', linkedPaymentId: 'p' }),
      cashTx('refund', 'expense', 5, { date: period.to, entryType: 'refund', relatedTransactionId: 'purchase' }),
      cashTx('future', 'income', 1000, { date: '2026-12-01' }),
    ], transfers: [cashTransfer({ date: '2026-11-22' }),
      cashTransfer({ id: 'return', fromAccountId: 'other', toAccountId: 'bank', amount: 7, date: '2026-11-23' })],
  });
  const selected = { from: '2026-11-12', to: period.to };
  const row = aggregateAccountsReport(data, selected, allBases(data))[0];
  assertReconciled(row);
  assert.equal(row.openingBalance, 1100);
  assert.equal(row.closingBalance, 1092);
  assert.equal(row.change, -8);
  assert.equal(row.movementCount, 6);
  assert.deepEqual(row.movements, { income: 50, expenses: 30, refunds: 5,
    transfersIn: 7, transfersOut: 40, creditCardRepaymentsIn: 0, creditCardRepaymentsOut: 0 });
  assert.notEqual(row.change, row.movements.income - row.movements.expenses);
  const { getAccountBalance } = require('../src/features/finance/utils/ledger.ts');
  assert.equal(row.closingBalance, getAccountBalance(data.accounts[0],
    data.transactions.filter(tx => tx.date <= selected.to), data.transfers));
});

test('8.3A transfer-only period changes balances with zero income and expenses', () => {
  const data = ledger({ accounts: [account(), account({ id: 'other' })], transfers: [cashTransfer()] });
  const rows = aggregateAccountsReport(data, period, allBases(data));
  rows.forEach(assertReconciled);
  assert.deepEqual(rows.map(r => r.change), [-40, 40]);
  assert.ok(rows.every(r => r.movements.income === 0 && r.movements.expenses === 0));
  assert.equal(rows.reduce((sum, r) => sum + r.minorUnits.change, 0), 0);
});

test('8.3A archived cross-currency accounts use each actual posted leg, no inferred FX', () => {
  const data = ledger({ accounts: [account({ archived: true }),
    account({ id: 'other', currencyCode: 'KWD', initialBalance: 1, archived: true })],
    transfers: [cashTransfer({ fromAmount: 40, fromCurrencyCode: 'EGP',
      toAmount: 0.237, toCurrencyCode: 'KWD', exchangeRate: 0.005925 })] });
  const rows = aggregateAccountsReport(data, period, allBases(data));
  rows.forEach(assertReconciled);
  assert.deepEqual(rows.map(r => [r.currencyCode, r.change, r.archived]), [['EGP', -40, true], ['KWD', 0.237, true]]);
  assert.equal(rows[1].minorUnits.transfersIn, 237);
});

test('8.3A credit-card purchases, refunds and repayment keep debt negative and repay once', () => {
  const data = ledger({ accounts: [account(), account({ id: 'card', type: 'credit_card',
    initialBalance: -200, creditLimit: 10000, archived: true })], transactions: [
    cashTx('purchase', 'expense', 50, { accountId: 'card' }),
    cashTx('refund', 'expense', 10, { accountId: 'card', entryType: 'refund', relatedTransactionId: 'purchase' }),
  ], transfers: [cashTransfer({ toAccountId: 'card', type: 'credit_card_payment', amount: 100 })] });
  const rows = aggregateAccountsReport(data, period, allBases(data));
  rows.forEach(assertReconciled);
  assert.equal(rows[0].closingBalance, 900);
  assert.equal(rows[1].openingBalance, -200);
  assert.equal(rows[1].closingBalance, -140);
  assert.equal(rows[1].change, 60);
  assert.equal(rows[1].movements.income, 0);
  assert.equal(rows[1].movements.transfersIn, 100);
  assert.equal(rows[1].movements.creditCardRepaymentsIn, 100);
  assert.equal(rows[0].movements.creditCardRepaymentsOut, 100);
});

test('8.3A refund original remains available across account/currency/period filters', () => {
  const data = ledger({ accounts: [account(), account({ id: 'other', currencyCode: 'USD', initialBalance: 0 })],
    transactions: [cashTx('purchase', 'expense', 100, { date: '2026-11-11' }),
      cashTx('refund', 'expense', 2, { date: '2026-11-20', accountId: 'other', currencyCode: 'USD',
        entryType: 'refund', relatedTransactionId: 'purchase' })] });
  const rows = aggregateAccountsReport(data, { from: '2026-11-20', to: period.to }, allBases(data));
  rows.forEach(assertReconciled);
  assert.equal(rows[1].movements.refunds, 2);
  assert.equal(rows[1].change, 2);
});

for (const [label, extra] of [
  ['orphan', { relatedTransactionId: 'missing' }],
  ['self', { relatedTransactionId: 'refund' }],
  ['future original', { date: '2026-11-09' }],
  ['wrong type', { type: 'income' }],
]) {
  test('8.3A invalid refund ' + label + ' fails closed', () => {
    const data = ledger({ transactions: [cashTx('purchase', 'expense', 100),
      cashTx('refund', 'expense', 5, { entryType: 'refund', relatedTransactionId: 'purchase', ...extra })] });
    assertUnavailable(aggregateAccountsReport(data, period, basis)[0]);
  });
}

test('8.3A invalid original expense and duplicate refund targets fail closed', () => {
  for (const original of [cashTx('purchase', 'income', 100), cashTx('purchase', 'expense', NaN),
    cashTx('purchase', 'expense', 0), cashTx('purchase', 'expense', 0.001)]) {
    const data = ledger({ transactions: [original,
      cashTx('refund', 'expense', 5, { entryType: 'refund', relatedTransactionId: 'purchase' })] });
    assertUnavailable(aggregateAccountsReport(data, period, basis)[0]);
  }
  const original = cashTx('purchase', 'expense', 100);
  const data = ledger({ transactions: [original, { ...original },
    cashTx('refund', 'expense', 5, { entryType: 'refund', relatedTransactionId: 'purchase' })] });
  assertUnavailable(aggregateAccountsReport(data, period, basis)[0]);
});

for (const extra of [
  { toAmount: 0.001 }, { fromAmount: NaN }, { toAmount: null },
  { fromCurrencyCode: 'USD' }, { toCurrencyCode: 'USD' },
  { fromAmount: 40, toAmount: 41 }, { exchangeRate: 0 }, { exchangeRate: NaN },
  { type: 'unsupported' }, { type: null }, { type: 'credit_card_payment' },
  { toAccountId: 'missing' },
]) {
  test('8.3A invalid transfer invalidates both known legs: ' + JSON.stringify(extra), () => {
    const data = ledger({ accounts: [account(), account({ id: 'other' })], transfers: [cashTransfer(extra)] });
    const rows = aggregateAccountsReport(data, period, allBases(data));
    assertUnavailable(rows[0]);
    if (extra.toAccountId !== 'missing') assertUnavailable(rows[1]);
  });
}

test('8.3A cross-currency transfers require both explicit legs, including counterparty precision', () => {
  for (const extra of [{ fromAmount: 40 }, { toAmount: 2 }, { fromAmount: 40, toAmount: 0.001 }]) {
    const data = ledger({ accounts: [account(), account({ id: 'other', currencyCode: 'USD' })],
      transfers: [cashTransfer(extra)] });
    aggregateAccountsReport(data, period, allBases(data)).forEach(assertUnavailable);
  }
});

test('8.3A duplicate movement and account identities fail closed', () => {
  for (const extra of [
    { transactions: [cashTx('dup', 'income', 1), cashTx('dup', 'expense', 1)] },
    { accounts: [account(), account({ currencyCode: 'USD' })] },
    { accounts: [account(), account({ id: 'other' })], transfers: [cashTransfer(), cashTransfer()] },
  ]) {
    const data = ledger(extra);
    aggregateAccountsReport(data, period, allBases(data)).forEach(assertUnavailable);
  }
});

test('8.3A unresolved cash records cannot silently produce complete account totals', () => {
  for (const extra of [
    { transactions: [cashTx('orphan', 'income', 5, { accountId: 'ghost' })] },
    { transfers: [cashTransfer({ fromAccountId: 'ghost', toAccountId: 'missing' })] },
  ]) {
    assertUnavailable(aggregateAccountsReport(ledger(extra), period, basis)[0]);
  }
});

for (const value of [134217728.02, 4398046511104.02, -134217728.02]) {
  test('8.3A large exact initial balance keeps minor units: ' + value, () => {
    const row = aggregateAccountsReport(ledger({ accounts: [account({ initialBalance: value })] }), period, basis)[0];
    assertReconciled(row);
    assert.equal(row.closingBalance, value);
  });
}
for (const value of [NaN, Infinity, 0.001, Number.MAX_SAFE_INTEGER, 90071992547409.9]) {
  test('8.3A unsafe or overprecise initial balance rejected: ' + value, () => {
    assertUnavailable(aggregateAccountsReport(ledger({ accounts: [account({ initialBalance: value })] }), period, basis)[0]);
  });
}

test('8.3A gross movement totals cannot overflow even when net change is zero', () => {
  const data = ledger({ accounts: [account({ initialBalance: 0 })], transactions: [
    cashTx('a', 'income', 50000000000000), cashTx('b', 'expense', 50000000000000),
    cashTx('c', 'income', 50000000000000), cashTx('d', 'expense', 50000000000000),
  ] });
  assertUnavailable(aggregateAccountsReport(data, period, basis)[0]);
});

test('8.3A unsafe change between two individually safe balances fails closed', () => {
  const data = ledger({ accounts: [account({ initialBalance: -50000000000000 })], transactions: [
    cashTx('a', 'income', 50000000000000), cashTx('b', 'income', 50000000000000),
  ] });
  assertUnavailable(aggregateAccountsReport(data, period, basis)[0]);
});

test('8.3A calendar validation rejects invalid periods and basis dates', () => {
  for (const selected of [{ from: '2026-11-31', to: period.to },
    { from: '2026-12-01', to: period.to }, { from: '2026-11-10T00:00:00Z', to: period.to }]) {
    assert.throws(() => aggregateAccountsReport(ledger(), selected, basis), /Invalid report period/);
  }
  assertUnavailable(aggregateAccountsReport(ledger(), period, [{ accountId: 'bank', openingBalanceDate: '2026-02-29' }])[0]);
  const leap = { from: '2024-02-29', to: '2024-02-29' };
  assertReconciled(aggregateAccountsReport(ledger(), leap, [{ accountId: 'bank', openingBalanceDate: leap.from }])[0]);
});

test('8.3A unplaceable dates fail closed even outside selected period', () => {
  for (const date of ['2026-12-32', '', undefined, null, 20261110]) {
    assertUnavailable(aggregateAccountsReport(ledger({ transactions: [cashTx('bad', 'income', 1, { date })] }), period, basis)[0]);
  }
});

test('8.3A zero activity is available and historical bases are never inferred', () => {
  const data = ledger({ accounts: [account({ initialBalance: 0, createdAt: '2026-11-10T00:00:00Z' })] });
  const row = aggregateAccountsReport(data, period, basis)[0];
  assertReconciled(row);
  assert.equal(row.movementCount, 0);
  assert.equal(row.change, 0);
  assertUnavailable(aggregateAccountsReport(data, period)[0]);
});

test('8.3A frozen ledger, dates and bases remain unchanged and exact evidence is frozen', () => {
  const data = ledger({ accounts: [account(), account({ id: 'other' })],
    transactions: [cashTx('income', 'income', 0.01)], transfers: [cashTransfer()] });
  const selected = { ...period }, verified = allBases(data);
  const before = structuredClone({ data, selected, verified });
  const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } };
  freeze(data); freeze(selected); freeze(verified);
  const rows = aggregateAccountsReport(data, selected, verified);
  rows.forEach(assertReconciled);
  assert.ok(Object.isFrozen(rows[0].minorUnits));
  assert.deepEqual({ data, selected, verified }, before);
});

test('8.3A transfers before selection affect opening, endpoint transfers affect change', () => {
  const selected = { from: '2026-11-20', to: period.to };
  const data = ledger({ accounts: [account(), account({ id: 'other', initialBalance: 0 })], transfers: [
    cashTransfer({ id: 'prior', amount: 10, date: '2026-11-19' }),
    cashTransfer({ id: 'first', amount: 20, date: selected.from }),
    cashTransfer({ id: 'last', amount: 30, date: selected.to }),
    cashTransfer({ id: 'future', amount: 40, date: '2026-12-01' }),
  ] });
  const rows = aggregateAccountsReport(data, selected, allBases(data));
  rows.forEach(assertReconciled);
  assert.deepEqual(rows.map(r => [r.openingBalance, r.closingBalance, r.change, r.movementCount]),
    [[990, 940, -50, 2], [10, 60, 50, 2]]);
});

test('8.3A refund cannot predate its original even when both dates are in verified history', () => {
  const data = ledger({ transactions: [cashTx('purchase', 'expense', 100, { date: '2026-11-15' }),
    cashTx('refund', 'expense', 5, { date: '2026-11-14', entryType: 'refund', relatedTransactionId: 'purchase' })] });
  const row = aggregateAccountsReport(data, period, basis)[0];
  assertUnavailable(row);
  assert.equal(row.diagnostics[0].id, 'refund');
});

test('8.3A invalid transactions, transfers, and metadata retain diagnostic identities', () => {
  for (const extra of [{ type: undefined }, { type: 'adjustment' }, { entryType: 'other' },
    { relatedTransactionId: 'unexpected' }, { currencyCode: 'USD' }, { amount: Infinity }]) {
    const row = aggregateAccountsReport(ledger({ transactions: [cashTx('bad', 'income', 1, extra)] }), period, basis)[0];
    assertUnavailable(row);
    assert.equal(row.diagnostics[0].kind, 'transaction');
    assert.equal(row.diagnostics[0].id, 'bad');
  }
  const data = ledger({ accounts: [account(), account({ id: 'other' })],
    transfers: [cashTransfer({ date: '2026-02-30' })] });
  const rows = aggregateAccountsReport(data, period, allBases(data));
  rows.forEach(row => { assertUnavailable(row); assert.equal(row.diagnostics[0].id, 'move'); });
});

test('8.3A cross-currency or reversed credit-card repayment is rejected', () => {
  for (const extra of [{ currencyCode: 'USD' }, {}]) {
    const data = ledger({ accounts: [account(), account({ id: 'card', type: 'credit_card', initialBalance: -200, ...extra })],
      transfers: [cashTransfer({ toAccountId: 'card', type: 'credit_card_payment', fromAmount: 40, toAmount: 40,
        ...(extra.currencyCode ? {} : { fromAccountId: 'card', toAccountId: 'bank' }) })] });
    aggregateAccountsReport(data, period, allBases(data)).forEach(assertUnavailable);
  }
});

test('8.3A exact units cannot expose a closing balance with lost minor units', () => {
  const data = ledger({ accounts: [account({ initialBalance: 90000000000000 })],
    transactions: [cashTx('cent', 'income', 0.01)] });
  assertUnavailable(aggregateAccountsReport(data, period, basis)[0]);
});
