import {
    CURRENCIES,
    RATE_ANCHOR,
} from '@/features/finance/constants/currencies';
import { TROY_OUNCE_GRAMS } from '@/features/finance/constants/metals';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';

// Rates by Exchange Rate API (open access, once-daily updates, attribution required).
const FX_URL = 'https://open.er-api.com/v6/latest/USD';
// Spot prices in USD per troy ounce.
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
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Converts "units per 1 USD" into "EGP per 1 unit" for every supported currency. */
function parseFx(json: unknown): Record<string, number> | null {
  if (!isRecord(json) || !isRecord(json.rates)) return null;
  const egpPerUsd = positive(json.rates[RATE_ANCHOR]);
  if (egpPerUsd === null) return null;

  const result: Record<string, number> = {};
  for (const currency of CURRENCIES) {
    if (currency.code === RATE_ANCHOR) continue;
    const perUsd = positive(json.rates[currency.code]);
    if (perUsd !== null) result[currency.code] = egpPerUsd / perUsd;
  }
  return result;
}

function parseMetal(json: unknown): number | null {
  if (!isRecord(json)) return null;
  return positive(json.price) ?? positive(json.priceUsd);
}

/**
 * Fetches live rates and saves them. Never throws: when offline, the
 * previously saved rates simply stay in place.
 */
export async function refreshLiveRates(): Promise<RefreshResult> {
  const [fxResult, goldResult, silverResult] = await Promise.allSettled([
    fetchJson(FX_URL),
    fetchJson(GOLD_URL),
    fetchJson(SILVER_URL),
  ]);

  const rates = fxResult.status === 'fulfilled' ? parseFx(fxResult.value) : null;
  const goldOunceUsd =
    goldResult.status === 'fulfilled' ? parseMetal(goldResult.value) : null;
  const silverOunceUsd =
    silverResult.status === 'fulfilled' ? parseMetal(silverResult.value) : null;

  if (!rates && goldOunceUsd === null && silverOunceUsd === null) {
    return {
      ok: false,
      message: 'Could not reach the rates service. Using your last saved rates.',
    };
  }

  const egpPerUsd = rates?.USD ?? useCurrencyStore.getState().rates.USD;
  const toGramEgp = (ounceUsd: number | null): number | null =>
    ounceUsd === null ? null : (ounceUsd / TROY_OUNCE_GRAMS) * egpPerUsd;

  useCurrencyStore.getState().applyLiveRates({
    rates: rates ?? {},
    metals: {
      gold24PerGram: toGramEgp(goldOunceUsd),
      silverPerGram: toGramEgp(silverOunceUsd),
    },
    updatedAt: new Date().toISOString(),
  });

  const complete = !!rates && goldOunceUsd !== null && silverOunceUsd !== null;
  return {
    ok: true,
    message: complete
      ? 'Rates updated.'
      : 'Some rates could not be updated. The rest were kept.',
  };
}