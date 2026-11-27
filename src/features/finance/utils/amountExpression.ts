import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import { evaluateExactAmountExpression, exactAmountToNumber } from './exactAmountArithmetic';
import { parseAmount } from './money';
import { hasValidCurrencyPrecision } from './amountPrecision';
import { normalizeDigits } from '@/utils/input';

export function resolveAmountExpression(input: string, currencyCode: string): number | null {
  const text = input.trim();
  if (!text || text.length > 256 || !isSupportedCurrency(currencyCode)) return null;

  // Preserve the existing plain-input grammar and typed precision policy.
  // Its floating-point value is only a grammar check, never the amount authority.
  const plain = parseAmount(text);
  if (plain !== null) {
    if (!hasValidCurrencyPrecision(text, currencyCode)) return null;
    const normalized = normalizeDigits(text).replace(/\u066B/g, '.').replace(/[,\u066C]/g, '');
    const exact = evaluateExactAmountExpression(normalized);
    return exact === null ? null : exactAmountToNumber(exact, getCurrencyDecimals(currencyCode));
  }

  const expression = text.replace(/\*/g, '×').replace(/\//g, '÷');
  if (/[+\-×÷]$/.test(expression)) return null;
  const exact = evaluateExactAmountExpression(expression);
  return exact === null ? null : exactAmountToNumber(exact, getCurrencyDecimals(currencyCode));
}
