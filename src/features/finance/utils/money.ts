
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { roundMoney } from '@/features/finance/utils/finance';
import { normalizeDigits } from '@/utils/input';

export type RateMap = Record<string, number>;

/**
 * Parses what the user typed.
 * Accepts Arabic digits, "1,000", "1.5", and "1,5".
 * Returns null when the input is not a valid number.
 */
export function parseAmount(text: string): number | null {
  let s = normalizeDigits(text)
    .replace(/[\s\u066C]/g, '')
    .replace(/\u066B/g, '.');

  if (s === '') return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Treat commas as thousands separators: "1,234.50".
    s = s.replace(/,/g, '');
  } else if (hasComma) {
    // "1,000" = thousands separator; "1,5" = decimal comma.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s)
      ? s.replace(/,/g, '')
      : s.replace(',', '.');
  }

  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) {
    return null;
  }

  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${dec !== undefined ? `.${dec}` : ''}`;
}

/**
 * Formats an amount using the currency's configured decimal places.
 */
export function formatMoney(value: number, code: string): string {
  return formatNumber(value, getCurrencyDecimals(code));
}

/**
 * Converts between currencies using rates stored as:
 * 1 unit of currency = X EGP.
 *
 * Returns null if either required rate is missing or invalid.
 * No exchange rate is guessed.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: RateMap
): number | null {
  if (!Number.isFinite(amount)) return null;

  if (from === to) return amount;

  const fromRate = rates[from];
  const toRate = rates[to];

  if (
    !Number.isFinite(fromRate) ||
    !Number.isFinite(toRate) ||
    fromRate <= 0 ||
    toRate <= 0
  ) {
    return null;
  }

  return roundMoney((amount * fromRate) / toRate);
}
