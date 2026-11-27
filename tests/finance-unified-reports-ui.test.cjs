// Actual Expenses screens and shared components, with native IO/rendering mocked.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..'), load = Module._load;
let savedState, states, cursor, ledger, finance, currency, ready, params, calls, alerts, files, tree, html;
let componentStates = new Map(), activeFrame = null;
const stateArray = () => { if (activeFrame === null) return states; if (!componentStates.has(activeFrame)) componentStates.set(activeFrame, []); return componentStates.get(activeFrame); };
const hooks = { ...React, useMemo: fn => fn(), useState: initial => {
  const states = stateArray(); const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
  return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
}, useEffect: () => {}, useSyncExternalStore: (_subscribe, get) => get(), useRef: initial => { const states = stateArray(); const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; } };
const selectors = data => select => select(new Proxy(data, { get: (value, key) => {
  assert.ok(Object.hasOwn(value, key), 'No store writers: ' + String(key)); return value[key];
} }));
class File {
  constructor(directory, name) { assert.equal(directory, 'file:///cache/'); this.uri = directory + name; this.exists = false; this.size = 0; files.push(this); }
  async write(content, options) {
    await Promise.resolve(); this.content = content; this.options = options;
    this.size = Buffer.byteLength(content); this.exists = true;
  }
}
Module._load = function(id, parent, main) {
  // This renderer supplies fake React/store contexts. Supply its explicit English
  // localization boundary too; localization/provider behavior is tested separately.
  if (id.endsWith('/LanguageProvider')) return {useAppLanguage: () => ({language:'en',isRTL:false,t:(english)=>english,setLanguage:()=>{}})};

  if (id === 'react') return hooks;
  if (id === '@react-native-community/datetimepicker') return { __esModule: true, default: 'DateTimePicker' };
  if (id === 'react-native') return { Platform: { OS: 'android' }, Modal: 'Modal', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) } };
  if (id === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
  if (id === 'expo-router') return { useRouter: () => ({ push: value => calls.push(value), back: () => calls.push('back') }), useLocalSearchParams: () => params };
  if (id === '@/components/ui') return { Screen: 'Screen', AppText: 'AppText', Card: 'Card' };
  if (id.endsWith('/store/installmentsStorage')) return { installmentsStorage: { subscribe: () => () => {}, getState: () => savedState } };
  if (id.endsWith('/utils/shareStatementPdf')) return { shareStatementPdf: async (value, options) => calls.push({ pdf: value, options }) };
  if (id.endsWith('/utils/shareStatementCsv')) return { shareStatementCsv: async value => calls.push({ csv: value }) };
  if (id === '@/theme') return { moduleColors: { finance: '#10B981' }, useTheme: () => ({ scheme: 'light', colors: { text: '#111111', surface: '#FFFFFF', border: '#CCCCCC', background: '#F4F6F8' }, spacing: { xs: 4, sm: 8, md: 12, lg: 16 } }) };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerHydrated: () => ready, useLedgerStore: select => selectors(ledger)(select) };
  if (id === '@/features/finance/store/useFinanceStore') return { useFinanceHydrated: () => ready, useFinanceStore: select => selectors(finance)(select) };
  // Assets valuation now reads the currency store; mock this external dependency like Finance/Ledger.
  if (id === '@/features/finance/store/useCurrencyStore') return {
    useCurrencyHydrated: () => ready,
    useCurrencyStore: select => selectors(currency)(select),
  };
  if (id === 'expo-file-system') return { File, Paths: { cache: 'file:///cache/' } };
  if (id === 'expo-print') return { printToFileAsync: async options => { assert.ok((options.width === 595 && options.height === 842) || (options.width === 842 && options.height === 595), 'Expected approved A4 portrait or landscape geometry'); assert.equal(options.textZoom, 100); html.push(options.html); return { base64: Buffer.from('%PDF-1.7\nfixture').toString('base64') }; } };
  if (id === 'expo-sharing') return { isAvailableAsync: async () => true, shareAsync: async (uri, options) => {
    assert.ok(files.find(file => file.uri === uri && file.exists && file.size > 0)); calls.push({ uri, options });
  } };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
const reports = ['income','expenses','accounts','assets','installments','loans','receivable','payable'].map(name => [name, require('../src/app/finance/report-' + name + '.tsx').default]);
function expand(node, nodePath = 'root') {
  if (Array.isArray(node)) return node.map((child, index) => expand(child, nodePath + '/' + (child?.key ?? index)));
  if (!React.isValidElement(node)) return node;
  if (node.type === 'Modal' && !node.props.visible) return null;
  if (typeof node.type === 'function') { const previousFrame = activeFrame, previousCursor = cursor; activeFrame = nodePath === 'root' ? null : nodePath + '/' + node.type.name;
    // Debt routes wrap their screen: give its period hook the same fixed date fixture as root screens.
    if (node.type.name === 'DebtReportScreen' && !componentStates.has(activeFrame)) componentStates.set(activeFrame, [{ from: '2026-11-01', to: '2026-11-12' }]);
    cursor = 0; const rendered = node.type(node.props); const result = expand(rendered, nodePath + '/render'); activeFrame = previousFrame; cursor = previousCursor; return result; }
  return { type: node.type, props: { ...node.props, children: expand(node.props.children, nodePath + '/children') } };
}
function assertNativeText(node, insideText = false) {
  if (Array.isArray(node)) return node.forEach(child => assertNativeText(child, insideText));
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') { assert.ok(insideText || node === '', 'Native raw text outside Text: ' + JSON.stringify(node)); return; }
  const inherited = node.type === React.Fragment ? insideText : node.type === 'AppText' || node.type === 'Text';
  assertNativeText(node.props.children, inherited);
}
function render(component) { if (component.name === "AccountsReportScreen" && states[0]?.from) states.unshift(""); cursor = 0; tree = expand(React.createElement(component)); assertNativeText(tree); }
function nodes(type, node) {
  if (arguments.length === 1) node = tree;
  if (Array.isArray(node)) return node.flatMap(value => nodes(type, value));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children)];
}
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node == null || typeof node === 'boolean') return ''; return typeof node === 'object' ? text(node.props.children) : String(node); }
const allText = () => nodes('AppText').map(text).join('\n');
function press(label) { const button = nodes('Pressable').find(node => node.props.accessibilityLabel === label); assert.ok(button, label); assert.ok(!button.props.disabled); button.props.onPress(); }
function openDetails(title, component) {
  const label = `Toggle ${title} details`;
  const button = nodes('Pressable').find(node => node.props.accessibilityLabel === label);
  assert.ok(button, label);
  assert.equal(button.props.accessibilityState.expanded, false);
  assert.ok(nodes('Ionicons', button).some(node => node.props.name === 'chevron-down'));
  press(label); render(component);
  const opened = nodes('Pressable').find(node => node.props.accessibilityLabel === label);
  assert.equal(opened.props.accessibilityState.expanded, true);
  assert.ok(nodes('Ionicons', opened).some(node => node.props.name === 'chevron-up'));
}
function assertFooter() {
  const labels = ['View Statement', 'Export PDF', 'Export Excel', 'Export Share'];
  const actions = nodes('Pressable').filter(node => labels.includes(node.props.accessibilityLabel));
  assert.deepEqual(actions.map(node => node.props.accessibilityLabel), labels);
  assert.deepEqual(actions.map(node => text(node)), ['Statement', 'PDF', 'Excel', 'Share']);
  assert.equal(actions.every(node => node.props.accessibilityRole === 'button'), true);
  return actions;
}
function xlsxParts(file) {
  assert.ok(file?.exists && file.size > 0);
  assert.deepEqual(file.options, { encoding: 'base64' });
  const bytes = Buffer.from(file.content, 'base64'), parts = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    parts.set(name, bytes.subarray(start, start + size).toString('utf8')); offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(parts.has(name), name);
  return parts;
}
function assertNumericCell(parts, reference, value) {
  const match = parts.get('xl/worksheets/sheet1.xml').match(new RegExp('<c r="' + reference + '"([^>]*)>([\\s\\S]*?)</c>'));
  assert.ok(match, reference); assert.doesNotMatch(match[1], /\bt="(?:inlineStr|s|str)"/);
  assert.equal(match[2], '<v>' + value + '</v>');
  const style = Number(match[1].match(/\bs="(\d+)"/)?.[1] ?? 0);
  const styles = parts.get('xl/styles.xml');
  const xfs = [...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*\/>/g)];
  const format = xfs[style][0].match(/numFmtId="(\d+)"/)[1];
  const formatCode = styles.match(new RegExp('<numFmt numFmtId="' + format + '" formatCode="([^"]+)"'))?.[1];
  assert.ok(formatCode, 'numeric format exists'); assert.match(formatCode, /^#,##0\.000(?:;|$)/, 'OMR display precision');
}
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } };
function savePreview(name) {
  if (!process.env.TOMORROW_REPORT_PREVIEWS) return;
  const mockedLoad = Module._load; Module._load = load;
  try {
    const Web = require('react-native-web'), { renderToStaticMarkup } = require('react-dom/server');
    const { typography } = require('../src/theme/typography.ts');
    function native(node) {
      if (Array.isArray(node)) return node.map(native);
      if (!node || typeof node !== 'object') return node;
      const { children, ...props } = node.props;
      if (node.type === React.Fragment) return React.createElement(React.Fragment, null, native(children));
      if (node.type === 'Ionicons') return React.createElement(Web.Text, { style: { fontSize: props.size, width: props.size, height: props.size, color: props.color, lineHeight: props.size } }, '◇');
      if (node.type === 'AppText') return React.createElement(Web.Text, { ...props, style: [typography[props.variant || 'body'], { color: props.color === 'textSecondary' ? '#64748b' : props.color === 'primary' ? '#10b981' : '#0f172a' }, props.style] }, native(children));
      if (node.type === 'Screen') return React.createElement(Web.View, { style: { padding: 16, backgroundColor: '#f4f6f8', minHeight: '100%' } }, native(children));
      const Host = node.type === 'ScrollView' ? Web.ScrollView : Web.View;
      return React.createElement(Host, props, native(children));
    }
    const markup = renderToStaticMarkup(native(tree));
    fs.writeFileSync(path.join(process.env.TOMORROW_REPORT_PREVIEWS, name + '.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;font-family:Arial,sans-serif}*{box-sizing:border-box}' + Web.StyleSheet.getSheet().textContent + '</style></head><body>' + markup + '</body></html>');
  } finally { Module._load = mockedLoad; }
}
beforeEach(() => {
  componentStates = new Map(); activeFrame = null; params = {}; savedState = { hydration: 'ready', contracts: [] }; states = [{ from: '2026-11-01', to: '2026-11-12' }]; cursor = 0; ready = true; calls = []; alerts = []; files = []; html = [];
  ledger = { accounts: [{ id: 'bank', name: 'Bank', currencyCode: 'OMR', archived: false }], categories: [{ id: 'salary', name: 'Salary', kind: 'income', icon: 'briefcase', color: '#123456' }], transfers: [], transactions: [{ id: 'income', type: 'income', amount: 1.237, currencyCode: 'OMR', accountId: 'bank', categoryId: 'salary', date: '2026-11-10', note: 'November salary' }] };
  finance = { assets: [], debts: [], loans: [], cheques: [] };
  currency = { baseCurrency: 'OMR', rates: { OMR: 1 }, verifiedCurrencies: ['OMR'], metals: { gold24PerGram: null, silverPerGram: null }, metalSources: { gold24PerGram: 'default', silverPerGram: 'default' }, updatedAt: null };
});
for (const [name, component] of reports) test(name + ' renders compact header, functional Back and dates without modifying stores', () => {
  if (name === 'expenses') { ledger.categories[0].kind = 'expense'; ledger.transactions[0].type = 'expense'; }
  const before = structuredClone({ ledger, finance }); freeze(ledger); freeze(finance);
  render(component); savePreview(name);
  assert.equal(nodes('Pressable').filter(node => /^Open .+ report$/.test(node.props.accessibilityLabel ?? '')).length, 0);
  assert.match(allText(), /Tomorrow Finance/);
  assert.match(allText(), new RegExp(name === 'receivable' ? 'Debts Receivable' : name === 'payable' ? 'Debts Payable' : name[0].toUpperCase() + name.slice(1) + ' Report'));
  const back = nodes('Pressable').filter(node => node.props.accessibilityLabel === 'Back');
  assert.equal(back.length, 1); assert.equal(back[0].props.accessibilityRole, 'button');
  assert.ok(nodes('Ionicons', back[0]).some(node => node.props.name === 'arrow-back'));
  assert.ok(nodes('Pressable').some(node => node.props.accessibilityLabel === 'From date: 2026-11-01'));
  assert.ok(nodes('Pressable').some(node => node.props.accessibilityLabel === 'To date: 2026-11-12'));
  // Reports without any selected data intentionally omit their footer.
  if (['income', 'expenses', 'accounts'].includes(name)) assertFooter();
  press('Back'); assert.deepEqual(calls, ['back']);
  assert.deepEqual({ ledger, finance }, before);
});
test('Income retains category icons/colors, exact currency, expandable details and account filter', () => {
  const component = reports[0][1]; render(component);
  assert.match(allText(), /Total Income/);
  assert.match(allText(), /1\.237/);
  assert.ok(nodes('View').some(node => node.props.style?.backgroundColor === '#123456'));
  press('Category: All Categories'); render(component);
  assert.ok(nodes('Ionicons').some(node => node.props.name === 'briefcase' && node.props.color === '#123456'));
  press('Salary'); render(component);
  assert.doesNotMatch(allText(), /November salary/); openDetails('Transactions (1)', component);
  assert.match(allText(), /November salary/);
  assert.ok(nodes('Ionicons').some(node => node.props.name === 'briefcase'));
  press('Toggle Transactions (1) details'); render(component); assert.doesNotMatch(allText(), /November salary/);
  assert.equal(nodes('Pressable').find(node => node.props.accessibilityLabel === 'Toggle Transactions (1) details').props.accessibilityState.expanded, false);
  press('Account: All accounts'); render(component); press('Bank 🇴🇲 OMR'); render(component);
  assert.match(allText(), /1\.237/);
});
test('date controls update the period, order reversed bounds, and dismiss without changes', () => {
  const component = reports[0][1]; render(component); openDetails('Transactions (1)', component); assert.match(allText(), /November salary/);
  press('From date: 2026-11-01'); render(component);
  nodes('DateTimePicker')[0].props.onChange({ type: 'set' }, new Date(2026, 10, 15)); render(component);
  assert.deepEqual(states[0], { from: '2026-11-15', to: '2026-11-15' });
  assert.match(allText(), /2026-11-15/); assert.doesNotMatch(allText(), /November salary/);
  press('To date: 2026-11-15'); render(component); nodes('DateTimePicker')[0].props.onChange({ type: 'dismissed' }); render(component);
  assert.equal(nodes('DateTimePicker').length, 0); assert.match(allText(), /2026-11-15/);
  assert.deepEqual(states[0], { from: '2026-11-15', to: '2026-11-15' });
  press('To date: 2026-11-15'); render(component);
  nodes('DateTimePicker')[0].props.onChange({ type: 'set' }, new Date(2026, 10, 10)); render(component);
  assert.deepEqual(states[0], { from: '2026-11-10', to: '2026-11-10' });
  assert.match(allText(), /November salary/);
});
for (const kind of ['income', 'expenses']) test(kind + ' exports selected verified values, blocks rapid double tap and fails closed on unknown data', async () => {
  if (kind === 'expenses') { ledger.categories[0].kind = 'expense'; ledger.transactions[0].type = 'expense'; }
  const component = reports.find(([name]) => name === kind)[1]; render(component); press('Export Excel'); press('Export Excel'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.filter(file => file.uri.endsWith('.xlsx')).length, 1); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /<v>1\.237<\/v>/);
  assertNumericCell(xlsxParts(files[0]), kind === 'expenses' ? 'E11' : 'E9', '1.237');
  ledger.transactions.push({ ...ledger.transactions[0], id: 'bad', amount: 0.0001 }); states = [{ from: '2026-11-01', to: '2026-11-12' }]; render(component);
  assert.match(allText(), /Incomplete report/);
  const disabled = assertFooter().slice(1); assert.equal(disabled.length, 3);
  assert.equal(disabled.every(node => node.props.disabled), true);
  const before = { files: files.length, calls: calls.length, alerts: alerts.length };
  for (const node of disabled) node.props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual({ files: files.length, calls: calls.length }, { files: before.files, calls: before.calls });
  // Disabled export callbacks must remain inert.
  assert.equal(alerts.length, before.alerts);
});
const { buildReportTableCsv, buildReportTableHtml } = require('../src/features/finance/utils/reportTableExport.ts');
const { reportRoutePeriod } = require('../src/features/finance/utils/reportRoutePeriod.ts');
test('table exports preserve decimal strings and escape formulas/HTML; incomplete evidence is rejected', () => {
  const table = { title: 'Assets <snapshot>', period: { from: '2026-11-01', to: '2026-11-12' }, columns: ['Name','Amount','Unit'], rows: [['=SUM(A1)', '9007199254740993.001', 'g']], verified: true, notice: 'Quantity only & no valuation' };
  const before = structuredClone(table); freeze(table);
  assert.match(buildReportTableCsv(table), /'\=SUM\(A1\)/); assert.match(buildReportTableCsv(table), /9007199254740993\.001/);
  assert.match(buildReportTableHtml(table), /Assets &lt;snapshot&gt;/); assert.match(buildReportTableHtml(table), /Quantity only &amp; no valuation/);
  assert.throws(() => buildReportTableCsv({ ...table, verified: false }), /verified/);
  assert.throws(() => buildReportTableHtml({ ...table, rows: [['x', null, 'g']] }), /verified/);
  assert.deepEqual(table, before);
});
test('exact statement ranges accept leap dates, reject malformed/repeated parameters and reversed bounds', () => {
  assert.deepEqual(reportRoutePeriod('2024-02-29','2024-03-01'), { from: '2024-02-29', to: '2024-03-01' });
  for (const range of [['2026-02-29','2026-03-01'], [['2026-11-01'],'2026-11-12'], ['2026-11-12','2026-11-01'], [undefined,'2026-11-12']]) assert.equal(reportRoutePeriod(...range), null);
});
test('Loans show contractual and principal balances separately, preserve fees and block unverified exports', async () => {
  finance.loans = [{ id: 'loan', name: 'Loan', lenderName: 'Bank', currencyCode: 'OMR', principalAmount: 1000, totalRepaymentAmount: 1200, monthlyInstallment: 100, numberOfInstallments: 12, firstDueDate: '2026-11-01', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', payments: [{ id: 'payment', date: '2026-11-10', amount: 120, latePaymentFee: 5, note: 'Confirmed payment' }] }];
  const before = structuredClone(finance); const component = reports.find(([name]) => name === 'loans')[1]; render(component);
  savePreview('loans'); assertFooter(); assert.match(allText(), /1,080\.000/); assert.doesNotMatch(allText(), /900\.000/);
  openDetails('Loan', component); assert.match(allText(), /900\.000/);
  assert.match(allText(), /Late fee: 5 OMR/); assert.match(allText(), /Confirmed payment/);
  press('Export PDF');
  for (let attempt = 0; attempt < 20 && !calls.some(value => value?.pdf); attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  const pdfExport = calls.find(value => value?.pdf);
  assert.ok(pdfExport, 'Expected verified Loans PDF export to be recorded');
  assert.match(pdfExport.pdf, /Current principal remaining/);
  assert.deepEqual(finance, before);
  finance.loans[0].updatedAt = '2026-12-01T00:00:00Z'; states = [{ from: '2026-11-01', to: '2026-11-12' }]; render(component);
  assert.match(allText(), /Unverified history/); assert.equal(nodes('Pressable').find(node => node.props.accessibilityLabel === 'Export PDF').props.disabled, true);
});
for (const direction of ['receivable','payable']) test(direction + ' isolates counterparties, balances and collection/payment history', async () => {
  finance.debts = [{ id: 'debt', personName: 'Person', direction, date: '2026-10-01', amount: 10, currencyCode: 'OMR', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', payments: [{ id: 'p', date: '2026-11-10', amount: 1.237, note: 'Actual payment' }] }];
  const before = structuredClone(finance); const component = reports.find(([name]) => name === direction)[1]; render(component);
  savePreview(direction); assertFooter(); assert.match(allText(), /8\.763/); assert.doesNotMatch(allText(), /Actual payment/); openDetails('Person', component); assert.match(allText(), /Actual payment/);
  press('Export Excel'); await new Promise(resolve => setImmediate(resolve)); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /<v>8\.763<\/v>/); assert.deepEqual(finance, before);
});
test('Assets preserve verified quantity units, movements and unavailable valuations in exports', async () => {
  finance.assets = [{ id: 'gold', name: 'Gold', category: 'gold', karat: 24, openingBalanceDate: '2026-10-01', entries: [{ id: 'g1', date: '2026-10-01', amount: 1.237 }, { id: 'g2', date: '2026-11-10', amount: 0.101, note: 'Gold addition' }] }];
  const component = reports.find(([name]) => name === 'assets')[1]; const before = structuredClone(finance); render(component);
  savePreview('assets'); assertFooter(); assert.match(allText(), /1\.338/); assert.doesNotMatch(allText(), /Historical valuation unavailable/); assert.equal(nodes('Pressable').some(node => node.props.accessibilityLabel === 'Report information'), false);
  assert.doesNotMatch(allText(), /Gold addition/); openDetails('Gold', component); openDetails('Gold movements', component); assert.match(allText(), /Gold addition/); assert.match(allText(), /0\.101 Gr/);
  press('Export Excel'); await new Promise(resolve => setImmediate(resolve)); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /Quantities are in their own units/); assert.deepEqual(finance, before);
});
test('Installments retain exact scheduled decimal strings, due dates and confirmation warning', async () => {
  savedState.contracts = [{ name: 'Schedule', contract: { id: 'contract', currencyCode: 'OMR', totalAmount: '0.303', accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' }, schedule: [{ id: 's1', contractId: 'contract', kind: 'regular', dueDate: '2026-11-10', amount: '0.101' }, { id: 's2', contractId: 'contract', kind: 'regular', dueDate: '2026-12-10', amount: '0.202' }] } }];
  const before = structuredClone(savedState); freeze(savedState); const component = reports.find(([name]) => name === 'installments')[1]; render(component);
  savePreview('installments'); assertFooter(); assert.match(allText(), /0\.303/); assert.match(allText(), /0\.101/); assert.doesNotMatch(allText(), /payments are not confirmed here/); // Approved removal from report UI; export warning remains.
  assert.doesNotMatch(allText(), /confirmation required/); openDetails('Scheduled due dates', component); assert.match(allText(), /confirmation required/); assert.match(allText(), /0\.101 🇴🇲 OMR/);
  press('Export Excel'); await new Promise(resolve => setImmediate(resolve)); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /Due dates never trigger deductions/); assert.deepEqual(savedState, before);
});
test('native text guard rejects literal fragment whitespace and numeric conditional fallthrough', () => {
  assert.throws(() => assertNativeText(expand(React.createElement('View', null, React.createElement(React.Fragment, null, '      ')))), /Native raw text/);
  assert.throws(() => assertNativeText(expand(React.createElement('View', null, 0))), /Native raw text/);
  assert.doesNotThrow(() => assertNativeText(expand(React.createElement('View', null, false, null, React.createElement('AppText', null, 0)))));
});
test('single-category chart is compact, shows the exact amount and 100%, and has no giant donut', () => {
  render(reports[0][1]); assert.match(allText(), /100\.0%/);
  const donut = nodes('View').find(node => node.props.testID === 'chart-donut');
  assert.ok(donut); assert.equal(donut.props.style.width, 112); assert.equal(donut.props.style.height, 112);
  assert.equal(donut.props.accessibilityLabel, 'Donut, OMR: Salary 1.237');
  assert.equal(nodes('View').filter(node => node.props.style?.height === 132).length, 0);
});
test('Accounts exports verified engine balances to real numeric XLSX cells', async () => {
  ledger.accounts[0] = { ...ledger.accounts[0], type: 'bank', initialBalance: 1.237, openingBalanceDate: '2026-11-01' };
  const before = structuredClone(ledger); freeze(ledger); const component = reports.find(([name]) => name === 'accounts')[1]; render(component);
  savePreview('accounts-verified'); press('Currency: All currencies'); render(component); press('🇴🇲 OMR'); render(component); press('Export Excel'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.length, 1); const workbook = Buffer.from(files[0].content, 'base64'); assert.equal(workbook.readUInt32LE(0), 0x04034b50); assert.ok(workbook.includes(Buffer.from('<v>2.474</v>'))); assert.deepEqual(ledger, before);
  assertNumericCell(xlsxParts(files[0]), 'D9', '2.474');
});
for (const kind of ['income', 'expenses']) test(kind + ' statement navigation preserves exact dates, account/category and currency filters', () => {
  if (kind === 'expenses') { ledger.categories[0].kind = 'expense'; ledger.transactions[0].type = 'expense'; }
  const component = reports.find(([name]) => name === kind)[1]; render(component); press('Category: All Categories'); render(component); press('Salary'); render(component);
  press('Account: All accounts'); render(component); press('Bank 🇴🇲 OMR'); render(component); press('View Statement');
  assert.equal(calls.at(-1).pathname, '/finance/statement-' + kind);
  assert.deepEqual(calls.at(-1).params, { from: '2026-11-01', to: '2026-11-12', accountId: 'bank', categoryId: 'salary', currencyCode: 'OMR' });
  const statementScreen = require('../src/app/finance/statement-' + kind + '.tsx').default;
  params = { ...calls.at(-1).params }; states = []; componentStates = new Map(); render(statementScreen); assert.match(allText(), /1\.237 🇴🇲 OMR/);
  assert.match(allText(), /November salary/); assert.match(allText(), /Bank/); assert.match(allText(), /Salary/);
  for (const invalid of [{ currencyCode: ['OMR','USD'] }, { accountId: ['bank'] }, { categoryId: ['salary'] }, { from: '2026-02-30' }, { from: '2026-11-13' }]) {
    params = { ...calls.at(-1).params, ...invalid }; states = []; componentStates = new Map(); render(statementScreen);
    assert.match(allText(), /Invalid or missing statement filters/);
  }
});
test('all eight hydration and empty states render no raw native text', () => {
  for (const [,component] of reports) {
    ready = false; states = [{ from: '2026-11-01', to: '2026-11-12' }]; componentStates = new Map(); render(component);
    ready = true; ledger.transactions = []; ledger.accounts = []; states = [{ from: '2026-11-01', to: '2026-11-12' }]; componentStates = new Map(); render(component);
  }
});


test('four-action footer generates scoped PDF and real XLSX through Share choices', async () => {
  const component = reports[0][1], before = structuredClone({ ledger, finance });
  freeze(ledger); freeze(finance); render(component); assertFooter();
  press('Export PDF'); await new Promise(resolve => setImmediate(resolve));
  const pdf = calls.find(value => value.pdf);
  assert.ok(pdf); assert.match(pdf.pdf, /2026-11-01/); assert.match(pdf.pdf, /2026-11-12/);
  assert.match(pdf.pdf, /November salary/); assert.match(pdf.pdf, />1\.237<\/td>/);
  assert.match(pdf.pdf, /Ordinary income only/);
  assert.deepEqual(pdf.options, { width: 842, height: 595, textZoom: 100 });
  render(component); press('Export Share');
  const choices = alerts.at(-1)[2];
  assert.deepEqual(choices.map(choice => choice.text), ['PDF', 'Excel XLSX', 'Cancel']);
  choices.find(choice => choice.text === 'Excel XLSX').onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.length, 1); assertNumericCell(xlsxParts(files[0]), 'E9', '1.237');
  const share = calls.find(value => value.uri?.endsWith('.xlsx'));
  assert.equal(share.options.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual({ ledger, finance }, before);
});

const { ReportTableActions } = require('../src/features/finance/components/reporting/ReportTableActions.tsx');
const safeTable = () => ({
  title: 'Income Report', period: { from: '2026-11-01', to: '2026-11-12' },
  columns: ['Name', 'Currency', 'Amount'], rows: [['Known income', 'OMR', 1.237]],
  verified: true, notice: 'Verified evidence only.',
});
for (const [name, change] of [
  ['unverified evidence', table => { table.verified = false; }],
  ['missing amount', table => { table.rows[0][2] = null; }],
  ['empty evidence', table => { table.rows = []; }],
]) test('four-action footer blocks PDF, Excel and Share for ' + name, async () => {
  const table = safeTable(); change(table);
  render(() => React.createElement(ReportTableActions, { table, statement: () => calls.push('statement') }));
  const actions = assertFooter(); assert.equal(actions[0].props.disabled, false);
  assert.equal(actions.slice(1).every(node => node.props.disabled), true);
  for (const action of actions.slice(1)) action.props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.length, 0); assert.deepEqual(calls, []); assert.deepEqual(alerts, []);
});
for (const [name, change] of [
  ['nonfinite amount', table => { table.rows[0][2] = Infinity; }],
  ['malformed period', table => { table.period.from = '2026-02-30'; }],
  ['unsafe exact numeric string', table => { table.rows[0][2] = '9007199254740993.001'; table.numericColumns = [2]; }],
]) test('Excel handler fails closed on ' + name + ' without creating or sharing a file', async () => {
  const table = safeTable(); change(table);
  render(() => React.createElement(ReportTableActions, { table, statement: () => calls.push('statement') }));
  assertFooter(); press('Export Excel'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.length, 0); assert.deepEqual(calls, []);
  assert.equal(alerts.length, 1); assert.equal(alerts[0][0], 'Export failed');
  assert.match(alerts[0][1], /verified|safe Excel numeric precision/);
});


test('Expenses chevrons expand real transaction content and collapse without altering financial data', () => {
  ledger.categories[0].kind = 'expense'; ledger.transactions[0].type = 'expense';
  const before = structuredClone({ ledger, finance }); freeze(ledger); freeze(finance);
  const component = reports.find(([name]) => name === 'expenses')[1];
  render(component); assertFooter();
  const label = 'View all Expenses transactions';
  const closed = nodes('Pressable').find(node => node.props.accessibilityLabel === label);
  assert.ok(closed); assert.equal(closed.props.accessibilityState.expanded, false);
  assert.ok(nodes('Ionicons', closed).some(node => node.props.name === 'chevron-down'));
  assert.doesNotMatch(allText(), /November salary/);
  press(label); render(component);
  const opened = nodes('Pressable').find(node => node.props.accessibilityLabel === label);
  assert.equal(opened.props.accessibilityState.expanded, true);
  assert.ok(nodes('Ionicons', opened).some(node => node.props.name === 'chevron-up'));
  const transaction = nodes('View').find(node => node.props.testID === 'report-transaction-income');
  assert.ok(transaction); assert.match(text(transaction), /November salary/);
  assert.match(text(transaction), /1\.237 🇴🇲 OMR/); assert.match(text(transaction), /100\.0%/);
  press(label); render(component); assert.doesNotMatch(allText(), /November salary/);
  assert.deepEqual({ ledger, finance }, before);
});
