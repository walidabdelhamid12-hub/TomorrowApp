const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const storage = new Map();
const originalLoad = Module._load;

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

const { useFinanceStore } =
  require('../src/features/finance/store/useFinanceStore.ts');
const { useLedgerStore } =
  require('../src/features/finance/store/useLedgerStore.ts');

let accountId;
let categoryId;

const validFx = {
  sourceCurrencyCode: 'USD',
  referenceCurrencyCode: 'EGP',
  rate: 50,
  rateDate: '2026-11-08',
  source: 'manual'
};

before(async () => {
  await Promise.all([
    useFinanceStore.persist.rehydrate(),
    useLedgerStore.persist.rehydrate()
  ]);
});

beforeEach(() => {
  useFinanceStore.setState({ loans: [], debts: [] });
  useLedgerStore.setState({
    accounts: [],
    transactions: [],
    transfers: []
  });

  accountId = useLedgerStore.getState().addAccount({
    name: 'FX Test Bank',
    type: 'bank',
    currencyCode: 'USD',
    initialBalance: 100
  });

  categoryId = useLedgerStore.getState()
    .categories.find(c => c.kind === 'income').id;

  assert.ok(accountId);
  assert.ok(categoryId);
});

function add(extra = {}) {
  return useLedgerStore.getState().addTransaction({
    type: 'income',
    accountId,
    categoryId,
    amount: 10,
    date: '2026-11-08',
    ...extra
  });
}

test('valid historical FX is accepted and preserved', () => {
  const id = add({ historicalFx: validFx });
  assert.ok(id);
  const tx = useLedgerStore.getState()
    .transactions.find(t => t.id === id);
  assert.deepEqual(tx.historicalFx, validFx);
});

test('invalid historical FX is rejected without insertion', () => {
  const id = add({
    historicalFx: { ...validFx, rate: -1 }
  });
  assert.equal(id, null);
  assert.equal(useLedgerStore.getState().transactions.length, 0);
});

test('wrong historical date is rejected', () => {
  const id = add({
    historicalFx: { ...validFx, rateDate: '2026-11-07' }
  });
  assert.equal(id, null);
  assert.equal(useLedgerStore.getState().transactions.length, 0);
});

test('legacy transaction without FX remains accepted', () => {
  const id = add();
  assert.ok(id);
  const tx = useLedgerStore.getState()
    .transactions.find(t => t.id === id);
  assert.equal(tx.historicalFx, undefined);
});
test('changing date with stale FX is rejected', () => {
  const id = add({ historicalFx: validFx });
  assert.ok(id);
  const updated = useLedgerStore.getState().updateTransaction(id, {
    date: '2026-11-07'
  });
  assert.equal(updated, false);
  assert.equal(useLedgerStore.getState().transactions[0].date, '2026-11-08');
});

test('changing date with matching FX is accepted', () => {
  const id = add({ historicalFx: validFx });
  assert.ok(id);
  const updated = useLedgerStore.getState().updateTransaction(id, {
    date: '2026-11-07',
    historicalFx: { ...validFx, rateDate: '2026-11-07', rate: 49 }
  });
  assert.equal(updated, true);
  const tx = useLedgerStore.getState().transactions[0];
  assert.equal(tx.date, '2026-11-07');
  assert.equal(tx.historicalFx.rate, 49);
});

test('changing account currency with stale FX is rejected', () => {
  const id = add({ historicalFx: validFx });
  assert.ok(id);
  const otherAccount = useLedgerStore.getState().addAccount({
    name: 'EUR Bank',
    type: 'bank',
    currencyCode: 'EUR',
    initialBalance: 100
  });
  const updated = useLedgerStore.getState().updateTransaction(id, {
    accountId: otherAccount
  });
  assert.equal(updated, false);
  assert.equal(useLedgerStore.getState().transactions[0].accountId, accountId);
});

test('changing account currency with matching FX is accepted', () => {
  const id = add({ historicalFx: validFx });
  assert.ok(id);
  const otherAccount = useLedgerStore.getState().addAccount({
    name: 'EUR Bank',
    type: 'bank',
    currencyCode: 'EUR',
    initialBalance: 100
  });
  const updated = useLedgerStore.getState().updateTransaction(id, {
    accountId: otherAccount,
    historicalFx: { ...validFx, sourceCurrencyCode: 'EUR', rate: 55 }
  });
  assert.equal(updated, true);
  const tx = useLedgerStore.getState().transactions[0];
  assert.equal(tx.accountId, otherAccount);
  assert.equal(tx.currencyCode, 'EUR');
  assert.equal(tx.historicalFx.sourceCurrencyCode, 'EUR');
});

// STEP 1C.3C EFFECTIVE RATE DATE TESTS

test('historical API accepts earlier effective date', () => {
  const fx = {
    ...validFx,
    source: 'historical_api',
    effectiveRateDate: '2026-11-06'
  };
  const id = add({ historicalFx: fx });
  assert.ok(id);
  assert.equal(
    useLedgerStore.getState().transactions[0].historicalFx.effectiveRateDate,
    '2026-11-06'
  );
});

test('historical API rejects future effective date', () => {
  const id = add({
    historicalFx: {
      ...validFx,
      source: 'historical_api',
      effectiveRateDate: '2026-11-09'
    }
  });
  assert.equal(id, null);
  assert.equal(useLedgerStore.getState().transactions.length, 0);
});

test('historical API rejects invalid effective calendar date', () => {
  const id = add({
    historicalFx: {
      ...validFx,
      source: 'historical_api',
      effectiveRateDate: '2026-02-30'
    }
  });
  assert.equal(id, null);
  assert.equal(useLedgerStore.getState().transactions.length, 0);
});

test('manual FX accepts effective date matching transaction', () => {
  const id = add({
    historicalFx: {
      ...validFx,
      effectiveRateDate: '2026-11-08'
    }
  });
  assert.ok(id);
  assert.equal(
    useLedgerStore.getState().transactions[0].historicalFx.source,
    'manual'
  );
});

test('manual FX rejects earlier effective date', () => {
  const id = add({
    historicalFx: {
      ...validFx,
      effectiveRateDate: '2026-11-06'
    }
  });
  assert.equal(id, null);
  assert.equal(useLedgerStore.getState().transactions.length, 0);
});

test('changing date with undefined FX rejects stale snapshot', () => {
  const id = add({ historicalFx: validFx });
  assert.ok(id);

  const original = useLedgerStore.getState().transactions.find(
    item => item.id === id
  );
  assert.ok(original);

  const updated = useLedgerStore.getState().updateTransaction(id, {
    date: '2026-11-07',
    historicalFx: undefined,
  });

  const tx = useLedgerStore.getState().transactions.find(
    item => item.id === id
  );

  assert.equal(updated, false);
  assert.equal(tx.date, original.date);
  assert.deepEqual(tx.historicalFx, validFx);
});
