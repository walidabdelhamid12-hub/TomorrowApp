// Native surfaces are mocked: these checks do not approve Android/Yoga rendering.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const original = Module._load;
let scheme = 'light';
Module._load = function(id, parent, main) {
  // This renderer supplies fake React/store contexts. Supply its explicit English
  // localization boundary too; localization/provider behavior is tested separately.
  if (id.endsWith('/LanguageProvider')) return {useAppLanguage: () => ({language:'en',isRTL:false,t:(english)=>english,setLanguage:()=>{}})};

  if (id === 'react') return { ...React, useState: value => [value, () => {}] };
  if (id === 'react-native') return { View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' }, StyleSheet: { create: x => x, absoluteFill: {}, hairlineWidth: 1 } };
  if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 28, bottom: 24, left: 0, right: 0 }) };
  if (id === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (id === '@react-native-community/datetimepicker') return { __esModule: true, default: 'NativeDatePicker' };
  if (id === '@/theme') return { useTheme: () => ({ scheme, spacing: { lg: 16, sm: 8, xxl: 32 }, colors: { overlay: '#0008', finance: { neutral: { accent: '#123456' } } } }) };
  if (id === '@/components/ui') return { AppText: 'AppText' };
  return original.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const { financeChrome } = require('../src/features/finance/components/financeChrome.ts');
const { FinanceModalHeader } = require('../src/features/finance/components/FinanceModalHeader.tsx');
const { FinanceButton } = require('../src/features/finance/components/FinanceButton.tsx');
const { FormModal } = require('../src/features/finance/components/FormModal.tsx');
const { FinanceDateField } = require('../src/features/finance/components/FinanceDateField.tsx');
const { AccountDropdown } = require('../src/features/finance/components/AccountDropdown.tsx');
const { CurrencyDropdown } = require('../src/features/finance/components/CurrencyDropdown.tsx');
const { shouldStackFinanceFields } = require('../src/features/finance/utils/formLayout.ts');
function nodes(node, type) {
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, type));
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === 'function') return nodes(node.type(node.props), type);
  return [...(node.type === type ? [node] : []), ...nodes(node.props.children, type)];
}
function noNestedPressables(node, inside = false) {
  if (Array.isArray(node)) return node.forEach(n => noNestedPressables(n, inside));
  if (!React.isValidElement(node)) return;
  if (typeof node.type === 'function') return noNestedPressables(node.type(node.props), inside);
  assert.ok(!(inside && node.type === 'Pressable'), 'nested pressable');
  noNestedPressables(node.props.children, inside || node.type === 'Pressable');
}
test('shortcut headers meet screen edges and grow with font scaling', () => {
  // Screen supplies 16 points of horizontal and top padding.
  assert.equal(16 + financeChrome.header.marginHorizontal, 0);
  assert.equal(16 + financeChrome.header.marginTop, 0);
  assert.equal(financeChrome.header.backgroundColor, '#1E293B');
  assert.equal(financeChrome.header.height, undefined);
  assert.equal(financeChrome.back.width, 44);
  assert.equal(financeChrome.back.borderColor, '#D6B777');
  for (const file of ['src/app/finance/accounts.tsx', 'src/app/finance/debts.tsx', 'src/app/finance/loans.tsx', 'src/app/finance/installments.tsx', 'src/features/finance/screens/AssetsScreen.tsx', 'src/features/finance/screens/IncomeExpensesScreen.tsx', 'src/features/finance/components/CategoryManagementScreen.tsx']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /style=\{(?:\[)?financeChrome.header/);
  }
});
test('sheet header has wrapping white title, accessible close and no nested actions', () => {
  let closed = 0;
  const tree = FinanceModalHeader({ title: 'A long translated Add / Edit title', onClose: () => closed++ });
  const title = nodes(tree, 'AppText')[0];
  assert.equal(title.props.style.color, '#FFFFFF');
  assert.equal(title.props.numberOfLines, undefined);
  const close = nodes(tree, 'Pressable')[0];
  assert.equal(close.props.accessibilityRole, 'button');
  assert.equal(close.props.style.width, 44);
  close.props.onPress(); assert.equal(closed, 1);
  noNestedPressables(tree);
});
test('shared form retains bottom sheet, Android close, keyboard and scroll behavior', () => {
  let closed = 0;
  const tree = FormModal({ visible: true, title: 'Edit', onClose: () => closed++, children: React.createElement('Field') });
  assert.equal(tree.props.transparent, true);
  assert.equal(tree.props.animationType, 'slide');
  assert.equal(tree.props.navigationBarTranslucent, false);
  tree.props.onRequestClose(); assert.equal(closed, 1);
  assert.equal(nodes(tree, 'KeyboardAvoidingView')[0].props.behavior, 'height');
  assert.equal(nodes(tree, 'KeyboardAvoidingView')[0].props.style[1].paddingTop, 36);
  const scroll = nodes(tree, 'ScrollView')[0];
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(scroll.props.contentContainerStyle.paddingBottom, 56);
  assert.equal(scroll.props.style.flexShrink, 1);
  assert.equal(scroll.props.style.minHeight, 0);
  const sheet = nodes(tree, 'View').find(n => n.props.accessibilityViewIsModal);
  assert.equal(sheet.props.style[0].flexShrink, 1);
  assert.equal(sheet.props.style[1].borderTopWidth, undefined);
  assert.equal(sheet.props.style[1].borderTopColor, undefined);
  noNestedPressables(tree);
});

test('page and modal corner geometry cannot leak into one another', () => {
  assert.equal(financeChrome.header.borderBottomLeftRadius, 24);
  assert.equal(financeChrome.header.borderTopLeftRadius, undefined);
  assert.equal(financeChrome.modalHeader.borderTopLeftRadius, 24);
  assert.equal(financeChrome.modalHeader.borderBottomLeftRadius, 0);
  assert.equal(financeChrome.modalHeader.borderBottomRightRadius, 0);
  assert.equal(financeChrome.modalHeader.flexShrink, 0);
  assert.equal(financeChrome.modalHeader.borderTopWidth, undefined);
});

test('wide fields retain two columns; narrow or large text layouts stack without fixed vertical bases', () => {
  for (const [width, scale, stack] of [[320, 1, true], [360, 1, false], [390, 1, false], [600, 1, false], [390, 1.6, true], [600, 2, true]]) {
    assert.equal(shouldStackFinanceFields(width, scale), stack);
    const containerStyle = stack ? { flex: 0 } : undefined;
    for (const tree of [AccountDropdown({ label: 'Account', options: [], value: '', onChange() {}, emptyMessage: 'None', containerStyle }), CurrencyDropdown({ label: 'Currency', value: 'OMR', onChange() {}, containerStyle })]) {
      const style = Object.assign({}, ...tree.props.style);
      assert.equal(style.flex, stack ? 0 : 1);
      assert.equal(style.flexBasis, undefined);
      assert.equal(style.height, undefined);
    }
  }
});

test('named forms keep their footer inside the shared scroll owner, without nested field ScrollViews', () => {
  for (const [file, title, action] of [
    ['src/app/finance/loans.tsx', 'New loan', 'Save loan'],
    ['src/features/finance/components/AddAccountModal.tsx', 'Add account', 'onSave'],
    ['src/features/finance/components/AddAssetModal.tsx', 'Add asset', 'handleSave'],
    ['src/features/finance/components/AddTransactionModal.tsx', null, 'submit'],
    ['src/features/finance/components/TransferModal.tsx', null, 'submit'],
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const forms = [];
    function visit(node) { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'FormModal') forms.push(node); ts.forEachChild(node, visit); }
    visit(ast);
    const form = forms.find(n => (!title || n.openingElement.getText(ast).includes(title)) && n.getText(ast).includes(action));
    assert.ok(form, file + ' footer must remain within FormModal');
    assert.doesNotMatch(form.getText(ast), /<ScrollView\b/);
    assert.doesNotMatch(form.getText(ast), /marginTop: -\d+.*FinanceModalHeader/);
  }
});

test('Finance calendar icons use gold including custom date controls and Transfer imports', () => {
  const transfer = fs.readFileSync(path.join(root, 'src/features/finance/components/TransferModal.tsx'), 'utf8');
  assert.match(transfer, /FinanceDateField as DateField/);
  let count = 0;
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) { walk(file); continue; }
      if (!file.endsWith('.tsx')) continue;
      const source = fs.readFileSync(file, 'utf8');
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Ionicons') {
          const attrs = node.attributes.properties;
          const name = attrs.find(p => p.name?.getText(ast) === 'name');
          if (name?.initializer?.getText(ast).includes('calendar')) {
            count++;
            const color = attrs.find(p => p.name?.getText(ast) === 'color');
            assert.equal(color?.initializer?.getText(ast), '"#D6B777"', file);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  walk(path.join(root, 'src/features/finance')); walk(path.join(root, 'src/app/finance'));
  // Shared DateField replaces duplicated inline calendar icons. Check every
  // remaining literal icon above, then the migrated callers explicitly.
  assert.ok(count > 0, 'shared calendar icon must remain present');
  const callers = {
    'src/features/finance/components/AddAccountModal.tsx': 1,
    'src/features/finance/components/AddDebtModal.tsx': 2,
    'src/features/finance/components/AddTransactionModal.tsx': 1,
    'src/features/finance/components/AccountDetails.tsx': 1,
    'src/features/finance/components/AssetEntriesModal.tsx': 1,
    'src/features/finance/components/TransferModal.tsx': 1,
    'src/features/finance/screens/AssetsScreen.tsx': 1,
    'src/app/finance/loans.tsx': 3,
    'src/app/finance/debts.tsx': 2,
    'src/app/finance/installment-contract.tsx': 1,
  };
  for (const [file, expected] of Object.entries(callers)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const imported = ast.statements.filter(ts.isImportDeclaration).flatMap(n => {
      if (!n.moduleSpecifier.text.endsWith('/FinanceDateField')) return [];
      const bindings = n.importClause?.namedBindings;
      return bindings && ts.isNamedImports(bindings) ? bindings.elements.filter(e => (e.propertyName ?? e.name).text === 'FinanceDateField').map(e => e.name.text) : [];
    });
    assert.equal(imported.length, 1, file + ': shared date import');
    let uses = 0;
    function visit(node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && imported.includes(node.tagName.getText(ast))) {
        uses++;
        assert.ok(node.attributes.properties.some(p => p.name?.getText(ast) === 'pickerOnly' && (!p.initializer || p.initializer.getText(ast) === '{true}')), file + ': calendar-only');
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(uses, expected, file + ': shared calendar count');
  }
});
test('Finance buttons wrap large text and retain disabled, loading and danger semantics in both themes', () => {
  for (scheme of ['light', 'dark']) {
    const tree = FinanceButton({ title: 'Save a long translated contract name', onPress() {}, disabled: true });
    assert.equal(tree.props.accessibilityState.disabled, true);
    assert.equal(tree.props.style({ pressed: false })[0].minHeight, 52);
    assert.equal(nodes(tree, 'AppText')[0].props.numberOfLines, undefined);
    assert.equal(nodes(tree, 'AppText')[0].props.adjustsFontSizeToFit, undefined);
    assert.equal(FinanceButton({ title: 'Delete', variant: 'danger', onPress() {} }).props.style({})[0].backgroundColor, scheme === 'light' ? '#DC2626' : '#F87171');
    assert.equal(nodes(FinanceButton({ title: 'Save', loading: true, onPress() {} }), 'ActivityIndicator').length, 1);
    noNestedPressables(tree);
  }
});
test('Finance date field is neutral with gold accessible calendar and unchanged text normalization', () => {
  let value;
  const tree = FinanceDateField({ value: '2026-11-17', onChange: next => value = next });
  const input = tree.props.children[0];
  assert.equal(input.props.fieldStyle.borderColor, '#CBD5E1');
  assert.equal(input.props.rightElement.props.accessibilityLabel, 'Open calendar');
  assert.equal(input.props.rightElement.props.children.props.color, '#D6B777');
  assert.equal(input.props.rightElement.props.style.minHeight, 44);
  input.props.onChangeText('٢٠٢٦-١١-١٧');
  assert.equal(value, '2026-11-17');
  const pickerOnly = FinanceDateField({ value: '2026-11-17', pickerOnly: true, onChange: next => value = next }).props.children[0];
  assert.equal(pickerOnly.props.editable, false);
  pickerOnly.props.onChangeText('2026-11-18');
  assert.equal(value, '2026-11-17', 'picker-only fields ignore manual input');
});

test('Documents uses its accepted compact header and Import PDF retains its handler and busy gates', () => {
  const file = 'src/app/finance/documents.tsx';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(source, /iconAction\('document-outline', t\('Import PDF', 'استيراد PDF'\), importPdf, '#DC2626'\)/);
  assert.match(source, /const busy = importing \|\| loading \|\| verifyingId !== null \|\| openingId !== null \|\| savingCategory/);
  assert.match(source, /disabled = busy\) => \(/);
  assert.match(source, /accessibilityLabel=\{label\} disabled=\{disabled\} onPress=\{action\}/);
  assert.match(source, /const importPdf = async \(\) => \{\s*if \(importLock.current \|\| categoryLock.current \|\| openLock.current \|\| verifyLock.current\) return/);
  assert.match(source, /testID="documents-add-header"/);
  assert.match(source, /name="arrow-left" size=\{27\}/);
  assert.match(source, /onPress=\{\(\) => onClose \? onClose\(\) : fromAdd === '1' \? router.navigate\('\/finance\/add'\) : router.back\(\)\}/);
  const modalRoute = fs.readFileSync(path.join(root, 'src/app/finance/add.tsx'), 'utf8');
  assert.match(modalRoute, /borderTopLeftRadius: financeLayoutTokens\.modalRadius/);
  assert.match(modalRoute, /borderTopRightRadius: financeLayoutTokens\.modalRadius/);
  const { financeLayoutTokens } = require('../src/features/finance/constants/financeDesignTokens.ts');
  assert.equal(financeLayoutTokens.modalRadius, 24);
  assert.doesNotMatch(modalRoute, /borderTopWidth/);
});

test('New asset type uses a non-posting dropdown and saves only through Add asset', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/finance/components/AddAssetModal.tsx'), 'utf8');
  assert.match(source, /<FinanceChoiceDropdown label=\{t\('Asset Type',\s*'[^']+'\)\} value=\{selectedType\}/);
  assert.match(source, /disabled=\{isEditing\}/);
  assert.match(source, /onChange=\{value => handleSelectType\(value as AssetCategory\)\}/);
  assert.match(source, /<FinanceChoiceDropdown label=\{t\('Currency',\s*'[^']+'\)\} value=\{selectedCurrency\}/);
  assert.match(source, /onChange=\{setSelectedCurrency\}/);
  assert.match(source, /const handleSelectType = \(type: AssetCategory\) => \{/);
  const selectionHandler = source.split('const handleSelectType = ')[1].split('const handleSave = ')[0];
  assert.doesNotMatch(selectionHandler, /onSave\s*\(/);
  assert.match(source, /const handleSave = \(\) => \{/);
  assert.match(source, /onSave\(\{/);
  assert.doesNotMatch(source, /<View style=\{styles.addToChipActive\}>/);
});

test('both debt Add labels use shared primary navy while semantic tabs remain separate', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/finance/debts.tsx'), 'utf8');
  const add = source.match(/<AppButton\s+title=\{activeTab === 'receivable' \? t\('Add receivable', [^)]*\) : t\('Add payable', [^)]*\)\}[\s\S]*?onPress=\{openAddDebt\}\s*\/>/)[0];
  assert.doesNotMatch(add, /accentColor/);
  assert.match(add, /onPress=\{openAddDebt\}/);
  assert.match(source, /receivableTabActive/);
  assert.match(source, /payableTabActive/);
  for (const schemeValue of ['light', 'dark']) {
    scheme = schemeValue;
    assert.equal(FinanceButton({ title: 'Add', onPress() {} }).props.style({ pressed: false })[0].backgroundColor, '#1E293B');
  }
});
