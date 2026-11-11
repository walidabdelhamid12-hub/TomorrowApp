const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const kind of ['income', 'expenses']) {
  test(kind + ' PDF action uses verified read-only statement and Expo sharing', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/app/finance/statement-' + kind + '.tsx'), 'utf8');
    assert.match(source, /statement\.reconciled && statement\.report\.unknown\.length === 0/);
    assert.match(source, /buildOperatingStatementPrintHtml\(statement, '(income|expenses)'/);
    assert.match(source, /shareStatementPdf\(html\)/);
    assert.match(source, /disabled=\{exporting\}/);
    assert.doesNotMatch(source, /setState\(|addTransaction\(|postingAllowed\s*=\s*true/);
  });
}

test('PDF sharing copies the generated file into a readable app cache location', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/features/finance/utils/shareStatementPdf.ts'), 'utf8');
  assert.match(source, /Print\.printToFileAsync\(\{ html, base64: true \}\)/);
  assert.match(source, /await target\.write\(base64, \{ encoding: 'base64' \}\)/);
  assert.match(source, /new File\(Paths\.cache,/);
  assert.match(source, /Sharing\.shareAsync\(target\.uri,/);
  assert.match(source, /!target\.exists \|\| target\.size <= 0/);
});
