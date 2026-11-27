import { getCurrencyDecimals, isSupportedCurrency } from '@/features/finance/constants/currencies';
import { normalizeDigits } from '@/utils/input';
import { evaluateExactAmountExpression, exactAmountToNumber } from './exactAmountArithmetic';

/** Validates typed currency amounts without rounding. Empty optional fields stay allowed. */
export function hasValidCurrencyPrecision(amount: string, currencyCode: string): boolean {
  if (!isSupportedCurrency(currencyCode)) return false;
  const text = normalizeDigits(amount.trim()).replace(/\u066B/g, '.').replace(/\u066C/g, ',');
  if (text === '') return true; // Required fields must still be checked by their callers.
  if (text.length > 256) return false;
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(text) && !/^-?\.\d+$/.test(text)) return false;
  const decimals = getCurrencyDecimals(currencyCode);
  const fraction = text.split('.')[1] ?? '';
  if (fraction.length > decimals) return false;
  const unsigned = text.replace(/^-/, '').replace(/,/g, '');
  const exact = evaluateExactAmountExpression(unsigned);
  if (exact === null) return false;
  if (exact.numerator === 0n) return true;
  return exactAmountToNumber(exact, decimals) !== null;
}
