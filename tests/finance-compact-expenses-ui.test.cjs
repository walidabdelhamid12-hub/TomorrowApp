// Actual Expenses screens and shared components, with native IO/rendering mocked.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..'), load = Module._load;
let states, cursor, ledger, finance, ready, params, calls, alerts, files, tree, html;
const hooks = { ...React, useMemo: fn => fn(), useState: initial => {
  const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
  return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
}, useRef: initial => { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; } };
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
  if (id === '@/components/ui') return { Screen: 'Screen', AppText: 'AppText' };
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
const Report = require('../src/app/finance/report-expenses.tsx').default;
const Reports = require('../src/app/finance/reports.tsx').default;
const Statement = require('../src/app/finance/statement-expenses.tsx').default;
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } };
}
function render(component = Report) { cursor = 0; if (component === Report && !states.length) states[0] = { from: '2026-11-01', to: '2026-11-30' }; tree = expand(React.createElement(component)); }
function nodes(type, node) {
  if (arguments.length === 1) node = tree;
  if (Array.isArray(node)) return node.flatMap(value => nodes(type, value));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children)];
}
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node == null || typeof node === 'boolean') return ''; return typeof node === 'object' ? text(node.props.children) : String(node); }
const allText = () => nodes('AppText').map(text).join('\n');
const button = label => { const result = nodes('Pressable').find(node => node.props.accessibilityLabel === label); assert.ok(result, label); return result; };
const press = label => { const node = button(label); assert.ok(!node.props.disabled, label); node.props.onPress(); };
const flush = () => new Promise(resolve => setImmediate(resolve));
const tx = (id, amount, extra = {}) => ({ id, amount, type: 'expense', date: '2026-11-10', accountId: 'bank', currencyCode: 'EGP', categoryId: 'food', note: 'Groceries', ...extra });
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } };
beforeEach(() => {
  states = []; cursor = 0; ready = true; params = {}; calls = []; alerts = []; files = []; html = [];
  ledger = { accounts: [{ id: 'bank', name: 'Bank', currencyCode: 'EGP', archived: false }, { id: 'oman', name: 'Oman', currencyCode: 'OMR', archived: true }],
    categories: [{ id: 'food', name: 'Food', kind: 'expense' }, { id: 'travel', name: 'Travel', kind: 'expense' }], transfers: [],
    transactions: [tx('a', 100), tx('refund', 20, { entryType: 'refund', relatedTransactionId: 'a', note: 'Refund' }),
      tx('omr', 1.237, { accountId: 'oman', currencyCode: 'OMR', categoryId: 'travel', note: 'Taxi in Muscat', originalAmount: 150, originalCurrencyCode: 'EGP', accountFxRate: 0.008246 }),
      tx('previous', 50, { date: '2026-10-15' })] };
  finance = { assets: [], debts: [], loans: [], cheques: [] };
});

test('compact Expenses has eight real report tabs, one chart, three per-currency summaries and signed refund rows', () => {
  render(); assert.match(allText(), /2026-11-01/); assert.match(allText(), /Net Expenses/);
  assert.match(allText(), /80\.00/); press('View all Expenses transactions'); render(); assert.match(allText(), /-20\.00 EGP/);
  for (const name of ['Income','Expenses','Accounts','Assets','Installments','Loans','Receivable','Payable']) assert.ok(button(`Open ${name} report`));
  assert.equal(nodes('View').filter(node => node.props.testID?.startsWith('chart-')).length, 1);
  press('Vertical Bar'); render(); assert.ok(nodes('View').some(node => node.props.testID === 'chart-vertical'));
  press('Horizontal Bar'); render(); assert.ok(nodes('View').some(node => node.props.testID === 'chart-horizontal'));
  assert.equal(nodes('View').filter(node => node.props.testID?.startsWith('chart-')).length, 1);
});

test('Expenses currency selection never combines EGP and OMR and statement preserves exact filters', () => {
  render(); press('Currency: 🇪🇬 EGP'); render(); press('🇴🇲 OMR'); render();
  assert.match(allText(), /1\.237/); assert.match(allText(), /🇴🇲/);
  assert.doesNotMatch(allText(), /report-transaction-a/);
  assert.equal(nodes('View').filter(node => node.props.testID?.startsWith('report-transaction-')).length, 0);
  press('View all Expenses transactions'); render();
  assert.deepEqual(nodes('View').filter(node => node.props.testID?.startsWith('report-transaction-')).map(node => node.props.testID), ['report-transaction-omr']);
  assert.equal(calls.length, 0, 'Inline expansion must not navigate');
  assert.match(allText(), /Taxi in Muscat/);
  press('View all Expenses transactions'); render();
  assert.equal(nodes('View').filter(node => node.props.testID?.startsWith('report-transaction-')).length, 0);
  params = { from: '2026-11-01', to: '2026-11-30', currencyCode: 'OMR' }; states = []; render(Statement);
  assert.match(allText(), /1\.237 OMR/); assert.match(allText(), /Taxi in Muscat/); assert.doesNotMatch(allText(), /100\.00 EGP/);
});

test('month/account/category controls retain full refund context and preserve archived filters', () => {
  render(); press('Acc.: All accounts'); render(); press('Oman 🇴🇲 OMR · Archived'); render();
  press('Cat.: All Categories'); render(); press('Travel'); render();
  press('View all Expenses transactions'); render();
  assert.equal(calls.length, 0);
  assert.deepEqual(nodes('View').filter(node => node.props.testID?.startsWith('report-transaction-')).map(node => node.props.testID), ['report-transaction-omr']);
  assert.match(allText(), /1\.237 OMR/);
  press('From date: 2026-11-01'); render();
  assert.equal(nodes('DateTimePicker').length, 1);
});

test('Expenses exports exact selected OMR rows to readable A4 PDF and Excel XLSX without mutation', async () => {
  const before = structuredClone({ ledger, finance }); freeze(ledger); freeze(finance);
  render(); press('Currency: 🇪🇬 EGP'); render(); press('🇴🇲 OMR'); render();
  press('Export PDF'); press('Export PDF'); await flush();
  assert.equal(html.length, 1, 'Synchronous export lock blocks rapid double-tap');
  assert.match(html[0], /size:A4 portrait;margin:10mm/); assert.match(html[0], /OMR · Omani Rial/);
  assert.match(html[0], /aria-label="Oman"/); assert.match(html[0], /1\.237/);
  assert.doesNotMatch(html[0], /Groceries|100\.00/);
  render(); press('Export Excel XLSX'); await flush();
  const workbook = files.find(file => file.uri.endsWith('.xlsx'));
  assert.ok(workbook); assert.equal(workbook.options.encoding, 'base64');
  const bytes = Buffer.from(workbook.content, 'base64');
  assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(bytes.includes(Buffer.from('Taxi in Muscat')));
  assert.ok(bytes.includes(Buffer.from('<v>1.237</v>')));
  assert.equal(alerts.length, 0);
  assert.deepEqual({ ledger, finance }, before);
});

test('Share offers functional format choices and incomplete data blocks every export', async () => {
  render(); press('Export Share');
  const choice = alerts.at(-1)[2].find(item => item.text === 'Excel XLSX');
  choice.onPress(); await flush(); assert.ok(files.some(file => file.uri.endsWith('.xlsx')));
  ledger.transactions.push(tx('bad', 0.001)); states = []; render();
  assert.match(allText(), /Incomplete report/);
  for (const label of ['Export PDF','Export Excel XLSX','Export Share']) assert.equal(button(label).props.disabled, true);
});

test('statement rejects repeated/unsupported currency parameters and keeps exports unavailable before hydration', () => {
  for (const currencyCode of [['OMR','EGP'], '', 'JPY', ' OMR']) {
    params = { from: '2026-11-01', to: '2026-11-30', currencyCode }; states = []; render(Statement);
    assert.match(allText(), /Invalid or missing statement filters/);
    assert.equal(nodes('Pressable').some(node => node.props.accessibilityLabel === 'Export PDF'), false);
  }
  ready = false; params = { from: '2026-11-01', to: '2026-11-30', currencyCode: 'OMR' }; states = []; render(Statement);
  assert.equal(nodes('ActivityIndicator').length, 1); assert.equal(files.length, 0);
});

test('negative-only categories have no chart segments and retain actual signed rows', () => {
  ledger.transactions = [tx('purchase', 100, { date: '2026-10-01' }), tx('r', 20, { entryType: 'refund', relatedTransactionId: 'purchase' })];
  render(); assert.match(allText(), /No positive net expenses to chart/);
  press('View all Expenses transactions'); render(); assert.match(allText(), /-20\.00 EGP/);
  assert.equal(nodes('View').some(node => node.props.testID?.startsWith('chart-')), false);
});

test('statement row remains horizontal and horizontally scrollable without truncating long descriptions', () => {
  params = { from: '2026-11-01', to: '2026-11-30', currencyCode: 'OMR' };
  ledger.transactions[2].note = '<script>long & Arabic وصف</script>';
  render(Statement);
  assert.ok(nodes('ScrollView').some(node => node.props.horizontal));
  assert.ok(nodes('View').filter(node => node.props.testID?.startsWith('report-transaction-')).every(node => node.props.style.flexDirection === 'row'));
  assert.ok(nodes('AppText').every(node => node.props.numberOfLines === undefined));
});

test('Expenses branded PDF escapes descriptions, preserves refund precision, and rejects unverified rows', () => {
  const { buildCompactExpensesPrintHtml } = require('../src/features/finance/utils/compactExpensesPrintHtml.ts');
  const statement = { reconciled: true, report: { unknown: [] }, rows: [{ id: 'refund', date: '2026-11-10',
    accountId: 'oman', categoryId: 'travel', currencyCode: 'OMR', amount: -1.237, note: '<script>alert(1)</script> & "taxi"' }] };
  const names = { accounts: new Map([['oman','Oman account']]), categories: new Map([['travel','Travel']]) };
  const period = { from: '2026-11-01', to: '2026-11-30' };
  const before = structuredClone(statement); freeze(statement);
  const document = buildCompactExpensesPrintHtml(statement, period, names);
  assert.match(document, /&lt;script&gt;/); assert.doesNotMatch(document, /<script>/);
  assert.match(document, /-1\.237/); assert.match(document, /OMR · Omani Rial/);
  assert.match(document, /table-header-group/); assert.match(document, /page-break-inside:avoid/);
  assert.deepEqual(statement, before);
  assert.throws(() => buildCompactExpensesPrintHtml({ ...statement, reconciled: false }, period, names), /verified/);
  assert.throws(() => buildCompactExpensesPrintHtml({ ...statement, report: { unknown: [{ id: 'bad' }] } }, period, names), /verified/);
  assert.throws(() => buildCompactExpensesPrintHtml(statement, period, { ...names, accounts: new Map() }), /missing/);
});


test('Reports entry retains eight routes in two columns with Finance icons', () => {
  render(Reports);
  const grid = nodes('View').find(node => node.props.testID === 'reports-grid');
  assert.ok(grid); assert.equal(grid.props.style.flexWrap, 'wrap');
  const entries = nodes('Pressable').filter(node => node.props.accessibilityLabel?.startsWith('Open '));
  assert.equal(entries.length, 8); assert.ok(entries.every(node => node.props.style.width === '48%'));
  press('Open Expenses report'); assert.equal(calls.at(-1), '/finance/report-expenses');
  assert.ok(nodes('Ionicons').some(node => node.props.name === 'trending-down-outline'));
});

test('polished Expenses keeps comparison in summaries, View all beside Transactions, and three export actions', () => {
  render();
  assert.match(allText(), /Net Expenses/); assert.match(allText(), /Previous Period/); assert.match(allText(), /Change/);
  assert.match(allText(), /All Categories/); assert.doesNotMatch(allText(), /Previous-period comparison|View Statement/);
  assert.ok(nodes('Ionicons').filter(node => node.props.name === 'trending-down-outline').length >= 2);
  assert.deepEqual(nodes('Pressable').filter(node => node.props.accessibilityLabel?.startsWith('Export ')).map(node => node.props.accessibilityLabel),
    ['Export PDF', 'Export Excel XLSX', 'Export Share']);
  press('Acc.: All accounts'); render(); press('Oman 🇴🇲 OMR · Archived'); render();
  assert.match(allText(), /Previous Period/);
});

test('branded PDF retains metadata, navy header, three summary cards, stripes, Arabic direction and A4 scale', () => {
  const { buildCompactExpensesPrintHtml } = require('../src/features/finance/utils/compactExpensesPrintHtml.ts');
  const sample = { reconciled: true, report: { unknown: [] }, rows: Array.from({ length: 80 }, (_, i) => ({
    id: String(i), date: '2026-11-10', accountId: 'oman', categoryId: 'travel', currencyCode: 'OMR', amount: -1.237, note: 'وصف عربي طويل '.repeat(4),
  })) };
  const names = { accounts: new Map([['oman','Oman']]), categories: new Map([['travel','Travel']]) };
  const document = buildCompactExpensesPrintHtml(sample, { from: '2026-11-01', to: '2026-11-30' }, names);
  for (const marker of ['TOMORROW', 'FINANCIAL STATEMENT', 'REPORT PERIOD', 'Report Type', 'Transactions', 'Currencies (1)', 'background:#142b49', 'tr.alternate', 'font-size:11pt', 'width:190mm', 'dir="auto"', 'table-header-group', 'page-break-inside:avoid']) assert.ok(document.includes(marker), marker);
  assert.equal((document.match(/<tr class=/g) ?? []).length, 80);
  assert.match(document, /aria-label="Oman"/);
});
