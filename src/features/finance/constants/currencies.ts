
export interface CurrencyInfo {
  code: string;
  name: string;
  /** Flag emoji shown next to the currency code. */
  flag: string;
  /** Decimal places used when displaying amounts. */
  decimals: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'EGP', name: 'Egyptian Pound', flag: '🇪🇬', decimals: 2 },
  { code: 'OMR', name: 'Omani Rial', flag: '🇴🇲', decimals: 3 },
  { code: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪', decimals: 2 },
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧', decimals: 2 },
  { code: 'JOD', name: 'Jordanian Dinar', flag: '🇯🇴', decimals: 3 },
  { code: 'QAR', name: 'Qatari Riyal', flag: '🇶🇦', decimals: 2 },
  { code: 'KWD', name: 'Kuwaiti Dinar', flag: '🇰🇼', decimals: 3 },
];

export const DEFAULT_BASE_CURRENCY = 'EGP';

/** All exchange rates are stored as the value of 1 unit in EGP. */
export const RATE_ANCHOR = 'EGP';

/**
 * Placeholder rates for development only.
 * These are NOT live market rates.
 * Replace them with verified live rates or user-entered rates.
 */
export const DEFAULT_RATES_TO_EGP: Record<string, number> = {
  EGP: 1,
  USD: 50,
  EUR: 55,
  GBP: 65,
  SAR: 13.3,
  AED: 13.6,
  OMR: 130,
  JOD: 70,
  QAR: 13.7,
  KWD: 160,
};

/** Returns true if the currency code exists in the supported list. */
export function isSupportedCurrency(code: string): boolean {
  const normalizedCode = code.trim().toUpperCase();
  return CURRENCIES.some((currency) => currency.code === normalizedCode);
}

export function getCurrencyDecimals(code: string): number {
  const normalizedCode = code.trim().toUpperCase();

  return (
    CURRENCIES.find((currency) => currency.code === normalizedCode)
      ?.decimals ?? 2
  );
}

export function getCurrencyFlag(code: string): string {
  const normalizedCode = code.trim().toUpperCase();

  return (
    CURRENCIES.find((currency) => currency.code === normalizedCode)?.flag ??
    ''
  );
}

/** Returns a display label such as "🇪🇬 EGP". */
export function getCurrencyLabel(code: string): string {
  const normalizedCode = code.trim().toUpperCase();
  const flag = getCurrencyFlag(normalizedCode);

  return flag ? `${flag} ${normalizedCode}` : normalizedCode;
}
