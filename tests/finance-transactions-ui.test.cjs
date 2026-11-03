// Exercises the real component's elements/handlers with mocked native primitives.
// This does not measure Yoga layout or Android text rendering.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const load = Module._load;
let ledger, finance, states, cursor;
const hooks = { ...React, useMemo: fn => fn(), useState: initial => {
  const key = cursor++;
  if (!(key in states)) states[key] = initial;
  return [states[key], value => { states[key] = typeof value === 'function' ? value(states[key]) : value; }];
} };
const theme = { colors: { text: '#111', textSecondary: '#555', danger: '#b00', border: '#ccc' }, spacing: { xl: 24, md: 12 } };
function Icon(props) { return React.createElement('Icon', props); }
Icon.glyphMap = { 'cash-outline': 1 };
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { Pressable: 'Pressable', View: 'View', StyleSheet: { create: x => x, hairlineWidth: 1 } };
  if (id === '@expo/vector-icons') return { Ionicons: Icon };
  if (id === '@/components/ui') return { AppText: 'AppText', Card: 'Card' };
  if (id === '@/theme') return { useTheme: () => theme, moduleColors: { finance: '#237' } };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerStore: select => select(ledger) };
  if (id === '@/features/finance/store/useFinanceStore') return { useFinanceStore: select => select(finance) };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
const { TransactionsSection } = require('../src/features/finance/components/TransactionsSection.tsx');
const { getTransactionDestination, focusLinkedRecords } = require('../src/features/finance/utils/transactionNavigation.ts');
let calls, tree;
const props = () => ({ amountsVisible: true,
  onEdit: x => calls.push(['edit', x.id]), onDelete: x => calls.push(['delete', x.id]),
  onEditTransfer: x => calls.push(['editTransfer', x.id]), onDeleteTransfer: x => calls.push(['deleteTransfer', x.id]),
  onManage: x => calls.push(['manage', x.id]),
});
function expand(node) {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } };
}
function render(overrides) { cursor = 0; tree = expand(TransactionsSection({ ...props(), ...overrides })); return tree; }
function nodes(type, node) {
  if (arguments.length === 1) node = tree;
  if (Array.isArray(node)) return node.flatMap(n => nodes(type, n));
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...nodes(type, node.props.children)];
}
function press(label) {
  const action = nodes('Pressable').find(n => n.props.accessibilityLabel === label);
  assert.ok(action, 'Missing accessible action: ' + label);
  action.props.onPress(); render();
}
function texts() { return nodes('AppText').map(n => n.props.children).filter(t => typeof t === 'string'); }
function styles(value) { return Object.assign({}, ...[value].flat(Infinity).filter(Boolean)); }
const base = (id, day) => ({ id, amount: 123456789.12, currencyCode: 'USD', accountId: 'a', categoryId: 'c',
  date: '2026-11-' + day, createdAt: '2026-11-' + day, type: 'expense' });
beforeEach(() => {
  states = []; cursor = 0; calls = [];
  ledger = { transactions: [base('first', '04'), base('second', '03'), base('third', '02')],
    transfers: [{ id: 'transfer', date: '2026-11-01', createdAt: '2026-11-01', fromAccountId: 'a', toAccountId: 'b',
      fromAmount: 123456789.12, toAmount: 99999999.123, fromCurrencyCode: 'USD', toCurrencyCode: 'OMR', type: 'internal' }],
    categories: [{ id: 'c', name: 'Long category name for Android font scaling', icon: 'cash-outline' }],
    accounts: [{ id: 'a', name: 'An account with a very long display name' }, { id: 'b', name: 'Destination account' }] };
  finance = { loans: [{ id: 'loan', payments: [] }], debts: [{ id: 'debt', direction: 'payable', payments: [] }] };
  render();
});

test('View all is accessible while collapsed and exposes all four records', () => {
  assert.ok(texts().includes('4 total'));
  assert.equal(nodes('Card').length, 0);
  press('View all (4)');
  assert.ok(texts().includes('Showing 4 of 4'));
  assert.equal(texts().filter(t => t === 'Long category name for Android font scaling').length, 3);
  assert.ok(texts().includes('Transfer'));
});
test('preview explicitly shows one of four; show less and collapse retain existing behavior', () => {
  press('Toggle recent transactions section');
  assert.ok(texts().includes('Showing 1 of 4'));
  assert.equal(texts().filter(t => t === 'Long category name for Android font scaling').length, 1);
  press('View all (4)'); press('Show less');
  assert.ok(texts().includes('Showing 1 of 4'));
  press('Toggle recent transactions section');
  assert.equal(nodes('Card').length, 0);
});
test('full amount, currency, category, date and account use uncapped scalable text', () => {
  press('Toggle recent transactions section');
  for (const text of ['-123,456,789.12 USD', 'Long category name for Android font scaling',
    '2026-11-04', 'Account: An account with a very long display name']) {
    const element = nodes('AppText').find(n => n.props.children === text);
    assert.ok(element, text);
    assert.equal(element.props.numberOfLines, undefined);
    assert.notEqual(element.props.allowFontScaling, false);
    assert.equal(element.props.maxFontSizeMultiplier, undefined);
  }
  const row = nodes('Card')[0].props.children[0];
  assert.equal(styles(row.props.style).height, undefined);
  assert.equal(styles(row.props.style).flexDirection, undefined, 'Rows stack instead of crowding all content horizontally');
});
test('ordinary transaction and transfer edit/delete handlers remain usable', () => {
  press('View all (4)');
  press('Edit transaction'); press('Delete transaction'); press('Edit transfer'); press('Delete transfer');
  assert.deepEqual(calls, [['edit', 'first'], ['delete', 'first'], ['editTransfer', 'transfer'], ['deleteTransfer', 'transfer']]);
});
test('transfer displays both complete amounts and source/destination account names', () => {
  press('View all (4)');
  for (const value of ['123,456,789.12 USD', '→ 99,999,999.123 OMR',
    'From: An account with a very long display name', 'To: Destination account']) assert.ok(texts().includes(value));
});
test('amount visibility hides both ordinary and transfer values', () => {
  press('View all (4)'); render({ amountsVisible: false });
  assert.equal(texts().some(t => t.includes('123,456,789') || t.includes('99,999,999')), false);
});
test('protected transaction exposes a functional Manage action instead of generic mutation controls', () => {
  ledger.transactions = [{ ...base('linked', '04'), linkedEntityType: 'loan', linkedEntityId: 'loan' }]; ledger.transfers = [];
  render(); press('Toggle recent transactions section'); press('Manage loan');
  assert.deepEqual(calls, [['manage', 'linked']]);
  assert.equal(nodes('Pressable').some(n => /^(Edit|Delete) transaction$/.test(n.props.accessibilityLabel)), false);
});
test('unresolved protected ownership offers explanation action, never generic edits', () => {
  ledger.transactions = [{ ...base('unknown', '04'), purpose: 'loan_payment' }]; ledger.transfers = [];
  render(); press('Toggle recent transactions section'); press('Linked record unavailable');
  assert.deepEqual(calls, [['manage', 'unknown']]);
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Edit transaction'), false);
});
test('touch targets are at least 48 points without fixed content heights', () => {
  press('View all (4)');
  for (const n of nodes('Pressable')) {
    const style = styles(typeof n.props.style === 'function' ? n.props.style({ pressed: false }) : n.props.style);
    assert.ok(style.minHeight >= 48);
    assert.equal(style.height, undefined);
  }
});

test('navigation targets existing explicit loan and debt IDs, including debt direction', () => {
  assert.deepEqual(getTransactionDestination({ id: 't', linkedEntityType: 'loan', linkedEntityId: 'loan' }, finance),
    { label: 'Manage loan', href: { pathname: '/finance/loans', params: { loanId: 'loan' } } });
  assert.deepEqual(getTransactionDestination({ id: 't', linkedEntityType: 'debt', linkedEntityId: 'debt' }, finance),
    { label: 'Manage debt', href: { pathname: '/finance/debts', params: { debtId: 'debt', direction: 'payable' } } });
  finance.debts[0].direction = 'receivable';
  assert.equal(getTransactionDestination({ id: 't', linkedEntityId: 'debt' }, finance).href.params.direction, 'receivable');
});
test('exact reverse payment and receipt references support legacy navigation without relinking', () => {
  finance.loans[0].payments = [{ id: 'payment', ledgerTransactionId: 'legacy' }];
  finance.loans[0].receiptTransactionId = 'receipt';
  const previous = structuredClone(finance);
  assert.equal(getTransactionDestination({ id: 'legacy' }, finance).href.params.loanId, 'loan');
  assert.equal(getTransactionDestination({ id: 'receipt' }, finance).href.params.loanId, 'loan');
  assert.deepEqual(finance, previous);
});
test('missing, duplicate or conflicting ownership never navigates to an unrelated record', () => {
  for (const tx of [{ id: 't', purpose: 'loan_payment' }, { id: 't', linkedEntityId: 'missing' },
    { id: 't', linkedEntityId: 'loan', purpose: 'debt_payment' }, { id: 't', note: 'Loan', amount: 100, date: '2026-11-04' }]) {
    assert.equal(getTransactionDestination(tx, finance), null);
  }
  finance.debts[0].payments = [{ id: 'dp', ledgerTransactionId: 't' }];
  assert.equal(getTransactionDestination({ id: 't', linkedEntityType: 'loan', linkedEntityId: 'loan' }, finance), null);
  finance.loans.push({ id: 'loan', payments: [] });
  assert.equal(getTransactionDestination({ id: 'other', linkedEntityType: 'loan', linkedEntityId: 'loan' }, finance), null);
});
test('focused routes never substitute another record when the target disappears or is ambiguous', () => {
  const records = [{ id: 'one' }, { id: 'two' }];
  assert.deepEqual(focusLinkedRecords(records, 'two'), [{ id: 'two' }]);
  assert.deepEqual(focusLinkedRecords(records, 'missing'), []);
  assert.deepEqual(focusLinkedRecords([...records, { id: 'two' }], 'two'), []);
  assert.deepEqual(focusLinkedRecords(records, ['one', 'two']), []);
  assert.deepEqual(focusLinkedRecords(records, undefined), records);
});

test('conflicting payment IDs and shared reverse references cannot select a destination', () => {
  finance.debts[0].payments = [{ id: 'dp', ledgerTransactionId: 'another-cash-entry' }];
  assert.equal(getTransactionDestination({ id: 't', linkedEntityType: 'loan', linkedEntityId: 'loan', linkedPaymentId: 'dp' }, finance), null);
  finance.debts[0].payments = [{ id: 'dp', ledgerTransactionId: 'shared' }];
  finance.loans[0].payments = [{ id: 'lp', ledgerTransactionId: 'shared' }];
  assert.equal(getTransactionDestination({ id: 'shared' }, finance), null);
});
