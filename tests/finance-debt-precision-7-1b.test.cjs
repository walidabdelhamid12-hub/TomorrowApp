const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/features/finance/components/AddDebtModal.tsx"), "utf8");
function loadTS(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((id) => { if (Object.hasOwn(mocks, id)) return mocks[id]; throw Error("Unexpected import: " + id); }, module, module.exports);
  return module.exports;
}
const currencies = loadTS(path.join(root, "src/features/finance/constants/currencies.ts"), {});
const precision = loadTS(path.join(root, "src/features/finance/utils/amountPrecision.ts"), { "@/features/finance/constants/currencies": currencies });
test("7.1B actual helper rejects excess debt precision", () => {
  assert.equal(precision.hasValidCurrencyPrecision("10.12", "EGP"), true);
  assert.equal(precision.hasValidCurrencyPrecision("10.123", "EGP"), false);
  assert.equal(precision.hasValidCurrencyPrecision("10.123", "OMR"), true);
  assert.equal(precision.hasValidCurrencyPrecision("10.1234", "OMR"), false);
});
test("7.1B debt form checks precision before saving", () => {
  const a = source.indexOf("if (!hasValidCurrencyPrecision(amount, selectedCurrency))");
  const b = source.indexOf("onSave({", a);
  assert.ok(a >= 0 && b > a);
  assert.match(source, /Invalid amount precision/);
  assert.match(source, /getCurrencyDecimals\(selectedCurrency\)/);
  assert.match(source, /keyboardType="decimal-pad"/);
});
