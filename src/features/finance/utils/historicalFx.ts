import type { HistoricalFxSnapshot } from '@/features/finance/types/ledger';
import { isSupportedCurrency, RATE_ANCHOR } from '@/features/finance/constants/currencies';
import { isValidISODate } from '@/features/finance/utils/input';

/**
 * Validate an FX snapshot against the transaction it belongs to.
 * Rate = reference currency units per one source currency unit.
 */
export function isValidHistoricalFx(
  snapshot: unknown,
  transactionCurrency: string,
  transactionDate: string,
): snapshot is HistoricalFxSnapshot {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return false;
  }

  const fx = snapshot as Record<string, unknown>;

  if (
    typeof fx.sourceCurrencyCode !== 'string' ||
    typeof fx.referenceCurrencyCode !== 'string' ||
    typeof fx.rateDate !== 'string' ||
    typeof fx.rate !== 'number'
  ) {
    return false;
  }

  if (
    fx.sourceCurrencyCode !== transactionCurrency ||
    fx.rateDate !== transactionDate ||
    !isValidISODate(fx.rateDate) ||
    !isSupportedCurrency(fx.sourceCurrencyCode) ||
    fx.referenceCurrencyCode !== RATE_ANCHOR
  ) {
    return false;
  }

  if (
    !Number.isFinite(fx.rate) ||
    fx.rate <= 0 ||
    (fx.sourceCurrencyCode === RATE_ANCHOR && fx.rate !== 1)
  ) {
    return false;
  }

  if (fx.source !== 'historical_api' && fx.source !== 'manual') {
    return false;
  }

  if (fx.effectiveRateDate !== undefined) {
    if (
      typeof fx.effectiveRateDate !== 'string' ||
      !isValidISODate(fx.effectiveRateDate) ||
      fx.effectiveRateDate > fx.rateDate ||
      (fx.source === 'manual' && fx.effectiveRateDate !== fx.rateDate)
    ) {
      return false;
    }
  }

  return true;
}
