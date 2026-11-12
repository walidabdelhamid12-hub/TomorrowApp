import { isSupportedCurrency } from '../constants/currencies';

/** Empty means no filter; null means malformed/repeated/unsupported, never "all". */
export function reportRouteCurrency(value: unknown): string | null {
  return value === undefined ? '' : typeof value === 'string' && /^[A-Z]{3}$/.test(value) && isSupportedCurrency(value) ? value : null;
}

/** Exact range takes precedence; malformed or repeated parameters fail closed. */
export function reportRoutePeriod(from: unknown, to: unknown): { from: string; to: string } | null {
  const valid = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 100 && year <= 9999 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  return valid(from) && valid(to) && from <= to ? { from, to } : null;
}
