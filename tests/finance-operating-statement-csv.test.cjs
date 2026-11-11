const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/', name), 'utf8');

test('Operating CSV export accepts only fully verified reconciled statements', () => {
  const source = read('operatingStatementCsv.ts');
  assert.match(source, /!statement\.reconciled \|\| statement\.report\.unknown\.length > 0/);
  assert.match(source, /Statement export requires fully verified transactions/);
  assert.match(source, /serializeStatementCsv\(buildVerifiedOperatingStatementRows\(statement, names\),/);
  assert.doesNotMatch(source, /setState\(|addTransaction\(|updateTransaction\(|postingAllowed\s*=\s*true/);
});

test('Operating CSV export refuses unknown accounts or categories and preserves currency', () => {
  const source = read('operatingStatementCsv.ts');
  assert.match(source, /names\.accounts\.get\(row\.accountId\)/);
  assert.match(source, /Statement export account is missing/);
  assert.match(source, /Statement export category is missing/);
  assert.match(source, /formatAmount\(row\.amount, row\.currencyCode\)/);
  assert.match(source, /currency: row\.currencyCode/);
  assert.match(source, /kind === 'income' \? 'Income Statement' : 'Expenses Statement'/);
});
