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
let componentStates = new Map(), activeFrame = null;
const stateArray = () => { if (activeFrame === null) return states; if (!componentStates.has(activeFrame)) componentStates.set(activeFrame, []); return componentStates.get(activeFrame); };
const hooks = { ...React, useEffect: () => {}, useMemo: fn => fn(), useState: initial => {
  const states = stateArray();
  const index = cursor++;
  if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
  return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
} };
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === '@/localization/LanguageProvider') return { useAppLanguage: () => ({ language: 'en', isRTL: false, setLanguage: () => {}, t: (english) => english }) };
  if (id === '@react-native-community/datetimepicker') return { __esModule: true, default: 'DateTimePicker' };
  if (id.endsWith('/ReportTableActions')) return { ReportTableActions: props => React.createElement('ReportTableActions', props) };
  if (id === 'react-native') return { useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }), Platform: { OS: 'android' }, Modal: 'Modal', ScrollView: 'ScrollView', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' };
  // Node UI tests do not load the native react-native-svg implementation.
  if (id === 'react-native-svg') {
    const element = name => props => React.createElement(name, props);
    const Svg = element('Svg');
    return { __esModule: true, default: Svg, Svg,
      G: element('G'), Path: element('Path'), Circle: element('Circle'),
      Rect: element('Rect'), Line: element('Line'), Text: element('SvgText'),
      Defs: element('Defs'), LinearGradient: element('LinearGradient'),
      Stop: element('Stop'), ClipPath: element('ClipPath') };
  }
  if (id === '@expo/vector-icons') return { Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' };
  if (id === 'expo-router') return { useRouter: () => ({ back: () => calls.push('back'), push: route => calls.push(route) }) };
  if (id === '@/components/ui') return { AppText: 'AppText', Screen: 'Screen' };
  if (id === '@/theme') return { moduleColors: { finance: '#10B981' }, useTheme: () => ({ scheme: 'light',
    colors: { text: '#111111', surface: '#FFFFFF', border: '#CCCCCC' }, spacing: { xs: 4, sm: 8, md: 12 },
  }) };
  if (id === '@/features/finance/store/useCurrencyStore') return {
    useCurrencyHydrated: () => ready,
    useCurrencyStore: select => select({ baseCurrency: 'EGP', rates: { EGP: 1 }, verifiedCurrencies: ['EGP'] }),
  };
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
function expand(node, nodePath = 'root') {
  if (Array.isArray(node)) return node.map((child, index) => expand(child, nodePath + '/' + (child?.key ?? index)));
  if (!React.isValidElement(node)) return node;
  if (node.type === 'Modal' && !node.props.visible) return null;
  if (typeof node.type === 'function') {
    const previousFrame = activeFrame, previousCursor = cursor;
    activeFrame = nodePath === 'root' ? null : nodePath + '/' + node.type.name; cursor = 0;
    const result = expand(node.type(node.props), nodePath + '/render');
    activeFrame = previousFrame; cursor = previousCursor; return result;
  }
  return { type: node.type, props: { ...node.props, children: expand(node.props.children, nodePath + '/children') } };
}
function render(component = Accounts) { if (component.name === "AccountsReportScreen" && states[0]?.from) states.unshift(""); cursor = 0; tree = expand(React.createElement(component)); }
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
  const node = nodes('Pressable').find(item => typeof item.props.accessibilityLabel === 'string' && item.props.accessibilityLabel.toLowerCase() === label.toLowerCase());
  assert.ok(node, label); assert.ok(!node.props.disabled, label + ' enabled'); node.props.onPress();
};
const account = (extra = {}) => ({ id: 'bank', name: 'Bank', currencyCode: 'EGP', type: 'bank',
  initialBalance: 1000, archived: false, createdAt: '2026-11-01T00:00:00Z', ...extra });
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } };
beforeEach(() => {
  componentStates = new Map(); activeFrame = null;
  states = [{ from: '2026-11-01', to: '2026-11-30' }]; cursor = 0; ready = true; calls = []; engineCalls = []; verifiedBases = undefined;
  ledger = { accounts: [account()], categories: [], transactions: [], transfers: [] };
});

test('8.3B missing verified history renders unavailable balances, never inferred dates or zeroes', () => {
  ledger.transactions.push({ id: 'cash', accountId: 'bank', type: 'income', amount: 50,
    currencyCode: 'EGP', date: '2026-11-01' });
  render();
  assert.match(allText(), /History unavailable|Invalid or inconsistent transaction/); press('Toggle Bank details'); render();
  assert.match(allText(), /Opening balance date not verified/);
  assert.equal((allText().match(/^Unavailable$/gm) ?? []).length, 0, 'No repeated unavailable cards');
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
  assert.match(allText(), /1,025\.00/);
  assert.doesNotMatch(allText(), /Incomplete history/);
});

test('8.3B hydration and empty states avoid misleading balances', () => {
  ready = false; render();
  assert.equal(nodes('ActivityIndicator').length, 1); assert.equal(engineCalls.length, 0);
  assert.doesNotMatch(allText(), /Incomplete history/);
  ready = true; ledger.accounts = []; render();
  assert.match(allText(), /No accounts for this selection/);
});

test('compact account dates change the exact engine period across leap boundaries', () => {
  states[0] = { from: '2024-03-01', to: '2024-03-31' }; render(); press('from date: 2024-03-01'); render();
  nodes('DateTimePicker')[0].props.onChange({ type: 'set' }, new Date(2024, 1, 29)); render();
  assert.deepEqual(engineCalls.at(-1).period, { from: '2024-02-29', to: '2024-03-31' });
  press('to date: 2024-03-31'); render();
  assert.equal(nodes('DateTimePicker')[0].props.minimumDate.getFullYear(), 100);
  assert.equal(nodes('DateTimePicker')[0].props.maximumDate.getFullYear(), 9999);
});

test('8.3B account filter includes archived accounts and retains full accounting context', () => {
  ledger.accounts.push(account({ id: 'old', name: 'Old account', currencyCode: 'USD', archived: true }));
  render(); press('Account: All accounts'); render(); press('Old account 🇺🇸 USD · Archived'); render();
  assert.match(allText(), /Old account/); assert.doesNotMatch(allText(), /^Bank$/m);
  assert.match(allText(), /USD · Archived/);
  assert.equal(engineCalls.at(-1).context.accounts.length, 2);
  press('Account: Old account 🇺🇸 USD · Archived'); render(); press('All accounts'); render();
  assert.match(allText(), /^Bank$/m);
});

test('8.3B removed or duplicate selected account fails closed without switching to all', () => {
  render(); press('Account: All accounts'); render(); press('Bank 🇪🇬 EGP'); render();
  ledger.accounts = []; render(); assert.match(allText(), /Selected account is missing or ambiguous/);
  ledger.accounts = [account(), account({ name: 'Duplicate' })]; render();
  assert.match(allText(), /Selected account is missing or ambiguous/);
  assert.doesNotMatch(allText(), /Opening Balance/);
});

test('8.3B verified fixture renders compact balances and separate currencies with exact scales', () => {
  ledger.accounts.push(account({ id: 'kwd', name: 'Kuwait', currencyCode: 'KWD', initialBalance: 1.237 }));
  verifiedBases = ledger.accounts.map(a => ({ accountId: a.id, openingBalanceDate: '2026-11-01' }));
  render();
  assert.match(allText(), /1,000\.00/); press('Currency: All currencies'); render(); press('🇰🇼 KWD'); render(); assert.match(allText(), /1\.237/); assert.doesNotMatch(allText(), /1,001\.237/);
  assert.match(allText(), /Opening Balance/); assert.match(allText(), /Closing Balance/); assert.match(allText(), /Net Change/);
  assert.doesNotMatch(allText(), /Total balance/i);
  const footer = nodes('ReportTableActions')[0]; assert.ok(footer); assert.equal(footer.props.table.verified, true);
  footer.props.statement();
  assert.deepEqual(calls.at(-1), { pathname: '/finance/statement-accounts', params: { month: '2026-11', from: '2026-11-01', to: '2026-11-30', currencyCode: 'KWD' } });
  assert.equal(nodes('View').filter(n => n.props.testID?.startsWith('account-report-')).length, 1);
  assert.ok(nodes('View').some(n => n.props.style.flexWrap === 'wrap'));
  assert.ok(nodes('View').filter(n => n.props.testID?.startsWith('account-report-')).every(n => n.props.style.height === undefined));
  assert.ok(nodes('AppText').some(n => n.props.numberOfLines === 1), 'Compact labels fit mobile widths');
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
  render(); press('Toggle Card details'); render(); assert.match(allText(), /-140\.00/);
  press('Toggle Movements for Card details'); render();
  for (const label of ['Income', 'Expenses', 'Refunds', 'Transfers in', 'Transfers out',
    'Credit-card repayments in (included above)', 'Credit-card repayments out (included above)']) {
    assert.ok(allText().includes(label), label);
  }
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Report information'), false);
  assert.match(allText(), /60\.00/); assert.match(allText(), /100\.00 EGP/);
  press('Back'); assert.deepEqual(calls, ['back']); assert.deepEqual(ledger, before);
});

test('8.3B engine diagnostics remain visible and unsafe row figures are hidden', () => {
  verifiedBases = [{ accountId: 'bank', openingBalanceDate: '2026-11-01' }];
  ledger.transactions.push({ id: 'bad-cash', accountId: 'bank', currencyCode: 'EGP',
    type: 'income', amount: 0.001, date: '2026-11-10' });
  render(); assert.match(allText(), /History unavailable|Invalid or inconsistent transaction/); press('Toggle Bank details'); render(); assert.match(allText(), /Invalid or inconsistent transaction/);
  assert.match(allText(), /transaction: bad-cash/);
  assert.doesNotMatch(allText(), /1,000\.00/);
});

test('Reports enables the eight implemented routes', () => {
  render(Reports);
  for (const [name, route] of [['Income','income'], ['Expenses','expenses'], ['Accounts','accounts'], ['Assets','assets'], ['Installments','installments'], ['Loans','loans'], ['Debts Receivable','receivable'], ['Debts Payable','payable']]) {
    press(`Open ${name} report`); assert.equal(calls.at(-1), `/finance/report-${route}`);
  }
  for (const name of ['Loans','Debts Receivable','Debts Payable']) {
    assert.equal(nodes('Pressable').find(n => n.props.accessibilityLabel === `Open ${name} report`).props.disabled === true, false);
  }
});

test('8.3B wiring keeps stored history, no writes or FX conversion, and the Statement route', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/finance/report-accounts.tsx'), 'utf8');
  assert.doesNotMatch(source, /createdAt|AsyncStorage|useFinanceStore/);
  assert.match(source, /useCurrencyStore/); // Display conversion reads verified FX; report history remains read-only.
  assert.match(source, /pathname: '\/finance\/statement-accounts'/);
  assert.match(source, /account\.openingBalanceDate/);
  assert.doesNotMatch(source, /\b(addAccount|updateAccount|addTransaction|updateTransaction|addTransfer|setState|setItem)\s*\(/);
});
