const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../src/app/finance/loans.tsx"), "utf8");
function section(startName, endName) {
  const start = source.indexOf("const " + startName + " =");
  assert.ok(start >= 0, "Missing " + startName);
  const end = source.indexOf("const " + endName + " =", start + 1);
  assert.ok(end > start, "Missing boundary " + endName);
  return source.slice(start, end);
}
 test("7.1D loan creation validates principal, installment and optional total", () => {
  const body = section("saveLoan", "openPayment");
  const guard = body.indexOf("hasValidCurrencyPrecision(value, currency)");
  assert.ok(body.includes("[principal, installment, total]"));
  assert.ok(guard >= 0 && guard < body.indexOf("money(principal)"));
  assert.ok(body.indexOf("addLoan(input)") > guard);
  assert.match(body, /Invalid amount precision/);
});
 test("7.1D loan receipt validates precision before money conversion and receipt", () => {
  const body = section("confirmLoanReceived", "confirmCloseWithoutPayment");
  const guard = body.indexOf("hasValidCurrencyPrecision(receivedAmount, receivingLoan.currencyCode)");
  assert.ok(guard >= 0 && guard < body.indexOf("money(receivedAmount)"));
  assert.ok(body.indexOf("confirmLoanReceipt(") > guard);
  assert.match(body, /Invalid amount precision/);
});
 test("7.1D new and edited loan payments validate amount and late fee", () => {
  const body = section("confirmPayment", "openEditPayment");
  const guard = body.indexOf("hasValidCurrencyPrecision(paymentAmount, selectedLoan.currencyCode)");
  const fee = body.indexOf("hasValidCurrencyPrecision(latePaymentFee, selectedLoan.currencyCode)");
  assert.ok(guard >= 0 && fee > guard);
  assert.ok(fee < body.indexOf("money(paymentAmount)"));
  assert.ok(body.indexOf("editLinkedPayment(") > fee);
  assert.ok(body.indexOf("postLinkedPayment(") > fee);
  assert.match(body, /Invalid amount precision/);
});
