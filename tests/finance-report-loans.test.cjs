const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {aggregateLoansReport}=require('../src/features/finance/utils/reportLoans.ts');
const period={from:'2026-02-01',to:'2026-02-28'};
const loan=(overrides={})=>({id:'l1',name:'Bank',lenderName:'Bank',currencyCode:'EGP',
 principalAmount:1000,totalRepaymentAmount:1200,monthlyInstallment:100,numberOfInstallments:12,
 firstDueDate:'2026-02-01',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
 payments:[],...overrides});
const pay=(id,date,amount,latePaymentFee=0)=>({id,date,amount,latePaymentFee});
test('contractual and principal balances stay distinct',()=>{
 const r=aggregateLoansReport([loan({payments:[pay('a','2026-02-05',120)]})],period)[0];
 assert.equal(r.currentContractualRemaining,1080);
 assert.equal(r.currentPrincipalRemaining,900);
 assert.equal(r.periodPaid,120);
});
test('late fees are separate from contractual payments',()=>{
 const r=aggregateLoansReport([loan({payments:[pay('a','2026-02-05',100,15)]})],period)[0];
 assert.equal(r.periodLateFees,15);assert.equal(r.totalPaid,100);
});
test('period and later payments differ',()=>{
 const r=aggregateLoansReport([loan({payments:[pay('a','2026-02-05',100),pay('b','2026-03-01',100)]})],period)[0];
 assert.equal(r.periodPaid,100);assert.equal(r.totalPaid,200);assert.equal(r.remainingAtPeriodEnd,1100);
});
test('period boundaries inclusive',()=>{
 const r=aggregateLoansReport([loan({payments:[pay('a','2026-02-01',10),pay('b','2026-02-28',20)]})],period)[0];
 assert.equal(r.periodPaid,30);
});
test('historical revisions unavailable',()=>{
 const r=aggregateLoansReport([loan({updatedAt:'2026-04-01T00:00:00Z'})],period)[0];
 assert.equal(r.remainingAtPeriodEnd,null);
});
test('closed loan is not treated as historical repayment',()=>{
 const r=aggregateLoansReport([loan({status:'closed',closureDate:'2026-02-15'})],period)[0];
 assert.equal(r.currentContractualRemaining,0);assert.equal(r.remainingAtPeriodEnd,null);
});
test('dated settlement after period does not erase earlier balance',()=>{
 const r=aggregateLoansReport([loan({status:'settled',settlementDate:'2026-03-05'})],period)[0];
 assert.equal(r.currentContractualRemaining,0);assert.equal(r.remainingAtPeriodEnd,1200);
});
test('duplicate loan ids fail closed',()=>{
 const rows=aggregateLoansReport([loan(),loan()],period);
 assert.ok(rows.every(r=>r.status==='historical_data_unavailable'));
});
test('duplicate payment ids fail closed',()=>{
 const r=aggregateLoansReport([loan({payments:[pay('a','2026-02-01',10),pay('a','2026-02-02',10)]})],period)[0];
 assert.equal(r.currentPrincipalRemaining,null);
});
test('invalid periods rejected',()=>assert.throws(()=>aggregateLoansReport([],{from:'2026-02-30',to:'2026-03-01'})));
test('frozen inputs are untouched',()=>{
 const p=Object.freeze(pay('a','2026-02-05',100));
 const l=Object.freeze(loan({payments:Object.freeze([p])}));
 assert.equal(aggregateLoansReport(Object.freeze([l]),Object.freeze(period))[0].periodPaid,100);
});
