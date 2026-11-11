const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const kind of ['income', 'expenses']) {
  test(kind + ' PDF action uses verified read-only statement and Expo sharing', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/statement-' + kind + '.tsx'), 'utf8');
    assert.match(source, /statement\.reconciled && statement\.report\.unknown\.length === 0/);
    assert.match(source, /buildOperatingStatementPrintHtml\(statement, '(income|expenses)'/);
    assert.match(source, /Print\.printToFileAsync\(\{ html \}\)/);
    assert.match(source, /Sharing\.isAvailableAsync\(\)/);
    assert.match(source, /Sharing\.shareAsync\(uri,/);
    assert.match(source, /disabled=\{exporting\}/);
    assert.doesNotMatch(source, /setState\(|addTransaction\(|postingAllowed\s*=\s*true/);
  });
}
