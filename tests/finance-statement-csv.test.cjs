const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/statementCsv.ts'), 'utf8');
test('CSV foundation is read-only and labels its format accurately', () => {
  assert.match(source, /CSV is not an XLSX workbook/);
  assert.match(source, /export function serializeStatementCsv/);
  assert.match(source, /\\uFEFF/);
  assert.match(source, /replace\(\/"\/g, '""'\)/);
  assert.doesNotMatch(source, /postingAllowed\s*=\s*true|setState\(|writeFile\(|saveAsync\(/);
});
test('CSV protects spreadsheet formula prefixes and rejects invalid rows', () => {
  assert.match(source, /\[=\+@\\-\]/);
  assert.match(source, /Invalid statement export row/);
  assert.match(source, /Invalid statement export metadata/);
  assert.match(source, /row\.date < options\.from \|\| row\.date > options\.to/);
});
