/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const report = read('src/app/finance/report-comparison.tsx');
const statement = read('src/app/finance/statement-comparison.tsx');
const actions = read('src/features/finance/components/reporting/ComparisonExportActions.tsx');
const pdf = read('src/features/finance/utils/comparisonBrandedPrintHtml.ts');
test('both comparison surfaces use one verified export path', () => {
  assert.match(report, /<ComparisonExportActions table=\{exportTable\}/);
  assert.match(statement, /<ComparisonExportActions table=\{snapshot.table\} statementMode/);
  assert.match(actions, /validateReportTable\(table\)/);
});
test('statement uses shared mobile rows and category icon fallback for Food', () => {
  assert.match(statement, /<StatementMobileRows rows=/);
  assert.match(statement, /restaurant-outline/);
  assert.match(statement, /category\?\.icon/);
  assert.match(statement, /categoryColor: category\?\.color/);
});
test('statement retains original currency and converted detail for all accounts', () => {
  assert.match(statement, /amount: formatAmount\(row.amount, row.currencyCode\)/);
  assert.match(statement, /convertComparisonAmount\(row.amount, row.currencyCode/);
});
test('PDF and Excel share verified source table and branded PDF', () => {
  assert.match(actions, /buildComparisonBrandedPrintHtml\(table\)/);
  assert.match(actions, /buildReportTableXlsx\(table\)/);
  assert.match(pdf, /buildReportTableHtml\(table\)/);
  assert.match(pdf, /validateReportTable\(table\)/);
});
test('shared statement and dashboard export actions are used', () => {
  assert.match(actions, /<StatementExportActions/);
  assert.match(actions, /<ReportDashboardActions/);
});
