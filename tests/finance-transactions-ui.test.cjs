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
const theme = { colors: { text: '#111', textSecondary: '#555', danger: '#b00', border: '#ccc' }, spacing: { xl: 24, md: 12, sm: 8 } };
function Icon(props) { return React.createElement('Icon', props); }
Icon.glyphMap = { 'cash-outline': 1 };
Module._load = function(id, parent, main) {
  if (id === 'react') return hooks;
  if (id === 'react-native') return { Modal: 'Modal', Pressable: 'Pressable', View: 'View', StyleSheet: { create: x => x, hairlineWidth: 1 } };
  if (id === '@expo/vector-icons') return { Ionicons: Icon };
  if (id === '@/components/ui') return { AppText: 'AppText', Card: 'Card' };
  if (id === '@/theme') return { useTheme: () => theme, moduleColors: { finance: '#237' } };
  if (id === '@/features/finance/store/useLedgerStore') return { useLedgerStore: Object.assign(select => select(ledger), { getState: () => ledger }) };
  if (id === '@/features/finance/store/useFinanceStore') return { useFinanceStore: Object.assign(select => select(finance), { getState: () => finance }) };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
const { lightColors, darkColors } = require('../src/theme/colors.ts');
const { TransactionsSection } = require('../src/features/finance/components/TransactionsSection.tsx');
const { getTransactionDestination, focusLinkedRecords } = require('../src/features/finance/utils/transactionNavigation.ts');
const { getTransactionDescription } = require('../src/features/finance/utils/transactionDescription.ts');
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
  const action = nodes('Pressable').find(n => n.props.accessibilityLabel === label || n.props.accessibilityLabel?.startsWith(label + ':'));
  assert.ok(action, 'Missing accessible action: ' + label);
  action.props.onPress(); render();
}
function texts() { return nodes('AppText').map(n => n.props.children).filter(t => typeof t === 'string'); }
function styles(value) { return Object.assign({}, ...[value].flat(Infinity).filter(Boolean)); }
const base = (id, day) => ({ id, amount: 123456789.12, currencyCode: 'USD', accountId: 'a', categoryId: 'c',
  date: '2026-11-' + day, createdAt: '2026-11-' + day, type: 'expense' });
beforeEach(() => {
  states = []; cursor = 0; calls = []; theme.colors = lightColors;
  ledger = { transactions: [base('first', '04'), base('second', '03'), base('third', '02')],
    transfers: [{ id: 'transfer', date: '2026-11-01', createdAt: '2026-11-01', fromAccountId: 'a', toAccountId: 'b',
      fromAmount: 123456789.12, toAmount: 99999999.123, fromCurrencyCode: 'USD', toCurrencyCode: 'OMR', type: 'internal' }],
    categories: [{ id: 'c', name: 'Long category name for Android font scaling', icon: 'cash-outline' }],
    accounts: [{ id: 'a', name: 'An account with a very long display name' }, { id: 'b', name: 'Destination account' }] };
  finance = { loans: [{ id: 'loan', payments: [] }], debts: [{ id: 'debt', direction: 'payable', payments: [] }] };
  render();
});

test('View all is accessible while collapsed and exposes all four records', () => {
  assert.ok(texts().includes('Showing 1 of 4'));
  assert.equal(nodes('Card').length, 1);
  press('View all (4)');
  assert.ok(texts().includes('Showing 4 of 4'));
  assert.equal(texts().filter(t => t === 'Long category name for Android font scaling').length, 3);
  assert.ok(texts().includes('Transfer'));
});
test('the single toggle expands all records and Show less restores the one-record preview', () => {

  assert.ok(texts().includes('Showing 1 of 4'));
  assert.equal(texts().filter(t => t === 'Long category name for Android font scaling').length, 1);
  press('View all (4)'); press('Show less');
  assert.ok(texts().includes('Showing 1 of 4'));

  assert.equal(nodes('Card').length, 1);
});
test('full amount, currency, category, date and account use uncapped scalable text', () => {

  for (const text of ['-123,456,789.12 USD', 'Long category name for Android font scaling',
    '2026-11-04 · An account with a very long display name']) {
    const element = nodes('AppText').find(n => n.props.children === text);
    assert.ok(element, text);
    assert.equal(element.props.numberOfLines, undefined);
    assert.notEqual(element.props.allowFontScaling, false);
    assert.equal(element.props.maxFontSizeMultiplier, undefined);
  }
  const row = nodes('Card')[0].props.children[0];
  assert.equal(styles(row.props.style).height, undefined);
  assert.equal(styles(row.props.style).minHeight, 60);
  assert.equal(styles(row.props.style).paddingVertical, 8);
  assert.equal(styles(row.props.style).maxHeight, undefined);
  assert.ok(nodes('View').some(n => styles(n.props.style).flexWrap === 'wrap'), 'Primary content can reflow instead of clipping money');
});
test('ordinary transaction and transfer edit/delete handlers remain usable', () => {
  press('View all (4)');
  press('Edit transaction');
  press('Delete transaction');
  press('Edit transfer');
  press('Delete transfer');
  assert.deepEqual(calls, [['edit', 'first'], ['delete', 'first'], ['editTransfer', 'transfer'], ['deleteTransfer', 'transfer']]);
});
test('transfer displays both complete amounts and source/destination account names', () => {
  press('View all (4)');
  for (const value of ['123,456,789.12 USD', '→ 99,999,999.123 OMR',
    '2026-11-01 · An account with a very long display name → Destination account']) assert.ok(texts().includes(value));
});
test('amount visibility hides both ordinary and transfer values', () => {
  press('View all (4)'); render({ amountsVisible: false });
  assert.equal(texts().some(t => t.includes('123,456,789') || t.includes('99,999,999')), false);
});
test('the entire protected row is the Manage action, with no separate action strip', () => {
  ledger.transactions = [{ ...base('linked', '04'), linkedEntityType: 'loan', linkedEntityId: 'loan' }]; ledger.transfers = [];
  render(); press('Manage loan');
  assert.deepEqual(calls, [['manage', 'linked']]);
  const row = nodes('Card')[0].props.children[0];
  assert.equal(row.type, 'Pressable');
  assert.equal(nodes('Pressable', row).length, 1);
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Transaction actions'), false);
  assert.equal(nodes('Pressable').some(n => /^(Edit|Delete) transaction$/.test(n.props.accessibilityLabel)), false);
});
test('unresolved protected ownership offers explanation action, never generic edits', () => {
  ledger.transactions = [{ ...base('unknown', '04'), purpose: 'loan_payment' }]; ledger.transfers = [];
  render(); press('Linked record unavailable');
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

test('context labels come from explicit purpose or resolved ownership, without altering categories or classification', () => {
  const purposes = { loan_payment: 'Loan payment', loan_principal_payment: 'Loan principal payment',
    loan_interest_payment: 'Loan interest payment', debt_payment: 'Debt payment', debt_collection: 'Debt collection' };
  for (const [purpose, label] of Object.entries(purposes)) {
    const tx = { ...base('linked', '04'), purpose };
    const previous = structuredClone(tx);
    assert.equal(getTransactionDescription(tx, 'Bills', null), label);
    assert.deepEqual(tx, previous);
  }
  const tx = { ...base('legacy', '04'), linkedEntityType: 'debt', linkedEntityId: 'debt' };
  finance.debts[0].direction = 'receivable';
  assert.equal(getTransactionDescription(tx, 'Other', getTransactionDestination(tx, finance)), 'Debt collection');
  assert.equal(getTransactionDescription({ ...base('plain', '04'), note: 'Loan payment' }, 'Shopping', null), 'Loan payment');
  assert.equal(getTransactionDestination({ ...base('plain', '04'), note: 'Loan payment' }, finance), null);
});

test('a protected loan payment renders a context label and no generic action controls', () => {
  ledger.transactions = [{ ...base('linked', '04'), purpose: 'loan_payment', linkedEntityType: 'loan', linkedEntityId: 'loan' }];
  ledger.transfers = [];
  const previous = structuredClone({ ledger, finance });
  render();
  assert.ok(texts().includes('Loan payment'));
  press('Manage loan');
  assert.deepEqual(calls, [['manage', 'linked']]);
  assert.deepEqual({ ledger, finance }, previous);
});

test('direct action rechecks protection before dispatching a captured ordinary Edit handler', () => {
  press('View all (4)');
  const edit = nodes('Pressable').find(n => n.props.accessibilityLabel === 'Edit transaction');
  ledger.transactions[0] = { ...ledger.transactions[0], purpose: 'loan_payment', linkedEntityType: 'loan', linkedEntityId: 'loan' };
  edit.props.onPress(); render();
  assert.deepEqual(calls, [['manage', 'first']]);
  assert.equal(nodes('Modal').some(n => n.props.visible), false);
});

test('ordinary and transfer details are read-only and Back never mutates records', () => {
  press('View all (4)'); press('Transaction details');
  assert.ok(texts().includes('Transaction details'));
  press('Back to list');
  assert.equal(nodes('Modal').some(n => n.props.visible), false);
  press('Transfer details');
  assert.ok(texts().includes('Sent: 123,456,789.12 USD'));
  assert.ok(texts().includes('Received: 99,999,999.123 OMR'));
  nodes('Modal').find(n => n.props.visible).props.onRequestClose(); render();
  assert.equal(nodes('Modal').some(n => n.props.visible), false); assert.deepEqual(calls, []);
});

test('ordinary three-decimal currency precision and dynamic sizing are preserved', () => {
  ledger.transactions = [{ ...base('precise', '04'), amount: 123.456, currencyCode: 'KWD' }]; ledger.transfers = [];
  render();
  const amount = nodes('AppText').find(n => n.props.children === '-123.456 KWD');
  assert.ok(amount); assert.equal(amount.props.numberOfLines, undefined);
  assert.equal(amount.props.adjustsFontSizeToFit, undefined); assert.notEqual(amount.props.allowFontScaling, false);
});

test('ordering stays newest date first, then creation time', () => {
  ledger.transactions = [
    { ...base('early', '04'), createdAt: '2026-11-04T08:00:00', note: 'Earlier' },
    { ...base('late', '04'), createdAt: '2026-11-04T09:00:00', note: 'Later' },
    { ...base('old', '03'), note: 'Yesterday' },
  ]; ledger.transfers = [];
  render(); press('View all (3)');
  assert.deepEqual(texts().filter(t => ['Earlier', 'Later', 'Yesterday'].includes(t)), ['Later', 'Earlier', 'Yesterday']);
});

test('header has a single-line modest title and exactly one list toggle with accurate state and chevrons', () => {
  const title = nodes('AppText').find(n => n.props.children === 'Recent Transactions');
  assert.ok(title);
  assert.equal(title.props.numberOfLines, 1);
  assert.equal(title.props.variant, 'bodyStrong');
  assert.equal(title.props.accessibilityRole, 'header');
  assert.equal(title.props.accessibilityLabel, 'Recent Transactions');
  assert.notEqual(title.props.allowFontScaling, false);
  const controls = () => nodes('Pressable').filter(n => /^(View all \(\d+\)|Show less)$/.test(n.props.accessibilityLabel));
  assert.equal(controls().length, 1);
  assert.deepEqual(controls()[0].props.accessibilityState, { expanded: false, disabled: false });
  assert.ok(nodes('Icon', controls()[0]).some(n => n.props.name === 'chevron-down'));
  assert.equal(nodes('Pressable').some(n => n.props.accessibilityLabel === 'Toggle recent transactions section'), false);
  press('View all (4)');
  assert.equal(controls().length, 1);
  assert.deepEqual(controls()[0].props.accessibilityState, { expanded: true, disabled: false });
  assert.ok(nodes('Icon', controls()[0]).some(n => n.props.name === 'chevron-up'));
  press('Show less');
  assert.equal(controls().length, 1);
  assert.ok(texts().includes('Showing 1 of 4'));
});

for (const [scheme, palette] of [['light', lightColors], ['dark', darkColors]]) {
  for (const [movement, txType, entryType, colorKey] of [
    ['outgoing expense', 'expense', 'normal', 'expense'],
    ['incoming income', 'income', 'normal', 'income'],
    ['incoming refund', 'expense', 'refund', 'income'],
  ]) {
    test(`${scheme} ${movement} amount, icon and background follow cash direction despite a misleading category color`, () => {
      theme.colors = palette;
      ledger.transactions = [{ ...base('colored', '04'), type: txType, entryType }];
      ledger.transfers = [];
      ledger.categories[0].name = colorKey === 'expense' ? 'Income' : 'Expenses';
      ledger.categories[0].color = palette[colorKey === 'expense' ? 'income' : 'expense'];
      const previous = structuredClone(ledger);
      render();
      const row = nodes('Card')[0].props.children[0];
      const amount = nodes('AppText', row).find(n => n.props.children.includes?.('123,456,789.12 USD'));
      assert.equal(amount.props.color, colorKey);
      assert.equal(nodes('Icon', row)[0].props.color, palette[colorKey]);
      assert.ok(nodes('View', row).some(n => styles(n.props.style).backgroundColor === palette[colorKey] + '18'));
      assert.deepEqual(ledger, previous);
    });
  }
  for (const type of ['internal', 'credit_card_payment']) {
    test(`${scheme} ${type} uses informative tokens for both amounts and the icon`, () => {
      theme.colors = palette; ledger.transactions = [];
      ledger.transfers[0].type = type;
      render();
      const row = nodes('Card')[0].props.children[0];
      const amounts = nodes('AppText', row).filter(n => n.props.textBreakStrategy === 'simple');
      assert.equal(amounts.length, 2);
      assert.ok(amounts.every(n => n.props.color === 'info'));
      assert.equal(nodes('Icon', row)[0].props.color, palette.info);
      assert.ok(nodes('View', row).some(n => styles(n.props.style).backgroundColor === palette.info + '18'));
    });
  }
}

test('one outlined card shares hairline dividers without nested cards or per-row shadows', () => {
  press('View all (4)');
  assert.equal(nodes('Card').length, 1);
  const card = nodes('Card')[0];
  assert.equal(card.props.variant, 'outlined');
  assert.equal(card.props.padded, false);
  const rows = card.props.children;
  assert.equal(rows.length, 4);
  rows.forEach((row, index) => {
    const style = styles(typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style);
    assert.equal(style.borderTopWidth, index ? 1 : undefined); // mocked hairlineWidth
    if (index) assert.equal(style.borderTopColor, lightColors.border);
    assert.equal(style.elevation, undefined);
    assert.equal(style.shadowOpacity, undefined);
  });
});

for (const count of [0, 1]) {
  test(`${count} records preserve correct counts and disable the unnecessary expansion`, () => {
    ledger.transactions = ledger.transactions.slice(0, count); ledger.transfers = [];
    render();
    const toggle = nodes('Pressable').find(n => n.props.accessibilityLabel === 'View all (' + count + ')');
    assert.equal(toggle.props.disabled, true);
    assert.deepEqual(toggle.props.accessibilityState, { expanded: false, disabled: true });
    assert.ok(texts().includes('Showing ' + count + ' of ' + count));
    assert.equal(nodes('Card').length, 1);
  });
}

test('protected rows retain expense semantics and hide money in both text and accessibility when privacy is enabled', () => {
  ledger.transactions = [{ ...base('linked', '04'), purpose: 'loan_payment', linkedEntityType: 'loan', linkedEntityId: 'loan' }];
  ledger.transfers = [];
  render({ amountsVisible: false });
  const row = nodes('Card')[0].props.children[0];
  assert.equal(row.type, 'Pressable');
  assert.equal(nodes('Icon', row)[0].props.color, lightColors.expense);
  assert.ok(!row.props.accessibilityLabel.includes('123,456,789'));
  assert.ok(row.props.accessibilityLabel.includes('••••••'));
  assert.equal(nodes('Pressable', row).length, 1);
  row.props.onPress();
  assert.deepEqual(calls, [['manage', 'linked']]);
});
