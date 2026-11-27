const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const transpileBody = source => {
  const compiled = ts.transpileModule('function __tomorrowTestEvaluate() {' + source + '\n}', {
    fileName: 'tomorrow-test-fragment.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      moduleDetection: ts.ModuleDetectionKind.Legacy,
      alwaysStrict: true,
    },
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
  return compiled.outputText + '\nreturn __tomorrowTestEvaluate();';
};
const root = process.env.TOMORROW_TEST_ROOT || require('node:path').resolve(__dirname, '..');
const phase = process.env.TOMORROW_TEST_PHASE || (__filename.includes('phase2') ? '2' : '3');
const read = (file) => readFileSync(root + '/src/features/finance/' + file, 'utf8').replace(/\r\n/g, '\n');
const store = read('store/useLedgerStore.ts');
const take = (source, start, end) => {
  const offset = source.indexOf(start);
  const finish = source.indexOf(end, offset);
  assert.ok(offset >= 0 && finish > offset);
  return source.slice(offset, finish);
};
const finance = read('utils/finance.ts');
const basics = take(finance, 'export const MONEY_DECIMALS', '/* ------------------------------- Dates').replaceAll('export ', '');
const currencies = read('constants/currencies.ts');
const currencyFunctions = take(currencies, 'export function isSupportedCurrency', 'export function getCurrencyFlag').replaceAll('export ', '');
const currencyList = take(currencies, 'export const CURRENCIES', 'export const DEFAULT_RATES_TO_EGP').replaceAll('export ', '');
const dates = take(read('utils/input.ts'), 'export function isValidISODate', '/** Parses a valid').replaceAll('export ', '');
const evaluate = (source, dependencies = {}) => new Function(...Object.keys(dependencies),
  transpileBody(basics + currencyList + currencyFunctions + dates + source))(...Object.values(dependencies));

if (phase === '2') {
  function accountStore() {
    let state = { accounts: [], transactions: [], transfers: [] };
    const actions = evaluate('return ({' + take(store, '      addAccount:', '      verifyAccountOpeningBalanceDate: (id') + '});', {
      get: () => state,
      set: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; },
      now: () => '2026-11-24',
      useCurrencyStore: { getState: () => ({ baseCurrency: 'USD' }) },
      useLedgerStore: { persist: { hasHydrated: () => true } },
      validateAccountOpeningDate: (ledger, id, date) => ({
        valid: ledger.accounts.some(a => a.id === id) && date === '2026-11-24',
      }),
    });
    return { ...actions, state: () => state };
  }
  const account = { name: 'Cash', type: 'cash', currencyCode: 'OMR', initialBalance: 1.234 };
  test('unsupported currency and excess precision are rejected before inserting', () => {
    const ledger = accountStore();
    assert.equal(ledger.addAccount({ ...account, currencyCode: 'XXX' }), '');
    assert.equal(ledger.addAccount({ ...account, currencyCode: 'USD' }), '');
    assert.equal(ledger.state().accounts.length, 0);
    assert.ok(ledger.addAccount(account));
    assert.equal(ledger.state().accounts[0].initialBalance, 1.234);
  });
  test('opening date is forwarded by both screens and saved on creation', () => {
    const ledger = accountStore();
    assert.equal(ledger.addAccount({ ...account, openingBalanceDate: '2026-11-24' }), '');
    assert.ok(ledger.addAccount(account, '2026-11-24'));
    assert.equal(ledger.state().accounts[0].openingBalanceDate, '2026-11-24');
    assert.equal(ledger.addAccount(account, '2026-02-30'), '');
    assert.equal(ledger.state().accounts.length, 1);
    const home = read('screens/FinanceHomeScreen.tsx');
    assert.equal([...home.matchAll(/const targetId = editingAccount\?\.id \?\? null;\s+const openingDate = targetId \? undefined : data\.openingBalanceDate;/g)].length, 2);
    assert.equal([...home.matchAll(/applyAccountForm\(useLedgerStore\.getState, targetId, accountInput, openingDate, expectedUpdatedAt\)/g)].length, 2);
    assert.match(read('components/explicitFinanceForm.ts'), /read\(\)\.addAccount\(input, openingDate\)/);
  });
  test('archive keeps historical references and survives serialized migration', () => {
    const category = { id: 'c', name: 'Food', kind: 'expense', icon: 'food', color: '#123456' };
    const stamp = '2026-11-24T00:00:00.000Z';
    let ledger = { accounts: [{ id: 'a', name: 'Cash', type: 'cash', currencyCode: 'USD', initialBalance: 10, createdAt: stamp, updatedAt: stamp }], categories: [category], transactions: [{ id: 't', categoryId: 'c', accountId: 'a', type: 'expense', currencyCode: 'USD', amount: 1, date: '2026-11-24', createdAt: stamp, updatedAt: stamp }], transfers: [] };
    let hydrated = false;
    const archive = evaluate('return ({' + take(store, '      archiveCategory: (id', '      deleteCategory: (id') + '}).archiveCategory;', {
      get: () => ledger,
      set: patch => { ledger = { ...ledger, ...patch }; },
      useLedgerStore: { persist: { hasHydrated: () => hydrated } },
    });
    assert.equal(archive('c'), false);
    hydrated = true;
    assert.equal(archive('c'), true);
    // Load the real hydration module and its settlement-evidence dependency, not a stub.
    const path = require('node:path');
    const cache = new Map();
    function loadLocal(file) {
      file = path.resolve(file);
      if (cache.has(file)) return cache.get(file).exports;
      const m = { exports: {} }; cache.set(file, m);
      const output = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
      new Function('require', 'module', 'exports', output)(specifier => {
        const target = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2))
          : path.resolve(path.dirname(file), specifier);
        return loadLocal(target.endsWith('.ts') ? target : target + '.ts');
      }, m, m.exports);
      return m.exports;
    }
    const { assertAccountingHydration } = loadLocal(path.join(root, 'src/features/finance/store/accountingHydration.ts'));
    const migrate = evaluate(take(store, 'function normalizeRecords', '/* -------------------------------------------------------------------------- */\n/* Refund') + 'return migrateLedgerData;', {
      assertAccountingHydration,
      isRecord: value => !!value && typeof value === 'object',
      paymentJournalMetadata: () => ({}),
      DEFAULT_CATEGORIES: [],
    });
    const restored = migrate(JSON.parse(JSON.stringify(ledger)));
    assert.throws(() => migrate({ ...ledger, accounts: null }), /Invalid saved accounting evidence/);
    assert.equal(restored.categories[0].archived, true);
    assert.equal(restored.transactions[0].categoryId, restored.categories[0].id);
    assert.equal(archive('c', false), true);
    assert.equal(ledger.categories[0].archived, false);
    const modal = read('components/AddTransactionModal.tsx');
    assert.match(modal, /!category.archived \|\| category.id === transaction\?\.categoryId/);
  });
} else {
  test('same-account refund cap retains OMR minor units', () => {
    const refundLogic = take(store, 'function getRefundedAmount(', '/* -------------------------------------------------------------------------- */\n/* Transfer validation');
    const validate = evaluate(refundLogic + 'return isValidRefund;', {
      isProtectedTransaction: () => false,
      useFinanceStore: { getState: () => ({}) },
    });
    const purchase = { id: 'p', accountId: 'a', currencyCode: 'OMR', categoryId: 'c', type: 'expense', amount: 1.234 };
    const refund = { ...purchase, id: 'r', entryType: 'refund', relatedTransactionId: 'p', amount: 0.6 };
    const accounts = [{ id: 'a', currencyCode: 'OMR' }];
    assert.equal(validate({ ...refund, amount: 0.634 }, [purchase, refund], accounts), true);
    assert.equal(validate({ ...refund, amount: 0.635 }, [purchase, refund], accounts), false);
    assert.equal(validate({ ...refund, amount: 1.234 }, [purchase], accounts), true);
  });
  test('refund creation persists all three OMR decimal places', () => {
    let state = {
      accounts: [{ id: 'a', currencyCode: 'OMR' }],
      categories: [{ id: 'c', kind: 'expense' }],
      transactions: [],
    };
    const hydrated = { persist: { hasHydrated: () => true } };
    const create = evaluate(take(store, '      const createTransaction =', '      const addPaymentTransaction =') + 'return createTransaction;', {
      get: () => state,
      set: patch => { state = { ...state, ...patch(state) }; },
      now: () => '2026-11-24',
      isValidRefund: () => true,
      isValidCrossCurrencyMetadata: () => true,
      useLedgerStore: hydrated,
      useFinanceStore: hydrated,
    });
    assert.ok(create({ accountId: 'a', categoryId: 'c', type: 'expense', entryType: 'refund', amount: 1.234 }));
    assert.equal(state.transactions[0].amount, 1.234);
  });
  test('invalid ordinary transaction date is rejected before creation', () => {
    const add = evaluate('return ({' + take(store, '      addTransaction: (input', '      addPropertyPaymentTransaction:') + '}).addTransaction;', {
      get: () => ({ accounts: [{ id: 'a', currencyCode: 'OMR' }] }),
      isValidCrossCurrencyMetadata: () => true,
      createTransaction: () => 'saved',
    });
    assert.equal(add({ accountId: 'a', date: '2026-02-30' }), null);
    assert.equal(add({ accountId: 'a', date: '2024-02-29' }), 'saved');
  });
}
