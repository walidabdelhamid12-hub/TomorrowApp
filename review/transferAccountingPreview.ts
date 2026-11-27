// REVIEW-ONLY prototype. Not a ledger mutation, not part of production wiring.
import { getCurrencyDecimals, CURRENCIES } from '../src/features/finance/constants/currencies';
import { hasValidCurrencyPrecision } from '../src/features/finance/utils/amountPrecision';
import { evaluateExactAmountExpression, exactAmountToNumber } from '../src/features/finance/utils/exactAmountArithmetic';
import { normalizeDigits } from '../src/utils/input';

type Input = { fromCurrency: string; toCurrency: string; principal: string; actualReceived: string; sourceFee?: string };
function units(text: string, code: string, allowZero: boolean): bigint | null {
  const normalized = normalizeDigits(text.trim()).replace(/\u066B/g, '.').replace(/\u066C/g, ',');
  if (!normalized || normalized.startsWith('-') || !hasValidCurrencyPrecision(normalized, code)) return null;
  const value = evaluateExactAmountExpression(normalized.replace(/,/g, ''));
  if (!value || value.numerator < 0n || (!allowZero && value.numerator === 0n)) return null;
  const scaled = value.numerator * 10n ** BigInt(getCurrencyDecimals(code));
  if (scaled % value.denominator !== 0n) return null;
  if (value.numerator && exactAmountToNumber(value, getCurrencyDecimals(code)) === null) return null;
  return scaled / value.denominator;
}
/** Proposed policy: optional source-currency fee is ADDITIONAL to principal, never subtracted twice. Actual credit is authoritative; same-currency credit equals principal. */
export function previewTransferAccounting(input: Input) {
  if (![input.fromCurrency, input.toCurrency].every(code => CURRENCIES.some(c => c.code === code))) return null;
  const principal = units(input.principal, input.fromCurrency, false);
  const credit = units(input.actualReceived, input.toCurrency, false);
  const fee = units(input.sourceFee?.trim() || '0', input.fromCurrency, true);
  if (principal === null || credit === null || fee === null) return null;
  if (input.fromCurrency === input.toCurrency && principal !== credit) return null;
  const debit = principal + fee;
  const factor = 10n ** BigInt(getCurrencyDecimals(input.fromCurrency));
  if (exactAmountToNumber({ numerator: debit, denominator: factor }, getCurrencyDecimals(input.fromCurrency)) === null) return null;
  return { sourcePrincipalMinor: principal.toString(), sourceFeeMinor: fee.toString(), sourceDebitMinor: debit.toString(), destinationCreditMinor: credit.toString(), postingAllowed: false as const, needsReview: true as const };
}

/** Proposed review-only ownership contract. No actual transaction or transfer is saved. */
type ReviewTransfer = Input & {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  feeCategoryId?: string;
};
type ReviewLeg = {
  transferId: string;
  accountId: string;
  currencyCode: string;
  kind: 'transfer-out' | 'transfer-in' | 'fee-expense';
  categoryId?: string;
  minor: bigint;
};
function reviewLegs(input: ReviewTransfer): ReviewLeg[] | null {
  if (!input.id.trim() || !input.fromAccountId.trim() || !input.toAccountId.trim()
    || input.fromAccountId === input.toAccountId) return null;
  const preview = previewTransferAccounting(input);
  if (!preview) return null;
  const fee = BigInt(preview.sourceFeeMinor);
  if (fee > 0n && !input.feeCategoryId?.trim()) return null;
  const legs: ReviewLeg[] = [
    { transferId: input.id, accountId: input.fromAccountId, currencyCode: input.fromCurrency, kind: 'transfer-out', minor: -BigInt(preview.sourcePrincipalMinor) },
    { transferId: input.id, accountId: input.toAccountId, currencyCode: input.toCurrency, kind: 'transfer-in', minor: BigInt(preview.destinationCreditMinor) },
  ];
  if (fee > 0n) legs.push({ transferId: input.id, accountId: input.fromAccountId, currencyCode: input.fromCurrency, kind: 'fee-expense', categoryId: input.feeCategoryId, minor: -fee });
  return legs;
}
/** Calculate the exact difference between a verified old and proposed new transfer.
 *  Caller must separately validate ledger ownership, current balance, category,
 *  historical rate evidence, revision and durable admission. Never use this
 *  to migrate legacy records or mutate financial storage. */
export function previewTransferChange(before: ReviewTransfer | null, after: ReviewTransfer | null) {
  if ((!before && !after) || (before && after && before.id !== after.id)) return null;
  const oldLegs = before ? reviewLegs(before) : [];
  const newLegs = after ? reviewLegs(after) : [];
  if (!oldLegs || !newLegs) return null;
  const accountCurrencies = new Map<string, string>();
  const deltas = new Map<string, { accountId: string; currencyCode: string; minor: bigint }>();
  const expenseDeltas = new Map<string, { categoryId: string; currencyCode: string; minor: bigint }>();
  for (const leg of [...oldLegs.map(l => ({ ...l, minor: -l.minor })), ...newLegs]) {
    const existing = accountCurrencies.get(leg.accountId);
    if (existing !== undefined && existing !== leg.currencyCode) return null;
    accountCurrencies.set(leg.accountId, leg.currencyCode);
    const row = deltas.get(leg.accountId) ?? { accountId: leg.accountId, currencyCode: leg.currencyCode, minor: 0n };
    row.minor += leg.minor;
    deltas.set(leg.accountId, row);
    if (leg.kind === 'fee-expense' && leg.categoryId) {
      const key = JSON.stringify([leg.categoryId, leg.currencyCode]);
      const expense = expenseDeltas.get(key) ?? { categoryId: leg.categoryId, currencyCode: leg.currencyCode, minor: 0n };
      expense.minor -= leg.minor;
      expenseDeltas.set(key, expense);
    }
  }
  return {
    accountDeltas: [...deltas.values()].map(row => ({ ...row, minor: row.minor.toString() })),
    expenseDeltas: [...expenseDeltas.values()].map(row => ({ ...row, minor: row.minor.toString() })),
    postingAllowed: false as const,
    needsReview: true as const,
  };
}
