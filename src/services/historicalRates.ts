import {
  isSupportedCurrency,
  RATE_ANCHOR,
} from '@/features/finance/constants/currencies';
import type { HistoricalFxSnapshot } from '@/features/finance/types/ledger';
import { isValidISODate } from '@/features/finance/utils/input';
import { isValidHistoricalFx } from '@/features/finance/utils/historicalFx';

const API_URL = 'https://api.frankfurter.dev/v2/rate';
const TIMEOUT_MS = 8000;

export type HistoricalRateResult =
  | { ok: true; snapshot: HistoricalFxSnapshot }
  | { ok: false; reason: string };

function validRate(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0;
}

function validRequest(
  currency: string,
  date: string,
): boolean {
  return isSupportedCurrency(currency) &&
    isValidISODate(date) &&
    date <= new Date().toISOString().slice(0, 10);
}

/**
 * Fetch EGP per one unit of transaction currency.
 * Does not read or mutate currency, ledger or finance stores.
 */
export async function getHistoricalRate(
  currency: string,
  transactionDate: string,
): Promise<HistoricalRateResult> {
  if (!validRequest(currency, transactionDate)) {
    return {
      ok: false,
      reason: 'Invalid currency or transaction date.',
    };
  }

  if (currency === RATE_ANCHOR) {
    return {
      ok: true,
      snapshot: {
        sourceCurrencyCode: RATE_ANCHOR,
        referenceCurrencyCode: RATE_ANCHOR,
        rate: 1,
        rateDate: transactionDate,
        effectiveRateDate: transactionDate,
        source: 'historical_api',
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    const url =
      `${API_URL}/${encodeURIComponent(currency)}` +
      `/${RATE_ANCHOR}?date=${encodeURIComponent(transactionDate)}`;

    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `Historical FX service returned HTTP ${response.status}.`,
      };
    }

    const data: unknown = await response.json();

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, reason: 'Invalid historical FX response.' };
    }

    const record = data as Record<string, unknown>;

    if (
      record.base !== currency ||
      record.quote !== RATE_ANCHOR ||
      typeof record.date !== 'string' ||
      !isValidISODate(record.date) ||
      record.date > transactionDate ||
      !validRate(record.rate)
    ) {
      return {
        ok: false,
        reason: 'Historical FX response failed validation.',
      };
    }

    const snapshot: HistoricalFxSnapshot = {
      sourceCurrencyCode: currency,
      referenceCurrencyCode: RATE_ANCHOR,
      rate: record.rate,
      rateDate: transactionDate,
      effectiveRateDate: record.date,
      source: 'historical_api',
    };

    if (!isValidHistoricalFx(snapshot, currency, transactionDate)) {
      return {
        ok: false,
        reason: 'Historical FX snapshot failed validation.',
      };
    }

    return { ok: true, snapshot };
  } catch {
    return {
      ok: false,
      reason: 'Historical FX unavailable. Try again or enter a manual rate.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a user-supplied rate, independent of the API.
 */
export function createManualHistoricalRate(
  currency: string,
  transactionDate: string,
  rate: number,
): HistoricalRateResult {
  if (!validRequest(currency, transactionDate) || !validRate(rate)) {
    return {
      ok: false,
      reason: 'Invalid currency, date or manual rate.',
    };
  }

  const snapshot: HistoricalFxSnapshot = {
    sourceCurrencyCode: currency,
    referenceCurrencyCode: RATE_ANCHOR,
    rate,
    rateDate: transactionDate,
    effectiveRateDate: transactionDate,
    source: 'manual',
  };

  if (!isValidHistoricalFx(snapshot, currency, transactionDate)) {
    return {
      ok: false,
      reason: 'Manual historical FX snapshot failed validation.',
    };
  }

  return { ok: true, snapshot };
}