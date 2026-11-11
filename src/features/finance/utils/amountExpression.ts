import { getCurrencyDecimals } from '../constants/currencies';
import { evaluateExpression } from './calculator';
import { parseAmount } from './money';
import { hasValidCurrencyPrecision } from './amountPrecision';

export function resolveAmountExpression(
  input: string,
  currencyCode: string
): number | null {
  const text = input.trim();

  if (!text) return null;

  // Preserve ordinary numeric input and existing parser behavior.
  const plain = parseAmount(text);
  if (plain !== null) {
    return plain > 0 &&
      hasValidCurrencyPrecision(text, currencyCode)
      ? plain
      : null;
  }

  // Normalize keyboard arithmetic symbols.
  const expression = text
    .replace(/\*/g, '×')
    .replace(/\//g, '÷');

  // Never accept incomplete expressions.
  if (/[+\-×÷]$/.test(expression)) return null;

  const value = evaluateExpression(expression);

  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const result = String(value);

  if (hasValidCurrencyPrecision(result, currencyCode)) {
    return value;
  }

  // Remove only negligible floating-point representation noise.
  // Never silently round a genuinely over-precise amount.
  const decimals = getCurrencyDecimals(currencyCode);
  const scale = 10 ** decimals;
  const scaled = value * scale;
  const nearest = Math.round(scaled);

  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;

  if (
    !Number.isSafeInteger(nearest) ||
    Math.abs(scaled - nearest) > tolerance
  ) {
    return null;
  }

  const normalized = nearest / scale;

  return hasValidCurrencyPrecision(
    String(normalized),
    currencyCode
  )
    ? normalized
    : null;
}