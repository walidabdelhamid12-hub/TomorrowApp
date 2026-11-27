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

test('archived categories survive a fresh store and reject new selection and historical deletion', async () => {
  let s = await actualSession({ tracked: false });
  const actions = s.ledger.getState();
  const categoryId = actions.addCategory({ name: 'Meals', kind: 'expense', icon: 'restaurant', color: '#000' });
  const replacement = actions.addCategory({ name: 'Other', kind: 'expense', icon: 'cash', color: '#000' });
  const accountId = actions.addAccount({ name: 'Cash', type: 'cash', initialBalance: 10, currencyCode: 'OMR' });
  const draft = { accountId, categoryId, amount: 1, date: '2026-11-24', type: 'expense' };
  const initial = actions.addTransaction(draft);
  assert.ok(initial);
  assert.equal(actions.archiveCategory(categoryId), true);
  assert.equal(actions.deleteCategory(categoryId, replacement), false);
  await tick();
  s = await actualSession({ tracked: false, data: s.native.data });
  const restored = s.ledger.getState();
  assert.equal(restored.categories.find(c => c.id === categoryId).archived, true);
  assert.equal(restored.transactions.find(t => t.id === initial).categoryId, categoryId);
  assert.equal(restored.addTransaction(draft), null);
  assert.equal(restored.updateTransaction(initial, { note: 'Historical edit' }), true);
  assert.equal(restored.archiveCategory(categoryId, false), true);
  assert.ok(restored.addTransaction(draft));
  assert.equal(s.runtime.getStatus().postingAllowed, false);
});

test('both category routes share the archive-capable screen and report filters retain history', () => {
  const source = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
  assert.match(source('app/categories.tsx'), /<CategoriesScreen/);
  assert.match(source('features/finance/screens/CategoriesScreen.tsx'), /<CategoryManagementScreen/);
  assert.match(source('app/finance/categories.tsx'), /<CategoryManagementScreen/);
  const management = source('features/finance/components/CategoryManagementScreen.tsx');
  assert.match(management, /setCategoryArchived\(category.id, false\)/);
  assert.match(management, /mutate: \(\) => archiveCategory\(targetId, archived\)/);
  assert.match(management, /export function CategoryManagementScreen\(/);
  assert.match(source('features/finance/components/AddTransactionModal.tsx'), /archiveCategory\(category.id\)/);
  for (const kind of ['income', 'expenses']) {
    const filter = source('app/finance/report-' + kind + '.tsx').split('<ReportPicker')[2];
    assert.match(filter, /categories.filter/);
    assert.doesNotMatch(filter, /category\.archived/);
  }
});
