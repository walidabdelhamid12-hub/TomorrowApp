
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { roundMoney } from '@/features/finance/utils/finance';
import { normalizeDigits } from '@/utils/input';

export type RateMap = Record<string, number>;

/**
 * Parses monetary input using the standard number format:
 * - "." is the decimal separator.
 * - "," is the thousands separator and must group digits in threes.
 * - Arabic/Persian digits and Arabic decimal/thousands separators are supported.
 * Returns null when the input is not a valid finite number.
 */
export function parseAmount(text: string): number | null {
  const s = normalizeDigits(text)
    .trim()
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',');

  if (s === '') return null;

  // A comma is always a thousands separator, never a decimal separator.
  const validNumber =
    /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(s) ||
    /^-?\.\d+$/.test(s);

  if (!validNumber) return null;

  const value = Number(s.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * Formats a number with thousands separators
 * and the requested number of decimal places.
 */
export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return (0).toFixed(decimals);

  const fixed = Math.abs(value).toFixed(decimals);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${sign}${grouped}${dec !== undefined ? `.${dec}` : ''}`;
}

/**
 * Formats monetary amounts with:
 * - Thousands separators.
 * - Exactly two decimal places for every currency.
 *
 * This affects display only.
 * It does not change stored values or calculation precision.
 */
export function formatMoney(value: number, code: string): string {
  return formatNumber(value, getCurrencyDecimals(code));
}

/**
 * Converts between currencies using rates stored as:
 * 1 unit of currency = X EGP.
 *
 * A conversion is allowed only when both currencies have
 * verified exchange rates.
 *
 * EGP is the fixed reference currency and is trusted by default.
 * Unverified/default rates are never used for conversion.
 *
 * Returns null if a required rate is missing, invalid,
 * or not verified.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: RateMap,
  verifiedCurrencies: readonly string[] = ['EGP'],
): number | null {
  if (!Number.isFinite(amount)) return null;

  const fromCode = from.trim().toUpperCase();
  const toCode = to.trim().toUpperCase();

  if (!fromCode || !toCode) return null;

  if (fromCode === toCode) return amount;

  const verified = new Set(
    verifiedCurrencies.map((code) => code.trim().toUpperCase()),
  );

  if (!verified.has(fromCode) || !verified.has(toCode)) {
    return null;
  }

  const fromRate = rates[fromCode];
  const toRate = rates[toCode];

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
