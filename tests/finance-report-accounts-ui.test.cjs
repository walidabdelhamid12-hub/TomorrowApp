// Render real report components with mocked native surfaces; no native layout measurement.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const load = Module._load;
let states, cursor, ledger, ready, calls, engineCalls, verifiedBases, tree;
let realAggregate;
const hooks = { ...React, useMemo: fn => fn(), useState: initial => {
  const index = cursor++;
  if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
  return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
} };
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' };
  if (id === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
  if (id === 'expo-router') return { useRouter: () => ({ back: () => calls.push('back'), push: route => calls.push(route) }) };
  if (id === '@/components/ui') return { AppText: 'AppText', Screen: 'Screen' };
  if (id === '@/theme') return { moduleColors: { finance: '#10B981' }, useTheme: () => ({
    colors: { text: '#111111', surface: '#FFFFFF', border: '#CCCCCC' }, spacing: { xs: 4, sm: 8, md: 12 },
  }) };
  if (id === '@/features/finance/store/useLedgerStore') return {
    useLedgerHydrated: () => ready,
    useLedgerStore: select => select(new Proxy(ledger, { get: (value, key) => {
      assert.ok(['accounts','categories','transactions','transfers'].includes(key), 'No store writers: ' + String(key));
      return value[key];
    } })),
  };
  if (id === '@/features/finance/utils/reportAccounts') return { aggregateAccountsReport: (context, period, bases) => {
    engineCalls.push({ context, period, bases });
    // Fixture-only verified dates exercise presentation of real reconciled engine rows.
    return realAggregate(context, period, verifiedBases ?? bases);
  } };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
realAggregate = require('../src/features/finance/utils/reportAccounts.ts').aggregateAccountsReport;
const Accounts = require('../src/app/finance/report-accounts.tsx').default;
const Reports = require('../src/app/finance/reports.tsx').default;
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } };
}
function render(component = Accounts) { cursor = 0; tree = expand(React.createElement(component)); }
function nodes(type, node) {
  if (arguments.length === 1) node = tree;
  if (Array.isArray(node)) return node.flatMap(value => nodes(type, value));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props.children) : String(node);
}
const allText = () => nodes('AppText').map(text).join('\n');
const press = label => {
  const node = nodes('Pressable').find(item => item.props.accessibilityLabel === label);
  assert.ok(node, label); assert.ok(!node.props.disabled, label + ' enabled'); node.props.onPress();
};
const account = (extra = {}) => ({ id: 'bank', name: 'Bank', currencyCode: 'EGP', type: 'bank',
  initialBalance: 1000, archived: false, createdAt: '2026-11-01T00:00:00Z', ...extra });
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } };
beforeEach(() => {
  states = ['2026-11']; cursor = 0; ready = true; calls = []; engineCalls = []; verifiedBases = undefined;
  ledger = { accounts: [account()], categories: [], transactions: [], transfers: [] };
});

test('8.3B missing verified history renders unavailable balances, never inferred dates or zeroes', () => {
  ledger.transactions.push({ id: 'cash', accountId: 'bank', type: 'income', amount: 50,
    currencyCode: 'EGP', date: '2026-11-01' });
  render();
  assert.match(allText(), /Incomplete history/);
  assert.match(allText(), /Opening balance date not verified/);
  assert.equal((allText().match(/^Unavailable$/gm) ?? []).length, 3);
  assert.doesNotMatch(allText(), /1,000\.00|1,050\.00|^0\.00/m);
  assert.deepEqual(engineCalls[0].bases, []);
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel?.startsWith('Movements for')), false);
});

test('8.3C stored verified date is forwarded to the report engine without fixture injection', () => {
  ledger.accounts = [account({ openingBalanceDate: '2026-11-01' })];
  ledger.transactions = [{ id: 'income', accountId: 'bank', currencyCode: 'EGP',
    type: 'income', amount: 25, date: '2026-11-10' }];
  render();
  assert.deepEqual(engineCalls[0].bases, [
    { accountId: 'bank', openingBalanceDate: '2026-11-01' },
  ]);
  assert.match(allText(), /1,025\.00 EGP/);
  assert.doesNotMatch(allText(), /Incomplete history/);
});

test('8.3B hydration and empty states avoid misleading balances', () => {
  ready = false; render();
  assert.equal(nodes('ActivityIndicator').length, 1); assert.equal(engineCalls.length, 0);
  assert.doesNotMatch(allText(), /Incomplete history/);
  ready = true; ledger.accounts = []; render();
  assert.match(allText(), /No accounts for this selection/);
});

test('8.3B month controls change only report period and handle year/leap boundaries', () => {
  states[0] = '2024-03'; render(); press('Previous month'); render();
  assert.deepEqual(engineCalls.at(-1).period, { from: '2024-02-01', to: '2024-02-29' });
  press('Next month'); render(); assert.equal(engineCalls.at(-1).period.from, '2024-03-01');
  states[0] = '2026-01'; render(); press('Previous month'); render();
  assert.equal(engineCalls.at(-1).period.from, '2025-12-01');
  states[0] = '0100-01'; render();
  assert.equal(nodes('Pressable').find(n => n.props.accessibilityLabel === 'Previous month').props.disabled, true);
  states[0] = '9999-12'; render();
  assert.equal(nodes('Pressable').find(n => n.props.accessibilityLabel === 'Next month').props.disabled, true);
});

test('8.3B account filter includes archived accounts and retains full accounting context', () => {
  ledger.accounts.push(account({ id: 'old', name: 'Old account', currencyCode: 'USD', archived: true }));
  render(); press('Account: All accounts'); render(); press('Old account (USD) · Archived'); render();
  assert.match(allText(), /Old account/); assert.doesNotMatch(allText(), /^Bank$/m);
  assert.match(allText(), /USD · Archived/);
  assert.equal(engineCalls.at(-1).context.accounts.length, 2);
  press('Account: Old account (USD) · Archived'); render(); press('All accounts'); render();
  assert.match(allText(), /^Bank$/m);
});

test('8.3B removed or duplicate selected account fails closed without switching to all', () => {
  render(); press('Account: All accounts'); render(); press('Bank (EGP)'); render();
  ledger.accounts = []; render(); assert.match(allText(), /Selected account is missing or ambiguous/);
  ledger.accounts = [account(), account({ name: 'Duplicate' })]; render();
  assert.match(allText(), /Selected account is missing or ambiguous/);
  assert.doesNotMatch(allText(), /Opening Balance/);
});

test('8.3B verified fixture renders compact balances and separate currencies with exact scales', () => {
  ledger.accounts.push(account({ id: 'kwd', name: 'Kuwait', currencyCode: 'KWD', initialBalance: 1.237 }));
  verifiedBases = ledger.accounts.map(a => ({ accountId: a.id, openingBalanceDate: '2026-11-01' }));
  render();
  assert.match(allText(), /1,000\.00 EGP/); assert.match(allText(), /1\.237 KWD/);
  assert.match(allText(), /Opening Balance/); assert.match(allText(), /Closing Balance/); assert.match(allText(), /Net Change/);
  assert.doesNotMatch(allText(), /Total balance|View Statement/i);
  assert.equal(nodes('View').filter(n => n.props.testID?.startsWith('account-report-')).length, 2);
  assert.ok(nodes('View').some(n => n.props.style.flexWrap === 'wrap'));
  assert.ok(nodes('View').every(n => n.props.style.height === undefined));
  assert.ok(nodes('AppText').every(n => n.props.numberOfLines === undefined));
});

test('8.3B card repayments are transfer subsets and cash movement presentation is read-only', () => {
  ledger.accounts.push(account({ id: 'card', name: 'Card', type: 'credit_card', initialBalance: -200 }));
  ledger.transactions = [
    { id: 'p', accountId: 'card', currencyCode: 'EGP', type: 'expense', amount: 50, date: '2026-11-10' },
    { id: 'r', accountId: 'card', currencyCode: 'EGP', type: 'expense', entryType: 'refund',
      relatedTransactionId: 'p', amount: 10, date: '2026-11-11' },
  ];
  ledger.transfers = [{ id: 'repay', fromAccountId: 'bank', toAccountId: 'card',
    type: 'credit_card_payment', amount: 100, currencyCode: 'EGP', date: '2026-11-12' }];
  verifiedBases = ledger.accounts.map(a => ({ accountId: a.id, openingBalanceDate: '2026-11-01' }));
  const before = structuredClone(ledger); freeze(ledger);
  render(); assert.match(allText(), /-140\.00 EGP/);
  press('Movements for Card'); render();
  for (const label of ['Income', 'Expenses', 'Refunds', 'Transfers in', 'Transfers out',
    'Credit-card repayments in (included above)', 'Credit-card repayments out (included above)']) {
    assert.ok(allText().includes(label), label);
  }
  assert.match(allText(), /Repayments are included in transfers once/);
  assert.match(allText(), /60\.00 EGP/); assert.match(allText(), /100\.00 EGP/);
  press('Back to Reports'); assert.deepEqual(calls, ['back']); assert.deepEqual(ledger, before);
});

test('8.3B engine diagnostics remain visible and unsafe row figures are hidden', () => {
  verifiedBases = [{ accountId: 'bank', openingBalanceDate: '2026-11-01' }];
  ledger.transactions.push({ id: 'bad-cash', accountId: 'bank', currencyCode: 'EGP',
    type: 'income', amount: 0.001, date: '2026-11-10' });
  render(); assert.match(allText(), /Invalid or inconsistent transaction/);
  assert.match(allText(), /transaction: bad-cash/);
  assert.doesNotMatch(allText(), /1,000\.00/);
});

test('Reports enables the five implemented routes', () => {
  render(Reports);
  for (const [name, route] of [['Income','income'], ['Expenses','expenses'], ['Accounts','accounts'], ['Assets','assets'], ['Installments','installments']]) {
    press(`Open ${name} report`); assert.equal(calls.at(-1), `/finance/report-${route}`);
  }
  for (const name of ['Loans','Debts Receivable','Debts Payable']) {
    assert.equal(nodes('Pressable').find(n => n.props.accessibilityLabel === `Open ${name} report`).props.disabled, true);
  }
});

test('8.3B wiring never adds history fields, writes, FX conversion or a statement route', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/finance/report-accounts.tsx'), 'utf8');
  assert.doesNotMatch(source, /createdAt|AsyncStorage|useFinanceStore|useCurrencyStore|statement-accounts|View Statement/);
  assert.match(source, /account\.openingBalanceDate/);
  assert.doesNotMatch(source, /\b(addAccount|updateAccount|addTransaction|updateTransaction|addTransfer|setState|setItem)\s*\(/);
});
