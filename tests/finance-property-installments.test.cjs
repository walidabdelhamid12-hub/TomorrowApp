const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  return originalLoad.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);

const { generateRegularInstallments, getPropertyInstallmentBalance } =
  require('../src/features/finance/types/propertyInstallments.ts');

const plan = { contractId: 'unit-a', firstDueDate: '2027-01-31', count: 3, intervalMonths: 1, totalAmount: 100 };

test('regular schedule preserves the contract unit and exact three-decimal total', () => {
  const rows = generateRegularInstallments(plan);
  assert.deepEqual(rows.map(x => x.dueDate), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(rows.map(x => x.amount), [33.333, 33.333, 33.334]);
  assert.equal(rows.reduce((sum, x) => Math.round((sum + x.amount) * 1000) / 1000, 0), 100);
  assert.ok(rows.every(x => x.contractId === 'unit-a'));
});

test('rejects invalid dates, counts and totals without producing a schedule', () => {
  for (const change of [
    { firstDueDate: '2027-02-30' }, { count: 0 }, { count: 601 },
    { intervalMonths: 0 }, { totalAmount: 0 }, { totalAmount: 0.001 },
    { totalAmount: Number.POSITIVE_INFINITY }, { totalAmount: 12.3456 },
  ]) {
    assert.throws(() => generateRegularInstallments({ ...plan, ...change }));
  }
});

test('confirmed partial and full payment status is derived from ledger-linked payments', () => {
  const installment = { id: 'i1', contractId: 'unit-a', amount: 10 };
  const payment = { id: 'p1', installmentId: 'i1', contractId: 'unit-a',
    date: '2027-02-01', amount: 4, accountId: 'bank', ledgerTransactionId: 'tx1' };
  assert.deepEqual(getPropertyInstallmentBalance(installment, []),
    { paid: 0, remaining: 10, status: 'unpaid' });
  assert.deepEqual(getPropertyInstallmentBalance(installment, [payment]),
    { paid: 4, remaining: 6, status: 'partial' });
  assert.deepEqual(getPropertyInstallmentBalance(installment, [payment, { ...payment, id: 'p2', amount: 6, ledgerTransactionId: 'tx2' }]),
    { paid: 10, remaining: 0, status: 'paid' });
});

test('payments for other units or installments do not affect the balance', () => {
  const installment = { id: 'i1', contractId: 'unit-a', amount: 10 };
  const unrelated = { id: 'p', installmentId: 'i1', contractId: 'unit-b',
    date: '2027-02-01', amount: 9, accountId: 'bank', ledgerTransactionId: 'tx' };
  assert.equal(getPropertyInstallmentBalance(installment, [unrelated]).remaining, 10);
});

test('invalid or excess linked payments are rejected', () => {
  const installment = { id: 'i1', contractId: 'unit-a', amount: 10 };
  const payment = { id: 'p', installmentId: 'i1', contractId: 'unit-a',
    date: '2027-02-01', amount: 11, accountId: 'bank', ledgerTransactionId: 'tx' };
  assert.throws(() => getPropertyInstallmentBalance(installment, [payment]));
  assert.throws(() => getPropertyInstallmentBalance(installment, [{ ...payment, amount: 1, ledgerTransactionId: '' }]));
});
