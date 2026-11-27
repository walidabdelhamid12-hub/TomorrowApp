const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id.startsWith('@/')) return originalLoad.call(this, path.join(root, 'src', id.slice(2)), parent, main);
  return originalLoad.call(this, id, parent, main);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) =>
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
const { classifyReportTransaction, classifyReportTransactions, classifyReportTransfer } =
  require('../src/features/finance/utils/reportTransactionClassifier.ts');

const account = (id = 'bank', currencyCode = 'EGP') => ({ id, currencyCode });
const tx = (id, type, amount, extra = {}) => ({
  id, type, amount, currencyCode: 'EGP', accountId: 'bank', categoryId: 'general',
  date: '2026-11-10', ...extra,
});
const ctx = (transactions, loans = [], debts = [], property) => ({
  ledger: { accounts: [account(), account('other', 'USD')], transactions, transfers: [], categories: [] },
  finance: { assets: [], loans, debts, cheques: [] },
  property,
});
function classify(t, context) { return classifyReportTransaction(t, context); }

test('ordinary income and expense are separate P&L values', () => {
  const a = tx('salary', 'income', 20000), b = tx('food', 'expense', 3000);
  const c = ctx([a, b]);
  assert.deepEqual([classify(a, c).incomeAmount, classify(a, c).expenseAmount], [20000, 0]);
  assert.deepEqual([classify(b, c).incomeAmount, classify(b, c).expenseAmount], [0, 3000]);
});
test('transfers and credit card settlement never become income/expense', () => {
  assert.equal(classifyReportTransfer({ type: 'internal' }), 'transfer');
  assert.equal(classifyReportTransfer({ type: 'credit_card_payment' }), 'credit_card_payment');
});
test('refund can reference original outside period and different bank account/currency', () => {
  const original = tx('old', 'expense', 100, { date: '2026-01-01', accountId: 'other', currencyCode: 'USD' });
  const refund = tx('back', 'expense', 4100, { entryType: 'refund', relatedTransactionId: 'old' });
  const c = ctx([original, refund]);
  assert.equal(classify(refund, c).kind, 'refund');
  assert.equal(classify(refund, c).expenseAmount, -4100);
});
test('orphan refund is unknown, not a negative expense', () => {
  const refund = tx('back', 'expense', 500, { entryType: 'refund', relatedTransactionId: 'missing' });
  assert.equal(classify(refund, ctx([refund])).kind, 'unknown');
});
test('verified loan receipt is excluded from P&L', () => {
  const receipt = tx('receipt', 'income', 100000);
  const loan = { id: 'loan', receiptTransactionId: 'receipt', receivedAmount: 100000,
    receivedAt: receipt.date, currencyCode: 'EGP', payments: [] };
  const item = classify(receipt, ctx([receipt], [loan]));
  assert.equal(item.kind, 'loan_receipt');
  assert.equal(item.incomeAmount, 0);
});
test('loan payment is classified without inventing interest/principal split', () => {
  const payment = tx('pay', 'expense', 10200, { purpose: 'loan_payment', linkedEntityType: 'loan',
    linkedEntityId: 'loan', linkedPaymentId: 'p' });
  const loan = { id: 'loan', currencyCode: 'EGP', payments: [{ id: 'p', amount: 10000,
    latePaymentFee: 200, date: payment.date, accountId: 'bank', ledgerTransactionId: 'pay' }] };
  const item = classify(payment, ctx([payment], [loan]));
  assert.equal(item.kind, 'unknown');
  assert.equal(item.expenseAmount, 0);
});
test('verified receivable collection is excluded from operating income', () => {
  const t = tx('col', 'income', 700, { purpose: 'debt_collection', linkedEntityType: 'debt',
    linkedEntityId: 'debt', linkedPaymentId: 'p' });
  const debt = { id: 'debt', direction: 'receivable', currencyCode: 'EGP',
    payments: [{ id: 'p', amount: 700, date: t.date, accountId: 'bank', ledgerTransactionId: 'col' }] };
  assert.equal(classify(t, ctx([t], [], [debt])).kind, 'debt_collection');
});
test('unverified linked payment is unknown', () => {
  const t = tx('pay', 'expense', 100, { purpose: 'loan_payment', linkedEntityType: 'loan',
    linkedEntityId: 'missing', linkedPaymentId: 'p' });
  assert.equal(classify(t, ctx([t])).kind, 'unknown');
});
test('duplicate transaction ID is unknown', () => {
  const a = tx('dup', 'income', 100), b = tx('dup', 'expense', 50);
  assert.equal(classify(a, ctx([a, b])).kind, 'unknown');
});
test('verified property payment is not an operating expense', () => {
  const t = tx('ptx', 'expense', 2000, { purpose: 'property_installment_payment',
    linkedEntityType: 'property', linkedEntityId: 'contract', linkedPaymentId: 'p' });
  const property = { contracts: [{ id: 'contract', currencyCode: 'EGP' }],
    installments: [{ id: 'i', contractId: 'contract', amount: 5000 }],
    payments: [{ id: 'p', contractId: 'contract', installmentId: 'i',
      amount: 2000, date: t.date, accountId: 'bank', ledgerTransactionId: 'ptx' }] };
  assert.equal(classify(t, ctx([t], [], [], property)).kind, 'property_installment_payment');
});
test('property schedule without confirmed ledger payment has no transaction', () => {
  const property = { contracts: [{ id: 'c', currencyCode: 'EGP' }],
    installments: [{ id: 'i', contractId: 'c', amount: 5000 }], payments: [] };
  assert.deepEqual(classifyReportTransactions(ctx([], [], [], property)), []);
});
test('classifier does not mutate input', () => {
  const a = tx('salary', 'income', 100, { originalAmount: 2, originalCurrencyCode: 'USD' });
  const c = ctx([a]);
  const before = structuredClone(c);
  const item = classify(a, c);
  assert.deepEqual(c, before);
  assert.equal(item.originalAmount, 2);
  assert.equal(item.originalCurrencyCode, 'USD');
});

test('refund keeps original expense category across periods', () => {
  const original = tx('original-food', 'expense', 100, {
    categoryId: 'food', date: '2026-01-01',
  });
  const refund = tx('refund-food', 'expense', 40, {
    categoryId: 'other',
    entryType: 'refund',
    relatedTransactionId: 'original-food',
  });
  const item = classify(refund, ctx([original, refund]));
  assert.equal(item.kind, 'refund');
  assert.equal(item.categoryId, 'food');
  assert.equal(item.expenseAmount, -40);
});

test('duplicate property payment ID is rejected', () => {
  const paymentTx = tx('property-duplicate', 'expense', 2000, {
    purpose: 'property_installment_payment',
    linkedEntityType: 'property',
    linkedEntityId: 'contract',
    linkedPaymentId: 'payment',
  });
  const payment = {
    id: 'payment', contractId: 'contract',
    installmentId: 'installment', amount: 2000,
    date: paymentTx.date, accountId: 'bank',
    ledgerTransactionId: paymentTx.id,
  };
  const property = {
    contracts: [{ id: 'contract', currencyCode: 'EGP' }],
    installments: [{ id: 'installment', contractId: 'contract' }],
    payments: [
      payment,
      { ...payment, ledgerTransactionId: 'another-transaction' },
    ],
  };
  assert.equal(
    classify(paymentTx, ctx([paymentTx], [], [], property)).kind,
    'unknown',
  );
});

test('conflicting property ledger ownership is rejected', () => {
  const paymentTx = tx('property-conflict', 'expense', 2000, {
    purpose: 'property_installment_payment',
    linkedEntityType: 'property',
    linkedEntityId: 'contract',
    linkedPaymentId: 'payment',
  });
  const property = {
    contracts: [{ id: 'contract', currencyCode: 'EGP' }],
    installments: [{ id: 'installment', contractId: 'contract' }],
    payments: [
      {
        id: 'payment', contractId: 'contract',
        installmentId: 'installment', amount: 2000,
        date: paymentTx.date, accountId: 'bank',
        ledgerTransactionId: paymentTx.id,
      },
      {
        id: 'other-payment', contractId: 'contract',
        installmentId: 'installment', amount: 2000,
        date: paymentTx.date, accountId: 'bank',
        ledgerTransactionId: paymentTx.id,
      },
    ],
  };
  assert.equal(
    classify(paymentTx, ctx([paymentTx], [], [], property)).kind,
    'unknown',
  );
});
for (const amount of [0, -1, NaN, Infinity]) {
  test('refund cannot verify against invalid original amount: ' + amount, () => {
    const original = tx('original', 'expense', amount);
    const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id });
    assert.equal(classify(refund, ctx([original, refund])).kind, 'unknown');
  });
}
test('refund cannot bypass reverse property ownership evidence', () => {
  const original = tx('original', 'expense', 100);
  const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id });
  const property = { contracts: [], installments: [], payments: [{ id: 'p', ledgerTransactionId: original.id }] };
  assert.equal(classify(refund, ctx([original, refund], [], [], property)).kind, 'unknown');
});
for (const type of ['adjustment', undefined, null, 7]) {
  test('unsupported transaction type is explicitly unknown: ' + type, () => {
    const t = tx('bad', type, 100);
    assert.equal(classify(t, ctx([t])).kind, 'unknown');
  });
}

test('refund with reverse property ownership is unknown', () => {
  const original = tx('original', 'expense', 100);
  const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id });
  const property = { contracts: [], installments: [], payments: [{ id: 'p', ledgerTransactionId: refund.id }] };
  assert.equal(classify(refund, ctx([original, refund], [], [], property)).kind, 'unknown');
});
test('refund with unsupported purpose is unknown', () => {
  const original = tx('original', 'expense', 100);
  const refund = tx('refund', 'expense', 10, { entryType: 'refund', relatedTransactionId: original.id, purpose: 'unsupported' });
  assert.equal(classify(refund, ctx([original, refund])).kind, 'unknown');
});
test('account IDs must be unique even across currencies', () => {
  const t = tx('ordinary', 'income', 100);
  const data = ctx([t]);
  data.ledger.accounts.push(account('bank', 'USD'));
  assert.equal(classify(t, data).kind, 'unknown');
});


test('R4 device scenario: loan receipt and debt principal excluded, only loan financing cost and genuine fee counted', () => {
  const {getClassifiedMonthlyFinanceSummary}=require('../src/features/finance/utils/monthlySummary.ts');
  const {buildExpensesStatement}=require('../src/features/finance/utils/expensesStatementReconciliation.ts');
  const receipt=tx('received','income',100,{currencyCode:'USD',accountId:'other'});
  const installment=tx('installment','expense',20,{currencyCode:'USD',accountId:'other',purpose:'loan_payment',linkedEntityType:'loan',linkedEntityId:'l',linkedPaymentId:'p'});
  const payable=tx('paid','expense',40,{currencyCode:'USD',accountId:'other',purpose:'debt_payment',linkedEntityType:'debt',linkedEntityId:'d',linkedPaymentId:'dp'});
  const collection=tx('collected','income',40,{currencyCode:'USD',accountId:'other',purpose:'debt_collection',linkedEntityType:'debt',linkedEntityId:'r',linkedPaymentId:'rp'});
  const food=tx('food','expense',4,{currencyCode:'OMR',accountId:'omr'});
  const first=tx('refund1','expense',1.234,{currencyCode:'OMR',accountId:'omr',entryType:'refund',relatedTransactionId:'food'});
  const second=tx('refund2','expense',2.001,{currencyCode:'OMR',accountId:'omr',entryType:'refund',relatedTransactionId:'food'});
  const loan={id:'l',currencyCode:'USD',principalAmount:100,totalRepaymentAmount:120,receivedAmount:100,receivedAt:receipt.date,receiptTransactionId:receipt.id,payments:[{id:'p',amount:20,date:installment.date,accountId:'other',ledgerTransactionId:installment.id}]};
  const debt=(id,direction,pid,row)=>({id,direction,currencyCode:'USD',payments:[{id:pid,amount:40,date:row.date,accountId:'other',ledgerTransactionId:row.id}]});
  const data=ctx([receipt,installment,payable,collection,food,first,second],[loan],[debt('d','payable','dp',payable),debt('r','receivable','rp',collection)]);
  data.ledger.accounts.push(account('omr','OMR'));
  const before=structuredClone(data);
  assert.equal(classify(installment,data).expenseAmount,3.33);
  assert.equal(classify(receipt,data).incomeAmount,0);
  assert.equal(classify(payable,data).expenseAmount,0);
  assert.equal(classify(collection,data).incomeAmount,0);
  const result=buildExpensesStatement(data,{from:'2026-11-01',to:'2026-11-30'});
  assert.equal(result.reconciled,true);
  assert.equal(result.rows.find(r=>r.id==='installment').amount,3.33);
  assert.deepEqual(getClassifiedMonthlyFinanceSummary(data,'2026-11','USD',{USD:1,OMR:2.5},['USD','OMR']),{income:0,expense:5.243,missing:0});
  assert.deepEqual(data,before);
});

test('R4 cumulative minor-unit financing allocation reconciles the whole contract',()=>{
  const {verifiedLoanFinanceCost}=require('../src/features/finance/utils/reportTransactionClassifier.ts');
  const loan={currencyCode:'USD',principalAmount:100,totalRepaymentAmount:120,payments:Array.from({length:6},(_,i)=>({id:'p'+i,amount:20,latePaymentFee:i===0?1:0}))};
  assert.deepEqual(loan.payments.map(p=>verifiedLoanFinanceCost(loan,p)),[4.33,3.34,3.33,3.33,3.34,3.33]);
});

test('R4 default fee category is staged only for the explicit fee and never resurrects archived or conflicting identities',()=>{
  const {categoriesForTransferFee,TRANSFER_FEES_CATEGORY:c}=require('../src/features/finance/utils/transferSettlement.ts');
  const ledger=ctx([]).ledger;
  assert.equal(categoriesForTransferFee({feeAmount:0,feeCategoryId:c.id},ledger),ledger.categories);
  assert.deepEqual(categoriesForTransferFee({feeAmount:2,feeCategoryId:c.id},ledger),[c]);
  assert.deepEqual(ledger.categories,[]);
  ledger.categories=[{...c,archived:true}];
  assert.equal(categoriesForTransferFee({feeAmount:2,feeCategoryId:c.id},ledger),ledger.categories);
  ledger.categories=[];ledger.accounts.push(account(c.id));
  assert.equal(categoriesForTransferFee({feeAmount:2,feeCategoryId:c.id},ledger),ledger.categories);
});
