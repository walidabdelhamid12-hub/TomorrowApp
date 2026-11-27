/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request.startsWith('@/')) request = path.join(__dirname, '../src', request.slice(2));
  return resolve.call(this, request, parent, ...rest);
};
for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    module._compile(output.outputText, filename);
  };
}
const { aggregateSavedInstallmentsReport, summarizeSavedInstallmentsByCurrency } =
  require('../src/features/finance/utils/reportSavedInstallments.ts');
function record(id, currencyCode, totalAmount, schedule) {
  return { name: id, contract: {
    id, currencyCode, totalAmount,
    accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' },
    schedule: schedule.map(([dueDate, amount], i) => ({
      id: id + '-row-' + i, contractId: id, kind: 'regular', dueDate, amount,
    })),
  }};
}
test('monthly projection respects month boundaries and zero due', () => {
  const rows = aggregateSavedInstallmentsReport([
    record('a', 'OMR', '30.000', [['2026-10-31','10.000'],['2026-11-15','10.000'],['2026-12-01','10.000']]),
    record('b', 'USD', '1.00', [['2026-10-15','1.00']]),
  ], '2026-11-01', '2026-11-30');
  assert.equal(rows[0].dueInPeriod, '10.000');
  assert.equal(rows[0].dueCount, 1);
  assert.equal(rows[1].dueInPeriod, '0.00');
  assert.equal(rows[1].totalScheduled, '1.00');
});
test('currency summary uses exact units and never mixes currencies', () => {
  const rows = aggregateSavedInstallmentsReport([
    record('a', 'OMR', '0.101', [['2026-11-01','0.101']]),
    record('b', 'OMR', '0.202', [['2026-11-30','0.202']]),
    record('c', 'USD', '4.25', [['2026-11-15','4.25']]),
  ], '2026-11-01', '2026-11-30');
  assert.deepEqual(summarizeSavedInstallmentsByCurrency(rows), [
    { currencyCode:'OMR', totalScheduled:'0.303', dueInPeriod:'0.303', contractCount:2, dueCount:2 },
    { currencyCode:'USD', totalScheduled:'4.25', dueInPeriod:'4.25', contractCount:1, dueCount:1 },
  ]);
});
test('duplicate IDs and impossible dates fail closed', () => {
  const item = record('a','USD','1.00',[['2026-11-01','1.00']]);
  assert.throws(() => aggregateSavedInstallmentsReport([item,item], '2026-11-01','2026-11-30'), /Duplicate contract/);
  assert.throws(() => aggregateSavedInstallmentsReport([item], '2026-02-30','2026-11-30'), /Invalid period/);
});
test('frozen source data remains untouched', () => {
  const item = record('a','USD','1.00',[['2026-11-01','1.00']]);
  Object.freeze(item.contract.schedule[0]);
  Object.freeze(item.contract.schedule);
  Object.freeze(item.contract.accountingOwnership);
  Object.freeze(item.contract);
  Object.freeze(item);
  const rows = aggregateSavedInstallmentsReport(Object.freeze([item]), '2026-11-01','2026-11-30');
  assert.equal(summarizeSavedInstallmentsByCurrency(Object.freeze(rows))[0].dueInPeriod, '1.00');
});

const { monthlyScheduledInstallmentTotal: monthly } = require('../src/features/finance/utils/reportSavedInstallments.ts');
test('dashboard schedule uses only current month and verified rates', () => {
  const data = [record('a','OMR','30.000',[['2026-10-31','10.000'],['2026-11-30','10.000'],['2026-12-01','10.000']]), record('b','USD','2.00',[['2026-11-01','2.00']])];
  assert.equal(monthly(data,'2026-11','OMR',{OMR:100,USD:40},['OMR','USD']),10.8);
  assert.equal(monthly(data,'2026-11','OMR',{OMR:100,USD:40},['OMR']),null);
  assert.equal(monthly(data,'2026-09','OMR',{},[]),0);
});
test('dashboard schedule handles leap years, duplicates and invalid month safely', () => {
  const data = record('a','OMR','1.001',[['2028-02-29','1.001']]);
  assert.equal(monthly([data],'2028-02','OMR',{},[]),1.001);
  assert.equal(monthly([data,data],'2028-02','OMR',{},[]),null);
  assert.equal(monthly([data],'2028-13','OMR',{},[]),null);
});
