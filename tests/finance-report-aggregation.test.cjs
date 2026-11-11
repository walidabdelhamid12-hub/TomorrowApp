/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;

Module._load = function (id, parent, main) {
  if (id.startsWith('@/')) {
    return originalLoad.call(
      this, path.join(root, 'src', id.slice(2)), parent, main,
    );
  }
  return originalLoad.call(this, id, parent, main);
};

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    const output = ts.transpileModule(
      fs.readFileSync(filename, 'utf8'),
      {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    module._compile(output, filename);
  };
}

const { aggregateOperatingReport } =
  require('../src/features/finance/utils/reportAggregation.ts');

const account = (id, currencyCode) => ({ id, currencyCode });

const tx = (id, type, amount, extra = {}) => ({
  id, type, amount,
  accountId: 'egp',
  currencyCode: 'EGP',
  categoryId: 'general',
  date: '2026-11-10',
  ...extra,
});

const context = (transactions) => ({
  ledger: {
    accounts: [
      account('egp', 'EGP'),
      account('usd', 'USD'),
    ],
    transactions,
    transfers: [],
    categories: [],
  },
  finance: {
    assets: [],
    loans: [],
    debts: [],
    cheques: [],
  },
});

const period = {
  from: '2026-11-01',
  to: '2026-11-30',
};

test('separates EGP and USD instead of mixing currencies', () => {
  const data = context([
    tx('salary', 'income', 10000),
    tx('foreign', 'income', 100, {
      accountId: 'usd',
      currencyCode: 'USD',
    }),
  ]);

  const result = aggregateOperatingReport(data, period);

  assert.deepEqual(result.currencies, [
    { currencyCode: 'EGP', income: 10000, expenses: 0, net: 10000 },
    { currencyCode: 'USD', income: 100, expenses: 0, net: 100 },
  ]);
});

test('refund reduces original category even across months', () => {
  const original = tx('food', 'expense', 500, {
    categoryId: 'groceries',
    date: '2026-01-15',
  });

  const refund = tx('refund', 'expense', 200, {
    categoryId: 'other',
    entryType: 'refund',
    relatedTransactionId: 'food',
  });

  const result = aggregateOperatingReport(
    context([original, refund]), period,
  );

  assert.deepEqual(result.expenseCategories, [
    { currencyCode: 'EGP', categoryId: 'groceries', amount: -200 },
  ]);
  assert.equal(result.currencies[0].expenses, -200);
});

test('period boundaries are inclusive', () => {
  const data = context([
    tx('first', 'income', 100, { date: '2026-11-01' }),
    tx('last', 'income', 200, { date: '2026-11-30' }),
    tx('outside', 'income', 300, { date: '2026-12-01' }),
  ]);

  const result = aggregateOperatingReport(data, period);

  assert.equal(result.currencies[0].income, 300);
  assert.equal(result.includedTransactions, 2);
});

test('orphan refunds stay unknown and never enter P&L', () => {
  const refund = tx('orphan', 'expense', 400, {
    entryType: 'refund',
    relatedTransactionId: 'missing',
  });

  const result = aggregateOperatingReport(context([refund]), period);

  assert.equal(result.currencies.length, 0);
  assert.equal(result.unknown.length, 1);
  assert.equal(result.unknown[0].id, 'orphan');
});

test('transfers and loan receipts are excluded from operating P&L', () => {
  const receipt = tx('loan-receipt', 'income', 100000);

  const data = context([receipt]);
  data.finance.loans = [{
    id: 'loan',
    receiptTransactionId: receipt.id,
    receivedAmount: 100000,
    receivedAt: receipt.date,
    currencyCode: 'EGP',
    payments: [],
  }];

  data.ledger.transfers = [{
    id: 'transfer',
    type: 'internal',
    fromAccountId: 'egp',
    toAccountId: 'usd',
    amount: 500,
  }];

  const result = aggregateOperatingReport(data, period);

  assert.equal(result.currencies.length, 0);
  assert.equal(result.includedTransactions, 0);
});

test('invalid periods are rejected', () => {
  const data = context([]);

  assert.throws(() => aggregateOperatingReport(
    data, { from: '2026-11-31', to: '2026-12-01' },
  ));

  assert.throws(() => aggregateOperatingReport(
    data, { from: '2026-12-01', to: '2026-11-01' },
  ));
});

test('aggregation never mutates input data', () => {
  const data = context([
    tx('salary', 'income', 1000),
    tx('food', 'expense', 250),
  ]);

  const before = structuredClone(data);
  const result = aggregateOperatingReport(data, period);

  assert.deepEqual(data, before);
  assert.equal(result.currencies[0].net, 750);
});

test('decimal arithmetic avoids floating-point drift', () => {
  const data = context([
    tx('a', 'income', 0.1),
    tx('b', 'income', 0.2),
  ]);

  const result = aggregateOperatingReport(data, period);

  assert.equal(result.currencies[0].income, 0.3);
  assert.equal(result.currencies[0].net, 0.3);
  assert.equal(result.incomeCategories[0].amount, 0.3);
});

test('invalid transaction dates are reported as unknown', () => {
  const data = context([
    tx('invalid', 'expense', 100, { date: '2026-11-31' }),
  ]);

  const result = aggregateOperatingReport(data, period);

  assert.equal(result.currencies.length, 0);
  assert.equal(result.unknown.length, 1);
  assert.equal(result.unknown[0].id, 'invalid');
});

test('currency-unit aggregation handles three-decimal precision', () => {
  const data = context([
    tx('a', 'income', 0.001, {
      accountId: 'kwd', currencyCode: 'KWD',
    }),
    tx('b', 'income', 0.002, {
      accountId: 'kwd', currencyCode: 'KWD',
    }),
  ]);

  data.ledger.accounts.push(account('kwd', 'KWD'));

  const result = aggregateOperatingReport(data, period);

  assert.deepEqual(result.currencies, [{
    currencyCode: 'KWD',
    income: 0.003,
    expenses: 0,
    net: 0.003,
  }]);
});

test('unsafe monetary values never enter totals', () => {
  const data = context([
    tx('unsafe', 'income', Number.MAX_SAFE_INTEGER),
  ]);

  const result = aggregateOperatingReport(data, period);

  assert.equal(result.currencies.length, 0);
  assert.equal(result.unknown.length, 1);
});

test('rejects sub-cent USD amounts', () => {
  const data = context([
    tx('invalid-usd', 'income', 0.001, {
      accountId: 'usd',
      currencyCode: 'USD',
    }),
  ]);

  const result = aggregateOperatingReport(data, period);

  assert.equal(result.currencies.length, 0);
  assert.equal(result.unknown.length, 1);
  assert.equal(result.unknown[0].id, 'invalid-usd');
});

test('expense categories reconcile after a refund', () => {
  const data = context([
    tx('food', 'expense', 100.25, {
      categoryId: 'groceries',
    }),
    tx('refund', 'expense', 20.15, {
      entryType: 'refund',
      relatedTransactionId: 'food',
      categoryId: 'other',
    }),
    tx('travel', 'expense', 50.10, {
      categoryId: 'transport',
    }),
  ]);

  const result = aggregateOperatingReport(data, period);
  const total = result.expenseCategories.reduce(
    (sum, category) => sum + Math.round(category.amount * 100),
    0,
  ) / 100;

  assert.equal(total, result.currencies[0].expenses);
  assert.equal(total, 130.20);
});

test('income categories reconcile across multiple categories', () => {
  const data = context([
    tx('salary', 'income', 1000.10, {
      categoryId: 'salary',
    }),
    tx('bonus', 'income', 250.20, {
      categoryId: 'bonus',
    }),
  ]);

  const result = aggregateOperatingReport(data, period);
  const total = result.incomeCategories.reduce(
    (sum, category) => sum + Math.round(category.amount * 100),
    0,
  ) / 100;

  assert.equal(total, result.currencies[0].income);
  assert.equal(total, 1250.30);
});
for (const currencyCode of ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'QAR', 'OMR', 'KWD', 'JOD']) {
  test(currencyCode + ' validates precision before totals update', () => {
    const factor = ['OMR', 'KWD', 'JOD'].includes(currencyCode) ? 1000 : 100;
    const data = context([tx('valid', 'income', 1 / factor, { currencyCode, accountId: 'test' }),
      tx('invalid', 'income', 1 / (factor * 10), { currencyCode, accountId: 'test' })]);
    data.ledger.accounts.push(account('test', currencyCode));
    const result = aggregateOperatingReport(data, period);
    assert.equal(result.currencies[0].income, 1 / factor);
    assert.equal(result.incomeCategories[0].amount, 1 / factor);
    assert.equal(result.unknown.length, 1);
    assert.equal(result.includedTransactions, 1);
  });
}
test('unsupported currencies never use fallback precision', () => {
  const data = context([tx('bad', 'income', 1, { currencyCode: 'JPY', accountId: 'jpy' })]);
  data.ledger.accounts.push(account('jpy', 'JPY'));
  const result = aggregateOperatingReport(data, period);
  assert.equal(result.currencies.length, 0);
  assert.equal(result.unknown.length, 1);
});
test('overflow rejects the whole transaction without category divergence', () => {
  const result = aggregateOperatingReport(context([tx('large', 'income', 90000000000000), tx('overflow', 'income', 1000000000000, { categoryId: 'other' })]), period);
  assert.equal(result.includedTransactions, 1);
  assert.equal(result.unknown.length, 1);
  assert.equal(result.incomeCategories.length, 1);
  assert.equal(result.currencies[0].income, result.incomeCategories[0].amount);
});
test('unverified loan principal remains diagnostic and excluded', () => {
  const result = aggregateOperatingReport(context([tx('principal', 'expense', 100, { purpose: 'loan_principal_payment' })]), period);
  assert.equal(result.currencies.length, 0);
  assert.equal(result.unknown.length, 1);
});
