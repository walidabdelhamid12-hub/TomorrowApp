// Dependency-free runner for the actual TypeScript stores. Only native storage is mocked.
const { test, beforeEach, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const storage = new Map();
const load = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@react-native-async-storage/async-storage') return {
    getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async key => { storage.delete(key); },
  };
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);

const { useLedgerStore: ledger } = require('../src/features/finance/store/useLedgerStore.ts');
const { useFinanceStore: finance } = require('../src/features/finance/store/useFinanceStore.ts');
const { editLinkedPayment, reverseLinkedPayment, postLinkedPayment, confirmLoanReceipt } =
  require('../src/features/finance/store/paymentOperations.ts');
const { getAccountBalance } = require('../src/features/finance/utils/ledger.ts');
const { getLoanRemainingAmount, getDebtRemaining } = require('../src/features/finance/utils/finance.ts');
const originalFinance = { ...finance.getState() };
const originalLedger = { ...ledger.getState() };
const date = '2026-11-04';
const stamps = { createdAt: date, updatedAt: date };
const loanRef = { entityType: 'loan', entityId: 'loan', paymentId: 'lp' };
const debtRef = { entityType: 'debt', entityId: 'debt', paymentId: 'dp' };
const edit = { amount: 150, date: '2026-11-05', latePaymentFee: 8 };
const account = id => ({ ...stamps, id, name: id, type: 'bank', currencyCode: 'USD', initialBalance: 2000, archived: false });
const loan = () => ({ ...stamps, id: 'loan', name: 'Loan', lenderName: 'Lender', principalAmount: 1000,
  totalRepaymentAmount: 1200, monthlyInstallment: 100, numberOfInstallments: 12, currencyCode: 'USD',
  firstDueDate: date, receivedAt: date, receivedAmount: 1000, status: 'active', payments: [
    { id: 'lp', amount: 100, latePaymentFee: 5, paymentMode: 'simple', accountId: 'a', date, ledgerTransactionId: 'lt' },
  ] });
const debt = () => ({ ...stamps, id: 'debt', personName: 'Person', direction: 'payable', amount: 500,
  currencyCode: 'USD', date, payments: [ { id: 'dp', amount: 50, accountId: 'a', date, ledgerTransactionId: 'dt' } ] });
const tx = (id, entityType, entityId, paymentId, amount, purpose) => ({ ...stamps, id, type: 'expense',
  entryType: 'normal', amount, accountId: 'a', currencyCode: 'USD', categoryId: 'out', date,
  linkedEntityType: entityType, linkedEntityId: entityId, linkedPaymentId: paymentId, purpose });
const snapshot = () => structuredClone({ loans: finance.getState().loans, debts: finance.getState().debts,
  transactions: ledger.getState().transactions });
const balance = id => getAccountBalance(ledger.getState().accounts.find(a => a.id === id),
  ledger.getState().transactions, ledger.getState().transfers);
function changeLoan(fn) { finance.setState(s => ({ loans: s.loans.map(fn) })); }
function changeDebt(fn) { finance.setState(s => ({ debts: s.debts.map(fn) })); }
function changeTx(id, fn) { ledger.setState(s => ({ transactions: s.transactions.map(t => t.id === id ? fn(t) : t) })); }
function assertRejected(fn) { const previous = snapshot(); assert.equal(fn().ok, false); assert.deepEqual(snapshot(), previous); }

before(async () => { await Promise.all([ledger.persist.rehydrate(), finance.persist.rehydrate()]); });
beforeEach(() => {
  finance.setState({ ...originalFinance, loans: [loan()], debts: [debt()] });
  ledger.setState({ ...originalLedger, accounts: [account('a'), account('b')], transfers: [],
    categories: [ { id: 'out', kind: 'expense', name: 'Other', icon: 'cash', color: '#000' },
      { id: 'in', kind: 'income', name: 'Other income', icon: 'cash', color: '#000' } ],
    transactions: [tx('lt', 'loan', 'loan', 'lp', 105, 'loan_payment'), tx('dt', 'debt', 'debt', 'dp', 50, 'debt_payment')] });
});

test('direct generic edits and deletes cannot alter linked loan/debt transactions', () => {
  const previous = snapshot();
  for (const id of ['lt', 'dt']) {
    assert.equal(ledger.getState().updateTransaction(id, { amount: 999, accountId: 'b' }), false);
    assert.equal(ledger.getState().removeTransaction(id), false);
  }
  assert.deepEqual(snapshot(), previous);
});

for (const purpose of ['debt_payment', 'debt_collection', 'loan_payment', 'loan_principal_payment', 'loan_interest_payment']) {
  test(`purpose-only legacy ${purpose} is protected without guessing an owner`, () => {
    ledger.setState({ transactions: [{ ...tx('old', undefined, undefined, undefined, 10, purpose) }] });
    assert.equal(ledger.getState().updateTransaction('old', { amount: 20 }), false);
    assert.equal(ledger.getState().removeTransaction('old'), false);
    assertRejected(() => editLinkedPayment(loanRef, edit));
  });
}

test('exact reverse-only legacy link is protected and dedicated edits preserve its metadata', () => {
  changeTx('lt', t => { const copy = { ...t }; for (const key of ['purpose', 'linkedEntityType', 'linkedEntityId', 'linkedPaymentId']) delete copy[key]; return copy; });
  assert.equal(ledger.getState().removeTransaction('lt'), false);
  assert.equal(editLinkedPayment(loanRef, edit).ok, true);
  assert.equal(finance.getState().loans[0].payments[0].amount, 150);
  assert.equal(ledger.getState().transactions[0].amount, 158);
  assert.equal(ledger.getState().transactions[0].purpose, undefined);
});

test('dedicated loan edit moves account cash including fee while reducing contract only by installment', () => {
  assert.equal(editLinkedPayment(loanRef, { ...edit, accountId: 'b', note: 'Changed' }).ok, true);
  assert.equal(balance('a'), 1950);
  assert.equal(balance('b'), 1842);
  assert.equal(getLoanRemainingAmount(finance.getState().loans[0]), 1050);
  assert.equal(finance.getState().loans[0].payments[0].ledgerTransactionId, 'lt');
});

test('dedicated loan reversal restores cash and contract once', () => {
  assert.equal(reverseLinkedPayment(loanRef).ok, true);
  assert.equal(balance('a'), 1950);
  assert.equal(getLoanRemainingAmount(finance.getState().loans[0]), 1200);
  assertRejected(() => reverseLinkedPayment(loanRef));
});

for (const direction of ['payable', 'receivable']) {
  test(`dedicated debt ${direction} edit and reversal preserve balance rules`, () => {
    changeDebt(d => ({ ...d, direction }));
    changeTx('dt', t => ({ ...t, type: direction === 'receivable' ? 'income' : 'expense',
      purpose: direction === 'receivable' ? 'debt_collection' : 'debt_payment',
      categoryId: direction === 'receivable' ? 'in' : 'out' }));
    assert.equal(editLinkedPayment(debtRef, { amount: 80, date }).ok, true);
    assert.equal(getDebtRemaining(finance.getState().debts[0]), 420);
    assert.equal(balance('a'), direction === 'receivable' ? 1975 : 1815);
    assert.equal(reverseLinkedPayment(debtRef).ok, true);
    assert.equal(balance('a'), 1895);
    assert.equal(getDebtRemaining(finance.getState().debts[0]), 500);
  });
}

test('generic refunds of payment expenses are rejected at the ledger store', () => {
  for (const id of ['lt', 'dt']) {
    assert.equal(ledger.getState().addTransaction({ type: 'expense', entryType: 'refund', relatedTransactionId: id,
      amount: 10, accountId: 'a', categoryId: 'out', date }), null);
  }
});

test('preexisting refunds block dedicated editing/reversal without deleting either record', () => {
  ledger.setState(s => ({ transactions: [...s.transactions, { ...tx('refund', undefined, undefined, undefined, 10),
    entryType: 'refund', relatedTransactionId: 'lt' }] }));
  assertRejected(() => editLinkedPayment(loanRef, edit));
  assertRejected(() => reverseLinkedPayment(loanRef));
});

test('ordinary transactions still support editing, refunds, and existing deletion checks', () => {
  const id = ledger.getState().addTransaction({ type: 'expense', amount: 100, accountId: 'a', categoryId: 'out', date });
  assert.equal(ledger.getState().updateTransaction(id, { amount: 110 }), true);
  assert.equal(ledger.getState().updateTransaction(id, { linkedEntityType: 'loan' }), false);
  const refundId = ledger.getState().addTransaction({ type: 'expense', entryType: 'refund', relatedTransactionId: id,
    amount: 10, accountId: 'a', categoryId: 'out', date });
  assert.ok(refundId);
  assert.equal(ledger.getState().removeTransaction(id), false);
  assert.equal(ledger.getState().removeTransaction(refundId), true);
  assert.equal(ledger.getState().removeTransaction(id), true);
});

test('unique explicit debt tuple can be recovered during dedicated edit only', () => {
  changeDebt(d => ({ ...d, payments: d.payments.map(p => ({ ...p, ledgerTransactionId: undefined })) }));
  assert.equal(finance.getState().debts[0].payments[0].ledgerTransactionId, undefined);
  assert.equal(editLinkedPayment(debtRef, { amount: 75, date }).ok, true);
  assert.equal(finance.getState().debts[0].payments[0].ledgerTransactionId, 'dt');
});

test('unique explicit unlinked debt tuple can be reversed without inventing a link', () => {
  changeDebt(d => ({ ...d, payments: d.payments.map(p => ({ ...p, ledgerTransactionId: undefined })) }));
  assert.equal(reverseLinkedPayment(debtRef).ok, true);
  assert.equal(finance.getState().debts[0].payments.length, 0);
});

for (const variant of ['duplicate-tuple', 'wrong-owner', 'wrong-amount', 'wrong-currency', 'wrong-type', 'shared-reference', 'split-purpose', 'missing-id']) {
  test(`ambiguous or inconsistent legacy ${variant} is rejected unchanged`, () => {
    if (variant === 'duplicate-tuple') ledger.setState(s => ({ transactions: [...s.transactions, { ...s.transactions[0], id: 'copy' }] }));
    if (variant === 'wrong-owner') changeTx('lt', t => ({ ...t, linkedEntityId: 'different' }));
    if (variant === 'wrong-amount') changeTx('lt', t => ({ ...t, amount: 999 }));
    if (variant === 'wrong-currency') changeTx('lt', t => ({ ...t, currencyCode: 'EGP' }));
    if (variant === 'wrong-type') changeTx('lt', t => ({ ...t, type: 'income' }));
    if (variant === 'shared-reference') changeDebt(d => ({ ...d, payments: d.payments.map(p => ({ ...p, ledgerTransactionId: 'lt' })) }));
    if (variant === 'split-purpose') changeTx('lt', t => ({ ...t, purpose: 'loan_principal_payment' }));
    if (variant === 'missing-id') ledger.setState(s => ({ transactions: s.transactions.filter(t => t.id !== 'lt') }));
    assertRejected(() => editLinkedPayment(loanRef, edit));
    assertRejected(() => reverseLinkedPayment(loanRef));
  });
}

test('matching amount/date/account alone never establishes a legacy link', () => {
  changeLoan(l => ({ ...l, payments: l.payments.map(p => ({ ...p, ledgerTransactionId: undefined })) }));
  changeTx('lt', t => ({ ...t, purpose: undefined, linkedEntityType: undefined, linkedEntityId: undefined, linkedPaymentId: undefined }));
  assertRejected(() => reverseLinkedPayment(loanRef));
  assertRejected(() => editLinkedPayment(loanRef, edit));
});

test('genuine custom loan payment edits and reversals never change ledger cash', () => {
  changeLoan(l => ({ ...l, payments: l.payments.map(p => ({ ...p, accountId: undefined, ledgerTransactionId: undefined, paymentMethodLabel: 'Cash outside app' })) }));
  ledger.setState(s => ({ transactions: s.transactions.filter(t => t.id !== 'lt') }));
  const previous = structuredClone(ledger.getState().transactions);
  assert.equal(editLinkedPayment(loanRef, { ...edit, paymentMethodLabel: 'Other cash' }).ok, true);
  assert.equal(reverseLinkedPayment(loanRef).ok, true);
  assert.deepEqual(ledger.getState().transactions, previous);
});

test('settlement reversal reopens loan and removes settlement fields', () => {
  changeLoan(l => ({ ...l, status: 'settled', settlementPaymentId: 'lp', settlementAmount: 100,
    settlementDate: date, settlementAccountId: 'a', settlementNote: 'Saved' }));
  assert.equal(reverseLinkedPayment(loanRef).ok, true);
  const l = finance.getState().loans[0];
  assert.equal(l.status, 'active');
  for (const field of ['settlementPaymentId', 'settlementAmount', 'settlementDate', 'settlementAccountId', 'settlementNote']) assert.equal(field in l, false);
});

test('completed loan reopens when a payment is edited below completion or reversed', () => {
  changeLoan(l => ({ ...l, status: 'completed', totalRepaymentAmount: 100, principalAmount: 100, receivedAmount: 100 }));
  assert.equal(editLinkedPayment(loanRef, { amount: 50, date, latePaymentFee: 5 }).ok, true);
  assert.equal(finance.getState().loans[0].status, 'active');
});

test('posting uses existing debt/loan amount limits, cash amounts, and linkage rules', () => {
  assert.equal(postLinkedPayment({ entityType: 'loan', entityId: 'loan', amount: 200, latePaymentFee: 10,
    date, accountId: 'a', categoryId: 'out' }).ok, true);
  assert.equal(balance('a'), 1635);
  assert.equal(getLoanRemainingAmount(finance.getState().loans[0]), 900);
  assert.equal(postLinkedPayment({ entityType: 'debt', entityId: 'debt', amount: 450,
    date, accountId: 'a', categoryId: 'out' }).ok, true);
  assert.equal(getDebtRemaining(finance.getState().debts[0]), 0);
});

test('failed posting restores newly created payments when ledger creation fails', () => {
  ledger.setState({ addPaymentTransaction: () => null });
  assertRejected(() => postLinkedPayment({ entityType: 'debt', entityId: 'debt', amount: 25, date, accountId: 'a', categoryId: 'out' }));
});

test('failed link attachment restores the new payment and protected transaction', () => {
  finance.setState({ linkDebtPaymentTransaction: () => false });
  assertRejected(() => postLinkedPayment({ entityType: 'debt', entityId: 'debt', amount: 25, date, accountId: 'a', categoryId: 'out' }));
});

test('finance rejection preserves both sides of a dedicated edit', () => {
  finance.setState({ updateLoanPayment: () => false });
  assertRejected(() => editLinkedPayment(loanRef, edit));
});

test('runtime exception after finance mutation restores exact snapshots including absent fields', () => {
  finance.setState({ updateLoanPayment: (...args) => {
    originalFinance.updateLoanPayment(...args); throw new Error('Injected failure');
  } });
  assertRejected(() => editLinkedPayment(loanRef, edit));
});

test('rejected finance deletion restores ledger transaction removed during reversal', () => {
  finance.setState({ deleteDebtPayment: () => false });
  assertRejected(() => reverseLinkedPayment(debtRef));
});

test('runtime subscriber exception after ledger mutation restores both stores', () => {
  let fired = false;
  const unsubscribe = ledger.subscribe(() => { if (!fired) { fired = true; throw new Error('Injected subscriber error'); } });
  try { assertRejected(() => editLinkedPayment(loanRef, edit)); } finally { unsubscribe(); }
});

test('confirmed loan receipt is protected from generic edits and deletion', () => {
  changeLoan(l => { const copy = { ...l, payments: [] }; delete copy.receivedAt; delete copy.receivedAmount; return copy; });
  ledger.setState({ transactions: [] });
  assert.equal(confirmLoanReceipt({ loanId: 'loan', amount: 1000, date, accountId: 'a', categoryId: 'in' }).ok, true);
  const id = finance.getState().loans[0].receiptTransactionId;
  assert.equal(ledger.getState().removeTransaction(id), false);
  assert.equal(ledger.getState().updateTransaction(id, { amount: 1 }), false);
});

test('failed receipt confirmation rolls back without using generic deletion', () => {
  changeLoan(l => { const copy = { ...l, payments: [] }; delete copy.receivedAt; delete copy.receivedAmount; return copy; });
  ledger.setState({ transactions: [] });
  finance.setState({ updateLoan: () => {} });
  assertRejected(() => confirmLoanReceipt({ loanId: 'loan', amount: 1000, date, accountId: 'a', categoryId: 'in' }));
});

test('invalid edits, cross-currency accounts and overpayments leave all records unchanged', () => {
  assertRejected(() => editLinkedPayment(loanRef, { ...edit, amount: 1201 }));
  assertRejected(() => editLinkedPayment(debtRef, { amount: 501, date }));
  assertRejected(() => editLinkedPayment(loanRef, { ...edit, date: '2026-02-30' }));
  ledger.setState(s => ({ accounts: s.accounts.map(a => a.id === 'b' ? { ...a, currencyCode: 'EGP' } : a) }));
  assertRejected(() => editLinkedPayment(loanRef, { ...edit, accountId: 'b' }));
});

test('ownership and balances survive rehydration without automatic relinking', async () => {
  await Promise.all([ledger.persist.rehydrate(), finance.persist.rehydrate()]);
  assert.equal(ledger.getState().removeTransaction('lt'), false);
  assert.equal(balance('a'), 1845);
});

test('generic mutation fails closed while finance hydration is incomplete', async () => {
  const hydrated = finance.persist.hasHydrated;
  finance.persist.hasHydrated = () => false;
  try {
    assert.equal(ledger.getState().removeTransaction('dt'), false);
    assertRejected(() => reverseLinkedPayment(debtRef));
  } finally { finance.persist.hasHydrated = hydrated; }
});

test('runtime attempts to replace IDs or ownership through a generic patch are rejected', () => {
  const id = ledger.getState().addTransaction({ type: 'expense', amount: 1, accountId: 'a', categoryId: 'out', date });
  for (const patch of [{ id: 'lt' }, { purpose: 'normal' }, { linkedPaymentId: 'lp' }, { linkedEntityId: undefined }]) {
    const previous = snapshot();
    assert.equal(ledger.getState().updateTransaction(id, patch), false);
    assert.deepEqual(snapshot(), previous);
  }
});

test('reversal reads latest ownership after a confirmation was opened', () => {
  const staleRef = { ...loanRef };
  changeTx('lt', t => ({ ...t, linkedPaymentId: 'different' }));
  assertRejected(() => reverseLinkedPayment(staleRef));
});

test('linked transaction with partial metadata remains protected even without a known parent', () => {
  ledger.setState({ transactions: [{ ...tx('orphan', undefined, 'missing', undefined, 50) }] });
  assert.equal(ledger.getState().updateTransaction('orphan', { amount: 10 }), false);
  assert.equal(ledger.getState().removeTransaction('orphan'), false);
});

test('legacy loan account record without explicit link is not treated as custom cash', () => {
  changeLoan(l => ({ ...l, payments: l.payments.map(p => ({ ...p, ledgerTransactionId: undefined })) }));
  ledger.setState(s => ({ transactions: s.transactions.filter(t => t.id !== 'lt') }));
  assertRejected(() => reverseLinkedPayment(loanRef));
});

for (const status of ['settled', 'closed']) test(status + ' loan payments reject edits without changing accounts, metadata or status', () => {
  changeLoan(l => ({ ...l, status, settlementPaymentId: 'lp', settlementAmount: 100, settlementDate: date }));
  assertRejected(() => editLinkedPayment(loanRef, { ...edit, note: 'Unsafe change' }));
  assert.equal(finance.getState().updateLoanPayment('loan', 'lp', { amount: 150 }), false);
});
for (const status of ['settled', 'closed']) test(status + ' historical payments cannot be reversed outside explicit settlement reversal', () => {
  changeLoan(l => ({ ...l, status, settlementPaymentId: 'other-payment' }));
  assertRejected(() => reverseLinkedPayment(loanRef));
  assert.equal(finance.getState().deleteLoanPayment('loan', 'lp'), false);
});

test('posting early settlement and reversing it preserves contractual accounting', () => {
  assert.equal(postLinkedPayment({ entityType: 'loan', entityId: 'loan', amount: 500, latePaymentFee: 10,
    date, accountId: 'a', categoryId: 'out', settlement: true }).ok, true);
  const l = finance.getState().loans[0];
  assert.equal(l.status, 'settled');
  assert.equal(getLoanRemainingAmount(l), 0);
  assert.equal(balance('a'), 1335);
  assert.equal(reverseLinkedPayment({ ...loanRef, paymentId: l.settlementPaymentId }).ok, true);
  assert.equal(getLoanRemainingAmount(finance.getState().loans[0]), 1100);
  assert.equal(balance('a'), 1845);
});

test('overpayments and missing category are rejected before a payment is created', () => {
  let calls = 0;
  finance.setState({ addDebtPayment: (...args) => { calls++; return originalFinance.addDebtPayment(...args); } });
  assertRejected(() => postLinkedPayment({ entityType: 'debt', entityId: 'debt', amount: 451, date, accountId: 'a', categoryId: 'out' }));
  assertRejected(() => postLinkedPayment({ entityType: 'debt', entityId: 'debt', amount: 10, date, accountId: 'a', categoryId: 'missing' }));
  assert.equal(calls, 0);
});

test('failure to update loan lifecycle restores reversed cash and payment', () => {
  const setState = finance.setState;
  let calls = 0;
  finance.setState = (...args) => { if (++calls === 1) throw new Error('Lifecycle update failed'); return setState(...args); };
  try { assertRejected(() => reverseLinkedPayment(loanRef)); } finally { finance.setState = setState; }
});

test('rollback failure is reported explicitly and never reported as success', () => {
  const setState = finance.setState;
  finance.setState({ deleteDebtPayment: () => false });
  finance.setState = () => { throw new Error('Injected rollback failure'); };
  try {
    const result = reverseLinkedPayment(debtRef);
    assert.equal(result.ok, false);
    assert.match(result.reason, /rollback failed/i);
    assert.equal(ledger.getState().transactions.some(t => t.id === 'dt'), true);
  } finally { finance.setState = setState; }
});

const fullSnapshot = () => structuredClone({ ...snapshot(), accounts: ledger.getState().accounts,
  transfers: ledger.getState().transfers, categories: ledger.getState().categories });

test('account deletion rejects protected payments and exact reverse-only links', () => {
  changeTx('lt', t => { const n = { ...t }; delete n.purpose; delete n.linkedEntityType; delete n.linkedEntityId; delete n.linkedPaymentId; return n; });
  const previous = fullSnapshot();
  assert.equal(ledger.getState().deleteAccount('a'), false);
  assert.deepEqual(fullSnapshot(), previous);
});

test('account deletion cannot erase an outgoing or incoming transfer or change the other balance', () => {
  finance.setState({ loans: [], debts: [] }); ledger.setState({ transactions: [], transfers: [
    { id: 'tr', fromAccountId: 'a', toAccountId: 'b', amount: 100, currencyCode: 'USD', type: 'internal', date, ...stamps },
  ] });
  const previous = fullSnapshot();
  for (const id of ['a', 'b']) assert.equal(ledger.getState().deleteAccount(id), false);
  assert.deepEqual(fullSnapshot(), previous);
  assert.equal(balance('a'), 1900); assert.equal(balance('b'), 2100);
});

test('ordinary account deletion still works and missing linked cash does not erase account history', () => {
  assert.equal(ledger.getState().deleteAccount('b'), true);
  ledger.setState({ transactions: [] });
  const previous = fullSnapshot();
  assert.equal(ledger.getState().deleteAccount('a'), false);
  assert.deepEqual(fullSnapshot(), previous);
});

for (const variant of ['payments', 'receipt', 'received-custom', 'settled', 'closed', 'orphan-ledger']) {
  test(`loan deletion rejects ${variant} history without changing accounting`, () => {
    const l = loan(); l.payments = []; delete l.receivedAt; delete l.receivedAmount;
    ledger.setState({ transactions: [] });
    if (variant === 'payments') l.payments = loan().payments;
    if (variant === 'receipt') l.receiptTransactionId = 'receipt';
    if (variant === 'received-custom') { l.receivedAt = date; l.receivedAmount = 1000; l.depositMethodLabel = 'Cash'; }
    if (variant === 'settled') l.status = 'settled';
    if (variant === 'closed') l.status = 'closed';
    if (variant === 'orphan-ledger') ledger.setState({ transactions: [tx('orphan', 'loan', 'loan', undefined, 100)] });
    finance.setState({ loans: [l] });
    const previous = fullSnapshot();
    assert.equal(finance.getState().deleteLoan('loan'), false);
    assert.deepEqual(fullSnapshot(), previous);
  });
}

test('an unreceived loan without accounting history can still be deleted', () => {
  changeLoan(l => { const n = { ...l, payments: [] }; delete n.receivedAt; delete n.receivedAmount; return n; });
  ledger.setState({ transactions: [] });
  assert.equal(finance.getState().deleteLoan('loan'), true);
  assert.equal(finance.getState().loans.length, 0);
});

test('ledger clear/reset and finance reset refuse linked history unchanged', () => {
  const previous = fullSnapshot();
  assert.equal(ledger.getState().clearAccountsAndTransactions(), false);
  assert.equal(ledger.getState().resetLedger(), false);
  assert.equal(finance.getState().resetFinanceData(), false);
  assert.deepEqual(fullSnapshot(), previous);
});

test('resets cannot bypass orphan protection and remain available for unlinked empty data', () => {
  finance.setState({ loans: [], debts: [] });
  ledger.setState({ transactions: [tx('orphan', undefined, undefined, undefined, 10, 'loan_payment')] });
  const previous = fullSnapshot();
  assert.equal(finance.getState().resetFinanceData(), false);
  assert.equal(ledger.getState().resetLedger(), false);
  assert.deepEqual(fullSnapshot(), previous);
  ledger.setState({ transactions: [] });
  assert.equal(finance.getState().resetFinanceData(), true);
  assert.equal(ledger.getState().resetLedger(), true);
});

test('deletion and reset guards fail closed before ledger hydration completes', () => {
  const ready = ledger.persist.hasHydrated; ledger.persist.hasHydrated = () => false;
  try {
    assert.equal(ledger.getState().deleteAccount('b'), false);
    assert.equal(finance.getState().deleteLoan('loan'), false);
    assert.equal(ledger.getState().resetLedger(), false);
    assert.equal(finance.getState().resetFinanceData(), false);
  } finally { ledger.persist.hasHydrated = ready; }
});

test('generic creation cannot forge linked purposes or ownership fields', () => {
  for (const extra of [{ purpose: 'loan_payment' }, { purpose: 'debt_payment' }, { purpose: 'debt_collection' },
    { purpose: 'loan_principal_payment' }, { purpose: 'loan_interest_payment' }, { linkedEntityType: 'loan' },
    { linkedEntityId: 'loan' }, { linkedPaymentId: 'lp' }, { linkedEntityType: undefined }]) {
    const previous = fullSnapshot();
    assert.equal(ledger.getState().addTransaction({ type: 'expense', amount: 10, date, accountId: 'a', categoryId: 'out', ...extra }), null);
    assert.deepEqual(fullSnapshot(), previous);
  }
});

test('dedicated posting derives cash values and rejects nonexistent or already posted payment IDs', () => {
  assert.equal(ledger.getState().addPaymentTransaction(loanRef, 'out'), null);
  assert.equal(ledger.getState().addPaymentTransaction({ ...loanRef, paymentId: 'missing' }, 'out'), null);
  const paymentId = finance.getState().addLoanPayment('loan', { amount: 25, latePaymentFee: 3, paymentMode: 'simple', date, accountId: 'a' });
  const ref = { ...loanRef, paymentId };
  const id = ledger.getState().addPaymentTransaction(ref, 'out');
  assert.ok(id);
  const posted = ledger.getState().transactions.find(t => t.id === id);
  assert.equal(posted.amount, 28); assert.equal(posted.accountId, 'a'); assert.equal(posted.linkedPaymentId, paymentId);
  assert.equal(ledger.getState().addPaymentTransaction(ref, 'out'), null);
});

for (const variant of ['explicit-split', 'legacy-components', 'simple-with-components']) {
  test(`editing ${variant} loan payments preserves original semantics by refusing unchanged`, () => {
    changeLoan(l => ({ ...l, payments: l.payments.map(p => ({ ...p, principalAmount: 80, interestAmount: 20,
      paymentMode: variant === 'explicit-split' ? 'split' : variant === 'legacy-components' ? undefined : 'simple' })) }));
    assertRejected(() => editLinkedPayment(loanRef, edit));
  });
}

test('a verified single-entry split payment can still be reversed', () => {
  changeLoan(l => ({ ...l, payments: l.payments.map(p => ({ ...p, paymentMode: 'split', principalAmount: 80, interestAmount: 20 })) }));
  assert.equal(reverseLinkedPayment(loanRef).ok, true);
  assert.equal(balance('a'), 1950);
});

for (const evidence of [
  { linkedEntityType: 'loan', linkedEntityId: 'loan' },
  { linkedEntityId: 'loan' },
  { linkedEntityType: 'debt', linkedEntityId: 'loan' },
  { linkedPaymentId: 'lp' },
  { linkedEntityType: 'loan' },
]) {
  test(`custom payment rejects explicit conflicting ownership ${JSON.stringify(evidence)}`, () => {
    changeLoan(l => ({ ...l, payments: l.payments.map(p => ({ ...p, accountId: undefined, ledgerTransactionId: undefined, paymentMethodLabel: 'Cash' })) }));
    ledger.setState({ transactions: [{ ...stamps, id: 'orphan', type: 'expense', amount: 105, currencyCode: 'USD', accountId: 'a', categoryId: 'out', date, ...evidence }] });
    assertRejected(() => editLinkedPayment(loanRef, { ...edit, paymentMethodLabel: 'Cash' }));
    assertRejected(() => reverseLinkedPayment(loanRef));
  });
}

test('a verified loan receipt can coexist with genuine custom payment edits and reversals', () => {
  changeLoan(l => ({ ...l, receiptTransactionId: 'receipt', payments: l.payments.map(p => ({ ...p, accountId: undefined, ledgerTransactionId: undefined, paymentMethodLabel: 'Cash' })) }));
  ledger.setState({ transactions: [{ ...tx('receipt', 'loan', 'loan', undefined, 1000), type: 'income' }] });
  const previous = structuredClone(ledger.getState().transactions);
  assert.equal(editLinkedPayment(loanRef, { ...edit, paymentMethodLabel: 'Cash' }).ok, true);
  assert.equal(reverseLinkedPayment(loanRef).ok, true);
  assert.deepEqual(ledger.getState().transactions, previous);
});

test('dedicated account repayment posting works after a verified loan receipt', () => {
  changeLoan(l => ({ ...l, receiptTransactionId: 'receipt' }));
  ledger.setState(s => ({ transactions: [...s.transactions, { ...tx('receipt', 'loan', 'loan', undefined, 1000), type: 'income' }] }));
  assert.equal(postLinkedPayment({ entityType: 'loan', entityId: 'loan', amount: 25, latePaymentFee: 3,
    accountId: 'a', categoryId: 'out', date }).ok, true);
  assert.equal(balance('a'), 2817);
  assert.equal(getLoanRemainingAmount(finance.getState().loans[0]), 1075);
});

test('ledger clear/reset reject transfers even when no loan or debt exists', () => {
  finance.setState({ loans: [], debts: [] });
  ledger.setState({ transactions: [], transfers: [
    { ...stamps, id: 'tr', fromAccountId: 'a', toAccountId: 'b', amount: 100, currencyCode: 'USD', type: 'internal', date },
  ] });
  const previous = fullSnapshot();
  assert.equal(ledger.getState().clearAccountsAndTransactions(), false);
  assert.equal(ledger.getState().resetLedger(), false);
  assert.deepEqual(fullSnapshot(), previous);
});

for (const evidence of [
  { linkedEntityType: 'debt', linkedEntityId: 'debt', linkedPaymentId: 'missing-payment', purpose: 'debt_payment' },
  { linkedEntityId: 'debt', purpose: 'debt_payment' },
  { linkedEntityId: 'debt', purpose: 'debt_collection', type: 'income' },
  { linkedEntityId: 'debt' },
  { linkedEntityId: 'debt', linkedEntityType: 'loan' },
]) {
  test(`empty debt cannot be deleted with explicit stale/orphan ownership ${JSON.stringify(evidence)}`, () => {
    changeDebt(d => ({ ...d, payments: [] }));
    ledger.setState({ transactions: [{ ...stamps, id: 'orphan', amount: 50, type: 'expense',
      accountId: 'a', categoryId: 'out', currencyCode: 'USD', date, ...evidence }] });
    const previous = fullSnapshot();
    const previousBalance = balance('a');
    assert.equal(finance.getState().deleteDebt('debt'), false);
    assert.deepEqual(fullSnapshot(), previous);
    assert.equal(balance('a'), previousBalance);
  });
}

test('direct debt deletion preserves existing payments and linked cash', () => {
  const previous = fullSnapshot();
  assert.equal(finance.getState().deleteDebt('debt'), false);
  assert.deepEqual(fullSnapshot(), previous);
});

test('a truly empty unlinked debt can be deleted without changing other accounting', () => {
  changeDebt(d => ({ ...d, payments: [] }));
  changeTx('dt', t => ({ ...t, linkedEntityId: 'another-debt' }));
  const previous = fullSnapshot();
  assert.equal(finance.getState().deleteDebt('debt'), true);
  assert.deepEqual(fullSnapshot(), { ...previous, debts: [] });
});

test('debt deletion rechecks ledger evidence added after opening confirmation', () => {
  changeDebt(d => ({ ...d, payments: [] }));
  ledger.setState({ transactions: [] });
  const staleDebt = finance.getState().debts[0];
  ledger.setState({ transactions: [tx('late-cash', 'debt', staleDebt.id, 'orphan-payment', 50, 'debt_payment')] });
  const previous = fullSnapshot();
  assert.equal(finance.getState().deleteDebt(staleDebt.id), false);
  assert.deepEqual(fullSnapshot(), previous);
});

for (const store of [finance, ledger]) {
  test(`debt deletion fails closed while ${store === finance ? 'Finance' : 'ledger'} hydrates`, () => {
    changeDebt(d => ({ ...d, payments: [] }));
    ledger.setState({ transactions: [] });
    const previous = fullSnapshot();
    const ready = store.persist.hasHydrated;
    store.persist.hasHydrated = () => false;
    try {
      assert.equal(finance.getState().deleteDebt('debt'), false);
      assert.deepEqual(fullSnapshot(), previous);
    } finally { store.persist.hasHydrated = ready; }
  });
}

test('debt deletion fails closed when the ledger protection reader is unavailable', () => {
  changeDebt(d => ({ ...d, payments: [] }));
  ledger.setState({ transactions: [] });
  const protection = require('../src/features/finance/store/ledgerProtectionReader.ts');
  const reader = protection.readLedgerProtection;
  const previous = fullSnapshot();
  protection.readLedgerProtection = () => undefined;
  try {
    assert.equal(finance.getState().deleteDebt('debt'), false);
    assert.deepEqual(fullSnapshot(), previous);
  } finally { protection.readLedgerProtection = reader; }
});

test('debt deletion refuses missing and duplicate IDs without deleting any parent', () => {
  changeDebt(d => ({ ...d, payments: [] }));
  ledger.setState({ transactions: [] });
  finance.setState(s => ({ debts: [...s.debts, { ...s.debts[0] }] }));
  const previous = fullSnapshot();
  assert.equal(finance.getState().deleteDebt('missing'), false);
  assert.equal(finance.getState().deleteDebt('debt'), false);
  assert.deepEqual(fullSnapshot(), previous);
});

test('ordinary transaction and same-currency transfer lifecycle restores balances and combined account total', () => {
  finance.setState({ loans: [], debts: [] }); ledger.setState({ transactions: [], transfers: [] });
  const initial = balance('a');
  const id = ledger.getState().addTransaction({ type: 'expense', amount: 100, accountId: 'a', categoryId: 'out', date });
  assert.equal(balance('a'), initial - 100);
  assert.equal(ledger.getState().updateTransaction(id, { amount: 150 }), true); assert.equal(balance('a'), initial - 150);
  assert.equal(ledger.getState().removeTransaction(id), true); assert.equal(balance('a'), initial);
  const total = balance('a') + balance('b');
  const transfer = ledger.getState().addTransfer({ fromAccountId: 'a', toAccountId: 'b', fromAmount: 100, toAmount: 100,
    fromCurrencyCode: 'USD', toCurrencyCode: 'USD', exchangeRate: 1, date, type: 'internal' });
  assert.ok(transfer); assert.equal(balance('a') + balance('b'), total);
  assert.equal(ledger.getState().updateTransfer(transfer, { fromAmount: 200, toAmount: 200 }), true);
  assert.equal(balance('a'), initial - 200); assert.equal(balance('a') + balance('b'), total);
  ledger.getState().removeTransfer(transfer); assert.equal(balance('a'), initial); assert.equal(balance('a') + balance('b'), total);
});
test('confirmed settlement affects principal/status/account exactly once and reversal restores prior principal', () => {
  const { getLoanRemainingPrincipal } = require('../src/features/finance/utils/finance.ts');
  const before = getLoanRemainingPrincipal(finance.getState().loans[0]); const cash = balance('a');
  assert.equal(postLinkedPayment({ entityType: 'loan', entityId: 'loan', amount: 500, latePaymentFee: 10, date, accountId: 'a', categoryId: 'out', settlement: true }).ok, true);
  const saved = finance.getState().loans[0]; assert.equal(saved.status, 'settled');
  assert.equal(getLoanRemainingPrincipal(saved), 0); assert.equal(getLoanRemainingAmount(saved), 0); assert.equal(balance('a'), cash - 510);
  const state = snapshot();
  assert.equal(postLinkedPayment({ entityType: 'loan', entityId: 'loan', amount: 500, date, accountId: 'a', settlement: true }).ok, false);
  assert.deepEqual(snapshot(), state);
  assert.equal(reverseLinkedPayment({ entityType: 'loan', entityId: 'loan', paymentId: saved.settlementPaymentId }).ok, true);
  assert.equal(getLoanRemainingPrincipal(finance.getState().loans[0]), before); assert.equal(balance('a'), cash);
});
test('finance and ledger records survive persisted rehydration without rewriting asset movements or loan history', async () => {
  const assets = ['gold', 'silver', 'foreign_currency'].map((category, i) => ({ ...stamps, id: 'asset-' + i, name: category, category, karat: 21, currencyCode: 'USD', entries: [{ id: 'entry-' + i, date, amount: 10, createdAt: date }] }));
  finance.setState({ assets });
  const financeBefore = structuredClone({ assets: finance.getState().assets, loans: finance.getState().loans, debts: finance.getState().debts });
  const ledgerBefore = structuredClone({ accounts: ledger.getState().accounts, transactions: ledger.getState().transactions, transfers: ledger.getState().transfers });
  await Promise.all([finance.persist.rehydrate(), ledger.persist.rehydrate()]);
  assert.deepEqual({ assets: finance.getState().assets, loans: finance.getState().loans, debts: finance.getState().debts }, financeBefore);
  assert.deepEqual({ accounts: ledger.getState().accounts, transactions: ledger.getState().transactions, transfers: ledger.getState().transfers }, ledgerBefore);
});

const { useFinancePreferences: preferences } = require('../src/features/finance/store/useFinancePreferences.ts');
test('global amount visibility persists across hydration without changing financial records', async () => {
  await preferences.persist.rehydrate();
  preferences.setState({ amountsVisible: false });
  const before = snapshot();
  preferences.getState().toggleAmounts();
  assert.equal(preferences.getState().amountsVisible, true);
  await Promise.resolve();
  const saved = storage.get('tomorrow-finance-preferences');
  assert.equal(JSON.parse(saved).state.amountsVisible, true);
  preferences.setState({ amountsVisible: false });
  storage.set('tomorrow-finance-preferences', saved);
  await preferences.persist.rehydrate();
  assert.equal(preferences.getState().amountsVisible, true);
  assert.deepEqual(snapshot(), before);
  preferences.getState().toggleAmounts();
  assert.equal(preferences.getState().amountsVisible, false);
});
test('invalid persisted amount visibility stays hidden', async () => {
  storage.set('tomorrow-finance-preferences', JSON.stringify({ state: { amountsVisible: 'true' }, version: 0 }));
  await preferences.persist.rehydrate();
  assert.equal(preferences.getState().amountsVisible, false);
});
