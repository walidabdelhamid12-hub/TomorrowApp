// Actual Expenses screens and shared components, with native IO/rendering mocked.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..'), load = Module._load;
let savedState, states, cursor, ledger, finance, ready, params, calls, alerts, files, tree, html;
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
  if (id === 'react') return hooks;
  if (id === '@react-native-community/datetimepicker') return { __esModule: true, default: 'DateTimePicker' };
  if (id === 'react-native') return { Platform: { OS: 'android' }, View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) } };
  if (id === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
  if (id === 'expo-router') return { useRouter: () => ({ push: value => calls.push(value), back: () => calls.push('back') }), useLocalSearchParams: () => params };
  if (id === '@/components/ui') return { Screen: 'Screen', AppText: 'AppText', Card: 'Card' };
  if (id.endsWith('/store/installmentsStorage')) return { installmentsStorage: { subscribe: () => () => {}, getState: () => savedState } };
  if (id.endsWith('/utils/shareStatementPdf')) return { shareStatementPdf: async value => calls.push({ pdf: value }) };
  if (id.endsWith('/utils/shareStatementCsv')) return { shareStatementCsv: async value => calls.push({ csv: value }) };
  if (id === '@/theme') return { moduleColors: { finance: '#10B981' }, useTheme: () => ({ colors: { text: '#111111', surface: '#FFFFFF', border: '#CCCCCC', background: '#F4F6F8' }, spacing: { xs: 4, sm: 8, md: 12, lg: 16 } }) };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerHydrated: () => ready, useLedgerStore: select => selectors(ledger)(select) };
  if (id === '@/features/finance/store/useFinanceStore') return { useFinanceHydrated: () => ready, useFinanceStore: select => selectors(finance)(select) };
  if (id === 'expo-file-system') return { File, Paths: { cache: 'file:///cache/' } };
  if (id === 'expo-print') return { printToFileAsync: async options => { assert.equal(options.width, 595); assert.equal(options.height, 842); assert.equal(options.textZoom, 100); html.push(options.html); return { base64: Buffer.from('%PDF-1.7\nfixture').toString('base64') }; } };
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
  if (typeof node.type === 'function') { const previousFrame = activeFrame, previousCursor = cursor; activeFrame = nodePath === 'root' ? null : nodePath + '/' + node.type.name; cursor = 0; const rendered = node.type(node.props); const result = expand(rendered, nodePath + '/render'); activeFrame = previousFrame; cursor = previousCursor; return result; }
  return { type: node.type, props: { ...node.props, children: expand(node.props.children, nodePath + '/children') } };
}
function assertNativeText(node, insideText = false) {
  if (Array.isArray(node)) return node.forEach(child => assertNativeText(child, insideText));
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') { assert.ok(insideText || node === '', 'Native raw text outside Text: ' + JSON.stringify(node)); return; }
  const inherited = node.type === React.Fragment ? insideText : node.type === 'AppText' || node.type === 'Text';
  assertNativeText(node.props.children, inherited);
}
function render(component) { cursor = 0; tree = expand(React.createElement(component)); assertNativeText(tree); }
function nodes(type, node) {
  if (arguments.length === 1) node = tree;
  if (Array.isArray(node)) return node.flatMap(value => nodes(type, value));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children)];
}
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node == null || typeof node === 'boolean') return ''; return typeof node === 'object' ? text(node.props.children) : String(node); }
const allText = () => nodes('AppText').map(text).join('\n');
function press(label) { const button = nodes('Pressable').find(node => node.props.accessibilityLabel === label); assert.ok(button, label); assert.ok(!button.props.disabled); button.props.onPress(); }
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
  componentStates = new Map(); activeFrame = null; savedState = { hydration: 'ready', contracts: [] }; states = [{ from: '2026-11-01', to: '2026-11-12' }]; cursor = 0; ready = true; calls = []; alerts = []; files = []; html = [];
  ledger = { accounts: [{ id: 'bank', name: 'Bank', currencyCode: 'OMR', archived: false }], categories: [{ id: 'salary', name: 'Salary', kind: 'income', icon: 'briefcase', color: '#123456' }], transfers: [], transactions: [{ id: 'income', type: 'income', amount: 1.237, currencyCode: 'OMR', accountId: 'bank', categoryId: 'salary', date: '2026-11-10', note: 'November salary' }] };
  finance = { assets: [], debts: [], loans: [], cheques: [] };
});
for (const [name, component] of reports) test(name + ' renders eight routes and compact dates without modifying stores', () => {
  if (name === 'expenses') { ledger.categories[0].kind = 'expense'; ledger.transactions[0].type = 'expense'; }
  const before = structuredClone({ ledger, finance }); freeze(ledger); freeze(finance);
  render(component); savePreview(name);
  assert.equal(nodes('Pressable').filter(node => node.props.accessibilityLabel?.startsWith('Open ')).length, 8);
  assert.ok(nodes('Pressable').some(node => node.props.accessibilityLabel === 'From date: 2026-11-01'));
  assert.ok(nodes('Pressable').some(node => node.props.accessibilityLabel === 'To date: 2026-11-12'));
  press('Open Loans report'); if (name === 'loans') assert.equal(calls.length, 0); else assert.equal(calls.at(-1), '/finance/report-loans');
  assert.deepEqual({ ledger, finance }, before);
});
test('Income retains category icons/colors, exact currency, details, account filter and previous range', () => {
  const component = reports[0][1]; render(component);
  assert.match(allText(), /Net Income|Previous Period|Change/);
  assert.match(allText(), /1\.237/);
  assert.ok(nodes('View').some(node => node.props.style?.backgroundColor === '#123456'));
  press('Cat.: All Categories'); render(component);
  assert.ok(nodes('Ionicons').some(node => node.props.name === 'briefcase' && node.props.color === '#123456'));
  press('Salary'); render(component);
  press('View all Transactions (1)'); render(component);
  assert.match(allText(), /November salary/);
  assert.ok(nodes('Ionicons').some(node => node.props.name === 'briefcase'));
  press('Acc.: All accounts'); render(component); press('Bank 🇴🇲 OMR'); render(component);
  assert.match(allText(), /1\.237/);
});
test('date controls update the period, order reversed bounds, and dismiss without changes', () => {
  const component = reports[0][1]; render(component); press('From date: 2026-11-01'); render(component);
  nodes('DateTimePicker')[0].props.onChange({ type: 'set' }, new Date(2026, 10, 15)); render(component);
  assert.match(allText(), /2026-11-15/); assert.doesNotMatch(allText(), /November salary/);
  press('To date: 2026-11-15'); render(component); nodes('DateTimePicker')[0].props.onChange({ type: 'dismissed' }); render(component);
  assert.equal(nodes('DateTimePicker').length, 0); assert.match(allText(), /2026-11-15/);
});
test('Income exports selected verified values, blocks rapid double tap and fails closed on unknown data', async () => {
  const component = reports[0][1]; render(component); press('Export Excel XLSX'); press('Export Excel XLSX'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.filter(file => file.uri.endsWith('.xlsx')).length, 1); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /<v>1\.237<\/v>/);
  ledger.transactions.push({ ...ledger.transactions[0], id: 'bad', amount: 0.0001 }); states = [{ from: '2026-11-01', to: '2026-11-12' }]; render(component);
  assert.match(allText(), /Incomplete report/);
  assert.equal(nodes('Pressable').filter(node => node.props.accessibilityLabel?.startsWith('Export ')).every(node => node.props.disabled), true);
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
  savePreview('loans'); assert.match(allText(), /1,080\.000/); assert.match(allText(), /900\.000/);
  press('View all Loan payments'); render(component); assert.match(allText(), /Late fee: 5 OMR/); assert.match(allText(), /Confirmed payment/);
  press('Export PDF'); await new Promise(resolve => setImmediate(resolve)); assert.match(calls.find(value => value.pdf).pdf, /Current principal remaining/);
  assert.deepEqual(finance, before);
  finance.loans[0].updatedAt = '2026-12-01T00:00:00Z'; states = [{ from: '2026-11-01', to: '2026-11-12' }]; render(component);
  assert.match(allText(), /Unverified history/); assert.equal(nodes('Pressable').find(node => node.props.accessibilityLabel === 'Export PDF').props.disabled, true);
});
for (const direction of ['receivable','payable']) test(direction + ' isolates counterparties, balances and collection/payment history', async () => {
  finance.debts = [{ id: 'debt', personName: 'Person', direction, date: '2026-10-01', amount: 10, currencyCode: 'OMR', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', payments: [{ id: 'p', date: '2026-11-10', amount: 1.237, note: 'Actual payment' }] }];
  const before = structuredClone(finance); const component = reports.find(([name]) => name === direction)[1]; render(component);
  savePreview(direction); assert.match(allText(), /8\.763/); press('View all ' + (direction === 'receivable' ? 'Collection history' : 'Payment history')); render(component); assert.match(allText(), /Actual payment/);
  press('Export Excel XLSX'); await new Promise(resolve => setImmediate(resolve)); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /<v>8\.763<\/v>/); assert.deepEqual(finance, before);
});
test('Assets preserve verified quantity units, movements and unavailable valuations in exports', async () => {
  finance.assets = [{ id: 'gold', name: 'Gold', category: 'gold', karat: 24, openingBalanceDate: '2026-10-01', entries: [{ id: 'g1', date: '2026-10-01', amount: 1.237 }, { id: 'g2', date: '2026-11-10', amount: 0.101, note: 'Gold addition' }] }];
  const component = reports.find(([name]) => name === 'assets')[1]; const before = structuredClone(finance); render(component);
  savePreview('assets'); assert.match(allText(), /1\.338/); assert.match(allText(), /Historical valuation unavailable/);
  press('View all Gold · Gold'); render(component); press('View all Gold movements'); render(component); assert.match(allText(), /Gold addition/); assert.match(allText(), /0\.101 g/);
  press('Export Excel XLSX'); await new Promise(resolve => setImmediate(resolve)); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /Quantities are in their own units/); assert.deepEqual(finance, before);
});
test('Installments retain exact scheduled decimal strings, due dates and confirmation warning', async () => {
  savedState.contracts = [{ name: 'Schedule', contract: { id: 'contract', currencyCode: 'OMR', totalAmount: '0.303', accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' }, schedule: [{ id: 's1', contractId: 'contract', kind: 'regular', dueDate: '2026-11-10', amount: '0.101' }, { id: 's2', contractId: 'contract', kind: 'regular', dueDate: '2026-12-10', amount: '0.202' }] } }];
  const before = structuredClone(savedState); freeze(savedState); const component = reports.find(([name]) => name === 'installments')[1]; render(component);
  savePreview('installments'); assert.match(allText(), /0\.303/); assert.match(allText(), /0\.101/); assert.match(allText(), /payments are not confirmed here/);
  press('View all Scheduled due dates'); render(component); assert.match(allText(), /confirmation required/); assert.match(allText(), /0\.101 OMR/);
  press('Export Excel XLSX'); await new Promise(resolve => setImmediate(resolve)); assert.match(Buffer.from(files[0].content, 'base64').toString('utf8'), /Due dates never trigger deductions/); assert.deepEqual(savedState, before);
});
test('native text guard rejects literal fragment whitespace and numeric conditional fallthrough', () => {
  assert.throws(() => assertNativeText(expand(React.createElement('View', null, React.createElement(React.Fragment, null, '      ')))), /Native raw text/);
  assert.throws(() => assertNativeText(expand(React.createElement('View', null, 0))), /Native raw text/);
  assert.doesNotThrow(() => assertNativeText(expand(React.createElement('View', null, false, null, React.createElement('AppText', null, 0)))));
});
test('single-category chart is compact, shows the exact amount and 100%, and has no giant donut', () => {
  render(reports[0][1]); assert.match(allText(), /1\.237 OMR · 100%/);
  assert.equal(nodes('View').filter(node => node.props.style?.height === 132).length, 0);
});
test('Accounts exports verified engine balances to real numeric XLSX cells', async () => {
  ledger.accounts[0] = { ...ledger.accounts[0], type: 'bank', initialBalance: 1.237, openingBalanceDate: '2026-11-01' };
  const before = structuredClone(ledger); freeze(ledger); const component = reports.find(([name]) => name === 'accounts')[1]; render(component);
  savePreview('accounts-verified'); press('Export Excel XLSX'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(files.length, 1); const workbook = Buffer.from(files[0].content, 'base64'); assert.equal(workbook.readUInt32LE(0), 0x04034b50); assert.ok(workbook.includes(Buffer.from('<v>2.474</v>'))); assert.deepEqual(ledger, before);
});
test('Income statement navigation preserves exact dates, account/category and currency filters', () => {
  const component = reports[0][1]; render(component); press('Cat.: All Categories'); render(component); press('Salary'); render(component);
  press('Acc.: All accounts'); render(component); press('Bank 🇴🇲 OMR'); render(component); press('View Income Statement');
  assert.deepEqual(calls.at(-1).params, { from: '2026-11-01', to: '2026-11-12', accountId: 'bank', categoryId: 'salary', currencyCode: 'OMR' });
  params = calls.at(-1).params; states = []; componentStates = new Map(); render(require('../src/app/finance/statement-income.tsx').default); assert.match(allText(), /1\.237 OMR/);
  params.currencyCode = ['OMR','USD']; states = []; componentStates = new Map(); render(require('../src/app/finance/statement-income.tsx').default); assert.match(allText(), /Invalid or missing statement filters/);
});
test('all eight hydration and empty states render no raw native text', () => {
  for (const [,component] of reports) {
    ready = false; states = [{ from: '2026-11-01', to: '2026-11-12' }]; componentStates = new Map(); render(component);
    ready = true; ledger.transactions = []; ledger.accounts = []; states = [{ from: '2026-11-01', to: '2026-11-12' }]; componentStates = new Map(); render(component);
  }
});
