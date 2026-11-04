// Actual asset components with mocked native surfaces; no native layout measurement.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const load = Module._load;
let states, cursor, finance, currency, alerts, calls, theme, ledger, effects, params;
const hooks = { ...React, useEffect: (fn, deps) => {
  const key = cursor++; const previous = states[key];
  if (!previous || !deps || deps.some((d, i) => d !== previous[i])) { states[key] = deps; effects.push(fn); }
}, useRef: initial => { const key = cursor++; if (!(key in states)) states[key] = { current: initial }; return states[key]; }, useMemo: fn => fn(), useState: initial => {
  const key = cursor++;
  if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial;
  return [states[key], value => { states[key] = typeof value === 'function' ? value(states[key]) : value; }];
} };
function Ionicon(props) { return React.createElement('Ionicon', props); }
function MaterialIcon(props) { return React.createElement('MaterialIcon', props); }
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', ScrollView: 'ScrollView', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView',
    PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Animated: { Value: function() { this.interpolate = () => 0; this.stopAnimation = () => {}; this.setValue = () => {}; }, timing: () => ({ start() {}, stop() {} }), loop: () => ({ start() {}, stop() {} }) },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, Platform: { OS: 'android' },
    Alert: { alert: (...args) => alerts.push(args) } };
  if (id === '@expo/vector-icons') return { Ionicons: Ionicon, MaterialCommunityIcons: MaterialIcon };
  if (id === 'expo-router') return { useLocalSearchParams: () => params, useRouter: () => ({ back: () => calls.push('back'), replace: () => calls.push('replace') }) };
  if (id === '@/theme') return { useTheme: () => theme, moduleColors: { finance: '#10B981' } };
  if (id === '@/components/ui') return { Card: 'Card', AppText: 'AppText', AppButton: 'AppButton', Screen: 'Screen', DateField: 'DateField', AppInput: 'AppInput' };
  if (id === '@/features/finance/components/AddAssetModal') return { AddAssetModal: 'AddAssetModal' };
  if (id === '@/features/finance/components/FormModal') return { FormModal: 'FormModal' };
  if (id === '@/features/finance/store/paymentOperations') return Object.fromEntries(['confirmLoanReceipt', 'postLinkedPayment', 'editLinkedPayment', 'reverseLinkedPayment'].map(name => [name, () => { calls.push(name); return { ok: true }; }]));
  if (id === '@/features/finance/components/AssetEntriesModal') return { AssetEntriesModal: 'AssetEntriesModal' };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerHydrated: () => true, useLedgerStore: Object.assign(select => select(ledger), { getState: () => ledger }) };
  if (id === '@/features/finance/store/useFinanceStore') return { useFinanceHydrated: () => true,
    useFinanceStore: Object.assign(select => select(finance), { getState: () => finance }) };
  if (id === '@/features/finance/store/useCurrencyStore') return { useCurrencyHydrated: () => true, useCurrencyStore: select => select(currency) };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
const { lightColors, darkColors } = require('../src/theme/colors.ts');
const { GOLD_COLORS } = require('../src/features/finance/constants/metals.ts');
const { AssetRow } = require('../src/features/finance/components/AssetRow.tsx');
const { AssetCard } = require('../src/features/finance/components/AssetCard.tsx');
const { default: AssetsScreen } = require('../src/features/finance/screens/AssetsScreen.tsx');
const { FinanceActionButtons } = require('../src/features/finance/components/FinanceActionButtons.tsx');
const { AccountsSection } = require('../src/features/finance/components/AccountsSection.tsx');
let tree;
const gold = { id: 'gold', name: 'GOLD TEST', category: 'gold', karat: 21,
  entries: [{ id: 'entry', amount: 2, date: '2026-11-04' }] };
const silver = { id: 'silver', name: 'SILVER TEST', category: 'silver', entries: [{ id: 'entry', amount: 0.002, date: '2026-11-04' }] };
const rowProps = asset => ({ asset, baseCurrency: 'EGP', rates: { EGP: 1 }, gold24PerGram: 7002.58,
  silverPerGram: 6127.2575, first: true, amountsVisible: true,
  onEdit: () => calls.push('edit'), onDelete: () => calls.push('delete'), onViewEntries: () => calls.push('movements') });
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } };
}
function render(component, props) { cursor = 0; tree = expand(React.createElement(component, props)); }
function nodes(type, node) {
  if (arguments.length === 1) node = tree;
  if (Array.isArray(node)) return node.flatMap(n => nodes(type, n));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children)];
}
const texts = () => nodes('AppText').map(n => n.props.children).filter(t => typeof t === 'string');
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
beforeEach(() => {
  states = []; cursor = 0; alerts = []; calls = []; effects = []; params = {};
  ledger = { accounts: [], transactions: [], transfers: [], categories: [] };
  theme = { colors: lightColors, isDark: false, spacing: { xs: 4, sm: 8, md: 12 }, radius: { sm: 8 } };
  finance = { assets: structuredClone([gold, silver]), loans: [], debts: [], cheques: [] };
  for (const method of ['addAsset', 'updateAsset', 'deleteAsset', 'addAssetEntry', 'updateAssetEntry', 'deleteAssetEntry']) {
    finance[method] = (...args) => calls.push([method, ...args]);
  }
  currency = { baseCurrency: 'EGP', rates: { EGP: 1 }, verifiedCurrencies: ['EGP'],
    metals: { gold24PerGram: 7002.58, silverPerGram: 6127.2575 },
    metalSources: { gold24PerGram: 'manual', silverPerGram: 'manual' } };
});

for (const isDark of [false, true]) {
  for (const asset of [gold, silver]) test(`${isDark ? 'dark' : 'light'} ${asset.category} uses the Rates metal symbol next to the asset name`, () => {
    theme.isDark = isDark; theme.colors = isDark ? darkColors : lightColors;
    render(AssetRow, rowProps(asset));
    const glyph = nodes('AppText').find(n => n.props.testID === 'asset-icon-' + asset.category);
    assert.equal(glyph.props.children, asset.category === 'gold' ? '🥇' : '🥈');
    assert.equal(nodes('Ionicon').some(n => /diamond/.test(n.props.name)), false);
    assert.ok(texts().includes(asset.name));
    assert.equal(nodes('Card')[0].props.variant, 'outlined');
  });
}
test('the active Assets screen uses the same Rates symbols and corrected gold/silver displays', () => {
  const previous = structuredClone(finance.assets);
  render(AssetsScreen);
  assert.equal(nodes('Card').length, 2);
  assert.deepEqual(nodes('AppText').filter(n => n.props.testID?.startsWith('asset-icon-')).map(n => n.props.testID), ['asset-icon-gold', 'asset-icon-silver']);
  for (const value of ['GOLD TEST', 'Gold · 21K', '2.000 g', '12,254.52 EGP', 'SILVER TEST', 'Silver', '0.002 g', '12.25 EGP']) assert.ok(texts().includes(value), value);
  assert.deepEqual(finance.assets, previous);
  assert.deepEqual(calls, []);
});
test('the compact shared card has small padding, no fixed height, and scalable untruncated names/values', () => {
  render(AssetRow, rowProps({ ...gold, name: 'A long gold asset name with room to wrap at large Android font scales' }));
  const cardStyle = style(nodes('Card')[0].props.style);
  assert.equal(cardStyle.padding, 8); assert.equal(cardStyle.gap, 4);
  assert.equal(cardStyle.height, undefined); assert.equal(cardStyle.minHeight, undefined);
  for (const text of nodes('AppText')) {
    assert.equal(text.props.numberOfLines, undefined);
    assert.notEqual(text.props.allowFontScaling, false);
  }
  for (const button of nodes('Pressable')) {
    const s = style(typeof button.props.style === 'function' ? button.props.style({ pressed: false }) : button.props.style);
    assert.ok(s.minHeight >= 48); assert.equal(s.height, undefined);
  }
});
test('AssetRow Movements, Edit, and Delete callbacks remain independently accessible', () => {
  render(AssetRow, rowProps(gold));
  for (const label of ['Movements GOLD TEST', 'Edit GOLD TEST', 'Delete GOLD TEST']) {
    const action = nodes('Pressable').find(n => label.startsWith('Movements') ? n.props.accessibilityLabel.startsWith('Movements for GOLD TEST,') : n.props.accessibilityLabel === label);
    assert.ok(action); action.props.onPress();
  }
  assert.deepEqual(calls, ['movements', 'edit', 'delete']);
});
test('Assets screen actions open the correct movement/edit modals and preserve delete confirmation', () => {
  render(AssetsScreen);
  nodes('Pressable').find(n => n.props.accessibilityLabel.startsWith('Movements for GOLD TEST,')).props.onPress(); render(AssetsScreen);
  const entries = nodes('AssetEntriesModal')[0];
  assert.equal(entries.props.visible, true); assert.equal(entries.props.asset.id, 'gold');
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Edit GOLD TEST').props.onPress(); render(AssetsScreen);
  const edit = nodes('AddAssetModal')[0];
  assert.equal(edit.props.visible, true); assert.equal(edit.props.asset.id, 'gold');
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Delete GOLD TEST').props.onPress();
  assert.equal(calls.length, 0);
  const confirmation = alerts[0];
  confirmation[2].find(button => button.text === 'Delete').onPress();
  assert.deepEqual(calls, [['deleteAsset', 'gold']]);
});
test('AssetRow privacy masks weight and valuation, including its accessible summary', () => {
  render(AssetRow, { ...rowProps(gold), amountsVisible: false });
  assert.equal(texts().some(t => t.includes('12,254') || t.includes('2.000')), false);
  assert.ok(nodes('Pressable').every(n => !n.props.accessibilityLabel.includes('12,254')));
});
test('foreign assets retain verified-rate availability and three-decimal base currency display', () => {
  const fx = { ...gold, category: 'foreign_currency', currencyCode: 'USD', entries: [{ amount: 1, date: '2026-11-04' }] };
  render(AssetRow, { ...rowProps(fx), baseCurrency: 'KWD', rates: { USD: 1.2345, KWD: 1 }, verifiedCurrencies: ['USD', 'KWD'] });
  assert.ok(texts().includes('≈ 1.235 KWD'));
  render(AssetRow, { ...rowProps(fx), baseCurrency: 'KWD', rates: { USD: 1.2345, KWD: 1 } });
  assert.ok(texts().includes('No rate available'));
});
test('unconfirmed metal prices remain unavailable on the active Assets screen', () => {
  currency.metalSources.gold24PerGram = 'default';
  render(AssetsScreen);
  assert.ok(texts().includes('Valuation unavailable'));
  assert.equal(texts().includes('12,254.52 EGP'), false);
});

for (const isDark of [false, true]) test('shared labeled action buttons, targets and callbacks in ' + (isDark ? 'dark' : 'light') + ' theme', () => {
  theme.colors = isDark ? darkColors : lightColors; theme.isDark = isDark;
  render(FinanceActionButtons, { label: 'Test record', onEdit: () => calls.push('edit'), onDelete: () => calls.push('delete') });
  assert.deepEqual(nodes('Ionicon').map(n => [n.props.name, n.props.size, n.props.color]), [
    ['create-outline', 13, isDark ? darkColors.success : '#27845B'], ['trash-outline', 13, isDark ? darkColors.danger : '#B42323'],
  ]);
  assert.deepEqual(texts(), ['Edit', 'Delete']);
  assert.deepEqual(nodes('Pressable').map(n => n.props.accessibilityLabel), ['Edit Test record', 'Delete Test record']);
  for (const button of nodes('Pressable')) {
    assert.equal(button.props.accessibilityRole, 'button');
    const target = style(button.props.style({ pressed: false }));
    assert.ok(target.minWidth >= 48 && target.minHeight >= 48);
    const visual = nodes('View', button).map(n => style(n.props.style)).find(s => s.borderWidth === 1);
    assert.equal(visual.borderRadius, 6); assert.equal(visual.minHeight, 30);
    assert.equal(visual.paddingHorizontal, 6); assert.ok(visual.backgroundColor && visual.borderColor);
    button.props.onPress();
  }
  assert.deepEqual(calls, ['edit', 'delete']);
});
test('edit-only lists do not acquire a delete action', () => {
  render(FinanceActionButtons, { label: 'Default category', onEdit: () => calls.push('edit') });
  assert.equal(nodes('Pressable').length, 1);
  assert.equal(nodes('Ionicon')[0].props.name, 'create-outline');
});
test('asset body remains the movements target and labeled actions are siblings without a separate full-width action strip', () => {
  render(AssetRow, rowProps(gold));
  assert.equal(nodes('Pressable').length, 3);
  assert.ok(texts().includes('Edit') && texts().includes('Delete'));
  assert.equal(texts().includes('Movements'), false);
  const body = nodes('Pressable').find(n => n.props.accessibilityLabel.startsWith('Movements for'));
  assert.equal(nodes('Pressable', body).length, 1);
  assert.equal(nodes('Ionicon', body).some(n => n.props.name === 'chevron-forward'), true);
  body.props.onPress();
  assert.deepEqual(calls, ['movements']);
});
test('Accounts reference uses the shared controls and retains exact record callbacks', () => {
  const account = { id: 'bank', name: 'My bank', type: 'bank', currencyCode: 'EGP', initialBalance: 100 };
  const props = { accounts: [account], amountsVisible: true, onEdit: a => calls.push(['edit', a.id]), onDelete: a => calls.push(['delete', a.id]) };
  render(AccountsSection, props);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle accounts section').props.onPress();
  render(AccountsSection, props);
  for (const label of ['Edit My bank', 'Delete My bank']) nodes('Pressable').find(n => n.props.accessibilityLabel === label).props.onPress();
  assert.deepEqual(calls, [['edit', 'bank'], ['delete', 'bank']]);
  assert.deepEqual(nodes('Ionicon').filter(n => ['create-outline', 'trash-outline'].includes(n.props.name)).map(n => n.props.size), [13, 13]);
});

const { RatesModal } = require('../src/features/finance/components/RatesModal.tsx');
const { AssetEntriesModal: RealEntries } = require('../src/features/finance/components/AssetEntriesModal.tsx');
const { default: LoansScreen } = require('../src/app/finance/loans.tsx');
const { default: DebtsScreen } = require('../src/app/finance/debts.tsx');
const { AccountDetails } = require('../src/features/finance/components/AccountDetails.tsx');
function flushEffects() { const pending = effects; effects = []; for (const fn of pending) fn(); }
const loanRecord = () => ({ id: 'loan', name: 'My Loan', lenderName: 'Lender', principalAmount: 100000, totalRepaymentAmount: 120000,
  currencyCode: 'EGP', monthlyInstallment: 10000, numberOfInstallments: 12, firstDueDate: '2026-12-01', receivedAt: '2026-11-01',
  receivedAmount: 100000, status: 'active', createdAt: '2026-11-01', updatedAt: '2026-11-04', payments: [{ id: 'p', amount: 12000, date: '2026-11-03' }] });
test('actual Assets screen gold/silver/USD values remain deterministic when native locale formatting is unavailable', () => {
  const previous = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = () => { throw new Error('Intl unavailable on this runtime'); };
  currency.metals.silverPerGram = 88.925; currency.rates.USD = 55.4154; currency.verifiedCurrencies.push('USD');
  finance.assets[1].entries[0].amount = 10;
  finance.assets.push({ ...gold, id: 'usd', name: 'USD TEST', category: 'foreign_currency', currencyCode: 'USD', entries: [{ amount: 10, date: '2026-11-01' }] });
  try {
    render(AssetsScreen);
    for (const value of ['12,254.52 EGP', '889.25 EGP', '554.15 EGP']) assert.ok(texts().includes(value), value);
    assert.ok(texts().includes('🇺🇸 USD'));
  } finally { Number.prototype.toLocaleString = previous; }
});
test('Rates exposes canonical silver precision, reuses metal symbols, and Save stays open', () => {
  currency.metals.silverPerGram = 88.925; currency.setMetalPrice = (...args) => { calls.push(args); return true; };
  currency.setManualRates = () => { calls.push('rates'); return true; }; currency.rateSources = { EGP: 'manual' };
  theme.spacing = { ...theme.spacing, lg: 16 }; theme.sizes = { inputHeight: 48 };
  const props = { visible: true, onClose: () => calls.push('close'), refreshRates: async () => null, isRefreshing: false };
  render(RatesModal, props); flushEffects(); render(RatesModal, props);
  assert.ok(nodes('AppInput').some(n => n.props.value === '88.925'));
  assert.ok(texts().includes('Gold 24K · 1 gram')); assert.ok(texts().includes('Silver · 1 gram'));
  assert.ok(texts().includes('🥇') && texts().includes('🥈'));
  nodes('AppButton').find(n => n.props.title === 'Save rates').props.onPress();
  assert.equal(calls.includes('close'), false); assert.deepEqual(calls, []);
});
for (const category of ['gold', 'silver', 'foreign_currency']) test(category + ' movement Edit prefills fields; Delete Cancel preserves history', () => {
  const asset = { ...gold, category, currencyCode: 'USD', entries: [{ id: 'e', amount: 10, date: '2026-11-01', note: 'Original note' }] };
  const props = { visible: true, asset, onClose: () => calls.push('close'), onSave: (...args) => calls.push(args), onDelete: (...args) => calls.push(args) };
  render(RealEntries, props); flushEffects(); render(RealEntries, props);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Edit entry dated 2026-11-01').props.onPress(); render(RealEntries, props);
  assert.deepEqual(nodes('TextInput').map(n => n.props.value), ['10', '2026-11-01', 'Original note']);
  nodes('AppButton').find(n => n.props.title === 'Cancel').props.onPress(); render(RealEntries, props);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Delete entry dated 2026-11-01').props.onPress();
  assert.equal(alerts[0][2][0].text, 'Cancel'); assert.deepEqual(calls, []); assert.equal(asset.entries.length, 1);
});
test('loan body opens exact read-only details; back and settlement Cancel never post money', () => {
  finance.loans = [loanRecord()];
  const before = structuredClone(finance.loans);
  render(LoansScreen);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Details for My Loan').props.onPress(); render(LoansScreen);
  assert.ok(texts().includes('Remaining principal: 90,000.00 EGP'));
  const modal = nodes('Modal').find(n => n.props.visible && nodes('AppText', n).some(t => t.props.children === 'My Loan'));
  assert.ok(modal); modal.props.onRequestClose(); render(LoansScreen);
  nodes('AppButton').find(n => n.props.title === 'Early settlement').props.onPress(); render(LoansScreen);
  assert.ok(texts().some(t => t.includes('not a lender settlement quote')));
  const paymentModal = nodes('Modal').find(n => n.props.visible && nodes('AppText', n).some(t => t.props.children === 'Early settlement'));
  assert.ok(nodes('TextInput', paymentModal).some(n => n.props.value === '108000'));
  nodes('Modal').find(n => n.props.visible && nodes('AppText', n).some(t => t.props.children === 'Early settlement')).props.onRequestClose();
  assert.deepEqual(finance.loans, before); assert.deepEqual(calls, []);
});
test('account details show actual balances and ordered transactions/transfers without mutation; privacy masks amounts', () => {
  ledger.accounts = [{ id: 'a', name: 'Bank', type: 'bank', currencyCode: 'EGP', initialBalance: 100, createdAt: '2026-11-01', updatedAt: '2026-11-04' }, { id: 'b', name: 'Cash' }];
  ledger.transactions = [{ id: 't', accountId: 'a', type: 'expense', amount: 10, date: '2026-11-02' }];
  ledger.transfers = [{ id: 'x', fromAccountId: 'a', toAccountId: 'b', fromAmount: 20, amount: 20, date: '2026-11-03' }];
  render(AccountDetails, { accountId: 'a', onClose: () => calls.push('close') });
  assert.ok(texts().includes('Current balance: 70.00 EGP'));
  assert.ok(texts().includes('2026-11-03 · Transfer to Cash · 20.00 EGP'));
  render(AccountDetails, { accountId: 'a', onClose() {}, amountsVisible: false });
  assert.equal(texts().some(t => t.includes('70.00') || t.includes('20.00')), false); assert.deepEqual(calls, []);
});
test('Debts stays one screen with horizontal tabs; swipe synchronizes tab and body opens exact details', () => {
  finance.debts = [{ id: 'd', personName: 'Person', direction: 'receivable', amount: 100, currencyCode: 'EGP', date: '2026-11-01', createdAt: '2026-11-01', updatedAt: '2026-11-04', payments: [] }];
  render(DebtsScreen); flushEffects(); render(DebtsScreen);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Details for Person').props.onPress(); render(DebtsScreen);
  assert.ok(texts().includes('Outstanding: 100.00 EGP'));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Back to list').props.onPress();
  const swipe = nodes('View').find(n => n.props.onPanResponderRelease);
  assert.equal(swipe.props.onMoveShouldSetPanResponder(null, { dx: 10, dy: 40 }), false);
  swipe.props.onPanResponderRelease(null, { dx: -100, dy: 5 }); render(DebtsScreen);
  const payable = nodes('Pressable').find(n => n.props.accessibilityRole === 'tab' && n.props.accessibilityState.selected);
  assert.ok(payable); assert.ok(nodes('AppText', payable).some(n => n.props.children === 'Payable'));
  assert.deepEqual(calls, []);
});

test('Rates close affects only Rates and unsaved changes require explicit Discard', () => {
  currency.rateSources = { EGP: 'manual' }; theme.sizes = { inputHeight: 48 };
  const props = { visible: true, onClose: () => calls.push('closeRates'), refreshRates: async () => null, isRefreshing: false };
  render(RatesModal, props); flushEffects(); render(RatesModal, props);
  nodes('FormModal')[0].props.onClose(); assert.deepEqual(calls, ['closeRates']); calls = [];
  const goldInput = nodes('AppInput').find(n => n.props.value === '7002.58'); goldInput.props.onChangeText('7003'); render(RatesModal, props);
  nodes('FormModal')[0].props.onClose(); assert.equal(alerts[0][0], 'Unsaved changes'); assert.deepEqual(calls, []);
  assert.equal(alerts[0][2][0].text, 'Keep editing'); alerts[0][2][1].onPress(); assert.deepEqual(calls, ['closeRates']);
});
test('compact card controls sit after details and wrap without fixed heights or nested Pressables', () => {
  render(AssetRow, rowProps({ ...gold, name: 'Long '.repeat(25) }));
  const controls = nodes('Pressable').filter(n => /^(Edit|Delete) /.test(n.props.accessibilityLabel));
  for (const c of controls) {
    assert.equal(nodes('Pressable', c).length, 1);
    assert.equal(style(c.props.style({ pressed: false })).height, undefined);
  }
  const group = nodes('View').find(n => style(n.props.style).justifyContent === 'flex-end');
  assert.equal(style(group.props.style).alignSelf, 'flex-end'); assert.equal(style(group.props.style).flexWrap, 'wrap');
  for (const text of nodes('AppText')) { assert.equal(text.props.numberOfLines, undefined); assert.notEqual(text.props.allowFontScaling, false); }
});

const { TotalCard } = require('../src/features/finance/components/TotalCard.tsx');
const { FinanceNetworks } = require('../src/features/finance/components/FinanceNetworks.tsx');
test('Finance cards offer one Debts shortcut and distinguish Total Balance, Net Worth, and future contract payments', () => {
  const props = { baseCurrency: 'EGP', accountsTotal: 100000, assetsTotal: 0, loansRemainingTotal: 90000, netWorth: 10000,
    loansInstallmentsRemainingTotal: 108000, receivablesTotal: 0, payablesTotal: 0, income: 0, expense: 0, amountsVisible: true,
    onToggleAmounts() {}, onNetworkPress: key => calls.push(key) };
  render(TotalCard, props);
  assert.equal(nodes('Pressable').filter(n => n.props.accessibilityLabel === 'Open Debts').length, 1);
  assert.equal(nodes('Pressable').some(n => ['Open Receivable', 'Open Payable'].includes(n.props.accessibilityLabel)), false);
  assert.ok(texts().includes('NET WORTH: 10,000.00 EGP'));
  assert.ok(texts().includes('Loan future contractual payments: 108,000.00 EGP'));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Open Debts').props.onPress(); assert.deepEqual(calls, ['debts']);
  render(TotalCard, { ...props, amountsVisible: false });
  assert.ok(texts().includes('NET WORTH: ••••••'));
  assert.ok(texts().includes('Loan future contractual payments: ••••••'));
  render(FinanceNetworks, { onPress: key => calls.push(key) });
  assert.equal(nodes('Pressable').filter(n => n.props.accessibilityLabel === 'Open Debts').length, 1);
});

for (const [code, flag] of [['USD', '🇺🇸'], ['EUR', '🇪🇺'], ['GBP', '🇬🇧']]) test(code + ' Assets uses the Rates currency flag source with a visible three-letter code', () => {
  render(AssetRow, rowProps({ ...gold, category: 'foreign_currency', currencyCode: code }));
  assert.ok(texts().includes(flag + ' ' + code));
});
test('loan card long names/large amounts retain wrapping text and actions stay outside the details target', () => {
  finance.loans = [{ ...loanRecord(), name: 'A long lender loan name '.repeat(10), receivedAmount: 1000000000, principalAmount: 1000000000, totalRepaymentAmount: 1200000000 }];
  render(LoansScreen);
  const body = nodes('Pressable').find(n => n.props.accessibilityLabel?.startsWith('Details for'));
  assert.equal(nodes('Pressable', body).length, 1); assert.equal(nodes('AppButton', body).length, 0);
  for (const text of nodes('AppText', body)) { assert.equal(text.props.numberOfLines, undefined); assert.notEqual(text.props.allowFontScaling, false); }
  assert.equal(style(body.props.style).height, undefined);
});
