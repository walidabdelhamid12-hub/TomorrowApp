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

const date = '2026-11-10';

const account = {
  id: 'omr',
  name: 'Test OMR',
  type: 'bank',
  currencyCode: 'OMR',
  initialBalance: 100,
  archived: false,
  createdAt: date,
  updatedAt: date,
};

const manualEvidence = (rate = 2.6) => ({
  accountCurrencyCode: 'OMR',
  transactionCurrencyCode: 'EUR',
  rate,
  rateDate: date,
  source: 'manual',
});

const anchor = (currency, rate) => ({
  sourceCurrencyCode: currency,
  referenceCurrencyCode: 'EGP',
  rate,
  rateDate: date,
  source: 'manual',
});

const manualInput = () => ({
  type: 'expense',
  accountId: 'omr',
  categoryId: 'out',
  amount: 10,
  date,
  originalAmount: 26,
  originalCurrencyCode: 'EUR',
  accountFxRate: 10 / 26,
  directHistoricalFx: manualEvidence(),
});

const apiInput = () => ({
  type: 'expense',
  accountId: 'omr',
  categoryId: 'out',
  amount: 10,
  date,
  originalAmount: 26,
  originalCurrencyCode: 'EUR',
  accountFxRate: 10 / 26,
  accountFxSnapshot: anchor('EUR', 50),
  historicalFx: anchor('OMR', 130),
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

function add(input) {
  const id = ledger.getState().addTransaction(input);
  assert.ok(id, 'Transaction must be created');
  return id;
}

test('creates manual direct transaction', () => {
  add(manualInput());
  const saved = ledger.getState().transactions[0];
  assert.equal(saved.amount, 10);
  assert.equal(saved.originalAmount, 26);
  assert.equal(saved.currencyCode, 'OMR');
  assert.equal(saved.originalCurrencyCode, 'EUR');
});

test('preserves manual direct rate direction and source', () => {
  add(manualInput());
  const saved = ledger.getState().transactions[0];
  assert.deepEqual(saved.directHistoricalFx, manualEvidence());
  assert.equal(saved.accountFxSnapshot, undefined);
  assert.equal(saved.historicalFx, undefined);
});

test('updates account amount with matching effective rate', () => {
  const id = add(manualInput());
  assert.equal(ledger.getState().updateTransaction(id, {
    amount: 11,
    accountFxRate: 11 / 26,
  }), true);
  assert.equal(ledger.getState().transactions[0].amount, 11);
});

test('rejects inconsistent effective rate without mutation', () => {
  const id = add(manualInput());
  const previous = ledger.getState().transactions;
  assert.equal(ledger.getState().updateTransaction(id, {
    amount: 11,
  }), false);
  assert.strictEqual(ledger.getState().transactions, previous);
});

test('rejects clearing manual evidence alone', () => {
  const id = add(manualInput());
  const previous = ledger.getState().transactions;
  assert.equal(ledger.getState().updateTransaction(id, {
    directHistoricalFx: undefined,
  }), false);
  assert.strictEqual(ledger.getState().transactions, previous);
});

test('full clear removes manual direct evidence', () => {
  const id = add(manualInput());
  assert.equal(ledger.getState().updateTransaction(id, {
    amount: 5,
    ...clearFields,
  }), true);
  const saved = ledger.getState().transactions[0];
  for (const key of [...Object.keys(clearFields), 'directHistoricalFx']) {
    assert.equal(saved[key], undefined);
    assert.equal(Object.hasOwn(saved, key), false);
  }
});

test('transitions API evidence to manual direct evidence', () => {
  const id = add(apiInput());
  assert.equal(ledger.getState().updateTransaction(id, {
    accountFxSnapshot: undefined,
    historicalFx: undefined,
    directHistoricalFx: manualEvidence(),
  }), true);
  const saved = ledger.getState().transactions[0];
  assert.deepEqual(saved.directHistoricalFx, manualEvidence());
  assert.equal(saved.accountFxSnapshot, undefined);
  assert.equal(saved.historicalFx, undefined);
});

test('transitions manual direct evidence to API evidence', () => {
  const id = add(manualInput());
  assert.equal(ledger.getState().updateTransaction(id, {
    directHistoricalFx: undefined,
    accountFxSnapshot: anchor('EUR', 50),
    historicalFx: anchor('OMR', 130),
  }), true);
  const saved = ledger.getState().transactions[0];
  assert.equal(saved.directHistoricalFx, undefined);
  assert.deepEqual(saved.accountFxSnapshot, anchor('EUR', 50));
  assert.deepEqual(saved.historicalFx, anchor('OMR', 130));
});