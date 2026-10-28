import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { roundMoney } from '@/features/finance/utils/finance';
import { normalizeDigits } from '@/utils/input';

export type RateMap = Record<string, number>;

/**
 * Parses what the user typed. Accepts Arabic digits, "1,000", "1.5", "1,5".
 * Returns null when it is not a number. The caller checks the range.
 */
export function parseAmount(text: string): number | null {
  let s = normalizeDigits(text)
    .replace(/[\s\u066C]/g, '')
    .replace(/\u066B/g, '.');
  if (s === '') return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    s = s.replace(/,/g, '');
  } else if (hasComma) {
    // "1,000" = thousands separator, "1,5" = decimal comma.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${dec ? `.${dec}` : ''}`;
}

/** "1,234.50" using the currency's own decimal places. */
export function formatMoney(value: number, code: string): string {
  return formatNumber(value, getCurrencyDecimals(code));
}

/**
 * Converts between currencies using rates stored as "1 unit = X EGP".
 * Returns null when a rate is missing, so callers never guess.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: RateMap
): number | null {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null;
  return roundMoney((amount * fromRate) / toRate);
}