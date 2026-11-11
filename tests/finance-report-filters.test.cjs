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


const { aggregateOperatingReport: report } = require('../src/features/finance/utils/reportAggregation.ts');
const period = { from: '2026-11-01', to: '2026-11-30' };
const tx = (id, type, amount, extra = {}) => ({ id, type, amount, accountId: 'egp', currencyCode: 'EGP',
  categoryId: 'food', date: '2026-11-10', ...extra });
const context = (transactions = []) => ({ ledger: {
  accounts: [{id:'egp',currencyCode:'EGP'},{id:'second',currencyCode:'EGP'},
    {id:'usd',currencyCode:'USD'},{id:'omr',currencyCode:'OMR'}],
  categories: [], transactions, transfers: [],
}, finance: { assets: [], loans: [], debts: [], cheques: [] } });
const refunds = () => context([
  tx('original','expense',100,{categoryId:'food',date:'2026-10-01'}),
  tx('refund','expense',25,{accountId:'second',entryType:'refund',relatedTransactionId:'original',categoryId:'other'}),
]);
const checkReconciliation = r => {
  for(const total of r.currencies) {
    const factor=total.currencyCode==='OMR'?1000:100;
    const sum=categories=>categories.filter(c=>c.currencyCode===total.currencyCode)
      .reduce((units,c)=>units+Math.round(c.amount*factor),0);
    assert.equal(sum(r.incomeCategories),total.minorUnits.income);
    assert.equal(sum(r.expenseCategories),total.minorUnits.expenses);
    assert.equal(total.minorUnits.net,total.minorUnits.income-total.minorUnits.expenses);
  }
};

test('omitted, undefined and empty filters preserve legacy shape and diagnostics',()=>{
  const data=context([tx('income','income',5),tx('bad','expense',1,{entryType:'refund',relatedTransactionId:'missing'}),
    tx('date','income',2,{date:'bad'})]);
  const plain=report(data,period);
  assert.deepEqual(plain,{period,currencies:[{currencyCode:'EGP',income:5,expenses:0,net:5}],
    incomeCategories:[{currencyCode:'EGP',categoryId:'food',amount:5}],expenseCategories:[],
    unknown:[{id:'bad',date:'2026-11-10',reason:'Refund original missing, incompatible or protected'},
      {id:'date',date:'bad',reason:'Invalid transaction date'}],includedTransactions:1});
  assert.equal(Object.hasOwn(plain,'status'),false);
  for(const filters of [undefined,{}]) {
    const actual=report(data,period,filters);
    assert.deepEqual(actual,plain);
    assert.deepEqual(actual.currencies[0].minorUnits,plain.currencies[0].minorUnits);
    assert.deepEqual(Object.getOwnPropertyDescriptor(actual.currencies[0],'minorUnits'),
      Object.getOwnPropertyDescriptor(plain.currencies[0],'minorUnits'));
  }
});
test('single account selects actual transaction account',()=>{
  const r=report(context([tx('one','income',10),tx('two','income',20,{accountId:'second'})]),period,{accountId:'egp'});
  assert.equal(r.currencies[0].income,10); assert.equal(r.includedTransactions,1);assert.equal(r.status,'complete');
});
test('single category selects classified category',()=>{
  const r=report(context([tx('one','expense',10),tx('two','expense',20,{categoryId:'other'})]),period,{categoryId:'food'});
  assert.equal(r.currencies[0].expenses,10);assert.equal(r.includedTransactions,1);checkReconciliation(r);
});
test('combined account/category filters intersect',()=>{
  const r=report(context([tx('one','income',10),tx('two','income',20,{accountId:'second'}),
    tx('three','income',30,{categoryId:'other'})]),period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.currencies[0].income,10);assert.equal(r.includedTransactions,1);
});
test('period boundaries remain inclusive under filters',()=>{
  const data=context([tx('before','income',100,{date:'2026-10-31'}),tx('first','income',1,{date:period.from}),
    tx('last','income',2,{date:period.to}),tx('after','income',100,{date:'2026-12-01'})]);
  const r=report(data,period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.currencies[0].income,3);assert.equal(r.includedTransactions,2);
});
test('refund is selected by receiving account, not original expense account',()=>{
  const data=refunds();
  assert.equal(report(data,period,{accountId:'egp'}).includedTransactions,0);
  const r=report(data,period,{accountId:'second'});
  assert.equal(r.currencies[0].expenses,-25);assert.equal(r.status,'complete');
});
test('refund uses original category outside period and account selection',()=>{
  const data=refunds();
  const r=report(data,period,{accountId:'second',categoryId:'food'});
  assert.equal(r.currencies[0].expenses,-25);assert.equal(r.expenseCategories[0].categoryId,'food');
  assert.equal(r.includedTransactions,1);assert.equal(r.status,'complete');
  assert.equal(report(data,period,{categoryId:'other'}).includedTransactions,0);
  checkReconciliation(r);
});
test('cross-currency refund uses actual receiving currency and original category',()=>{
  const data=refunds();data.ledger.transactions[1].accountId='usd';data.ledger.transactions[1].currencyCode='USD';
  const r=report(data,period,{accountId:'usd',categoryId:'food'});
  assert.deepEqual(r.currencies,[{currencyCode:'USD',income:0,expenses:-25,net:25}]);
});
test('ambiguous UNKNOWN categories remain diagnostic even when raw category differs',()=>{
  const data=context([tx('known','income',5),tx('orphan','expense',3,{categoryId:'other',entryType:'refund',relatedTransactionId:'missing'})]);
  const r=report(data,period,{categoryId:'food'});
  assert.equal(r.currencies[0].income,5);assert.equal(r.includedTransactions,1);
  assert.deepEqual(r.unknown.map(t=>t.id),['orphan']);assert.equal(r.status,'incomplete');
});
test('account scope excludes unrelated unknowns but preserves selected ones',()=>{
  const data=context([tx('bad','expense',1,{accountId:'second',purpose:'loan_principal_payment'})]);
  assert.equal(report(data,period,{accountId:'egp',categoryId:'food'}).status,'complete');
  const r=report(data,period,{accountId:'second',categoryId:'food'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown.length,1);assert.equal(r.includedTransactions,0);
});
test('unknowns with valid dates outside the period do not affect completeness',()=>{
  const data=context([tx('bad','expense',1,{purpose:'loan_principal_payment',date:'2026-10-01'})]);
  assert.equal(report(data,period,{categoryId:'food'}).status,'complete');
});
test('invalid dates with ambiguous category remain uncertain in selected account',()=>{
  const data=context([tx('bad','expense',1,{date:'bad',purpose:'loan_principal_payment',categoryId:'other'})]);
  const r=report(data,period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].reason,'Invalid transaction date');
  assert.equal(report(data,period,{accountId:'second'}).status,'complete');
});
for(const filters of [null,[],1,'egp',true,{accountId:''},{categoryId:''},{accountId:' '},
  {categoryId:' food'},{accountId:'egp '},{categoryId:'a b'},{accountId:'a\n'},
  {accountId:null},{categoryId:1},{accountId:undefined},{categoryId:undefined},
  {accountIds:['egp']},{unexpected:true},{[Symbol('key')]:'egp'},Object.create({accountId:'egp'})]) {
  test('malformed filter rejected: '+String(filters),()=>{
    assert.throws(()=>report(context(),period,filters),/Invalid report filter/);
  });
}
test('nonexistent identifiers yield an empty selection and never unfiltered totals',()=>{
  const data=context([tx('income','income',5)]);
  for(const filters of [{accountId:'missing'},{categoryId:'missing'},{accountId:'egp',categoryId:'missing'}]) {
    const r=report(data,period,filters);assert.equal(r.status,'complete');assert.equal(r.includedTransactions,0);
    assert.deepEqual(r.currencies,[]);assert.deepEqual(r.incomeCategories,[]);
  }
});
test('nonexistent category still exposes potentially relevant unknowns',()=>{
  const data=context([tx('bad','expense',1,{entryType:'refund',relatedTransactionId:'missing'})]);
  const r=report(data,period,{categoryId:'missing'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown.length,1);assert.deepEqual(r.currencies,[]);
});
test('filters remain case sensitive and IDs are not coerced',()=>{
  assert.equal(report(context([tx('x','income',1)]),period,{accountId:'EGP'}).includedTransactions,0);
});
test('category filter keeps currencies separate with exact minor units',()=>{
  const data=context([tx('egp','income',0.29),tx('usd','income',0.01,{accountId:'usd',currencyCode:'USD'}),
    tx('omr','expense',0.001,{accountId:'omr',currencyCode:'OMR'})]);
  const r=report(data,period,{categoryId:'food'});
  assert.equal(r.currencies.length,3);assert.equal(r.currencies[0].minorUnits.income,29);
  assert.equal(r.currencies.find(c=>c.currencyCode==='OMR').minorUnits.expenses,1);checkReconciliation(r);
});
test('selected invalid precision and unsupported currency fail closed without category contamination',()=>{
  for(const [currencyCode,amount] of [['EGP',0.301],['OMR',0.0001],['JPY',1]]) {
    const data=context([tx('bad','income',amount,{accountId:'test',currencyCode})]);
    data.ledger.accounts.push({id:'test',currencyCode});
    const r=report(data,period,{accountId:'test',categoryId:'food'});
    assert.equal(r.status,'incomplete');assert.equal(r.unknown.length,1);
    assert.deepEqual(r.currencies,[]);assert.deepEqual(r.incomeCategories,[]);
  }
});
test('unselected known category precision errors do not contaminate selected totals',()=>{
  const r=report(context([tx('good','income',1),tx('bad','income',0.301,{categoryId:'other'})]),period,{categoryId:'food'});
  assert.equal(r.status,'complete');assert.equal(r.currencies[0].income,1);
});
test('filtered overflow rejects whole transactions before totals/categories change',()=>{
  const r=report(context([tx('large','income',90000000000000),tx('overflow','income',1000000000000),
    tx('unselected','expense',1,{categoryId:'other'})]),period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.status,'incomplete');assert.equal(r.includedTransactions,1);assert.equal(r.unknown.length,1);
  assert.equal(r.currencies[0].income,90000000000000);checkReconciliation(r);
});
test('classification retains duplicate evidence outside account/date filters',()=>{
  const r=report(context([tx('dup','income',1),tx('dup','income',2,{accountId:'second',date:'2026-10-01'})]),period,{accountId:'egp'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown.length,1);assert.equal(r.includedTransactions,0);
});
test('internal/credit-card transfers and verified financing remain excluded',()=>{
  const receipt=tx('receipt','income',100);
  const payment=tx('payment','expense',10,{purpose:'loan_payment',linkedEntityType:'loan',linkedEntityId:'loan',linkedPaymentId:'p'});
  const collection=tx('collection','income',7,{purpose:'debt_collection',linkedEntityType:'debt',linkedEntityId:'debt',linkedPaymentId:'d'});
  const data=context([receipt,payment,collection,tx('operating','income',1)]);
  data.finance.loans=[{id:'loan',currencyCode:'EGP',receiptTransactionId:'receipt',receivedAmount:100,receivedAt:receipt.date,
    payments:[{id:'p',amount:10,latePaymentFee:0,date:payment.date,accountId:'egp',ledgerTransactionId:'payment'}]}];
  data.finance.debts=[{id:'debt',currencyCode:'EGP',direction:'receivable',payments:[{id:'d',amount:7,date:collection.date,accountId:'egp',ledgerTransactionId:'collection'}]}];
  data.ledger.transfers=[{id:'t',type:'internal',amount:100,fromAccountId:'egp',toAccountId:'usd',date:period.from},
    {id:'cc',type:'credit_card_payment',amount:100,fromAccountId:'egp',toAccountId:'usd',date:period.from}];
  const r=report(data,period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.status,'complete');assert.equal(r.includedTransactions,1);assert.equal(r.currencies[0].income,1);
});
test('filtered categories reconcile after expenses, refunds and income',()=>{
  const data=refunds();data.ledger.transactions.push(tx('expense','expense',30,{accountId:'second'}),tx('income','income',5,{accountId:'second'}));
  const r=report(data,period,{accountId:'second',categoryId:'food'});
  assert.equal(r.currencies[0].expenses,5);assert.equal(r.currencies[0].net,0);checkReconciliation(r);
});
test('frozen inputs, finance, filters and period remain unchanged',()=>{
  const data=refunds(),filters={accountId:'second',categoryId:'food'},dates={...period};
  const before=structuredClone({data,filters,dates});
  const freeze=o=>{Object.freeze(o);Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});};
  freeze(data);freeze(filters);freeze(dates);report(data,dates,filters);
  assert.deepEqual({data,filters,dates},before);
});

// D1: runtime records can survive hydration without a validated transaction type.
for (const [label, type] of [['adjustment','adjustment'], ['undefined',undefined],
  ['null',null], ['number',7], ['object',{}], ['array',[]], ['boolean',true],
  ['transfer','transfer'], ['refund-kind','refund']]) {
  test('D1 malformed type '+label+' is diagnostic without contaminating totals',()=>{
    const data=context([tx('good','income',5),tx('bad',type,100)]);
    const r=report(data,period,{accountId:'egp',categoryId:'food'});
    assert.equal(r.status,'incomplete');assert.equal(r.includedTransactions,1);
    assert.deepEqual(r.unknown,[{id:'bad',date:'2026-11-10',reason:'Invalid or unsupported transaction type'}]);
    assert.deepEqual(r.currencies,[{currencyCode:'EGP',income:5,expenses:0,net:5}]);
    assert.deepEqual(r.incomeCategories,[{currencyCode:'EGP',categoryId:'food',amount:5}]);
    assert.deepEqual(r.expenseCategories,[]);checkReconciliation(r);
  });
}
test('D1 missing type property is diagnostic for account-only filters',()=>{
  const bad=tx('bad','income',100);delete bad.type;
  const r=report(context([bad]),period,{accountId:'egp'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].reason,'Invalid or unsupported transaction type');
  assert.equal(r.includedTransactions,0);assert.deepEqual(r.currencies,[]);
});
test('D1 different raw category cannot exclude a malformed type',()=>{
  const data=context([tx('bad','adjustment',100,{categoryId:'other'})]);
  for(const filters of [{categoryId:'food'},{accountId:'egp',categoryId:'food'}]) {
    const r=report(data,period,filters);
    assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].id,'bad');assert.equal(r.includedTransactions,0);
  }
});
test('D1 uniquely known unrelated account safely excludes a malformed type',()=>{
  const data=context([tx('good','income',5),tx('bad','adjustment',100,{accountId:'second',categoryId:'other'})]);
  for(const filters of [{accountId:'egp'},{accountId:'egp',categoryId:'food'}]) {
    const r=report(data,period,filters);
    assert.equal(r.status,'complete');assert.deepEqual(r.unknown,[]);assert.equal(r.currencies[0].income,5);
  }
});
for(const [label,accountId] of [['undefined',undefined],['null',null],['empty',''],
  ['object',{}],['unrecognized','ghost'],['duplicate','duplicate']]) {
  test('D1 '+label+' account cannot safely exclude a malformed type',()=>{
    const data=context([tx('bad','adjustment',100,{accountId,categoryId:'other'})]);
    data.ledger.accounts.push({id:'duplicate',currencyCode:'EGP'},{id:'duplicate',currencyCode:'USD'});
    for(const filters of [{accountId:'egp'},{accountId:'egp',categoryId:'food'}]) {
      const r=report(data,period,filters);
      assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].id,'bad');
      assert.equal(r.includedTransactions,0);assert.deepEqual(r.currencies,[]);
    }
  });
}
test('D1 missing account property cannot safely exclude a malformed transaction',()=>{
  const bad=tx('bad','adjustment',100);delete bad.accountId;
  const r=report(context([bad]),period,{accountId:'egp'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].id,'bad');assert.deepEqual(r.currencies,[]);
});
test('D1 valid type with unresolved account identity remains diagnostic, never a selected-account total',()=>{
  const data=context([tx('bad','income',100,{accountId:'ghost',categoryId:'other'})]);
  const r=report(data,period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].reason,'Transaction account identity unavailable or ambiguous');
  assert.equal(r.includedTransactions,0);assert.deepEqual(r.currencies,[]);
});
test('D1 valid out-of-period dates safely exclude malformed records',()=>{
  for(const date of ['2026-10-31','2026-12-01']) {
    const r=report(context([tx('bad','adjustment',100,{accountId:undefined,date})]),period,{accountId:'egp'});
    assert.equal(r.status,'complete');assert.deepEqual(r.unknown,[]);assert.deepEqual(r.currencies,[]);
  }
});
test('D1 invalid dates cannot safely exclude malformed records',()=>{
  const r=report(context([tx('bad','adjustment',100,{date:'bad',categoryId:'other'})]),period,{accountId:'egp',categoryId:'food'});
  assert.equal(r.status,'incomplete');assert.equal(r.unknown[0].reason,'Invalid or unsupported transaction type');
  assert.deepEqual(r.currencies,[]);
});
test('D1 malformed amounts/currencies are never inferred or accumulated',()=>{
  for(const amount of [100,-100,NaN,Infinity,Number.MAX_SAFE_INTEGER]) {
    const r=report(context([tx('bad','adjustment',amount,{currencyCode:'JPY'})]),period,{accountId:'egp'});
    assert.equal(r.status,'incomplete');assert.equal(r.unknown.length,1);
    assert.deepEqual(r.currencies,[]);assert.deepEqual(r.incomeCategories,[]);assert.deepEqual(r.expenseCategories,[]);
  }
});
test('D1 omitted, undefined and empty filters retain exact legacy malformed-type behavior',()=>{
  const data=context([tx('good','income',5),tx('bad','adjustment',100),tx('missing',undefined,100)]);
  const expected={period,currencies:[{currencyCode:'EGP',income:5,expenses:0,net:5}],
    incomeCategories:[{currencyCode:'EGP',categoryId:'food',amount:5}],expenseCategories:[],unknown:[],includedTransactions:1};
  const omitted=report(data,period);
  assert.deepEqual(omitted,expected);assert.equal(Object.hasOwn(omitted,'status'),false);
  for(const filters of [undefined,{}]) {
    const r=report(data,period,filters);assert.deepEqual(r,expected);assert.equal(Object.hasOwn(r,'status'),false);
    assert.deepEqual(r.currencies[0].minorUnits,omitted.currencies[0].minorUnits);
  }
});
test('D1 frozen malformed records and selection inputs remain unchanged',()=>{
  const data=context([tx('bad','adjustment',100,{accountId:undefined,categoryId:'other'})]);
  const filters={accountId:'egp',categoryId:'food'},dates={...period};
  const before=structuredClone({data,filters,dates});
  const freeze=o=>{Object.freeze(o);Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});};
  freeze(data);freeze(filters);freeze(dates);
  assert.equal(report(data,dates,filters).status,'incomplete');assert.deepEqual({data,filters,dates},before);
});
