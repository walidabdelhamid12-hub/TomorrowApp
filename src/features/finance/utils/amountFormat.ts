import { getCurrencyDecimals } from '@/features/finance/constants/currencies';

/** Decimal half-up (ties away from zero), independent of native Intl/toFixed. */
export function formatAmount(value: number, currencyCode?: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = currencyCode ? getCurrencyDecimals(currencyCode) : 2;
  const [coefficient, exponent = '0'] = Math.abs(safe).toString().toLowerCase().split('e');
  const fraction = coefficient.split('.')[1]?.length ?? 0;
  const shift = Number(exponent) - fraction + decimals;
  let units = BigInt(coefficient.replace('.', ''));
  if (shift >= 0) units *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    units = (units + divisor / 2n) / divisor;
  }
  const digits = units.toString().padStart(decimals + 1, '0');
  const integer = decimals ? digits.slice(0, -decimals) : digits;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (safe < 0 && units !== 0n ? '-' : '') + grouped + (decimals ? '.' + digits.slice(-decimals) : '');
}
