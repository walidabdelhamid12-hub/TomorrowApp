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
    assert.ok(ledger.addAccount(account, '2026-11-24'));
    assert.equal(ledger.state().accounts[0].openingBalanceDate, '2026-11-24');
    assert.equal(ledger.addAccount(account, '2026-02-30'), '');
    assert.equal(ledger.state().accounts.length, 1);
    assert.equal([...read('screens/FinanceHomeScreen.tsx').matchAll(/addAccount\(accountInput, data.openingBalanceDate\)/g)].length, 2);
  });
} else {
  test('same-account refund cap retains OMR minor units', () => {
    const refundLogic = take(store, 'function getRefundedAmount(', '/* -------------------------------------------------------------------------- */\n/* Transfer validation');
    const validate = evaluate(refundLogic + 'return isValidRefund;', {
      isProtectedTransaction: () => false,
      isValidCrossCurrencyMetadata: () => true,
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
  test('FX refund caps original units independently of the bank credit', () => {
    const validate = evaluate(take(store, 'function getRefundedAmount(', '/* -------------------------------------------------------------------------- */\n/* Transfer validation') + 'return isValidRefund;', {
      isProtectedTransaction: () => false,
      isValidCrossCurrencyMetadata: item => item.accountFxRate > 0,
      useFinanceStore: { getState: () => ({}) },
    });
    const purchase = { id: 'p', accountId: 'a', currencyCode: 'OMR', categoryId: 'c', type: 'expense', amount: 4,
      originalAmount: 10, originalCurrencyCode: 'USD', accountFxRate: 0.4 };
    const refund = { ...purchase, id: 'r', entryType: 'refund', relatedTransactionId: 'p',
      amount: 3, originalAmount: 6, accountFxRate: 0.5 };
    const accounts = [{ id: 'a', currencyCode: 'OMR' }];
    assert.equal(validate({ ...refund, amount: 2.5, originalAmount: 4 }, [purchase, refund], accounts), true);
    assert.equal(validate({ ...refund, amount: 1, originalAmount: 4.01 }, [purchase, refund], accounts), false);
    assert.equal(validate(refund, [purchase, { ...refund, originalCurrencyCode: undefined }], accounts), false);
  });
  test('actual cross-currency metadata validator accepts a different bank credit and rejects stale evidence', () => {
    const direct = read('utils/directHistoricalFx.ts').slice(read('utils/directHistoricalFx.ts').indexOf('export function')).replace('export ', '');
    const metadata = read('utils/crossCurrencyMetadata.ts').split('type Metadata =')[1];
    const valid = evaluate(direct + '\ntype Metadata =' + metadata.replace('export function', 'function')
      + '\nreturn isValidCrossCurrencyMetadata;');
    const refund = { amount: 0.5, currencyCode: 'OMR', originalAmount: 2, originalCurrencyCode: 'USD',
      accountFxRate: 0.25, date: '2026-11-24',
      directHistoricalFx: { source: 'manual', accountCurrencyCode: 'OMR', transactionCurrencyCode: 'USD',
        rate: 2.6, rateDate: '2026-11-24' } };
    assert.equal(valid(refund), true);
    assert.equal(valid({ ...refund, date: '2026-11-23' }), false);
    assert.equal(valid({ ...refund, accountFxRate: 0.2 }), false);
    assert.equal(valid({ ...refund, originalAmount: 2.001 }), false);
  });
  test('submission ID rejects a retry re-entering after the first insert', () => {
    const entries = [];
    const input = { accountId: 'a', date: '2026-11-24' };
    let add;
    add = evaluate('return ({' + take(store, '      addTransaction: (input', '      addPropertyPaymentTransaction:') + '}).addTransaction;', {
      get: () => ({ accounts: [{ id: 'a', currencyCode: 'OMR' }], transactions: entries }),
      pendingSubmissions: new Set(),
      useLedgerStore: { persist: { hasHydrated: () => true } },
      isValidCrossCurrencyMetadata: () => true,
      createTransaction: (draft, id) => {
        assert.equal(add(draft, id), null);
        entries.push({ ...draft, id });
        return id;
      },
    });
    assert.equal(add(input, 'trx_submit_test'), 'trx_submit_test');
    assert.equal(add(input, 'trx_submit_test'), null);
    assert.equal(entries.length, 1);
  });
  test('history searches Arabic notes and archived category names and filters refunds', () => {
    const screen = read('screens/IncomeExpensesScreen.tsx');
    const pipeline = take(screen, '  const rows =', '  const summary =');
    const select = evaluate('return (transactions, accounts, categories, kind, entryFilter, search, accountFilter = "" , categoryFilter = "") => { const byId = new Map(transactions.map(row=>[row.id,{incomeAmount:row.type==="income"?1:0,expenseAmount:row.type==="expense"?1:0}]));' + pipeline + 'return rows; };');
    const purchase = { id: 'p', type: 'expense', categoryId: 'c', accountId: 'a', date: '2026-11-24', createdAt: '1', note: 'قهوة' };
    const refund = { ...purchase, id: 'r', entryType: 'refund', createdAt: '2' };
    const categories = [{ id: 'c', archived: true, name: 'Food' }];
    assert.deepEqual(select([purchase, refund], [], categories, 'expense', 'refund', 'food'), [refund]);
    assert.deepEqual(select([purchase, refund], [], categories, 'expense', 'all', 'قهوة'), [refund, purchase]);
    const fx = { ...refund, originalCurrencyCode: 'USD', originalAmount: 7.89 };
    assert.deepEqual(select([purchase, fx], [], categories, 'expense', 'refund', 'usd', 'a', 'c'), [fx]);
    assert.deepEqual(select([purchase, fx], [], categories, 'expense', 'refund', '7.89', 'a', 'c'), [fx]);
    assert.deepEqual(select([purchase, fx], [], categories, 'expense', 'refund', 'usd', 'other', 'c'), []);
    assert.deepEqual(select([purchase, fx], [], categories, 'expense', 'refund', 'usd', 'a', 'other'), []);
  });
}
