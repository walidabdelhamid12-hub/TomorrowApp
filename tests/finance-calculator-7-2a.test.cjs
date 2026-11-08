const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(
  path.join(__dirname, "../src/features/finance/utils/calculator.ts"),
  "utf8"
);

const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const moduleRef = { exports: {} };
new Function("module", "exports", js)(moduleRef, moduleRef.exports);

const { applyKey, evaluateExpression } = moduleRef.exports;

test("7.2A arithmetic and precedence", () => {
  assert.equal(evaluateExpression("2+3×4"), 14);
  assert.equal(evaluateExpression("20÷4+3"), 8);
  assert.equal(evaluateExpression("10-3×2"), 4);
});

test("7.2A retains fractional precision without forced rounding", () => {
  assert.equal(evaluateExpression("1÷16"), 0.0625);
  assert.ok(Math.abs(evaluateExpression("0.0001+0.0002") - 0.0003) < 1e-15);
});

test("7.2A rejects division by zero and overflow", () => {
  assert.equal(evaluateExpression("1÷0"), null);
  assert.equal(evaluateExpression("1e308×1e308"), null);
});

test("7.2A preserves existing keypad behavior", () => {
  assert.equal(applyKey("12+", "×"), "12×");
  assert.equal(applyKey("1.2", "."), "1.2");
  assert.equal(applyKey("12", "DEL"), "1");
  assert.equal(applyKey("12", "C"), "");
});