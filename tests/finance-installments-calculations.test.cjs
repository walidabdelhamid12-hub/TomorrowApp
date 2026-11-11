/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const load = Module._load;
Module._load = function(id, parent, main) {
  return load.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const api = require('../src/features/finance/utils/installments.ts');
const row = (id, amount, dueDate, kind = 'regular') => ({ id, contractId: 'c', kind, dueDate, amount });
const contract = () => ({ id: 'c', currencyCode: 'EGP', totalAmount: '100.00',
  accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' },
  schedule: [row('down', '20', '2028-01-01', 'down_payment'), row('r1', '40', '2028-02-01'), row('r2', '40', '2028-03-01')] });
const input = () => ({ contract: contract(), payments: [], trustedConfirmations: [], asOf: '2028-02-15' });
function payment(id, installmentId, amount, paidOn = '2028-02-01') {
  return { id, contractId: 'c', installmentId, amount, paidOn, currencyCode: 'EGP', paymentReference: 'ref-' + id };
}
function evidence(p, overrides = {}) {
  const { id, ...details } = p;
  return { ...details, kind: 'trusted_confirmation', evidenceId: 'ev-' + id, paymentId: id, ...overrides };
}
function confirm(i, p) { i.payments.push(p); i.trustedConfirmations.push(evidence(p)); return i; }
function frozen(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test('regular schedule, optional down payment and all public totals reconcile exactly', () => {
  const i = confirm(confirm(input(), payment('p1', 'down', '20')), payment('p2', 'r1', '15'));
  api.validateInstallmentContract(i.contract);
  const result = api.calculateInstallments(i);
  assert.equal(result.totalScheduled, '100.00');
  assert.equal(result.confirmedPaid, '35.00');
  assert.equal(result.remaining, '65.00');
  assert.equal(result.overdue, '25.00');
  assert.equal(api.getTotalScheduledAmount(i.contract), result.totalScheduled);
  assert.equal(api.getConfirmedPaidAmount(i), result.confirmedPaid);
  assert.equal(api.getRemainingContractBalance(i), result.remaining);
  assert.equal(api.getOverdueInstallmentAmount(i), result.overdue);
  assert.equal(api.getRemainingInstallmentAmount(i, 'r1'), '25.00');
  assert.equal(api.getNextUnpaidInstallment(i).id, 'r1');
  assert.equal(api.getInstallmentPaymentStatus(i, 'down'), 'paid');
  assert.equal(api.getInstallmentPaymentStatus(i, 'r1'), 'partial');
  assert.equal(api.getInstallmentPaymentStatus(i, 'r2'), 'unpaid');
  assert.equal(result.installments[0].dueDateStatus, 'overdue'); // even though paid
});
test('schedule without a down payment is valid', () => {
  const c = contract(); c.schedule = c.schedule.slice(1); c.totalAmount = '80';
  assert.equal(api.getTotalScheduledAmount(c), '80.00');
});
test('irregular amounts and dates with OMR precision and partial payments', () => {
  const i = input();
  i.contract.currencyCode = 'OMR'; i.contract.totalAmount = '100.005';
  i.contract.schedule = [row('b', '60.002', '2028-08-17', 'irregular'), row('down', '10.001', '2028-01-03', 'down_payment'), row('a', '30.002', '2028-02-14', 'irregular')];
  confirm(i, { ...payment('p1', 'a', '0.001'), currencyCode: 'OMR' });
  const result = api.calculateInstallments(i);
  assert.equal(result.totalScheduled, '100.005');
  assert.equal(result.confirmedPaid, '0.001');
  assert.equal(result.remaining, '100.004');
  assert.equal(result.overdue, '40.002');
  assert.equal(result.nextUnpaid.id, 'down');
});
test('exact decimal sums avoid 0.1 + 0.2 drift', () => {
  const i = input(); i.contract.totalAmount = '0.30';
  i.contract.schedule = [row('r1', '0.30', '2028-01-01')];
  confirm(confirm(i, payment('p1', 'r1', '0.1')), payment('p2', 'r1', '0.2'));
  assert.equal(api.calculateInstallments(i).remaining, '0.00');
  assert.equal(api.getConfirmedPaidAmount(i), '0.30');
  assert.equal(api.getNextUnpaidInstallment(i), null);
});
test('large decimal values retain exact minor units beyond Number safe integer range', () => {
  const i = input(); i.contract.totalAmount = '9007199254740993.01';
  i.contract.schedule = [row('r1', i.contract.totalAmount, '2028-01-01')];
  confirm(i, payment('p1', 'r1', '9007199254740993.00'));
  assert.equal(api.getRemainingContractBalance(i), '0.01');
});
for (const code of ['OMR', 'KWD', 'JOD']) test(code + ' accepts a one-minor-unit installment', () => {
  const c = contract(); c.currencyCode = code; c.totalAmount = '0.001'; c.schedule = [row('r1', '0.001', '2028-02-29')];
  assert.equal(api.getTotalScheduledAmount(c), '0.001');
});
test('payment and calendar statuses stay independent; due today is not overdue', () => {
  const i = input(); i.asOf = '2028-02-01';
  confirm(i, payment('p1', 'down', '20', '2028-01-01'));
  confirm(i, payment('p2', 'r2', '40', '2028-01-31'));
  const result = api.calculateInstallments(i);
  assert.equal(result.overdue, '0.00');
  assert.deepEqual(result.installments.map(x => [x.paymentStatus, x.dueDateStatus]), [
    ['paid', 'overdue'], ['unpaid', 'due_today'], ['paid', 'upcoming'],
  ]);
});
test('as-of cutoff includes payment that day and excludes future confirmed payments', () => {
  const i = confirm(input(), payment('p1', 'r1', '40', '2028-02-16'));
  assert.equal(api.getConfirmedPaidAmount(i), '0.00');
  assert.equal(api.getOverdueInstallmentAmount(i), '60.00');
  i.asOf = '2028-02-16';
  assert.equal(api.getConfirmedPaidAmount(i), '40.00');
  assert.equal(api.getOverdueInstallmentAmount(i), '20.00');
});
test('next unpaid uses due date then stable ID, including overdue and partial rows', () => {
  const i = input();
  i.contract.schedule.reverse();
  assert.equal(api.getNextUnpaidInstallment(i).id, 'down');
  confirm(i, payment('p1', 'down', '20'));
  confirm(i, payment('p2', 'r1', '5'));
  assert.equal(api.getNextUnpaidInstallment(i).id, 'r1');
  i.contract.schedule.forEach(x => { x.dueDate = '2028-01-01'; });
  assert.equal(api.getNextUnpaidInstallment(i).id, 'r1');
  i.contract.schedule.reverse();
  assert.equal(api.getNextUnpaidInstallment(i).id, 'r1');
});
for (const hint of [{ paid: true }, { status: 'paid' }, { legacyStatus: 'paid' }, { scheduledChequeId: 'cheque1' }, { ledgerTransactionId: 'tx1' }, { confirmation: { trusted: true } }]) {
  test('untrusted hint alone cannot confirm payment: ' + JSON.stringify(hint), () => {
    const i = input(); i.payments = [{ ...payment('p1', 'r1', '40'), ...hint }];
    assert.equal(api.getConfirmedPaidAmount(i), '0.00');
    assert.equal(api.getInstallmentPaymentStatus(i, 'r1'), 'unpaid');
  });
}
test('only independently supplied matching trusted evidence confirms a candidate', () => {
  const i = input(); i.payments = [payment('p1', 'r1', '10'), payment('p2', 'r1', '15')];
  i.trustedConfirmations = [evidence(i.payments[0])];
  assert.equal(api.getConfirmedPaidAmount(i), '10.00');
});
for (const patch of [
  { kind: 'scheduled_cheque' }, { paymentId: 'missing' }, { contractId: 'other' }, { installmentId: 'r2' },
  { paymentReference: 'another' }, { currencyCode: 'OMR' }, { paidOn: '2028-02-02' }, { amount: '9.99' }, { evidenceId: '' },
]) test('rejects mismatched or invalid evidence: ' + JSON.stringify(patch), () => {
  const i = input(); i.payments = [payment('p1', 'r1', '10')]; i.trustedConfirmations = [evidence(i.payments[0], patch)];
  assert.throws(() => api.calculateInstallments(i));
});
for (const [name, change] of [
  ['duplicate installment IDs', c => { c.schedule[1].id = c.schedule[0].id; }],
  ['wrong installment contract', c => { c.schedule[0].contractId = 'other'; }],
  ['inconsistent total', c => { c.totalAmount = '99.99'; }],
  ['empty schedule', c => { c.schedule = []; }],
  ['duplicate down payment', c => { c.schedule[1].kind = 'down_payment'; }],
  ['unknown installment kind', c => { c.schedule[0].kind = 'unknown'; }],
  ['missing ownership', c => { delete c.accountingOwnership; }],
  ['blank contract ID', c => { c.id = ''; }],
  ['blank installment ID', c => { c.schedule[0].id = ''; }],
  ['unsupported currency', c => { c.currencyCode = 'XYZ'; }],
  ['noncanonical currency', c => { c.currencyCode = 'omr'; }],
  ['wrong liability owner', c => { c.accountingOwnership = { kind: 'linked_loan', liabilityOwner: 'installment_contract', loanId: 'l' }; }],
  ['ambiguous ownership', c => { c.accountingOwnership = { kind: 'linked_loan', liabilityOwner: 'loan', loanId: 'l', debtId: 'd' }; }],
  ['blank linked ID', c => { c.accountingOwnership = { kind: 'linked_debt', liabilityOwner: 'debt', debtId: ' ' }; }],
]) test('rejects ' + name, () => { const c = contract(); change(c); assert.throws(() => api.validateInstallmentContract(c)); });
for (const amount of ['0', '-1', '1.001', 'NaN', 'Infinity', '1e2', '', ' 1', '1,000', '.5', 1, NaN, Infinity]) {
  test('rejects invalid EGP monetary input: ' + String(amount), () => {
    const c = contract(); c.schedule[0].amount = amount;
    assert.throws(() => api.validateInstallmentContract(c));
    const i = input(); i.payments = [payment('p1', 'r1', amount)];
    assert.throws(() => api.calculateInstallments(i));
    const invalidTotal = contract(); invalidTotal.totalAmount = amount;
    assert.throws(() => api.validateInstallmentContract(invalidTotal));
  });
}
for (const invalid of ['2027-02-29', '2028-02-30', '2028-04-31', '2028-00-01', '2028-13-01', '2028-01-00', '2028-1-01', '2028-01-01T00:00:00Z', '', 'not-a-date']) {
  test('rejects invalid due/payment/as-of date: ' + invalid, () => {
    const c = contract(); c.schedule[0].dueDate = invalid;
    assert.throws(() => api.validateInstallmentContract(c));
    const i = input(); i.payments = [payment('p1', 'r1', '1', invalid)];
    assert.throws(() => api.calculateInstallments(i));
    assert.throws(() => api.calculateInstallments({ ...input(), asOf: invalid }));
    assert.throws(() => api.getInstallmentDueDateStatus(invalid, '2028-01-01'));
  });
}
test('valid leap day and century leap rules use existing calendar validation', () => {
  assert.equal(api.getInstallmentDueDateStatus('2000-02-29', '2000-03-01'), 'overdue');
  assert.throws(() => api.getInstallmentDueDateStatus('2100-02-29', '2100-03-01'));
});
for (const patch of [{ id: '' }, { paymentReference: ' ' }, { installmentId: 'missing' }, { contractId: 'other' }, { currencyCode: 'OMR' }]) {
  test('rejects invalid candidate payment: ' + JSON.stringify(patch), () => {
    const i = input(); i.payments = [{ ...payment('p1', 'r1', '1'), ...patch }];
    assert.throws(() => api.calculateInstallments(i));
  });
}
test('rejects duplicate payment IDs, references, evidence IDs and repeated confirmations', () => {
  const i = input(); const p = payment('p1', 'r1', '1');
  for (const other of [{ ...p, paymentReference: 'different' }, { ...p, id: 'p2', installmentId: 'r2' }]) {
    assert.throws(() => api.calculateInstallments({ ...i, payments: [p, other] }));
  }
  const p2 = payment('p2', 'r2', '1');
  const first = evidence(p);
  for (const second of [evidence(p2, { evidenceId: first.evidenceId }), evidence(p, { evidenceId: 'another' })]) {
    assert.throws(() => api.calculateInstallments({ ...i, payments: [p, p2], trustedConfirmations: [first, second] }));
  }
});
test('rejects individual, cumulative, future, and contract overpayments', () => {
  assert.throws(() => api.calculateInstallments({ ...input(), payments: [payment('p1', 'r1', '40.01')] }));
  const i = confirm(confirm(input(), payment('p1', 'r1', '30')), payment('p2', 'r1', '10.01', '2030-01-01'));
  assert.throws(() => api.calculateInstallments(i));
  const all = input();
  for (const x of all.contract.schedule) confirm(all, payment('p-' + x.id, x.id, x.amount));
  confirm(all, payment('extra', 'r2', '0.01'));
  assert.throws(() => api.calculateInstallments(all));
});
test('loan and debt ownership are explicit metadata and do not alter calculations', () => {
  for (const owner of [{ kind: 'linked_loan', liabilityOwner: 'loan', loanId: 'l1' }, { kind: 'linked_debt', liabilityOwner: 'debt', debtId: 'd1' }]) {
    const i = input(); i.contract.accountingOwnership = owner;
    assert.deepEqual(api.calculateInstallments(i), api.calculateInstallments(input()));
  }
});
test('unknown installment lookup is rejected', () => {
  assert.throws(() => api.getRemainingInstallmentAmount(input(), 'missing'));
  assert.throws(() => api.getInstallmentPaymentStatus(input(), 'missing'));
});
test('frozen inputs remain unchanged and output mutation cannot change source schedule', () => {
  const i = frozen(confirm(input(), payment('p1', 'r1', '1')));
  const before = JSON.stringify(i);
  const result = api.calculateInstallments(i);
  result.nextUnpaid.amount = '999';
  result.installments[1].installment.dueDate = '2099-01-01';
  assert.equal(JSON.stringify(i), before);
  assert.equal(api.getRemainingContractBalance(i), '99.00');
});
test('standalone utility imports have no stores, runtime authority or side-effect dependencies', () => {
  const source = fs.readFileSync(path.join(root, 'src/features/finance/utils/installments.ts'), 'utf8');
  assert.doesNotMatch(source, /from ['"][^'"]*(?:store|hook|runtime|paymentOperations|paymentRecovery|ledger)/i);
});

test('OMR rejects excess precision without rounding schedule or payment amounts', () => {
  const i = input(); i.contract.currencyCode = 'OMR';
  i.contract.schedule[0].amount = '20.0001';
  assert.throws(() => api.calculateInstallments(i), /precision/);
  i.contract.schedule[0].amount = '20';
  i.payments = [{ ...payment('p1', 'r1', '0.0001'), currencyCode: 'OMR' }];
  assert.throws(() => api.calculateInstallments(i), /precision/);
});
test('equivalent decimal text in evidence matches by exact monetary value', () => {
  const i = input(); i.payments = [payment('p1', 'r1', '10')];
  i.trustedConfirmations = [evidence(i.payments[0], { amount: '10.00' })];
  assert.equal(api.getConfirmedPaidAmount(i), '10.00');
});
test('all-paid contract has no next unpaid installment or overdue balance', () => {
  const i = input();
  for (const x of i.contract.schedule) confirm(i, payment('p-' + x.id, x.id, x.amount));
  const result = api.calculateInstallments(i);
  assert.equal(result.confirmedPaid, '100.00');
  assert.equal(result.remaining, '0.00');
  assert.equal(result.overdue, '0.00');
  assert.equal(result.nextUnpaid, null);
});
