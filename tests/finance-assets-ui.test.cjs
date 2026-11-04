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
let states, cursor, finance, currency, alerts, calls, theme;
const hooks = { ...React, useMemo: fn => fn(), useState: initial => {
  const key = cursor++;
  if (!(key in states)) states[key] = initial;
  return [states[key], value => { states[key] = typeof value === 'function' ? value(states[key]) : value; }];
} };
function Ionicon(props) { return React.createElement('Ionicon', props); }
function MaterialIcon(props) { return React.createElement('MaterialIcon', props); }
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: value => value, hairlineWidth: 1 }, Platform: { OS: 'android' },
    Alert: { alert: (...args) => alerts.push(args) } };
  if (id === '@expo/vector-icons') return { Ionicons: Ionicon, MaterialCommunityIcons: MaterialIcon };
  if (id === 'expo-router') return { useRouter: () => ({ back: () => calls.push('back') }) };
  if (id === '@/theme') return { useTheme: () => theme, moduleColors: { finance: '#10B981' } };
  if (id === '@/components/ui') return { Card: 'Card', AppText: 'AppText', AppButton: 'AppButton', Screen: 'Screen' };
  if (id === '@/features/finance/components/AddAssetModal') return { AddAssetModal: 'AddAssetModal' };
  if (id === '@/features/finance/components/AssetEntriesModal') return { AssetEntriesModal: 'AssetEntriesModal' };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerStore: select => select({ transactions: [], transfers: [] }) };
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
  states = []; cursor = 0; alerts = []; calls = [];
  theme = { colors: lightColors, isDark: false, spacing: { xs: 4, sm: 8, md: 12 }, radius: { sm: 8 } };
  finance = { assets: structuredClone([gold, silver]) };
  for (const method of ['addAsset', 'updateAsset', 'deleteAsset', 'addAssetEntry', 'updateAssetEntry', 'deleteAssetEntry']) {
    finance[method] = (...args) => calls.push([method, ...args]);
  }
  currency = { baseCurrency: 'EGP', rates: { EGP: 1 }, verifiedCurrencies: ['EGP'],
    metals: { gold24PerGram: 7002.58, silverPerGram: 6127.2575 },
    metalSources: { gold24PerGram: 'manual', silverPerGram: 'manual' } };
});

test('the installed vector font includes a real bullion glyph without a new package', () => {
  const glyphs = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'), 'utf8'));
  assert.equal(typeof glyphs.gold, 'number');
});
for (const isDark of [false, true]) {
  for (const asset of [gold, silver]) test(`${isDark ? 'dark' : 'light'} ${asset.category} uses a small, appropriately colored bar next to the asset name`, () => {
    theme.isDark = isDark; theme.colors = isDark ? darkColors : lightColors;
    render(AssetRow, rowProps(asset));
    const glyph = nodes('MaterialIcon')[0];
    assert.equal(glyph.props.name, 'gold');
    assert.equal(glyph.props.size, 24);
    assert.equal(glyph.props.color, asset.category === 'gold' ? isDark ? GOLD_COLORS.light : GOLD_COLORS.dark : theme.colors.textSecondary);
    assert.equal(nodes('Ionicon').some(n => /diamond/.test(n.props.name)), false);
    assert.ok(texts().includes(asset.name));
    assert.equal(nodes('Card')[0].props.variant, 'outlined');
  });
}
test('the active Assets screen uses the same bar icons and corrected gold/silver displays', () => {
  const previous = structuredClone(finance.assets);
  render(AssetsScreen);
  assert.equal(nodes('Card').length, 2);
  assert.deepEqual(nodes('MaterialIcon').map(n => n.props.testID), ['asset-icon-gold', 'asset-icon-silver']);
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
    ['create-outline', 17, isDark ? darkColors.success : '#27845B'], ['trash-outline', 17, isDark ? darkColors.danger : '#B42323'],
  ]);
  assert.deepEqual(texts(), ['Edit', 'Delete']);
  assert.deepEqual(nodes('Pressable').map(n => n.props.accessibilityLabel), ['Edit Test record', 'Delete Test record']);
  for (const button of nodes('Pressable')) {
    assert.equal(button.props.accessibilityRole, 'button');
    const target = style(button.props.style({ pressed: false }));
    assert.ok(target.minWidth >= 48 && target.minHeight >= 48);
    assert.equal(target.borderRadius, 9); assert.equal(target.paddingHorizontal, 9);
    assert.ok(target.backgroundColor && target.borderColor);
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
  assert.deepEqual(nodes('Ionicon').filter(n => ['create-outline', 'trash-outline'].includes(n.props.name)).map(n => n.props.size), [17, 17]);
});
