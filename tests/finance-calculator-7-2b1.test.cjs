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

const m = { exports: {} };
new Function("module", "exports", js)(m, m.exports);

const { evaluateExpression, applyKey } = m.exports;

test("7.2B-1 rejects malformed expressions", () => {
  for (const expr of ["2++3", "2--3", "2..3", "2a3", "1+×2"]) {
    assert.equal(evaluateExpression(expr), null, expr);
  }
});

test("7.2B-1 rejects unsafe integer input", () => {
  assert.equal(evaluateExpression("9007199254740992"), null);
  assert.equal(evaluateExpression("999999999999999999999"), null);
});

test("7.2B-1 preserves valid calculations", () => {
  assert.equal(evaluateExpression("2+3×4"), 14);
  assert.equal(evaluateExpression("1÷16"), 0.0625);
  assert.equal(evaluateExpression("20÷4+3"), 8);
});

test("7.2B-1 preserves trailing-operator preview", () => {
  assert.equal(evaluateExpression("2+"), 2);
  assert.equal(applyKey("12+", "×"), "12×");
});

test("7.2B-1 rejects non-finite results", () => {
  assert.equal(evaluateExpression("1÷0"), null);
  assert.equal(evaluateExpression("1e308×1e308"), null);
});