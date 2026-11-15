const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
test('balance picker is a native modal overlay, not an expanding in-card picker', () => {
  const picker = read('features/finance/components/reporting/BalanceCurrencyPicker.tsx');
  assert.match(picker, /<Modal\s+visible=\{open\}\s+transparent/);
  assert.match(picker, /onRequestClose=\{\(\) => setOpen\(false\)\}/);
  assert.match(picker, /onSelect\(item\.code\); setOpen\(false\)/);
  assert.match(picker, /accessibilityState=\{\{ expanded: open \}\}/);
});
for (const screen of ['accounts', 'assets']) test(`${screen} report uses balance overlay and retains report actions`, () => {
  const source = read(`app/finance/report-${screen}.tsx`);
  assert.match(source, /<BalanceCurrencyPicker\b/);
  assert.doesNotMatch(source, /<ReportPicker\s+label="Balance currency"/);
  assert.match(source, /ReportTableActions/);
});
