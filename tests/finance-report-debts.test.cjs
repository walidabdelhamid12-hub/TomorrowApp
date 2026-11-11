/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = function(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    module._compile(ts.transpileModule(source, {compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    }}).outputText, filename);
  };
}
const { aggregateDebtsReport } = require('../src/features/finance/utils/reportDebts.ts');
const debt = (changes = {}) => ({
  id: 'd1', direction: 'receivable', personName: 'A', currencyCode: 'EGP',
  date: '2026-01-01', amount: 1000, payments: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...changes,
});
const period = {from:'2026-02-01',to:'2026-02-28'};
const payment = (id,date,amount) => ({id,date,amount});
test('period payments and period-end balance are distinct from current remaining',()=>{
  const d=debt({payments:[payment('p1','2026-02-10',200),payment('p2','2026-03-01',100)]});
  const r=aggregateDebtsReport([d],period)[0];
  assert.equal(r.periodPaid,200);assert.equal(r.remainingAtPeriodEnd,800);assert.equal(r.currentRemaining,700);
});
test('receivable and payable remain separate',()=>{
  const rows=aggregateDebtsReport([debt(),debt({id:'d2',direction:'payable',currencyCode:'USD'})],period,'payable');
  assert.equal(rows.length,1);assert.equal(rows[0].currencyCode,'USD');
});
test('debt not yet created has zero period-end balance',()=>{
  const r=aggregateDebtsReport([debt({date:'2026-03-01'})],period)[0];
  assert.equal(r.remainingAtPeriodEnd,0);assert.equal(r.currentRemaining,1000);
});
test('payments on inclusive boundaries counted',()=>{
  const r=aggregateDebtsReport([debt({payments:[payment('a','2026-02-01',10),payment('b','2026-02-28',20)]})],period)[0];
  assert.equal(r.periodPaid,30);
});
test('later debt revision makes historical closing unknown',()=>{
  const r=aggregateDebtsReport([debt({updatedAt:'2026-04-01T00:00:00Z'})],period)[0];
  assert.equal(r.remainingAtPeriodEnd,null);
});
test('duplicate debt ids fail closed',()=>{
  const rows=aggregateDebtsReport([debt(),debt()],period);
  assert.ok(rows.every(r=>r.status==='historical_data_unavailable'));
});
test('duplicate payment ids fail closed',()=>{
  const r=aggregateDebtsReport([debt({payments:[payment('a','2026-02-01',1),payment('a','2026-02-02',2)]})],period)[0];
  assert.equal(r.currentRemaining,null);
});
test('excess payments fail closed',()=>{
  const r=aggregateDebtsReport([debt({payments:[payment('a','2026-02-01',1001)]})],period)[0];
  assert.equal(r.status,'historical_data_unavailable');
});
test('invalid date rejects',()=>{
  assert.throws(()=>aggregateDebtsReport([], {from:'2026-02-30',to:'2026-03-01'}));
});
test('inputs stay untouched',()=>{
  const d=Object.freeze(debt({payments:Object.freeze([Object.freeze(payment('a','2026-02-02',20))])}));
  assert.equal(aggregateDebtsReport(Object.freeze([d]),period)[0].periodPaid,20);
});
