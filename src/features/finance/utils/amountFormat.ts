import { getCurrencyDecimals } from '@/features/finance/constants/currencies';

/**
 * Display-only number formatting.
 * It never changes stored values or calculation precision.
 * Decimal places follow the currency's minor-unit precision.
 */
export function formatAmount(value: number, currencyCode?: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = currencyCode ? getCurrencyDecimals(currencyCode) : 2;

  return safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}