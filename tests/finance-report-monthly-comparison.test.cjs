/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;

Module._load = function (id, parent, main) {
  if (id.startsWith('@/')) {
    return originalLoad.call(
      this, path.join(root, 'src', id.slice(2)), parent, main,
    );
  }
  return originalLoad.call(this, id, parent, main);
};

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    const output = ts.transpileModule(
      fs.readFileSync(filename, 'utf8'),
      {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    module._compile(output, filename);
  };
}


const { aggregateMonthlyOperatingComparison: compare } = require('../src/features/finance/utils/reportMonthlyComparison.ts');
const tx = (id, type, amount, date, extra = {}) => ({ id, type, amount, date,
  accountId: 'EGP', currencyCode: 'EGP', categoryId: 'general', ...extra });
const context = (transactions = []) => ({ ledger: {
  accounts: ['EGP','USD','OMR','KWD','JOD'].map(currencyCode => ({ id: currencyCode, currencyCode })),
  transactions, transfers: [], categories: [],
}, finance: { assets: [], loans: [], debts: [], cheques: [] } });
const row = (result, currency = 'EGP') => result.currencies.find(r => r.currencyCode === currency);

test('normal monthly totals, signed differences and percentages', () => {
  const r = compare(context([tx('old','income',100,'2026-10-01'), tx('old-e','expense',40,'2026-10-31'),
    tx('new','income',150,'2026-11-01'),tx('new-e','expense',50,'2026-11-30'),
    tx('future','income',999,'2026-12-01')]),'2026-11');
  assert.deepEqual(row(r).income, {current:150,previous:100,difference:50,percentageChange:50,reason:null});
  assert.equal(row(r).expenses.difference,10);
  assert.equal(row(r).net.current,100);
  assert.equal(row(r).net.previous,60);
  assert.equal(r.current.report.includedTransactions,2);
});
test('January compares inclusive December of the previous year', () => {
  const r=compare(context([tx('dec','income',1,'2025-12-31'),tx('jan','income',2,'2026-01-31')]),'2026-01');
  assert.deepEqual(r.previous.report.period,{from:'2025-12-01',to:'2025-12-31'});
  assert.equal(row(r).income.difference,1);
});
for (const [month,end] of [['2024-02','29'],['2025-02','28'],['2000-02','29'],['2100-02','28']]) {
  test(month+' uses correct February range',()=>{
    const r=compare(context([tx('last','income',1,month+'-'+end)]),month);
    assert.equal(r.current.report.period.to,month+'-'+end);
    assert.equal(row(r).income.current,1);
  });
}
test('empty months are explicit known zeros, including a ledger without accounts',()=>{
  const r=compare(context(),'2026-11');
  assert.equal(r.current.status,'no_transactions');
  assert.equal(r.previous.status,'no_transactions');
  assert.equal(row(r).currentStatus,'no_operating_activity');
  assert.equal(row(r).income.current,0);
  const data=context(); data.ledger.accounts=[];
  assert.deepEqual(compare(data,'2026-11').currencies,[]);
});
test('EGP and USD remain separate and an absent complete period is zero',()=>{
  const r=compare(context([tx('egp','income',10,'2026-10-10'),
    tx('usd','income',2,'2026-11-10',{accountId:'USD',currencyCode:'USD'})]),'2026-11');
  assert.equal(row(r).income.current,0);
  assert.equal(row(r).income.difference,-10);
  assert.equal(row(r,'USD').income.previous,0);
  assert.equal(row(r,'USD').income.percentageChange,null);
  assert.equal(row(r,'USD').income.reason,'zero_baseline');
});
for(const currencyCode of ['OMR','KWD','JOD']) {
  test(currencyCode+' preserves minor units in differences',()=>{
    const extra={accountId:currencyCode,currencyCode};
    const r=compare(context([tx('old','income',0.001,'2026-10-01',extra),
      tx('new','income',0.003,'2026-11-01',extra)]),'2026-11');
    assert.equal(row(r,currencyCode).income.difference,0.002);
    assert.equal(row(r,currencyCode).income.percentageChange,200);
  });
}
test('cross-month refunds keep original category and negative expenses',()=>{
  const r=compare(context([tx('buy','expense',100,'2026-10-01',{categoryId:'food'}),
    tx('refund','expense',25,'2026-11-01',{entryType:'refund',relatedTransactionId:'buy',categoryId:'other'})]),'2026-11');
  assert.equal(row(r).expenses.current,-25);
  assert.equal(row(r).expenses.difference,-125);
  assert.equal(row(r).expenses.percentageChange,-125);
  assert.equal(row(r).net.previous,-100);
  assert.equal(row(r).net.percentageChange,null);
  assert.equal(row(r).net.reason,'negative_baseline');
  assert.equal(r.current.report.expenseCategories[0].categoryId,'food');
});
test('unknown diagnostics stay in their months and incomplete is never zero',()=>{
  const r=compare(context([tx('old-bad','expense',1,'2026-10-10',{purpose:'loan_principal_payment'}),
    tx('new-bad','expense',1,'2026-11-10',{entryType:'refund',relatedTransactionId:'missing'}),
    tx('known','income',5,'2026-11-10')]),'2026-11');
  assert.deepEqual(r.previous.report.unknown.map(x=>x.id),['old-bad']);
  assert.deepEqual(r.current.report.unknown.map(x=>x.id),['new-bad']);
  assert.equal(r.current.status,'incomplete');
  assert.equal(r.current.report.currencies[0].income,5);
  for(const c of r.currencies) {
    assert.equal(c.income.current,null); assert.equal(c.income.previous,null);
    assert.equal(c.income.difference,null); assert.equal(c.income.reason,'incomplete_data');
  }
});
test('invalid dates cannot be assigned to a month and invalidate both',()=>{
  const r=compare(context([tx('bad','income',1,'2026-11-31')]),'2026-11');
  assert.equal(r.current.report.unknown[0].id,'bad');
  assert.equal(r.previous.report.unknown[0].id,'bad');
  assert.equal(row(r).income.current,null);
});
test('zero baseline returns null with reason even when both values are zero',()=>{
  const r=compare(context(),'2026-11');
  assert.equal(row(r).income.difference,0);
  assert.equal(row(r).income.percentageChange,null);
  assert.equal(row(r).income.reason,'zero_baseline');
});
test('invalid month inputs are rejected strictly',()=>{
  for(const month of ['2026-1','2026-00','2026-13','2026-11-01',' 2026-11','2026-11\n','0000-01','0100-01',null,undefined,202611]) {
    assert.throws(()=>compare(context(),month),/Invalid report month/);
  }
});
test('input remains deeply unchanged, including unknowns and refunds',()=>{
  const data=context([tx('buy','expense',1,'2026-10-01'),tx('refund','expense',0.1,'2026-11-01',{entryType:'refund',relatedTransactionId:'buy'})]);
  const before=structuredClone(data);
  const freeze=o=>{ Object.freeze(o); Object.values(o).forEach(v=>{if(v && typeof v==='object') freeze(v);}); };
  freeze(data); compare(data,'2026-11'); assert.deepEqual(data,before);
});
for(const amount of [Number.MAX_SAFE_INTEGER,Infinity,NaN,0.001]) {
  test('unsafe or invalid amount '+amount+' makes totals incomplete',()=>{
    const r=compare(context([tx('bad','income',amount,'2026-11-01')]),'2026-11');
    assert.equal(r.current.status,'incomplete');
    assert.equal(row(r).income.current,null);
    assert.equal(r.current.report.unknown.length,1);
  });
}
test('aggregation overflow remains diagnostic and does not become a complete partial total',()=>{
  const r=compare(context([tx('large','income',90000000000000,'2026-11-01'),
    tx('overflow','income',1000000000000,'2026-11-02')]),'2026-11');
  assert.equal(r.current.status,'incomplete');
  assert.equal(row(r).income.current,null);
});
test('difference overflow is explicit even when individual monthly nets are safe',()=>{
  const r=compare(context([tx('expense','expense',90000000000000,'2026-10-01'),
    tx('income','income',90000000000000,'2026-11-01')]),'2026-11');
  assert.equal(row(r).net.current,90000000000000);
  assert.equal(row(r).net.previous,-90000000000000);
  assert.equal(row(r).net.difference,null);
  assert.equal(row(r).net.reason,'unsafe_difference');
});
test('unsupported currencies are diagnosed without creating fallback comparison rows',()=>{
  const data=context([tx('bad','income',1,'2026-11-01',{accountId:'JPY',currencyCode:'JPY'})]);
  data.ledger.accounts.push({id:'JPY',currencyCode:'JPY'});
  const r=compare(data,'2026-11');
  assert.equal(r.current.status,'incomplete');
  assert.equal(r.currencies.some(c=>c.currencyCode==='JPY'),false);
});

test('negative expense baseline reports monetary change without ambiguous percentage',()=>{
  const data=context([tx('buy','expense',10,'2026-09-01'),
    tx('refund','expense',5,'2026-10-01',{entryType:'refund',relatedTransactionId:'buy'}),
    tx('expense','expense',2,'2026-11-01')]);
  const r=compare(data,'2026-11');
  assert.equal(row(r).expenses.previous,-5);
  assert.equal(row(r).expenses.current,2);
  assert.equal(row(r).expenses.difference,7);
  assert.equal(row(r).expenses.percentageChange,null);
  assert.equal(row(r).expenses.reason,'negative_baseline');
});
test('excluded loan receipts and transfers do not become monthly operating activity',()=>{
  const receipt=tx('receipt','income',100,'2026-11-10');
  const data=context([receipt]);
  data.finance.loans=[{id:'loan',receiptTransactionId:'receipt',receivedAmount:100,receivedAt:receipt.date,currencyCode:'EGP',payments:[]}];
  data.ledger.transfers=[{id:'transfer',type:'internal',fromAccountId:'EGP',toAccountId:'USD',amount:1,date:'2026-11-10'}];
  const r=compare(data,'2026-11');
  assert.equal(r.current.status,'available');
  assert.equal(r.current.report.includedTransactions,0);
  assert.equal(row(r).currentStatus,'no_operating_activity');
  assert.equal(row(r).income.current,0);
});
test('a complete prior month remains known when the current month is incomplete',()=>{
  const r=compare(context([tx('old','income',10,'2026-10-01'),
    tx('bad','expense',1,'2026-11-01',{purpose:'loan_principal_payment'})]),'2026-11');
  assert.equal(row(r).income.current,null);
  assert.equal(row(r).income.previous,10);
  assert.equal(row(r).income.difference,null);
  assert.equal(r.previous.report.unknown.length,0);
});


test('8.2C regression: large EGP totals preserve exact minor-unit difference', () => {
  const r = compare(context([
    tx('previous-base', 'income', 90000000000000, '2026-10-01'),
    tx('previous-extra', 'income', 719925474.89, '2026-10-02'),
    tx('current-base', 'income', 90000000000000, '2026-11-01'),
    tx('current-extra', 'income', 719925474.90, '2026-11-02'),
  ]), '2026-11');

  const income = row(r).income;
  assert.equal(r.current.status, 'available');
  assert.equal(r.previous.status, 'available');
  assert.equal(income.difference, 0.01);
  assert.equal(income.reason, null);
});

test('8.2C regression: large OMR totals preserve exact minor-unit difference', () => {
  const extra = { accountId: 'OMR', currencyCode: 'OMR' };
  const r = compare(context([
    tx('previous-base', 'income', 9000000000000, '2026-10-01', extra),
    tx('previous-extra', 'income', 719925474.089, '2026-10-02', extra),
    tx('current-base', 'income', 9000000000000, '2026-11-01', extra),
    tx('current-extra', 'income', 719925474.090, '2026-11-02', extra),
  ]), '2026-11');

  const income = row(r, 'OMR').income;
  assert.equal(r.current.status, 'available');
  assert.equal(r.previous.status, 'available');
  assert.equal(income.difference, 0.001);
  assert.equal(income.reason, null);
});

test('8.2C regression: unsafe single large fractional EGP transactions fail closed', () => {
  const r = compare(context([
    tx('previous', 'income', 90000719925474.89, '2026-10-01'),
    tx('current', 'income', 90000719925474.90, '2026-11-01'),
  ]), '2026-11');

  assert.equal(r.previous.status, 'incomplete');
  assert.equal(r.current.status, 'incomplete');
  assert.equal(r.previous.report.unknown[0].id, 'previous');
  assert.equal(r.current.report.unknown[0].id, 'current');
  assert.equal(row(r).income.difference, null);
  assert.equal(row(r).income.reason, 'incomplete_data');
});

test('8.2C guard: unsafe large fractional expense', () => {
  const r = compare(context([
    tx('expense-large', 'expense', 90000719925474.89, '2026-11-01'),
  ]), '2026-11');

  assert.equal(r.current.status, 'incomplete');
  assert.equal(r.current.report.unknown[0].id, 'expense-large');
  assert.equal(row(r).expenses.current, null);
  assert.equal(row(r).expenses.reason, 'incomplete_data');
});

test('8.2C guard: unsafe large fractional refund', () => {
  const r = compare(context([
    tx('original', 'expense', 90000000000000, '2026-10-01', {
      categoryId: 'food',
    }),
    tx('refund-large', 'expense', 90000719925474.89, '2026-11-01', {
      entryType: 'refund',
      relatedTransactionId: 'original',
      categoryId: 'other',
    }),
  ]), '2026-11');

  assert.equal(r.current.status, 'incomplete');
  assert.equal(r.current.report.unknown[0].id, 'refund-large');
  assert.equal(row(r).expenses.current, null);
  assert.equal(row(r).expenses.reason, 'incomplete_data');
});

test('8.2C guard: unsafe large fractional OMR income', () => {
  const r = compare(context([
    tx('omr-large', 'income', 9000719925474.089, '2026-11-01', {
      accountId: 'OMR',
      currencyCode: 'OMR',
    }),
  ]), '2026-11');

  assert.equal(r.current.status, 'incomplete');
  assert.equal(r.current.report.unknown[0].id, 'omr-large');
  assert.equal(row(r, 'OMR').income.current, null);
  assert.equal(row(r, 'OMR').income.reason, 'incomplete_data');
});

test('8.2C guard: large exact integer remains available', () => {
  const r = compare(context([
    tx('integer-large', 'income', 90000000000000, '2026-11-01'),
  ]), '2026-11');

  assert.equal(r.current.status, 'available');
  assert.equal(r.current.report.unknown.length, 0);
  assert.equal(row(r).income.current, 90000000000000);
});

for (const [currency, amount, expected] of [
  ['EGP', 25000000000000.5, 25000000000000.5],
  ['OMR', 2500000000000.125, 2500000000000.125],
  ['KWD', 2500000000000.125, 2500000000000.125],
  ['JOD', 2500000000000.125, 2500000000000.125],
]) {
  test('8.2C regression: exact large fractional ' + currency + ' accepted', () => {
    const r = compare(context([
      tx('valid-large', 'income', amount, '2026-11-01', {
        accountId: currency,
        currencyCode: currency,
      }),
    ]), '2026-11');

    assert.equal(r.current.status, 'available');
    assert.equal(r.current.report.unknown.length, 0);
    assert.equal(row(r, currency).income.current, expected);
  });
}

for (const [currency, amount] of [
  ['EGP', 70368744177663.99],
  ['OMR', 8796093022207.999],
  ['KWD', 8796093022207.999],
  ['JOD', 8796093022207.999],
]) {
  test('8.2C regression: power-of-two boundary ' + currency, () => {
    const r = compare(context([
      tx('boundary', 'income', amount, '2026-11-01', {
        accountId: currency,
        currencyCode: currency,
      }),
    ]), '2026-11');

    assert.equal(r.current.status, 'available');
    assert.equal(r.current.report.unknown.length, 0);
    assert.equal(row(r, currency).income.current, amount);
  });
}