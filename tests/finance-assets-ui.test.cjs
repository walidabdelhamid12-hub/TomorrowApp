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
let states, cursor, finance, currency, alerts, calls, theme, ledger, effects, params, paymentCalls;
let appStateListener, appStateRemoved = false;
let dimensions = { width: 390, height: 844, fontScale: 1 };
const hooks = { ...React, useEffect: (fn, deps) => {
  const key = cursor++; const previous = states[key];
  if (!previous || !deps || deps.some((d, i) => d !== previous[i])) { states[key] = deps; effects.push(fn); }
}, useRef: initial => { const key = cursor++; if (!(key in states)) states[key] = { current: initial }; return states[key]; }, useMemo: fn => fn(), useState: initial => {
  const key = cursor++;
  if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial;
  return [states[key], value => { states[key] = typeof value === 'function' ? value(states[key]) : value; }];
} };
function Ionicon(props) { return React.createElement('Ionicon', props); }
Ionicon.glyphMap = {};
function MaterialIcon(props) { return React.createElement('MaterialIcon', props); }
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { useWindowDimensions: () => dimensions, AppState: { addEventListener: (_event, callback) => { appStateListener = callback; return { remove() { appStateRemoved = true; } }; } }, View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', ScrollView: 'ScrollView', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView',
    PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Animated: { Value: function() { this.interpolate = () => 0; this.stopAnimation = () => {}; this.setValue = () => {}; }, timing: () => ({ start() {}, stop() {} }), loop: () => ({ start() {}, stop() {} }) },
    StyleSheet: { create: value => value, hairlineWidth: 1 }, Platform: { OS: 'android' },
    Alert: { alert: (...args) => alerts.push(args) } };
  if (id === '@expo/vector-icons') return { Ionicons: Ionicon, MaterialCommunityIcons: MaterialIcon };
  if (id === 'expo-router') return { useLocalSearchParams: () => params, useRouter: () => ({ back: () => calls.push('back'), replace: () => calls.push('replace') }) };
  if (id === '@/features/finance/providers/RatesAutoRefreshProvider') return { useRatesAutoRefresh: () => ({ refresh: async () => null, isRefreshing: false, lastResult: null }) };
  if (id === '@/features/finance/store/useFinancePreferences') return { useFinancePreferences: select => select(privacy) };
  if (id === '@/features/finance/components/AddTransactionModal') return { AddTransactionModal: 'AddTransactionModal' };
  if (id === '@/features/finance/components/TransferModal') return { TransferModal: 'TransferModal' };
  if (id === '@/theme') return { useTheme: () => theme, moduleColors: { finance: '#10B981' } };
  if (id === '@/components/ui') return { Card: 'Card', AppText: 'AppText', AppButton: 'AppButton', Screen: 'Screen', DateField: 'DateField', AppInput: 'AppInput', ChipSelect: 'ChipSelect' };
  if (id === '@/features/finance/components/AddAssetModal') return { AddAssetModal: 'AddAssetModal' };
  if (id === '@/features/finance/components/FormModal') return { FormModal: 'FormModal' };
  if (id === '@/features/finance/store/paymentOperations') return Object.fromEntries(['confirmLoanReceipt', 'postLinkedPayment', 'editLinkedPayment', 'reverseLinkedPayment'].map(name => [name, (...args) => { calls.push(name); paymentCalls.push([name, ...args]); return { ok: true }; }]));
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
  states = []; cursor = 0; alerts = []; calls = []; effects = []; params = {}; paymentCalls = [];
  dimensions = { width: 390, height: 844, fontScale: 1 };
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
  render(AssetsScreen);
  nodes('AppButton').find(button => button.props.title === 'Delete').props.onPress();
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
    ['create-outline', 13, theme.colors.finance.edit.text], ['trash-outline', 13, theme.colors.finance.delete.text],
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
  assert.equal(nodes('Pressable', body).length, 1);
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
  assert.ok(texts().includes('Gold (gram)')); assert.ok(texts().includes('Silver (gram)'));
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
  render(RealEntries, props);
  nodes('AppButton').find(n => n.props.title === 'Cancel').props.onPress(); render(RealEntries, props);
  assert.equal(nodes('AppButton').some(n => n.props.title === 'Delete'), false); assert.deepEqual(calls, []); assert.equal(asset.entries.length, 1);
});
test('loan body opens exact read-only details; back and settlement Cancel never post money', () => {
  finance.loans = [loanRecord()];
  const before = structuredClone(finance.loans);
  render(LoansScreen);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Details for My Loan').props.onPress(); render(LoansScreen);
  assert.ok(texts().includes('Remaining principal')); assert.ok(texts().includes('90,000.00 EGP'));
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
  assert.ok(texts().includes('Current balance')); assert.ok(texts().includes('70.00 EGP'));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle Transaction history').props.onPress(); render(AccountDetails, { accountId: 'a', onClose() {} });
  assert.ok(texts().includes('2026-11-03 · Transfer to Cash · 20.00 EGP'));
  render(AccountDetails, { accountId: 'a', onClose() {}, amountsVisible: false });
  assert.equal(texts().some(t => t.includes('70.00') || t.includes('20.00')), false); assert.deepEqual(calls, []);
});
test('Debts stays one screen with horizontal tabs; swipe synchronizes tab and body opens exact details', () => {
  finance.debts = [{ id: 'd', personName: 'Person', direction: 'receivable', amount: 100, currencyCode: 'EGP', date: '2026-11-01', createdAt: '2026-11-01', updatedAt: '2026-11-04', payments: [] }];
  render(DebtsScreen); flushEffects(); render(DebtsScreen);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Details for Person').props.onPress(); render(DebtsScreen);
  const details = visibleDebtModal('Person');
  assert.ok(nodes('View', details).some(n => {
    const labels = nodes('AppText', n).map(t => t.props.children);
    return labels.includes('Remaining') && labels.includes('100.00 EGP');
  }));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Back to list').props.onPress();
  const swipe = nodes('View').find(n => n.props.onPanResponderRelease);
  assert.equal(swipe.props.onMoveShouldSetPanResponder(null, { dx: 10, dy: 40 }), false);
  swipe.props.onPanResponderRelease(null, { dx: -100, dy: 5 }); render(DebtsScreen);
  const payable = nodes('Pressable').find(n => n.props.accessibilityRole === 'tab' && n.props.accessibilityState.selected);
  assert.ok(payable); assert.ok(nodes('AppText', payable).some(n => n.props.children === 'Payable'));
  assert.deepEqual(calls, []);
});

function visibleDebtModal(title) {
  const modal = nodes('Modal').find(n => n.props.visible && nodes('AppText', n).some(t => t.props.children === title));
  assert.ok(modal, `Expected visible modal: ${title}`);
  return modal;
}
function debtCard(name) {
  const card = nodes('Card').find(n => nodes('Pressable', n).some(p => p.props.accessibilityLabel === 'Details for ' + name));
  assert.ok(card, `Expected debt card: ${name}`);
  return card;
}
function debtControl(label, parent) {
  const control = (parent ? nodes('Pressable', parent) : nodes('Pressable')).find(n => n.props.accessibilityLabel === label);
  assert.ok(control, `Expected control: ${label}`);
  return control;
}
function prepareDebtUi(direction) {
  params = { direction };
  const payment = { id: 'payment-' + direction, amount: 25, date: '2026-11-03', note: 'Original payment', accountId: 'a', ledgerTransactionId: 'linked' };
  const debt = { id: 'debt-' + direction, personName: 'Primary', direction, amount: 100, currencyCode: 'EGP',
    date: '2026-11-01', dueDate: '2026-12-01', notes: 'Debt note', payments: [payment] };
  finance.debts = [debt, { ...debt, id: 'other-' + direction, personName: 'Other', payments: [] }];
  render(DebtsScreen); flushEffects(); render(DebtsScreen);
  return { debt, payment, before: structuredClone(finance.debts) };
}

for (const direction of ['receivable', 'payable']) {
  test(`${direction} compact details show exact metrics; Back and Android Back only dismiss details`, () => {
    const { before } = prepareDebtUi(direction);
    for (const close of ['button', 'android']) {
      debtControl('Details for Primary').props.onPress(); render(DebtsScreen);
      const details = visibleDebtModal('Primary');
      for (const [label, value] of [['Remaining', '75.00 EGP'], ['Original', '100.00 EGP'],
        ['Paid / collected', '25.00 EGP'], ['Type', direction === 'receivable' ? 'Receivable' : 'Payable']]) {
        assert.ok(nodes('View', details).some(n => {
          const labels = nodes('AppText', n).map(t => t.props.children);
          return labels.includes(label) && labels.includes(value);
        }), label);
      }
      assert.ok(nodes('AppText', details).some(n => n.props.children === 'Debt recorded on 01/11/2026'));
      if (close === 'button') debtControl('Back to list', details).props.onPress();
      else details.props.onRequestClose();
      render(DebtsScreen);
      assert.equal(nodes('Modal').some(n => n.props.visible), false);
      assert.equal(debtControl('Show payment history for Primary').props.accessibilityState.expanded, false);
      const selected = nodes('Pressable').find(n => n.props.accessibilityRole === 'tab' && n.props.accessibilityState.selected);
      assert.ok(nodes('AppText', selected).some(n => n.props.children === (direction === 'receivable' ? 'Receivable' : 'Payable')));
    }
    assert.deepEqual(finance.debts, before);
    assert.deepEqual(calls, []);
  });

  test(`${direction} inline history toggle is independent of details and other records`, () => {
    const { before } = prepareDebtUi(direction);
    debtControl('Show payment history for Primary').props.onPress(); render(DebtsScreen);
    assert.equal(debtControl('Hide payment history for Primary').props.accessibilityState.expanded, true);
    assert.equal(nodes('Modal').some(n => n.props.visible), false);
    assert.ok(debtControl('Edit payment dated 03/11/2026', debtCard('Primary')));
    assert.ok(debtControl('Delete payment dated 03/11/2026', debtCard('Primary')));
    debtControl('Details for Primary').props.onPress(); render(DebtsScreen);
    debtControl('Back to list', visibleDebtModal('Primary')).props.onPress(); render(DebtsScreen);
    assert.equal(debtControl('Hide payment history for Primary').props.accessibilityState.expanded, true);
    debtControl('Hide payment history for Primary').props.onPress(); render(DebtsScreen);
    assert.equal(nodes('Pressable', debtCard('Primary')).some(n => n.props.accessibilityLabel?.startsWith('Edit payment')), false);
    debtControl('Show payment history for Other').props.onPress(); render(DebtsScreen);
    assert.ok(nodes('AppText', debtCard('Other')).some(n => n.props.children === 'No payments recorded yet.'));
    assert.equal(debtControl('Show payment history for Primary').props.accessibilityState.expanded, false);
    assert.deepEqual(finance.debts, before); assert.deepEqual(calls, []);
  });

  for (const location of ['inline', 'details']) {
    const openControls = () => {
      if (location === 'inline') {
        debtControl('Show payment history for Primary').props.onPress(); render(DebtsScreen);
        return debtCard('Primary');
      }
      debtControl('Details for Primary').props.onPress(); render(DebtsScreen);
      return visibleDebtModal('Primary');
    };
    test(`${direction} ${location} payment Edit prefills the original record and dispatches only on Save`, () => {
      const { debt, payment, before } = prepareDebtUi(direction);
      debtControl('Edit payment dated 03/11/2026', openControls()).props.onPress();
      render(DebtsScreen); render(DebtsScreen);
      const editor = visibleDebtModal('Edit payment');
      const inputs = nodes('TextInput', editor).map(n => n.props.value);
      for (const value of ['25', '2026-11-03', 'Original payment']) assert.ok(inputs.includes(value), value);
      if (location === 'details') assert.equal(nodes('Modal').some(n => n.props.visible
        && nodes('Pressable', n).some(p => p.props.accessibilityLabel === 'Back to list')), false);
      assert.deepEqual(calls, []);
      const save = nodes('Pressable', editor).find(n => nodes('AppText', n).some(t => t.props.children === 'Save changes'));
      assert.ok(save); save.props.onPress(); render(DebtsScreen);
      assert.deepEqual(paymentCalls, [['editLinkedPayment', { entityType: 'debt', entityId: debt.id, paymentId: payment.id },
        { amount: 25, date: '2026-11-03', note: 'Original payment' }]]);
      assert.equal(nodes('Modal').some(n => n.props.visible && nodes('AppText', n).some(t => t.props.children === 'Edit payment')), false);
      assert.deepEqual(finance.debts, before);
    });

    test(`${direction} ${location} payment Delete requires confirmation and preserves the exact payment reference`, () => {
      const { debt, payment, before } = prepareDebtUi(direction);
      const parent = openControls();
      debtControl('Delete payment dated 03/11/2026', parent).props.onPress(); render(DebtsScreen);
      let confirmation = visibleDebtModal('Delete payment?');
      assert.ok(nodes('AppText', confirmation).some(n => typeof n.props.children === 'string' && n.props.children.includes(direction === 'receivable' ? 'collection' : 'payment')));
      assert.deepEqual(calls, []);
      nodes('AppButton', confirmation).find(n => n.props.title === 'Cancel').props.onPress(); render(DebtsScreen);
      assert.deepEqual(calls, []); assert.deepEqual(finance.debts, before);
      const currentParent = location === 'inline' ? debtCard('Primary') : visibleDebtModal('Primary');
      debtControl('Delete payment dated 03/11/2026', currentParent).props.onPress(); render(DebtsScreen);
      confirmation = visibleDebtModal('Delete payment?');
      nodes('AppButton', confirmation).find(n => n.props.title === 'Delete').props.onPress(); render(DebtsScreen);
      assert.deepEqual(paymentCalls, [['reverseLinkedPayment', { entityType: 'debt', entityId: debt.id, paymentId: payment.id }]]);
      assert.deepEqual(finance.debts, before);
    });
  }
}

test('Receivable/Payable tab taps and horizontal swipe stay synchronized without claiming vertical scrolling', () => {
  prepareDebtUi('receivable');
  finance.debts.push({ ...finance.debts[0], id: 'payable-record', personName: 'Payable record', direction: 'payable' });
  const before = structuredClone(finance.debts);
  render(DebtsScreen);
  const tab = label => nodes('Pressable').find(n => n.props.accessibilityRole === 'tab' && nodes('AppText', n).some(t => t.props.children === label));
  const swipe = () => nodes('View').find(n => n.props.onPanResponderRelease);
  tab('Payable').props.onPress(); render(DebtsScreen);
  assert.equal(tab('Payable').props.accessibilityState.selected, true);
  assert.equal(tab('Receivable').props.accessibilityState.selected, false);
  assert.ok(debtControl('Details for Payable record'));
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Details for Primary'), false);
  assert.equal(swipe().props.onMoveShouldSetPanResponder(null, { dx: 10, dy: 80 }), false);
  assert.equal(swipe().props.onMoveShouldSetPanResponder(null, { dx: 100, dy: 5 }), true);
  swipe().props.onPanResponderRelease(null, { dx: 100, dy: 5 }); render(DebtsScreen);
  assert.equal(tab('Receivable').props.accessibilityState.selected, true);
  assert.ok(debtControl('Details for Primary'));
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Details for Payable record'), false);
  swipe().props.onPanResponderRelease(null, { dx: -100, dy: 5 }); render(DebtsScreen);
  assert.equal(tab('Payable').props.accessibilityState.selected, true);
  tab('Receivable').props.onPress(); render(DebtsScreen);
  assert.equal(tab('Receivable').props.accessibilityState.selected, true);
  assert.deepEqual(finance.debts, before);
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
  assert.ok(texts().includes('10,000.00 EGP'));
  assert.ok(texts().includes('Loan future contractual payments: 108,000.00 EGP'));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Open Debts').props.onPress(); assert.deepEqual(calls, ['debts']);
  render(TotalCard, { ...props, amountsVisible: false });
  assert.ok(texts().includes('••••••'));
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

for (const status of ['settled', 'closed']) test(status + ' loan has no active payment actions or historical Edit', () => {
  finance.loans = [{ ...loanRecord(), status }];
  render(LoansScreen);
  for (const title of ['Record payment', 'Early settlement', 'Close without payment'])
    assert.equal(nodes('AppButton').some(n => n.props.title === title), false);
  assert.equal(nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle Payment history').props.accessibilityState.expanded, false);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle Payment history').props.onPress(); render(LoansScreen);
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel?.startsWith('Edit payment')), false);
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel?.startsWith('Delete payment')), false);
});

test('loan disclosures default closed, show a payment count, and preserve receipt details on expansion', () => {
  finance.loans = [loanRecord()];
  render(LoansScreen);
  assert.ok(texts().includes('Payment history (1)'));
  assert.equal(nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle Deposit distribution').props.accessibilityState.expanded, false);
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel?.startsWith('Edit payment')), false);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle Payment history').props.onPress(); render(LoansScreen);
  assert.ok(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Edit payment dated 2026-11-03'));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Toggle Deposit distribution').props.onPress(); render(LoansScreen);
  assert.ok(texts().some(t => t.includes('Received: 100,000.00 EGP on 2026-11-01')));
});

test('eight shortcuts follow approved order with Categories excluded and one global eye masks every amount', () => {
  const props = { baseCurrency: 'EGP', accountsTotal: 123456, assetsTotal: 234567, loansRemainingTotal: 345678, netWorth: 456789,
    loansInstallmentsRemainingTotal: 567890, receivablesTotal: 678901, payablesTotal: 789012, income: 890123, expense: 901234,
    amountsVisible: false, onNetworkPress() {} };
  render(TotalCard, props);
  assert.deepEqual(nodes('Pressable').map(n => n.props.accessibilityLabel).filter(t => t?.startsWith('Open ')),
    ['Expenses','Income','Accounts','Assets','Installments','Loans','Debts','Transfers'].map(t => 'Open ' + t));
  assert.equal(texts().some(t => /123,456|234,567|345,678|456,789|567,890|678,901|789,012|890,123|901,234/.test(t)), false);
  assert.equal(nodes('Ionicon').filter(n => n.props.name === 'eye-outline' || n.props.name === 'eye-off-outline').length, 1);
  assert.ok(texts().includes('Coming soon'));
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Open Categories'), false);
  const info = nodes('Pressable').find(n => n.props.accessibilityLabel === 'Explain Net Worth');
  assert.equal(info.props.accessibilityState.expanded, false);
  info.props.onPress(); render(TotalCard, props);
  assert.ok(texts().some(t => t.includes('Future contractual installments')));
  render(TotalCard, { ...props, amountsVisible: true });
  assert.ok(texts().includes('456,789.00 EGP'));
});

test('themed confirmation cancels via Android Back and runs the captured action once only on confirmation', () => {
  render(AssetsScreen);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Delete GOLD TEST').props.onPress(); render(AssetsScreen);
  const modal = nodes('Modal').find(n => n.props.visible);
  assert.ok(texts().some(t => t.includes('permanently delete')));
  modal.props.onRequestClose(); render(AssetsScreen);
  assert.deepEqual(calls, []);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Delete SILVER TEST').props.onPress(); render(AssetsScreen);
  const deletion = nodes('AppButton').find(n => n.props.title === 'Delete');
  deletion.props.onPress(); deletion.props.onPress(); render(AssetsScreen);
  assert.deepEqual(calls, [['deleteAsset', 'silver']]);
});

let privacy;
const { default: FinanceHomeScreen } = require('../src/features/finance/screens/FinanceHomeScreen.tsx');
test('Finance header has one global eye control and toggles summary and recent values together', () => {
  finance.assets = [];
  privacy = { amountsVisible: false, toggleAmounts() { privacy.amountsVisible = !privacy.amountsVisible; } };
  ledger.accounts = [{ id: 'a', type: 'bank', name: 'Bank', currencyCode: 'EGP', initialBalance: 12345 }];
  ledger.transactions = [{ id: 't', type: 'expense', accountId: 'a', categoryId: 'food', amount: 321, currencyCode: 'EGP', date: '2026-11-04', createdAt: '2026-11-04' }];
  currency.rateSources = { EGP: 'manual' };
  theme.sizes = { inputHeight: 48 };
  render(FinanceHomeScreen);
  assert.equal(nodes('Ionicon').filter(n => ['eye-outline', 'eye-off-outline'].includes(n.props.name)).length, 1);
  assert.equal(texts().some(t => t.includes('12,024') || t.includes('321.00')), false);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Show Finance amounts').props.onPress(); render(FinanceHomeScreen);
  assert.ok(texts().includes('12,024.00'));
  assert.ok(texts().includes('-321.00 EGP'));
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Hide Finance amounts').props.onPress(); render(FinanceHomeScreen);
  assert.equal(texts().some(t => t.includes('12,024') || t.includes('321.00')), false);
});

const { CURRENCIES } = require('../src/features/finance/constants/currencies.ts');
function preparePreciseRates() {
  currency.rates = Object.fromEntries(CURRENCIES.map(c => [c.code, 1]));
  currency.rates.KWD = 2;
  currency.baseCurrency = 'KWD';
  currency.metals = { gold24PerGram: 14005.16246913, silverPerGram: 88.925123456 };
  currency.rateSources = Object.fromEntries(CURRENCIES.map(c => [c.code, 'manual']));
  currency.setMetalPrice = (key, value) => { calls.push([key, value]); currency.metals = { ...currency.metals, [key]: value }; return true; };
  currency.setManualRates = values => { calls.push(['rates', values]); return true; };
  theme.sizes = { inputHeight: 48 };
  return { visible: true, onClose: () => calls.push('close'), refreshRates: async () => null, isRefreshing: false };
}
function metalInput(kind) { return nodes('AppInput').find(n => n.props.accessibilityLabel === kind + ' price'); }

test('Rates shows trimmed three-decimal metals while unchanged Save and clean close preserve canonical prices in a converted base', () => {
  const props = preparePreciseRates(), before = { ...currency.metals };
  render(RatesModal, props); flushEffects(); render(RatesModal, props);
  assert.equal(metalInput('Gold').props.value, '7002.581');
  assert.equal(metalInput('Silver').props.value, '44.463');
  assert.equal(nodes('AppButton').find(n => n.props.title === 'Save rates').props.disabled, true);
  nodes('AppButton').find(n => n.props.title === 'Save rates').props.onPress(); render(RatesModal, props);
  assert.deepEqual(calls, []); assert.deepEqual(currency.metals, before);
  assert.equal(nodes('AppText').some(n => n.props.color === 'danger' && typeof n.props.children === 'string' && n.props.children.includes('Enter a valid')), false);
  nodes('FormModal')[0].props.onClose();
  assert.deepEqual(calls, ['close']); assert.deepEqual(currency.metals, before);
});

test('deliberately edited metal digits below the old tolerance save exactly through base conversion; Save stays open and becomes clean', () => {
  const props = preparePreciseRates();
  render(RatesModal, props); flushEffects(); render(RatesModal, props);
  metalInput('Silver').props.onChangeText('44.462561729'); render(RatesModal, props);
  nodes('FormModal')[0].props.onClose();
  assert.equal(alerts[0][0], 'Unsaved changes'); assert.deepEqual(calls, []);
  nodes('AppButton').find(n => n.props.title === 'Save rates').props.onPress();
  assert.deepEqual(calls, [['silverPerGram', 44.462561729 * 2]]);
  render(RatesModal, props); flushEffects(); render(RatesModal, props);
  assert.equal(metalInput('Silver').props.value, '44.463');
  assert.equal(nodes('AppButton').find(n => n.props.title === 'Save rates').props.disabled, true);
  nodes('AppButton').find(n => n.props.title === 'Save rates').props.onPress();
  assert.equal(calls.length, 1);
});

test('metal trailing zeros trim only in display, deliberate clear and invalid edits keep existing validation', () => {
  const props = preparePreciseRates(); currency.metals.gold24PerGram = 14000;
  render(RatesModal, props); flushEffects(); render(RatesModal, props);
  assert.equal(metalInput('Gold').props.value, '7000');
  metalInput('Gold').props.onChangeText('-5'); render(RatesModal, props);
  nodes('AppButton').find(n => n.props.title === 'Save rates').props.onPress(); render(RatesModal, props);
  assert.deepEqual(calls, []);
  metalInput('Gold').props.onChangeText(''); render(RatesModal, props);
  nodes('AppButton').find(n => n.props.title === 'Save rates').props.onPress();
  assert.deepEqual(calls, [['gold24PerGram', null]]);
});

const { TransferModal: RealTransferModal } = require('../src/features/finance/components/TransferModal.tsx');
const transferFixture = { id: 'transfer', type: 'internal', fromAccountId: 'usd', toAccountId: 'egp',
  fromAmount: 10, toAmount: 550, amount: 10, currencyCode: 'USD', fromCurrencyCode: 'USD', toCurrencyCode: 'EGP', exchangeRate: 55, date: '2026-11-04', note: 'Keep note' };
function prepareTransfer() {
  ledger.accounts = [{ id: 'usd', name: 'USD bank', currencyCode: 'USD', type: 'bank' }, { id: 'egp', name: 'EGP bank', currencyCode: 'EGP', type: 'bank' }, { id: 'card', name: 'USD card', currencyCode: 'USD', type: 'credit_card' }];
  ledger.updateTransfer = (id, values) => { calls.push(['update', id, values]); return true; };
  ledger.addTransfer = values => { calls.push(['add', values]); return 'new'; };
  currency.rates = { USD: 55, EGP: 1 }; dimensions = { width: 390, height: 844, fontScale: 1 };
  return { visible: true, transfer: transferFixture, onClose: () => calls.push('close') };
}
test('transfer account dropdowns are adjacent with amounts before date/note, and edit preserves the original payload', () => {
  const props = prepareTransfer();
  render(RealTransferModal, props); flushEffects(); render(RealTransferModal, props);
  assert.ok(nodes('View').some(n => style(n.props.style).flexDirection === 'row' && nodes('Pressable', n).filter(p => ['From account', 'To account'].includes(p.props.accessibilityLabel)).length === 2));
  assert.ok(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Amount to transfer'));
  assert.equal(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate').props.value, '55');
  nodes('AppButton').find(n => n.props.title === 'Save changes').props.onPress();
  assert.equal(calls[0][0], 'update'); assert.equal(calls[0][1], 'transfer');
  assert.equal(calls[0][2].fromAmount, 10); assert.equal(calls[0][2].toAmount, 550); assert.equal(calls[0][2].exchangeRate, 55);
  assert.deepEqual(calls.slice(1), ['close']);
});
for (const view of [{ width: 320, fontScale: 1 }, { width: 390, fontScale: 1.6 }]) test('transfer dropdowns stack at width ' + view.width + ' and font scale ' + view.fontScale, () => {
  const props = prepareTransfer(); dimensions = { ...dimensions, ...view };
  render(RealTransferModal, props); flushEffects(); render(RealTransferModal, props);
  assert.ok(nodes('View').some(n => style(n.props.style).flexDirection === 'column' && nodes('Pressable', n).filter(p => ['From account', 'To account'].includes(p.props.accessibilityLabel)).length === 2));
  dimensions = { width: 390, height: 844, fontScale: 1 };
});

const { useFinanceDate, formatFinanceDate } = require('../src/features/finance/hooks/useFinanceDate.ts');
test('Finance date uses the device local calendar with full English day, month and year', () => {
  assert.equal(formatFinanceDate(new Date(2026, 10, 4, 23, 59)), 'Wednesday, November 4, 2026');
});
test('Finance date refreshes over local midnight and app resume, and cleans up its timer/subscription', () => {
  const OriginalDate = Date, originalInterval = global.setInterval, originalClear = global.clearInterval;
  let now = new OriginalDate(2026, 10, 4, 23, 59), tick, cleared;
  global.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } };
  global.setInterval = callback => { tick = callback; return 42; };
  global.clearInterval = id => { cleared = id; };
  function DateLabel() { return React.createElement('AppText', null, useFinanceDate()); }
  let cleanup;
  try {
    render(DateLabel); cleanup = effects.shift()(); effects = [];
    assert.ok(texts().includes('Wednesday, November 4, 2026'));
    now = new OriginalDate(2026, 10, 5, 0, 1); tick(); render(DateLabel);
    assert.ok(texts().includes('Thursday, November 5, 2026'));
    now = new OriginalDate(2026, 10, 6, 8); appStateListener('active'); render(DateLabel);
    assert.ok(texts().includes('Friday, November 6, 2026'));
  } finally { cleanup?.(); global.Date = OriginalDate; global.setInterval = originalInterval; global.clearInterval = originalClear; }
  assert.equal(cleared, 42); assert.equal(appStateRemoved, true);
});

test('restored asset hierarchy contains quantity and right-side valuation in its details body, with actions below', () => {
  render(AssetRow, rowProps(gold));
  const body = nodes('Pressable').find(n => n.props.accessibilityLabel.startsWith('Movements for'));
  assert.equal(nodes('Pressable', body).length, 1);
  for (const value of ['GOLD TEST', '2.000 g', '≈ 12,254.52 EGP']) assert.ok(nodes('AppText', body).some(n => n.props.children === value));
  assert.ok(nodes('Ionicon', body).some(n => n.props.name === 'chevron-forward'));
  assert.deepEqual(nodes('Pressable').filter(n => n !== body).map(n => n.props.accessibilityLabel), ['Edit GOLD TEST', 'Delete GOLD TEST']);
});

function settleTransfer(props) { for (let i = 0; i < 4; i++) { render(RealTransferModal, props); flushEffects(); } render(RealTransferModal, props); }
test('transfer edit keeps a saved custom rate through effects, live rate refresh, and switching to another edit', () => {
  const props = prepareTransfer(); props.transfer = { ...transferFixture, exchangeRate: 54.321123, toAmount: 543.21123 };
  settleTransfer(props);
  assert.equal(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate').props.value, '54.321123');
  currency.rates = { USD: 58, EGP: 1 }; settleTransfer(props);
  assert.equal(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate').props.value, '54.321123');
  settleTransfer({ ...props, visible: false });
  const second = { ...props, transfer: { ...transferFixture, id: 'second', fromAccountId: 'egp', toAccountId: 'usd', fromAmount: 550, toAmount: 11, fromCurrencyCode: 'EGP', toCurrencyCode: 'USD', exchangeRate: 0.02 } };
  settleTransfer(second);
  assert.equal(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate').props.value, '0.02');
  nodes('AppButton').find(n => n.props.title === 'Save changes').props.onPress();
  assert.equal(calls[0][1], 'second'); assert.equal(calls[0][2].fromAccountId, 'egp'); assert.equal(calls[0][2].toAccountId, 'usd');
  assert.equal(calls[0][2].toAmount, 11);
});
test('credit-card transfer mode keeps matching-account validation and a fixed rate of one', () => {
  const props = prepareTransfer(); props.transfer = { ...transferFixture, type: 'credit_card_payment', toAccountId: 'card', toCurrencyCode: 'USD', exchangeRate: 1, toAmount: 10 };
  settleTransfer(props);
  assert.equal(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate').props.editable, false);
  nodes('AppButton').find(n => n.props.title === 'Save changes').props.onPress();
  assert.equal(calls[0][2].type, 'credit_card_payment'); assert.equal(calls[0][2].toAmount, 10); assert.equal(calls[0][2].exchangeRate, 1);
});

const { AccountCard } = require('../src/features/finance/components/AccountCard.tsx');
function luminance(hex) {
  const values = hex.match(/[a-f0-9]{2}/ig).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
for (const [mode, colors] of [['light', lightColors], ['dark', darkColors]]) {
  test(mode + ' Finance accent/action text meets 4.5:1 contrast against its tinted surface', () => {
    for (const [name, tone] of Object.entries(colors.finance)) assert.ok(contrast(tone.accent ?? tone.text, tone.surface) >= 4.5, name);
    for (const name of ['income', 'expense', 'transfer', 'balance']) assert.ok(contrast(colors.finance[name].accent, colors.finance.neutral.surface) >= 4.5, name + ' list accent');
  });
  test(mode + ' account name/type is next to its icon with balance in the body and independent actions below', () => {
    theme.colors = colors; theme.isDark = mode === 'dark';
    const account = { id: 'bank', name: 'Household bank', type: 'bank', currencyCode: 'EGP' };
    render(AccountCard, { account, balance: 1234.56, onPress: () => calls.push('details'), onEdit: () => calls.push('edit'), onDelete: () => calls.push('delete') });
    const card = style(nodes('Card')[0].props.style);
    assert.equal(card.backgroundColor, colors.finance.account.surface); assert.equal(card.borderColor, colors.finance.account.border);
    const body = nodes('Pressable').find(n => n.props.accessibilityLabel === 'Details for Household bank');
    for (const value of ['Household bank', 'Bank · EGP', '1,234.56 EGP']) assert.ok(nodes('AppText', body).some(n => n.props.children === value));
    assert.equal(nodes('Pressable', body).length, 1);
    body.props.onPress(); nodes('Pressable').find(n => n.props.accessibilityLabel === 'Edit Household bank').props.onPress();
    assert.deepEqual(calls, ['details', 'edit']);
  });
}

test('asset color variants change surfaces, not the approved content geometry or details/action structure', () => {
  const geometries = [];
  for (const colors of [lightColors, darkColors]) {
    theme.colors = colors; render(AssetRow, rowProps(gold));
    const card = style(nodes('Card')[0].props.style);
    assert.equal(card.backgroundColor, colors.finance.asset.surface); assert.equal(card.borderColor, colors.finance.asset.border);
    const body = nodes('Pressable').find(n => n.props.accessibilityLabel.startsWith('Movements for'));
    assert.ok(nodes('AppText', body).some(n => n.props.children === '≈ 12,254.52 EGP'));
    assert.equal(nodes('Pressable', body).length, 1);
    geometries.push({ ...card, backgroundColor: undefined, borderColor: undefined });
  }
  assert.deepEqual(geometries[0], geometries[1]);
});

test('Total Balance label and single eye share one heading row; all eight shortcuts stay in two columns', () => {
  const props = { baseCurrency: 'EGP', accountsTotal: 100, assetsTotal: 0, loansRemainingTotal: 0, receivablesTotal: 0, payablesTotal: 0, income: 0, expense: 0,
    amountsVisible: true, onToggleAmounts: () => calls.push('eye'), onNetworkPress: key => calls.push(key) };
  const geometries = [];
  for (const colors of [lightColors, darkColors]) {
    theme.colors = colors; render(TotalCard, props);
    const row = nodes('View').find(n => style(n.props.style).flexDirection === 'row' && nodes('AppText', n).some(t => t.props.children === 'TOTAL BALANCE')
      && nodes('Pressable', n).some(p => p.props.accessibilityLabel === 'Hide Finance amounts') && !nodes('AppText', n).some(t => t.props.children === '100.00'));
    assert.ok(row);
    const grid = nodes('View').find(n => style(n.props.style).flexWrap === 'wrap' && Array.isArray(n.props.children) && n.props.children.length === 8);
    assert.ok(grid);
    assert.deepEqual(grid.props.children.map(n => style(n.props.style).width), Array(8).fill('49%'));
    geometries.push(grid.props.children.map(n => { const value = style(n.props.style); return { ...value, backgroundColor: undefined, borderColor: undefined }; }));
  }
  assert.deepEqual(geometries[0], geometries[1]);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Hide Finance amounts').props.onPress();
  assert.deepEqual(calls, ['eye']);
});

for (const view of [{ width: 390, fontScale: 1, direction: 'row' }, { width: 320, fontScale: 1, direction: 'column' }, { width: 390, fontScale: 1.6, direction: 'column' }]) {
  test('Rates metal fields use ' + view.direction + ' at width ' + view.width + ' and font scale ' + view.fontScale, () => {
    const props = preparePreciseRates(); dimensions = { ...dimensions, ...view };
    render(RatesModal, props); flushEffects(); render(RatesModal, props);
    assert.equal(style(nodes('View').find(n => n.props.testID === 'rates-metals').props.style).flexDirection, view.direction);
    for (const kind of ['gold', 'silver']) {
      const card = nodes('View').find(n => n.props.testID === 'rates-metal-' + kind);
      assert.equal(style(card.props.style).flex, 1); assert.equal(style(card.props.style).width, undefined);
      const label = nodes('AppText', card).find(n => typeof n.props.children === 'string' && n.props.children.includes('(gram)'));
      assert.equal(label.props.numberOfLines, view.direction === 'row' ? 1 : undefined);
    }
    dimensions = { width: 390, height: 844, fontScale: 1 };
  });
}

const compactSummaryProps = () => ({ baseCurrency: 'EGP', accountsTotal: 1234, assetsTotal: 100, netWorth: 1200, loansRemainingTotal: 134,
  loansInstallmentsRemainingTotal: 200, receivablesTotal: 0, payablesTotal: 0, income: 50, expense: 30, missing: 2,
  amountsVisible: true, onToggleAmounts: () => calls.push('eye'), onNetworkPress: key => calls.push(key) });
for (const [mode, colors] of [['light', lightColors], ['dark', darkColors]]) {
  test(`${mode} compact summary removes whitespace without fixing height or hiding content`, () => {
    theme.colors = colors;
    dimensions = { width: 320, height: 640, fontScale: 1.6 };
    render(TotalCard, compactSummaryProps());
    const summary = nodes('Card')[0];
    const cardStyle = style(summary.props.style);
    assert.equal(cardStyle.backgroundColor, colors.finance.balance.surface);
    assert.equal(cardStyle.paddingVertical, 0);
    assert.equal(cardStyle.height, undefined);
    assert.notEqual(cardStyle.overflow, 'hidden');
    const info = nodes('Pressable', summary).find(n => n.props.accessibilityLabel === 'Explain Net Worth');
    assert.ok(style(info.props.style).minHeight >= 44);
    const worthRow = nodes('View', summary).find(n => nodes('Pressable', n).includes(info)
      && nodes('AppText', n).some(t => t.props.children === 'Net Worth'));
    assert.equal(style(worthRow.props.style).marginTop, 0);
    for (const label of ['Hide Finance amounts', 'Base currency EGP. Change currency']) {
      const control = nodes('Pressable', summary).find(n => n.props.accessibilityLabel === label);
      assert.ok(style(control.props.style).minHeight >= 48);
    }
    assert.ok(nodes('AppText', summary).some(n => n.props.children === 'Loan future contractual payments: 200.00 EGP'));
    info.props.onPress(); render(TotalCard, compactSummaryProps());
    assert.ok(texts().some(t => t.includes('Future contractual installments')));
  });

  test(`${mode} Finance date keeps its English format and location with a themed semibold accent`, () => {
    theme.colors = colors;
    theme.sizes = { inputHeight: 48 };
    currency.rateSources = { EGP: 'manual' };
    privacy = { amountsVisible: true, toggleAmounts() {} };
    render(FinanceHomeScreen);
    const date = nodes('AppText').find(n => typeof n.props.children === 'string'
      && /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), [A-Z][a-z]+ \d{1,2}, \d{4}$/.test(n.props.children));
    assert.ok(date);
    assert.equal(date.props.color, colors.finance.neutral.accent);
    assert.equal(style(date.props.style).fontWeight, '600');
    assert.equal(style(date.props.style).marginTop, theme.spacing.xs);
    const labels = nodes('AppText');
    assert.equal(labels.indexOf(date), labels.findIndex(n => n.props.children === 'Finance') + 1);
  });
}

test('shortcuts are outside the compact balance Card with no visible heading/counter and warnings remain inside', () => {
  render(TotalCard, compactSummaryProps());
  const summary = nodes('Card')[0];
  assert.equal(nodes('Pressable', summary).some(n => n.props.accessibilityLabel?.startsWith('Open ')), false);
  assert.equal(nodes('View', summary).some(n => n.props.accessibilityLabel === 'Finance sections'), false);
  assert.equal(texts().includes('Finance Shortcuts'), false);
  assert.equal(nodes('AppText').some(n => JSON.stringify(n.props.children).includes('sections')), false);
  assert.ok(nodes('AppText', summary).some(n => typeof n.props.children === 'string' && n.props.children.includes('2 item(s) have unavailable valuation')));
  assert.equal(summary.props.padded, false);
  assert.equal(style(summary.props.style).paddingVertical, 0);
  const grid = nodes('View').find(n => n.props.accessibilityLabel === 'Finance sections');
  assert.ok(grid); assert.equal(grid.props.children.length, 8);
  const expected = ['Expenses', 'Income', 'Accounts', 'Assets', 'Installments', 'Loans', 'Debts', 'Transfers'];
  assert.deepEqual(nodes('Pressable', grid).map(n => n.props.accessibilityLabel), expected.map(label => 'Open ' + label));
  assert.ok(grid.props.children.every(n => style(n.props.style).width === '49%' && style(n.props.style).minHeight >= 48));
});
test('Net Worth label and value are bolder while the one global eye, formula and contractual masking remain intact', () => {
  const props = compactSummaryProps(); render(TotalCard, props);
  const label = nodes('AppText').find(n => n.props.children === 'Net Worth');
  const value = nodes('AppText').find(n => n.props.children === '1,200.00 EGP');
  assert.equal(style(label.props.style).fontWeight, '800'); assert.equal(style(value.props.style).fontWeight, '800');
  assert.equal(nodes('Ionicon').filter(n => ['eye-outline', 'eye-off-outline'].includes(n.props.name)).length, 1);
  nodes('Pressable').find(n => n.props.accessibilityLabel === 'Explain Net Worth').props.onPress(); render(TotalCard, props);
  assert.ok(texts().some(t => t.includes('Future contractual installments')));
  render(TotalCard, { ...props, amountsVisible: false });
  assert.equal(texts().some(t => t.includes('1,200.00') || t.includes('1,334.00') || t.includes('200.00 EGP')), false);
  assert.ok(texts().includes('Loan future contractual payments: ••••••'));
});
for (const view of [{ width: 390, fontScale: 1, direction: 'row' }, { width: 320, fontScale: 1, direction: 'column' }, { width: 390, fontScale: 1.6, direction: 'column' }]) {
  test('three transfer fields render in ' + view.direction + ' at ' + view.width + ' / ' + view.fontScale, () => {
    const props = prepareTransfer(); dimensions = { ...dimensions, ...view }; settleTransfer(props);
    const row = nodes('View').find(n => n.props.testID === 'transfer-amounts-row');
    assert.equal(style(row.props.style).flexDirection, view.direction);
    assert.equal(row.props.children.length, 3);
    if (view.direction === 'row') assert.deepEqual(row.props.children.map(n => style(n.props.style).flex), [38, 24, 38]);
    for (const label of ['Amount to transfer', 'Rate', 'Amount to receive']) assert.ok(nodes('AppText', row).some(n => n.props.children === label));
    assert.equal(nodes('AppText', row).some(n => typeof n.props.children === 'string' && n.props.children.includes('Suggested rate:')), false);
    const rate = nodes('AppInput', row).find(n => n.props.accessibilityLabel === 'Rate');
    assert.equal(rate.props.value, '55'); assert.equal(rate.props.editable, true); assert.equal(rate.props.keyboardType, 'decimal-pad');
    assert.equal(rate.props.label, undefined); assert.ok(rate.props.accessibilityHint.includes('Suggested rate:'));
    assert.ok(nodes('AppText', row).some(n => n.props.children === '🇺🇸 USD')); assert.ok(nodes('AppText', row).some(n => n.props.children === '🇪🇬 EGP'));
    const received = nodes('AppText', row).find(n => n.props.accessibilityLabel?.startsWith('Amount to receive:'));
    assert.equal(received.props.children, (550).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    assert.equal(nodes('AppInput', row).length, 2);
    for (const input of nodes('AppInput', row)) assert.ok(style(input.props.fieldStyle).minHeight >= 48);
    for (const label of ['From account', 'To account']) assert.equal(style(nodes('AppText').find(n => n.props.children === label).props.style).fontWeight, '700');
    dimensions = { width: 390, height: 844, fontScale: 1 };
  });
}
test('incomplete transfer selection keeps the amount row coherent without a made-up rate or received value', () => {
  const props = prepareTransfer(); props.transfer = null; ledger.accounts = ledger.accounts.slice(0, 1);
  settleTransfer(props);
  const row = nodes('View').find(n => n.props.testID === 'transfer-amounts-row'); assert.ok(row);
  const amount = nodes('AppInput', row).find(n => n.props.accessibilityLabel === 'Amount to transfer');
  amount.props.onChangeText('25'); settleTransfer(props);
  const rate = nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate');
  assert.equal(rate.props.value, ''); assert.equal(rate.props.editable, false);
  assert.equal(nodes('AppText').find(n => n.props.accessibilityLabel?.startsWith('Amount to receive:')).props.children, '—');
  assert.equal(nodes('AppInput').find(n => n.props.accessibilityLabel === 'Amount to transfer').props.value, '25');
  assert.deepEqual(calls, []);
});

test('Date and Note remain the next fields after the transfer row, with their original edit values', () => {
  const props = prepareTransfer(); settleTransfer(props);
  const children = nodes('FormModal')[0].props.children.props.children;
  const rowIndex = children.findIndex(n => n?.props?.testID === 'transfer-amounts-row');
  assert.ok(rowIndex >= 0); assert.equal(children[rowIndex + 1].type, 'DateField');
  assert.equal(children[rowIndex + 1].props.value, '2026-11-04');
  assert.equal(children[rowIndex + 2].type, 'AppInput'); assert.equal(children[rowIndex + 2].props.label, 'Note (optional)');
  assert.equal(children[rowIndex + 2].props.value, 'Keep note');
});
test('manual Rate entry remains numeric-only and submits its full precision through the unchanged transfer handler', () => {
  const props = prepareTransfer(); settleTransfer(props);
  nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate').props.onChangeText('54.321123456'); settleTransfer(props);
  const rate = nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate');
  assert.equal(rate.props.value, '54.321123456'); assert.equal(rate.props.leftElement, undefined);
  nodes('AppButton').find(n => n.props.title === 'Save changes').props.onPress();
  assert.equal(calls[0][2].exchangeRate, 54.321123456); assert.equal(calls[0][2].toAmount, 10 * 54.321123456);
  assert.equal(calls[0][2].date, '2026-11-04'); assert.equal(calls[0][2].note, 'Keep note');
  assert.deepEqual(calls.slice(1), ['close']);
});
test('same-currency transfer keeps Rate fixed at one in the compact row', () => {
  const props = prepareTransfer(); ledger.accounts[1].currencyCode = 'USD';
  props.transfer = { ...transferFixture, toCurrencyCode: 'USD', toAmount: 10, exchangeRate: 1 }; settleTransfer(props);
  const rate = nodes('AppInput').find(n => n.props.accessibilityLabel === 'Rate');
  assert.equal(rate.props.value, '1'); assert.equal(rate.props.editable, false);
  assert.ok(rate.props.accessibilityHint.includes('fixed at 1'));
});
