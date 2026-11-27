/* global __dirname */
// Actual accounting stores, actual persist middleware, controllable native I/O.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), load = Module._load;
let native, session;
Module._load = function(id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: native };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const F = 'tomorrow:finance', L = 'tomorrow:ledger', J = 'tomorrow:payment-operations';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = key => key === F ? { assets: [], debts: [], loans: [], cheques: [] }
  : { accounts: [], categories: [], transactions: [], transfers: [] };
const marker = { schemaVersion: 1, generationId: 'retained' };
function memory(data = new Map()) {
  const events = [];
  return { data, events, getItem: async key => { events.push(['get', key]); return data.get(key) ?? null; },
    setItem: async (key, value) => { events.push(['set', key, value]); data.set(key, value); },
    removeItem: async key => { events.push(['remove', key]); data.delete(key); } };
}
async function actualSession({ tracked = true, data, configure, waitHydration = true } = {}) {
  if (session) await session.runtime.close();
  // Simulate a fresh JS runtime, with the prior owner's I/O fully drained.
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.join(root, 'src', 'features', 'finance'))) delete require.cache[file];
  native = memory(data);
  configure?.(native);
  const module = require('../src/features/finance/store/paymentOperationRuntime.ts');
  const runtime = module.createPaymentOperationRuntime(native);
  if (tracked) module.installPaymentRuntimeBeforeStores(runtime);
  const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
  const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
  const hydrated = Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  session = { ...module, runtime, finance, ledger, native, hydrated };
  if (waitHydration) await hydrated;
  return session;
}
afterEach(async () => { if (session) await session.runtime.close(); session = undefined; });

test('real stores preserve bank credit and refund evidence through rehydration', async () => {
  let s = await actualSession({ tracked: false });
  const actions = s.ledger.getState();
  const accountId = actions.addAccount({ name: 'Cash', type: 'cash', currencyCode: 'OMR', initialBalance: 10 });
  const categoryId = actions.addCategory({ name: 'Meals', kind: 'expense', icon: 'restaurant', color: '#000' });
  const draft = {
    accountId, categoryId, type: 'expense', amount: 4, date: '2026-11-20',
    originalCurrencyCode: 'USD', originalAmount: 10, accountFxRate: 0.4,
    directHistoricalFx: { source: 'manual', accountCurrencyCode: 'OMR', transactionCurrencyCode: 'USD', rate: 2.5, rateDate: '2026-11-20' },
  };
  const purchase = actions.addTransaction(draft, 'trx_submit_purchase');
  assert.equal(purchase, 'trx_submit_purchase');
  const refund = {
    ...draft, entryType: 'refund', relatedTransactionId: purchase, amount: 1.234,
    date: '2026-11-24', originalAmount: 5, accountFxRate: 1.234 / 5,
    directHistoricalFx: { ...draft.directHistoricalFx, rate: 2.6, rateDate: '2026-11-24' },
  };
  assert.equal(actions.addTransaction({ ...refund, date: draft.date, amount: 1.2341 }), null);
  assert.equal(actions.addTransaction({ ...refund, date: '2026-11-19',
    directHistoricalFx: { ...refund.directHistoricalFx, rateDate: '2026-11-19' } }), null);
  assert.ok(actions.addTransaction(refund, 'trx_submit_refund'));
  await tick();
  s = await actualSession({ tracked: false, data: s.native.data });
  const restored = s.ledger.getState();
  assert.equal(restored.addTransaction(refund, 'trx_submit_refund'), null);
  assert.equal(restored.addTransaction({ ...refund, originalAmount: 5.01, accountFxRate: 1.234 / 5.01 }), null);
  const entry = restored.transactions.find(t => t.id === 'trx_submit_refund');
  assert.equal(entry.amount, 1.234);
  assert.equal(entry.originalAmount, 5);
  assert.deepEqual(entry.directHistoricalFx, refund.directHistoricalFx);
  const { getAccountBalance } = require('../src/features/finance/utils/ledger.ts');
  assert.equal(getAccountBalance(restored.accounts.find(a => a.id === accountId), restored.transactions), 7.234);
  const second = {
    ...refund, amount: 2.001, date: '2026-11-25', accountFxRate: 2.001 / 5,
    directHistoricalFx: { ...refund.directHistoricalFx, rate: 2.7, rateDate: '2026-11-25' },
  };
  assert.equal(restored.addTransaction({ ...second, originalCurrencyCode: 'EUR',
    directHistoricalFx: { ...second.directHistoricalFx, transactionCurrencyCode: 'EUR' } }), null);
  assert.ok(restored.addTransaction(second, 'trx_submit_second'));
  assert.equal(getAccountBalance(restored.accounts.find(a => a.id === accountId), s.ledger.getState().transactions), 9.235);
  assert.equal(restored.addTransaction(refund, 'trx_submit_third'), null);
  assert.equal(s.runtime.getStatus().postingAllowed, false);
});

test('restart can only deduplicate IDs in the persisted snapshot', async () => {
  let s = await actualSession({ tracked: false });
  const state = s.ledger.getState();
  const accountId = state.addAccount({ name: 'Cash', type: 'cash', currencyCode: 'OMR', initialBalance: 10 });
  const categoryId = state.addCategory({ name: 'Meals', kind: 'expense', icon: 'restaurant', color: '#000' });
  await tick();
  const beforeWrite = new Map(s.native.data);
  const input = { accountId, categoryId, type: 'expense', date: '2026-11-24', amount: 1 };
  const id = 'trx_submit_interrupted';
  assert.equal(state.addTransaction(input, id), id);
  // Restore the last complete disk image, modelling loss before the transaction write reached storage.
  s = await actualSession({ tracked: false, data: beforeWrite });
  assert.equal(s.ledger.getState().transactions.some(transaction => transaction.id === id), false);
  assert.equal(s.ledger.getState().addTransaction(input, id), id);
  await tick();
  s = await actualSession({ tracked: false, data: s.native.data });
  assert.equal(s.ledger.getState().addTransaction(input, id), null);
  assert.equal(s.ledger.getState().transactions.filter(transaction => transaction.id === id).length, 1);
});
