const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const storage = new Map();

Module._load = function (id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') {
    return {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async key => { storage.delete(key); },
    };
  }

  return originalLoad.call(
    this,
    id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id,
    parent,
    main,
  );
};

require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText,
    filename,
  );

const { useLedgerStore: ledger } =
  require('../src/features/finance/store/useLedgerStore.ts');
const { useFinanceStore: finance } =
  require('../src/features/finance/store/useFinanceStore.ts');

const date = '2026-11-08';

const fx = (currency, rate) => ({
  sourceCurrencyCode: currency,
  referenceCurrencyCode: 'EGP',
  rate,
  rateDate: date,
  source: 'manual',
});

const account = {
  id: 'omr',
  name: 'TEST',
  type: 'bank',
  currencyCode: 'OMR',
  initialBalance: 100,
  archived: false,
  createdAt: date,
  updatedAt: date,
};

const crossInput = () => ({
  type: 'expense',
  accountId: 'omr',
  categoryId: 'out',
  amount: 3.901,
  date,
  originalAmount: 10,
  originalCurrencyCode: 'USD',
  accountFxRate: 0.3901,
  accountFxSnapshot: fx('USD', 50),
  historicalFx: fx('OMR', 130),
});

const clearFields = {
  originalAmount: undefined,
  originalCurrencyCode: undefined,
  accountFxRate: undefined,
  accountFxSnapshot: undefined,
};

before(async () => {
  await Promise.all([
    ledger.persist.rehydrate(),
    finance.persist.rehydrate(),
  ]);
});

beforeEach(() => {
  finance.setState({ loans: [], debts: [] });

  ledger.setState({
    accounts: [account],
    categories: [{
      id: 'out',
      name: 'Other',
      kind: 'expense',
      icon: 'cash',
      color: '#000',
      isDefault: false,
    }],
    transactions: [],
    transfers: [],
  });
});

test('USD to OMR transaction retains original and account amounts', () => {
  const id = ledger.getState().addTransaction(crossInput());
  assert.ok(id);

  const saved = ledger.getState().transactions[0];

  assert.equal(saved.originalAmount, 10);
  assert.equal(saved.originalCurrencyCode, 'USD');
  assert.equal(saved.amount, 3.901);
  assert.equal(saved.currencyCode, 'OMR');
  assert.equal(saved.accountFxRate, 0.3901);
});

test('explicit four-field clearing converts USD to ordinary OMR', () => {
  const id = ledger.getState().addTransaction(crossInput());
  assert.ok(id);

  const result = ledger.getState().updateTransaction(id, {
    amount: 5,
    historicalFx: fx('OMR', 130),
    ...clearFields,
  });

  assert.equal(result, true);

  const saved = ledger.getState().transactions[0];

  assert.equal(saved.amount, 5);
  assert.equal(saved.currencyCode, 'OMR');

  for (const key of Object.keys(clearFields)) {
    assert.equal(saved[key], undefined, `${key} must be cleared`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(saved, key),
      false,
      `${key} must not remain as an own property`,
    );
  }
});

test('partial clearing is rejected without mutation', () => {
  const id = ledger.getState().addTransaction(crossInput());
  assert.ok(id);

  const previous = ledger.getState().transactions;

  assert.equal(
    ledger.getState().updateTransaction(id, {
      originalAmount: undefined,
      originalCurrencyCode: undefined,
    }),
    false,
  );

  assert.strictEqual(ledger.getState().transactions, previous);
});

test('ordinary edit does not remove cross-currency evidence', () => {
  const id = ledger.getState().addTransaction(crossInput());
  assert.ok(id);

  assert.equal(
    ledger.getState().updateTransaction(id, { note: 'Edited' }),
    true,
  );

  const saved = ledger.getState().transactions[0];

  assert.equal(saved.originalAmount, 10);
  assert.equal(saved.accountFxRate, 0.3901);
  assert.deepEqual(saved.accountFxSnapshot, fx('USD', 50));
});

test('invalid effective rate cannot change saved transaction', () => {
  const id = ledger.getState().addTransaction(crossInput());
  assert.ok(id);

  const previous = ledger.getState().transactions;

  assert.equal(
    ledger.getState().updateTransaction(id, {
      amount: 4.1,
    }),
    false,
  );

  assert.strictEqual(ledger.getState().transactions, previous);
});