const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const ui = fs.readFileSync(path.join(root, "src/features/finance/components/AddAccountModal.tsx"), "utf8");
const helperPath = path.join(root, "src/features/finance/utils/amountPrecision.ts");
const currenciesPath = path.join(root, "src/features/finance/constants/currencies.ts");
function loadTS(file, mocks) {
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const requireMock = (id) => { if (Object.hasOwn(mocks, id)) return mocks[id]; throw Error("Unexpected import: " + id); };
  new Function("require", "module", "exports", js)(requireMock, module, module.exports);
  return module.exports;
}
const currencyModule = loadTS(currenciesPath, {});
const precision = loadTS(helperPath, { "@/features/finance/constants/currencies": currencyModule });
test("7.1A actual precision helper uses real currency metadata", () => {
  assert.equal(precision.hasValidCurrencyPrecision("10.12", "EGP"), true);
  assert.equal(precision.hasValidCurrencyPrecision("10.123", "EGP"), false);
  assert.equal(precision.hasValidCurrencyPrecision("10.123", "OMR"), true);
  assert.equal(precision.hasValidCurrencyPrecision("10.1234", "OMR"), false);
  assert.equal(precision.hasValidCurrencyPrecision("0.001", "KWD"), true);
  assert.equal(precision.hasValidCurrencyPrecision("0.0001", "KWD"), false);
  assert.equal(precision.hasValidCurrencyPrecision("1.005", "USD"), false);
  assert.equal(precision.hasValidCurrencyPrecision("\u0661\u0660\u066B\u0661\u0662", "EGP"), true);
});
test("7.1A account form invokes helper before legacy validation and save", () => {
  const a = ui.indexOf("if (!hasValidCurrencyPrecision(amount, selectedCurrency))");
  const b = ui.indexOf("if (parsed === null || parsed < 0");
  const c = ui.indexOf("onSave({", b);
  assert.ok(a >= 0 && a < b && b < c);
  assert.match(ui, /Invalid amount precision/);
  assert.match(ui, /getCurrencyDecimals\(selectedCurrency\)/);
  assert.match(ui, /keyboardType="decimal-pad"/);
});
