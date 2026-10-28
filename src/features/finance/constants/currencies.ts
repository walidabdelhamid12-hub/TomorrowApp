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

/** All rates are stored as "value of 1 unit in EGP". EGP itself is always 1. */
export const RATE_ANCHOR = 'EGP';

/** PLACEHOLDER rates, not market data. Replaced by live rates or your edits. */
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

export function getCurrencyDecimals(code: string): number {
  return CURRENCIES.find((c) => c.code === code)?.decimals ?? 2;
}

export function getCurrencyFlag(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.flag ?? '';
}

/** "🇪🇬 EGP" (just the code when there is no flag). */
export function getCurrencyLabel(code: string): string {
  const flag = getCurrencyFlag(code);
  return flag ? `${flag} ${code}` : code;
}