
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
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
}

interface CurrencyData {
  baseCurrency: string;
  rates: Record<string, number>;
  metals: MetalPrices;
  updatedAt: string | null;
  source: RateSource;
}

interface CurrencyActions {
  setBaseCurrency: (code: string) => void;
  setRate: (code: string, rate: number) => boolean;
  setMetalPrice: (kind: MetalKey, value: number | null) => boolean;
  applyLiveRates: (payload: LiveRatesPayload) => void;
  resetRates: () => void;
}

export type CurrencyStore = CurrencyData & CurrencyActions;

const STORAGE_VERSION = 3;

const initialData: CurrencyData = {
  baseCurrency: DEFAULT_BASE_CURRENCY,
  rates: {
    ...DEFAULT_RATES_TO_EGP,
    [RATE_ANCHOR]: 1,
  },
  metals: {
    gold24PerGram: null,
    silverPerGram: null,
  },
  updatedAt: null,
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

function normalizeRates(rates?: unknown): Record<string, number> {
  const normalized: Record<string, number> = {
    ...DEFAULT_RATES_TO_EGP,
  };

  if (isRecord(rates)) {
    for (const [rawCode, value] of Object.entries(rates)) {
      const code = rawCode.trim().toUpperCase();

      if (code && isValidRate(value)) {
        normalized[code] = value;
      }
    }
  }

  normalized[RATE_ANCHOR] = 1;
  return normalized;
}

function normalizeMetalPrice(value: unknown): number | null {
  return isValidRate(value) ? value : null;
}

function normalizeBaseCurrency(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim().toUpperCase();
  }

  return DEFAULT_BASE_CURRENCY;
}

function normalizeSource(value: unknown): RateSource {
  if (value === 'live' || value === 'manual') {
    return value;
  }

  return 'default';
}

function normalizeUpdatedAt(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== ''
    ? value
    : null;
}

/**
 * Converts persisted currency data from older versions to the
 * current shape without discarding valid saved values.
 */
function migrateCurrencyData(
  persistedState: unknown,
): CurrencyData {
  const saved = isRecord(persistedState) ? persistedState : {};
  const savedMetals = isRecord(saved.metals) ? saved.metals : {};

  return {
    baseCurrency: normalizeBaseCurrency(saved.baseCurrency),
    rates: normalizeRates(saved.rates),
    metals: {
      gold24PerGram: normalizeMetalPrice(
        savedMetals.gold24PerGram,
      ),
      silverPerGram: normalizeMetalPrice(
        savedMetals.silverPerGram,
      ),
    },
    updatedAt: normalizeUpdatedAt(saved.updatedAt),
    source: normalizeSource(saved.source),
  };
}

export const useCurrencyStore = create<CurrencyStore>()(
  persist(
    (set) => ({
      ...initialData,

      setBaseCurrency: (code) => {
        const normalizedCode = code.trim().toUpperCase();

        if (!normalizedCode) return;

        set((state) => ({
          baseCurrency: normalizedCode,
          rates: normalizeRates(state.rates),
        }));
      },

      setRate: (code, rate) => {
        const normalizedCode = code.trim().toUpperCase();

        if (
          !normalizedCode ||
          normalizedCode === RATE_ANCHOR ||
          !isValidRate(rate)
        ) {
          return false;
        }

        set((state) => ({
          rates: normalizeRates({
            ...state.rates,
            [normalizedCode]: rate,
          }),
          source: 'manual',
          updatedAt: new Date().toISOString(),
        }));

        return true;
      },

      setMetalPrice: (kind, value) => {
        if (value !== null && !isValidRate(value)) {
          return false;
        }

        set((state) => ({
          metals: {
            ...state.metals,
            [kind]: value,
          },
          source: 'manual',
          updatedAt: new Date().toISOString(),
        }));

        return true;
      },

      applyLiveRates: (payload) => {
        set((state) => {
          const validLiveRates: Record<string, number> = {};

          for (const [rawCode, rate] of Object.entries(
            payload.rates ?? {},
          )) {
            const code = rawCode.trim().toUpperCase();

            if (
              code &&
              code !== RATE_ANCHOR &&
              isValidRate(rate)
            ) {
              validLiveRates[code] = rate;
            }
          }

          const nextMetals = { ...state.metals };
          const goldPrice = payload.metals?.gold24PerGram;
          const silverPrice = payload.metals?.silverPerGram;

          if (isValidRate(goldPrice)) {
            nextMetals.gold24PerGram = goldPrice;
          }

          if (isValidRate(silverPrice)) {
            nextMetals.silverPerGram = silverPrice;
          }

          return {
            rates: normalizeRates({
              ...state.rates,
              ...validLiveRates,
            }),
            metals: nextMetals,
            source: 'live',
            updatedAt: normalizeUpdatedAt(payload.updatedAt),
          };
        });
      },

      resetRates: () =>
        set({
          rates: normalizeRates(DEFAULT_RATES_TO_EGP),
          metals: {
            gold24PerGram: null,
            silverPerGram: null,
          },
          updatedAt: null,
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
        metals: state.metals,
        updatedAt: state.updatedAt,
        source: state.source,
      }),

      migrate: (persistedState, _persistedVersion): CurrencyData => {
        return migrateCurrencyData(persistedState);
      },

      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateCurrencyData(persistedState),
      }),
    },
  ),
);

/** True once AsyncStorage data has been loaded into the store. */
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
