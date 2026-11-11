import { getCurrencyDecimals } from '@/features/finance/constants/currencies';

/** Checks typed fractional precision without rounding or changing the amount. */
export function hasValidCurrencyPrecision(amount: string, currencyCode: string): boolean {
  const fraction = amount.trim().split(/[.\u066B]/)[1] ?? '';
  return fraction.length <= getCurrencyDecimals(currencyCode);
}
