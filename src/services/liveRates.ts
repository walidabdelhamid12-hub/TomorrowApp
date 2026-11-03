
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

interface FxParseResult {
  rates: Record<string, number>;
  egpPerUsd: number;
  failedCurrencyCodes: string[];
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
 * Converts currencies into EGP per 1 unit.
 * Valid currencies are retained even if another currency is missing.
 */
function parseFx(json: unknown): FxParseResult | null {
  if (!isRecord(json) || !isRecord(json.rates)) {
    return null;
  }

  const egpPerUsd = positive(json.rates[RATE_ANCHOR]);

  if (egpPerUsd === null) {
    return null;
  }

  const rates: Record<string, number> = {
    [RATE_ANCHOR]: 1,
  };

  const failedCurrencyCodes: string[] = [];

  for (const currency of CURRENCIES) {
    if (currency.code === RATE_ANCHOR) {
      continue;
    }

    const unitsPerUsd = positive(json.rates[currency.code]);

    if (unitsPerUsd === null) {
      failedCurrencyCodes.push(currency.code);
      continue;
    }

    const egpPerUnit = egpPerUsd / unitsPerUsd;

    if (!Number.isFinite(egpPerUnit) || egpPerUnit <= 0) {
      failedCurrencyCodes.push(currency.code);
      continue;
    }

    rates[currency.code] = egpPerUnit;
  }

  return {
    rates,
    egpPerUsd,
    failedCurrencyCodes,
  };
}

function parseMetal(json: unknown): number | null {
  if (!isRecord(json)) {
    return null;
  }

  return positive(json.price) ?? positive(json.priceUsd);
}

/**
 * Refreshes FX, gold and silver independently.
 *
 * Successful sources are saved even if another source fails.
 * Previous values are preserved when a source fails.
 */
export async function refreshLiveRates(): Promise<RefreshResult> {
  const [fxResult, goldResult, silverResult] =
    await Promise.allSettled([
      fetchJson(FX_URL),
      fetchJson(GOLD_URL),
      fetchJson(SILVER_URL),
    ]);

  const fx =
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

  const egpPerUsd = fx?.egpPerUsd ?? null;

  const gold24PerGram =
    goldOunceUsd !== null && egpPerUsd !== null
      ? (goldOunceUsd / TROY_OUNCE_GRAMS) * egpPerUsd
      : null;

  const silverPerGram =
    silverOunceUsd !== null && egpPerUsd !== null
      ? (silverOunceUsd / TROY_OUNCE_GRAMS) * egpPerUsd
      : null;

  const validGold =
    gold24PerGram !== null &&
    Number.isFinite(gold24PerGram) &&
    gold24PerGram > 0;

  const validSilver =
    silverPerGram !== null &&
    Number.isFinite(silverPerGram) &&
    silverPerGram > 0;

  const validRates = fx?.rates ?? {};

  const store = useCurrencyStore.getState();

  // Failed sources keep their previous value and source classification.
  // This preserves the last successfully verified rate for calculations.
  // A scheduled slot is complete only when every source and currency succeeded.
  const isCompleteRefresh =
    fx !== null &&
    fx.failedCurrencyCodes.length === 0 &&
    validGold &&
    validSilver;
  const updatedAt = new Date().toISOString();

  // Save successful values even when another source fails. Only a fully
  // successful refresh advances the scheduler's completed-slot timestamp.
  const saved = store.applyLiveRates({
    rates: validRates,
    metals: {
      ...(validGold ? { gold24PerGram: gold24PerGram! } : {}),
      ...(validSilver ? { silverPerGram: silverPerGram! } : {}),
    },
    updatedAt,
    ...(isCompleteRefresh ? { lastLiveUpdatedAt: updatedAt } : {}),
  });

  if (!saved) {
    return {
      ok: false,
      message: 'No new valid prices. Previous prices were preserved.',
    };
  }

  const successfulParts: string[] = [];
  const failedParts: string[] = [];

  const hasUpdatedCurrencies = Object.keys(validRates).some(
    (code) => code !== RATE_ANCHOR,
  );

  if (hasUpdatedCurrencies) {
    successfulParts.push('currencies');
  }

  if (validGold) {
    successfulParts.push('gold');
  }

  if (validSilver) {
    successfulParts.push('silver');
  }

  if (fx === null) {
    failedParts.push('currencies');
  } else if (fx.failedCurrencyCodes.length > 0) {
    failedParts.push(
      `${fx.failedCurrencyCodes.length} currencies`,
    );
  }

  if (!validGold) {
    failedParts.push('gold');
  }

  if (!validSilver) {
    failedParts.push('silver');
  }

  if (failedParts.length === 0) {
    return {
      ok: true,
      message: 'Currencies, gold & silver updated.',
    };
  }

  if (successfulParts.length === 0) {
    return {
      ok: false,
      message: `Update failed: ${failedParts.join(', ')}.`,
    };
  }

  return {
    ok: false,
    message: `Updated ${successfulParts.join(', ')}. Failed: ${failedParts.join(', ')}. Will retry automatically.`,
  };
}
