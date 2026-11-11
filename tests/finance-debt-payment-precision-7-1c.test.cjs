const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../src/app/finance/debts.tsx"), "utf8");
function handler(name, nextName) {
  const start = source.indexOf("const " + name + " =");
  assert.ok(start >= 0, "Missing handler: " + name);
  const end = source.indexOf("const " + nextName + " =", start + 1);
  assert.ok(end > start, "Missing handler boundary: " + nextName);
  return source.slice(start, end);
}
function verify(name, nextName, amountVariable, currencyVariable, operation) {
  const body = handler(name, nextName);
  const guard = body.indexOf("if (!hasValidCurrencyPrecision(" + amountVariable + ", " + currencyVariable + "))");
  const parse = body.indexOf("parseAmount(" + amountVariable + ")");
  const call = body.indexOf(operation + "(");
  assert.ok(guard >= 0, "Missing precision guard");
  assert.ok(parse > guard, "Precision must precede parsing");
  assert.ok(call > parse, "Payment operation must follow validation");
  assert.match(body, /Invalid amount precision/);
  assert.match(body, /return;/);
}

 test("7.1C new debt payment checks precision before posting", () => {
  verify("handleConfirmPayment", "openEditPayment", "paymentAmount", "paymentDebt.currencyCode", "postLinkedPayment");
});
 test("7.1C edited debt payment checks precision before editing", () => {
  verify("handleSavePaymentEdit", "getStatus", "amountText", "debt.currencyCode", "editLinkedPayment");
});
