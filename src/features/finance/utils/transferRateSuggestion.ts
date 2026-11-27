import { CURRENCIES, RATE_ANCHOR } from '../constants/currencies';

export type TransferRateSuggestion = { rate: number; source: 'fixed' | 'saved-live' | 'saved-manual' | 'saved-mixed' };

/** A saved rate is a suggestion only. No per-currency observation timestamp exists. */
export function getTransferRateSuggestion(
  from: string, to: string, rates: Readonly<Record<string, number>>,
  verifiedCurrencies: readonly string[] | undefined,
  rateSources: Readonly<Record<string, 'default' | 'live' | 'manual'>> | undefined,
): TransferRateSuggestion | null {
  if (!CURRENCIES.some(c => c.code === from) || !CURRENCIES.some(c => c.code === to)) return null;
  if (from === to) return { rate: 1, source: 'fixed' };
  const codes = [from, to].filter(code => code !== RATE_ANCHOR);
  const sources = codes.map(code => rateSources?.[code]);
  if (codes.some(code => !verifiedCurrencies?.includes(code)) || sources.some(s => s !== 'live' && s !== 'manual')) return null;
  if ([from, to].some(code => !Number.isFinite(rates[code]) || rates[code] <= 0)) return null;
  if ([from, to].includes(RATE_ANCHOR) && rates[RATE_ANCHOR] !== 1) return null;
  const rate = rates[from] / rates[to];
  // The existing decimal keyboard/parser cannot represent exponent notation.
  if (!Number.isFinite(rate) || rate <= 0 || !/^\d+(?:\.\d+)?$/.test(String(rate))) return null;
  return { rate, source: sources.every(s => s === 'live') ? 'saved-live' : sources.every(s => s === 'manual') ? 'saved-manual' : 'saved-mixed' };
}
