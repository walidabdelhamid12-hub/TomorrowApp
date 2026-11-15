import type { RateMap } from '@/features/finance/utils/money';

/** Read-only display conversion. Never use unverified/default FX evidence. */
export function reportVerifiedConversion(amount: number, from: string, to: string, rates: RateMap, verified: readonly string[]): number | null {
  if (!Number.isFinite(amount) || !from || !to) return null;
  if (from === to) return amount;
  const allowed = new Set(verified);
  if (!allowed.has(from) || !allowed.has(to)) return null;
  const source = rates[from];
  const target = rates[to];
  if (!Number.isFinite(source) || !Number.isFinite(target) || source <= 0 || target <= 0) return null;
  const result = amount / target * source;
  return Number.isFinite(result) ? result : null;
}
