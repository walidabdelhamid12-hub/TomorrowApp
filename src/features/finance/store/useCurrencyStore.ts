
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CURRENCIES,
  DEFAULT_BASE_CURRENCY,
  DEFAULT_RATES_TO_EGP,
  RATE_ANCHOR,
} from '@/features/finance/constants/currencies';

export type RateSource = 'default' | 'live' | 'manual';
export type MetalKey = 'gold24PerGram' | 'silverPerGram';

export interface MetalPrices {
  gold24PerGram: number | null;
  silverPerGram: number | null;
}

export interface LiveRatesPayload {
  rates: Record<string, number>;
  metals: Partial<MetalPrices>;
  updatedAt: string;
  /** Set only when currencies, gold and silver all refreshed successfully. */
  lastLiveUpdatedAt?: string;
}

type MetalSources = Record<MetalKey, RateSource>;

interface CurrencyData {
  baseCurrency: string;
  rates: Record<string, number>;
  verifiedCurrencies: string[];
  rateSources: Record<string, RateSource>;
  metalSources: MetalSources;
  metals: MetalPrices;
  updatedAt: string | null;
  lastLiveUpdatedAt: string | null;
  lastManualUpdatedAt: string | null;
  source: RateSource;
}

interface CurrencyActions {
  setBaseCurrency: (code: string) => void;
  setRate: (code: string, rate: number) => boolean;
  setMetalPrice: (kind: MetalKey, value: number | null) => boolean;
  setManualRates: (
    rates: Record<string, number>,
    metals: MetalPrices,
  ) => boolean;
  applyLiveRates: (payload: LiveRatesPayload) => boolean;
  markRatesUnconfirmed: (
    currencyCodes: string[],
    metalKeys: MetalKey[],
  ) => void;
  resetRates: () => void;
}

export type CurrencyStore = CurrencyData & CurrencyActions;

const STORAGE_VERSION = 5;
const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const SUPPORTED_CURRENCY_CODES = new Set(
  CURRENCIES.map((currency) => currency.code),
);

const ALL_CURRENCY_CODES = CURRENCIES.map(
  (currency) => currency.code,
);

const initialData: CurrencyData = {
  baseCurrency: DEFAULT_BASE_CURRENCY,
  rates: {
    ...DEFAULT_RATES_TO_EGP,
    [RATE_ANCHOR]: 1,
  },
  verifiedCurrencies: [RATE_ANCHOR],
  rateSources: Object.fromEntries(
    ALL_CURRENCY_CODES.map((code) => [
      code,
      code === RATE_ANCHOR ? 'live' : 'default',
    ]),
  ) as Record<string, RateSource>,
  metalSources: {
    gold24PerGram: 'default',
    silverPerGram: 'default',
  },
  metals: {
    gold24PerGram: null,
    silverPerGram: null,
  },
  updatedAt: null,
  lastLiveUpdatedAt: null,
  lastManualUpdatedAt: null,
  source: 'default',
};

function isValidRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCY_CODES.has(code);
}

function normalizeRates(rates?: unknown): Record<string, number> {
  const normalized: Record<string, number> = {
    ...DEFAULT_RATES_TO_EGP,
  };

  if (isRecord(rates)) {
    for (const [rawCode, value] of Object.entries(rates)) {
      const code = rawCode.trim().toUpperCase();

      if (isSupportedCurrency(code) && isValidRate(value)) {
        normalized[code] = value;
      }
    }
  }

  normalized[RATE_ANCHOR] = 1;
  return normalized;
}

function normalizeRateSource(value: unknown): RateSource {
  if (value === 'live' || value === 'manual') {
    return value;
  }

  return 'default';
}

function normalizeRateSources(
  value: unknown,
  rates: Record<string, number>,
  verifiedCurrencies: string[],
): Record<string, RateSource> {
  const result: Record<string, RateSource> = {};

  for (const code of ALL_CURRENCY_CODES) {
    if (code === RATE_ANCHOR) {
      result[code] = 'live';
      continue;
    }

    if (isRecord(value) && value[code] !== undefined) {
      result[code] = normalizeRateSource(value[code]);
      continue;
    }

    result[code] = verifiedCurrencies.includes(code)
      ? 'manual'
      : 'default';
  }

  return result;
}

function normalizeVerifiedCurrencies(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [RATE_ANCHOR];
  }

  const verified = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;

    const code = item.trim().toUpperCase();

    if (isSupportedCurrency(code)) {
      verified.add(code);
    }
  }

  verified.add(RATE_ANCHOR);
  return [...verified];
}

function normalizeMetalPrice(value: unknown): number | null {
  return isValidRate(value) ? value : null;
}

function normalizeBaseCurrency(value: unknown): string {
  if (typeof value === 'string') {
    const code = value.trim().toUpperCase();

    if (isSupportedCurrency(code)) {
      return code;
    }
  }

  return DEFAULT_BASE_CURRENCY;
}

function normalizeSource(value: unknown): RateSource {
  return normalizeRateSource(value);
}

function normalizeUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  if (timestamp > Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function normalizeMetalSources(
  value: unknown,
  metals: MetalPrices,
  legacySource: RateSource,
  lastLiveUpdatedAt: string | null,
): MetalSources {
  const result: MetalSources = {
    gold24PerGram: 'default',
    silverPerGram: 'default',
  };

  const keys: MetalKey[] = [
    'gold24PerGram',
    'silverPerGram',
  ];

  for (const key of keys) {
    if (!isValidRate(metals[key])) {
      result[key] = 'default';
      continue;
    }

    if (isRecord(value) && value[key] !== undefined) {
      result[key] = normalizeRateSource(value[key]);
      continue;
    }

    if (legacySource === 'manual') {
      result[key] = 'manual';
    } else if (lastLiveUpdatedAt) {
      result[key] = 'live';
    }
  }

  return result;
}

function migrateCurrencyData(
  persistedState: unknown,
): CurrencyData {
  const saved = isRecord(persistedState) ? persistedState : {};
  const savedMetals = isRecord(saved.metals) ? saved.metals : {};

  const updatedAt = normalizeUpdatedAt(saved.updatedAt);
  const legacySource = normalizeSource(saved.source);

  const lastLiveUpdatedAt =
    normalizeUpdatedAt(saved.lastLiveUpdatedAt) ??
    (legacySource === 'live' ? updatedAt : null);

  const verifiedCurrencies = Array.isArray(
    saved.verifiedCurrencies,
  )
    ? normalizeVerifiedCurrencies(saved.verifiedCurrencies)
    : legacySource === 'live' && lastLiveUpdatedAt !== null
      ? [...ALL_CURRENCY_CODES]
      : [RATE_ANCHOR];

  const rates = normalizeRates(saved.rates);

  const metals: MetalPrices = {
    gold24PerGram: normalizeMetalPrice(
      savedMetals.gold24PerGram,
    ),
    silverPerGram: normalizeMetalPrice(
      savedMetals.silverPerGram,
    ),
  };

  const rateSources = normalizeRateSources(
    saved.rateSources,
    rates,
    verifiedCurrencies,
  );

  const metalSources = normalizeMetalSources(
    saved.metalSources,
    metals,
    legacySource,
    lastLiveUpdatedAt,
  );

  const normalizedVerified = ALL_CURRENCY_CODES.filter(
    (code) =>
      code === RATE_ANCHOR || rateSources[code] !== 'default',
  );

  return {
    baseCurrency: normalizeBaseCurrency(saved.baseCurrency),
    rates,
    verifiedCurrencies: normalizedVerified,
    rateSources,
    metalSources,
    metals,
    updatedAt,
    source: legacySource,
    lastLiveUpdatedAt,
    lastManualUpdatedAt:
      normalizeUpdatedAt(saved.lastManualUpdatedAt) ??
      (legacySource === 'manual' ? updatedAt : null),
  };
}

function isValidLiveTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);

  return (
    Number.isFinite(timestamp) &&
    timestamp <= Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS
  );
}

function isValidManualPayload(
  rates: Record<string, number>,
  metals: MetalPrices,
): boolean {
  if (!isRecord(rates) || !isRecord(metals)) {
    return false;
  }

  for (const [rawCode, value] of Object.entries(rates)) {
    const code = rawCode.trim().toUpperCase();

    if (
      !isSupportedCurrency(code) ||
      code === RATE_ANCHOR ||
      !isValidRate(value)
    ) {
      return false;
    }
  }

  return (
    (metals.gold24PerGram === null ||
      isValidRate(metals.gold24PerGram)) &&
    (metals.silverPerGram === null ||
      isValidRate(metals.silverPerGram))
  );
}

function getVerifiedCurrencies(
  rateSources: Record<string, RateSource>,
): string[] {
  return ALL_CURRENCY_CODES.filter(
    (code) =>
      code === RATE_ANCHOR || rateSources[code] !== 'default',
  );
}

export const useCurrencyStore = create<CurrencyStore>()(
  persist(
    (set) => ({
      ...initialData,

      setBaseCurrency: (code) => {
        if (typeof code !== 'string') return;

        const normalizedCode = code.trim().toUpperCase();

        if (!isSupportedCurrency(normalizedCode)) {
          return;
        }

        set({
          baseCurrency: normalizedCode,
        });
      },

      setRate: (code, rate) => {
        if (typeof code !== 'string') return false;

        const normalizedCode = code.trim().toUpperCase();

        if (
          !isSupportedCurrency(normalizedCode) ||
          normalizedCode === RATE_ANCHOR ||
          !isValidRate(rate)
        ) {
          return false;
        }

        const now = new Date().toISOString();

        set((state) => {
          const rateSources = {
            ...state.rateSources,
            [normalizedCode]: 'manual' as const,
            [RATE_ANCHOR]: 'live' as const,
          };

          return {
            rates: {
              ...state.rates,
              [normalizedCode]: rate,
              [RATE_ANCHOR]: 1,
            },
            rateSources,
            verifiedCurrencies: getVerifiedCurrencies(rateSources),
            source: 'manual',
            updatedAt: now,
            lastManualUpdatedAt: now,
          };
        });

        return true;
      },

      setMetalPrice: (kind, value) => {
        if (
          (kind !== 'gold24PerGram' && kind !== 'silverPerGram') ||
          (value !== null && !isValidRate(value))
        ) {
          return false;
        }

        const now = new Date().toISOString();

        set((state) => ({
          metals: {
            ...state.metals,
            [kind]: value,
          },
          metalSources: {
            ...state.metalSources,
            [kind]: value === null ? 'default' : 'manual',
          },
          source: 'manual',
          updatedAt: now,
          lastManualUpdatedAt: now,
        }));

        return true;
      },

      setManualRates: (rates, metals) => {
        if (!isValidManualPayload(rates, metals)) {
          return false;
        }

        const now = new Date().toISOString();

        set((state) => {
          const normalizedManualRates: Record<string, number> = {};

          for (const [rawCode, value] of Object.entries(rates)) {
            const code = rawCode.trim().toUpperCase();
            normalizedManualRates[code] = value;
          }

          const rateSources = {
            ...state.rateSources,
            ...Object.fromEntries(
              Object.keys(normalizedManualRates).map((code) => [
                code,
                'manual' as const,
              ]),
            ),
            [RATE_ANCHOR]: 'live' as const,
          };

          const metalSources = {
            ...state.metalSources,
            gold24PerGram:
              metals.gold24PerGram === null
                ? state.metalSources.gold24PerGram
                : 'manual' as const,
            silverPerGram:
              metals.silverPerGram === null
                ? state.metalSources.silverPerGram
                : 'manual' as const,
          };

          return {
            rates: {
              ...state.rates,
              ...normalizedManualRates,
              [RATE_ANCHOR]: 1,
            },
            rateSources,
            verifiedCurrencies: getVerifiedCurrencies(rateSources),
            metals: {
              gold24PerGram:
                metals.gold24PerGram === null
                  ? state.metals.gold24PerGram
                  : metals.gold24PerGram,
              silverPerGram:
                metals.silverPerGram === null
                  ? state.metals.silverPerGram
                  : metals.silverPerGram,
            },
            metalSources,
            source: 'manual',
            updatedAt: now,
            lastManualUpdatedAt: now,
          };
        });

        return true;
      },

      applyLiveRates: (payload) => {
        if (
          !isRecord(payload) ||
          !isRecord(payload.rates) ||
          !isRecord(payload.metals) ||
          typeof payload.updatedAt !== 'string' ||
          !isValidLiveTimestamp(payload.updatedAt) ||
          (payload.lastLiveUpdatedAt !== undefined &&
            (typeof payload.lastLiveUpdatedAt !== 'string' ||
              !isValidLiveTimestamp(payload.lastLiveUpdatedAt)))
        ) {
          return false;
        }

        const incomingTimestamp = Date.parse(payload.updatedAt);

        const currentLastLiveTimestamp = Date.parse(
          useCurrencyStore.getState().lastLiveUpdatedAt ?? '',
        );

        if (
          Number.isFinite(currentLastLiveTimestamp) &&
          incomingTimestamp <= currentLastLiveTimestamp
        ) {
          return false;
        }

        const incomingRates: Record<string, number> = {};

        for (const [rawCode, value] of Object.entries(payload.rates)) {
          const code = rawCode.trim().toUpperCase();

          if (
            !isSupportedCurrency(code) ||
            code === RATE_ANCHOR ||
            !isValidRate(value)
          ) {
            continue;
          }

          incomingRates[code] = value;
        }

        const incomingMetals: Partial<MetalPrices> = {};

        if (isValidRate(payload.metals.gold24PerGram)) {
          incomingMetals.gold24PerGram =
            payload.metals.gold24PerGram;
        }

        if (isValidRate(payload.metals.silverPerGram)) {
          incomingMetals.silverPerGram =
            payload.metals.silverPerGram;
        }

        const hasIncomingRates = Object.keys(incomingRates).length > 0;
        const hasIncomingMetals =
          Object.keys(incomingMetals).length > 0;

        if (!hasIncomingRates && !hasIncomingMetals) {
          return false;
        }

        const normalizedTimestamp = new Date(
          incomingTimestamp,
        ).toISOString();

        set((state) => {
          const rateSources = {
            ...state.rateSources,
            ...Object.fromEntries(
              Object.keys(incomingRates).map((code) => [
                code,
                'live' as const,
              ]),
            ),
            [RATE_ANCHOR]: 'live' as const,
          };

          const metalSources = {
            ...state.metalSources,
            ...(incomingMetals.gold24PerGram !== undefined
              ? { gold24PerGram: 'live' as const }
              : {}),
            ...(incomingMetals.silverPerGram !== undefined
              ? { silverPerGram: 'live' as const }
              : {}),
          };

          return {
            rates: {
              ...state.rates,
              ...incomingRates,
              [RATE_ANCHOR]: 1,
            },
            rateSources,
            verifiedCurrencies: getVerifiedCurrencies(rateSources),
            metals: {
              ...state.metals,
              ...incomingMetals,
            },
            metalSources,
            source: 'live',
            updatedAt: normalizedTimestamp,
            lastLiveUpdatedAt:
              payload.lastLiveUpdatedAt !== undefined
                ? new Date(
                    Date.parse(payload.lastLiveUpdatedAt),
                  ).toISOString()
                : state.lastLiveUpdatedAt,
          };
        });

        return true;
      },

      markRatesUnconfirmed: (currencyCodes, metalKeys) => {
        set((state) => {
          const rateSources = { ...state.rateSources };
          const metalSources = { ...state.metalSources };

          for (const rawCode of currencyCodes) {
            if (typeof rawCode !== 'string') continue;

            const code = rawCode.trim().toUpperCase();

            if (
              isSupportedCurrency(code) &&
              code !== RATE_ANCHOR &&
              rateSources[code] === 'live'
            ) {
              rateSources[code] = 'default';
            }
          }

          for (const key of metalKeys) {
            if (
              (key === 'gold24PerGram' ||
                key === 'silverPerGram') &&
              metalSources[key] === 'live'
            ) {
              metalSources[key] = 'default';
            }
          }

          return {
            rateSources,
            metalSources,
            verifiedCurrencies: getVerifiedCurrencies(rateSources),
          };
        });
      },

      resetRates: () =>
        set({
          rates: normalizeRates(DEFAULT_RATES_TO_EGP),
          verifiedCurrencies: [RATE_ANCHOR],
          rateSources: Object.fromEntries(
            ALL_CURRENCY_CODES.map((code) => [
              code,
              code === RATE_ANCHOR ? 'live' : 'default',
            ]),
          ) as Record<string, RateSource>,
          metalSources: {
            gold24PerGram: 'default',
            silverPerGram: 'default',
          },
          metals: {
            gold24PerGram: null,
            silverPerGram: null,
          },
          updatedAt: null,
          lastLiveUpdatedAt: null,
          lastManualUpdatedAt: null,
          source: 'default',
        }),
    }),
    {
      name: 'tomorrow:currency',
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => AsyncStorage),

      partialize: (state): CurrencyData => ({
        baseCurrency: state.baseCurrency,
        rates: state.rates,
        verifiedCurrencies: state.verifiedCurrencies,
        rateSources: state.rateSources,
        metalSources: state.metalSources,
        metals: state.metals,
        updatedAt: state.updatedAt,
        lastLiveUpdatedAt: state.lastLiveUpdatedAt,
        lastManualUpdatedAt: state.lastManualUpdatedAt,
        source: state.source,
      }),

      migrate: (persistedState): CurrencyData => {
        return migrateCurrencyData(persistedState);
      },

      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateCurrencyData(persistedState),
      }),
    },
  ),
);

export function useCurrencyHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useCurrencyStore.persist.hasHydrated(),
  );

  useEffect(() => {
    const unsubscribe =
      useCurrencyStore.persist.onFinishHydration(() => {
        setHydrated(true);
      });

    setHydrated(useCurrencyStore.persist.hasHydrated());

    return unsubscribe;
  }, []);

  return hydrated;
}
