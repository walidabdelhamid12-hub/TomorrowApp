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
  ledger.setState({ addTransaction: () => null });
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

test('settlement edit preserves settled status, fee, and settlement metadata', () => {
  changeLoan(l => ({ ...l, status: 'settled', settlementPaymentId: 'lp', settlementAmount: 100, settlementDate: date }));
  assert.equal(editLinkedPayment(loanRef, { ...edit, note: 'Settlement updated' }).ok, true);
  const l = finance.getState().loans[0];
  assert.equal(l.status, 'settled');
  assert.equal(l.settlementAmount, 150);
  assert.equal(l.settlementDate, edit.date);
  assert.equal(l.settlementNote, 'Settlement updated');
  assert.equal(getLoanRemainingAmount(l), 0);
  assert.equal(balance('a'), 1792);
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
