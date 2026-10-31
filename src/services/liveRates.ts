
import {
  CURRENCIES,
  RATE_ANCHOR,
} from '@/features/finance/constants/currencies';
import { TROY_OUNCE_GRAMS } from '@/features/finance/constants/metals';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';

// Exchange rates: units per 1 USD.
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

// Metal spot prices: USD per troy ounce.
const GOLD_URL = 'https://api.gold-api.com/price/XAU';
const SILVER_URL = 'https://api.gold-api.com/price/XAG';

const TIMEOUT_MS = 8000;

export interface RefreshResult {
  ok: boolean;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converts "units per 1 USD" into "EGP per 1 unit".
 * Every supported currency must be present for a complete update.
 */
function parseFx(json: unknown): Record<string, number> | null {
  if (!isRecord(json) || !isRecord(json.rates)) {
    return null;
  }

  const egpPerUsd = positive(json.rates[RATE_ANCHOR]);

  if (egpPerUsd === null) {
    return null;
  }

  const result: Record<string, number> = {
    [RATE_ANCHOR]: 1,
  };

  for (const currency of CURRENCIES) {
    if (currency.code === RATE_ANCHOR) {
      continue;
    }

    const unitsPerUsd = positive(json.rates[currency.code]);

    if (unitsPerUsd === null) {
      return null;
    }

    result[currency.code] = egpPerUsd / unitsPerUsd;
  }

  return result;
}

function parseMetal(json: unknown): number | null {
  if (!isRecord(json)) {
    return null;
  }

  return positive(json.price) ?? positive(json.priceUsd);
}

/**
 * Fetches all exchange and metal prices as one complete batch.
 *
 * If any source fails or returns invalid data, nothing is saved.
 * The previously saved prices remain unchanged.
 */
export async function refreshLiveRates(): Promise<RefreshResult> {
  const [fxResult, goldResult, silverResult] =
    await Promise.allSettled([
      fetchJson(FX_URL),
      fetchJson(GOLD_URL),
      fetchJson(SILVER_URL),
    ]);

  const rates =
    fxResult.status === 'fulfilled'
      ? parseFx(fxResult.value)
      : null;

  const goldOunceUsd =
    goldResult.status === 'fulfilled'
      ? parseMetal(goldResult.value)
      : null;

  const silverOunceUsd =
    silverResult.status === 'fulfilled'
      ? parseMetal(silverResult.value)
      : null;

  if (
    rates === null ||
    goldOunceUsd === null ||
    silverOunceUsd === null
  ) {
    return {
      ok: false,
      message:
        'Rates update failed. All previous saved rates were kept.',
    };
  }

  const egpPerUsd = rates.USD;

  if (egpPerUsd === undefined || !Number.isFinite(egpPerUsd)) {
    return {
      ok: false,
      message:
        'Rates update failed. All previous saved rates were kept.',
    };
  }

  const gold24PerGram =
    (goldOunceUsd / TROY_OUNCE_GRAMS) * egpPerUsd;

  const silverPerGram =
    (silverOunceUsd / TROY_OUNCE_GRAMS) * egpPerUsd;

  if (
    !Number.isFinite(gold24PerGram) ||
    gold24PerGram <= 0 ||
    !Number.isFinite(silverPerGram) ||
    silverPerGram <= 0
  ) {
    return {
      ok: false,
      message:
        'Invalid metal prices received. All previous saved rates were kept.',
    };
  }

  useCurrencyStore.getState().applyLiveRates({
    rates,
    metals: {
      gold24PerGram,
      silverPerGram,
    },
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    message: 'All currency, gold and silver rates updated successfully.',
  };
}
