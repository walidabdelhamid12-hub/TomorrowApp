import { getCurrencyDecimals } from '@/features/finance/constants/currencies';

/**
 * Display-only number formatting.
 * It never changes stored values or calculation precision.
 * Decimal places follow the currency's minor-unit precision.
 * Intl's decimal half-expand rule rounds ties away from zero (half-up for
 * positive money), unlike toFixed's rounding of the binary approximation.
 */
export function formatAmount(value: number, currencyCode?: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = currencyCode ? getCurrencyDecimals(currencyCode) : 2;

  // Suppress signed zero, including amounts that round to zero for this currency.
  const normalized = Math.abs(safe) < 0.5 * 10 ** -decimals ? 0 : safe;
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
