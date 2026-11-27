// Test the actual field implementations with a small native/React boundary mock.
// Does not claim real device rendering or native picker behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({type, props: props || {}});
const actualInput = path.join(root, 'src/utils/input.ts');
function load(file, resolve) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  });
  assert.deepEqual((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
  const module = {exports: {}};
  new Function('require', 'module', 'exports', result.outputText)(resolve, module, module.exports);
  return module.exports;
}
const utils = load(actualInput, id => { throw Error(`Unexpected utility import: ${id}`); });
const fields = [
  ['DateField', 'src/components/ui/DateField.tsx'],
  ['FinanceDateField', 'src/features/finance/components/FinanceDateField.tsx'],
];
function harness(name, file, platform = 'android', locale = 'en') {
  let open = false;
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react': { useState: initial => [open ?? initial, v => { open = typeof v === 'function' ? v(open) : v; }] },
    'react-native': { View: 'View', Pressable: 'Pressable', Platform: {OS: platform} },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'NativePicker' },
    '@/theme': { useTheme: () => ({colors: {primary: '#123456'}, spacing: {sm: 8}}) },
    '@/localization/LanguageProvider': { useAppLanguage: () => ({t: (en, ar) => locale === 'ar' ? ar : en}) },
    '@/utils/input': utils,
    './AppButton': { AppButton: 'Button' }, './AppInput': { AppInput: 'Input' },
    './FinanceButton': { FinanceButton: 'Button' }, './FinanceInput': { FinanceInput: 'Input' },
  };
  const field = load(path.join(root, file), id => { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; })[name];
  const changes = [];
  const render = (extra = {}) => field({value: '2026-11-17', onChange: x => changes.push(x), ...extra});
  function find(node, type) {
    if (Array.isArray(node)) return node.flatMap(x => find(x, type));
    if (!node || typeof node !== 'object' || !node.props) return [];
    return [...(node.type === type ? [node] : []), ...find(node.props.children, type), ...find(node.props.rightElement, type)];
  }
  const picker = extra => { const first = render(extra); find(first, 'Pressable')[0].props.onPress(); return find(render(extra), 'NativePicker')[0]; };
  return {render, find, picker, changes};
}
for (const [name, file] of fields) {
  test(`${name} is calendar-only even when a legacy caller supplies false`, () => {
    const h = harness(name, file);
    for (const extra of [{}, {pickerOnly:true}, {pickerOnly:false}]) {
      const input = h.find(h.render(extra), 'Input')[0];
      assert.equal(input.props.editable, false);
      assert.equal(input.props.onChangeText, undefined);
      assert.equal(input.props.value, '2026-11-17');
    }
    assert.deepEqual(h.changes, []);
  });
  test(`${name} selects canonical local date and closes Android calendar`, () => {
    const h = harness(name, file);
    const p = h.picker();
    assert.equal(p.props.mode, 'date');
    assert.equal(utils.toLocalISODate(p.props.value), '2026-11-17');
    p.props.onChange({type:'set'}, new Date(2024,1,29,23,59));
    assert.deepEqual(h.changes, ['2024-02-29']);
    assert.equal(h.find(h.render(), 'NativePicker').length, 0);
  });
  test(`${name} ignores Android dismissal, missing selection and invalid Date`, () => {
    const h = harness(name, file);
    h.picker().props.onChange({type:'dismissed'}, new Date(2026,10,18));
    h.picker().props.onChange({type:'set'});
    h.picker().props.onChange({type:'set'}, new Date(NaN));
    assert.deepEqual(h.changes, []);
  });
  test(`${name} uses a valid picker seed for empty or malformed values without auto-saving`, () => {
    for (const value of ['', '2026-02-30']) {
      const h = harness(name, file);
      assert.equal(utils.isValidISODate(utils.toLocalISODate(h.picker({value}).props.value)), true);
      assert.deepEqual(h.changes, []);
    }
  });
  test(`${name} iOS selection stays open until Done`, () => {
    const h = harness(name, file, 'ios');
    const p = h.picker(); assert.equal(p.props.display,'inline');
    p.props.onChange({type:'set'}, new Date(2026,11,31));
    assert.deepEqual(h.changes,['2026-12-31']);
    const opened=h.render(); assert.equal(h.find(opened,'NativePicker').length,1);
    h.find(opened,'Button')[0].props.onPress();
    assert.equal(h.find(h.render(),'NativePicker').length,0);
  });
}
test('FinanceDateField retains Arabic labels, gold accessible calendar, and explicit optional clear', () => {
  const h = harness(...fields[1], 'android', 'ar');
  let clears=0; const extra={onClear:()=>clears++};
  const tree=h.render(extra), input=h.find(tree,'Input')[0];
  assert.equal(input.props.label,'التاريخ');
  assert.equal(input.props.fieldStyle.borderColor,'#CBD5E1');
  const calendar=h.find(tree,'Pressable')[0];
  assert.equal(calendar.props.accessibilityLabel,'فتح التقويم');
  assert.equal(calendar.props.style.minHeight,44);
  assert.equal(h.find(calendar,'Icon')[0].props.color,'#D6B777');
  h.find(tree,'Button')[0].props.onPress(); assert.equal(clears,1);
  assert.deepEqual(h.changes,[]);
  assert.equal(h.find(h.render({...extra,value:''}),'Button').length,0);
});
