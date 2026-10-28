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

/** Prices in EGP per gram. Gold is the 24K price. */
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
  /** Value of 1 unit of each currency in EGP. */
  rates: Record<string, number>;
  metals: MetalPrices;
  updatedAt: string | null;
  source: RateSource;
}

interface CurrencyActions {
  setBaseCurrency: (code: string) => void;
  /** Returns false for the anchor currency or an invalid rate. */
  setRate: (code: string, rate: number) => boolean;
  /** Pass null to clear. Returns false for an invalid price. */
  setMetalPrice: (kind: MetalKey, value: number | null) => boolean;
  applyLiveRates: (payload: LiveRatesPayload) => void;
  resetRates: () => void;
}

export type CurrencyStore = CurrencyData & CurrencyActions;

const initialData: CurrencyData = {
  baseCurrency: DEFAULT_BASE_CURRENCY,
  rates: { ...DEFAULT_RATES_TO_EGP },
  metals: { gold24PerGram: null, silverPerGram: null },
  updatedAt: null,
  source: 'default',
};

export const useCurrencyStore = create<CurrencyStore>()(
  persist(
    (set) => ({
      ...initialData,

      setBaseCurrency: (code) => set({ baseCurrency: code }),

      setRate: (code, rate) => {
        if (code === RATE_ANCHOR) return false;
        if (!Number.isFinite(rate) || rate <= 0) return false;
        set((s) => ({
          rates: { ...s.rates, [code]: rate },
          source: 'manual',
          updatedAt: new Date().toISOString(),
        }));
        return true;
      },

      setMetalPrice: (kind, value) => {
        if (value !== null && (!Number.isFinite(value) || value <= 0)) {
          return false;
        }
        set((s) => ({
          metals: { ...s.metals, [kind]: value },
          source: 'manual',
          updatedAt: new Date().toISOString(),
        }));
        return true;
      },

      applyLiveRates: (payload) =>
        set((s) => ({
          rates: { ...s.rates, ...payload.rates, [RATE_ANCHOR]: 1 },
          metals: {
            gold24PerGram: payload.metals.gold24PerGram ?? s.metals.gold24PerGram,
            silverPerGram: payload.metals.silverPerGram ?? s.metals.silverPerGram,
          },
          source: 'live',
          updatedAt: payload.updatedAt,
        })),

      resetRates: () =>
        set({
          rates: { ...DEFAULT_RATES_TO_EGP },
          metals: { gold24PerGram: null, silverPerGram: null },
          updatedAt: null,
          source: 'default',
        }),
    }),
    {
      name: 'tomorrow:currency',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): CurrencyData => ({
        baseCurrency: state.baseCurrency,
        rates: state.rates,
        metals: state.metals,
        updatedAt: state.updatedAt,
        source: state.source,
      }),
      // Keeps defaults for anything missing from older saved data.
      merge: (persistedState, currentState) => {
        const saved = (persistedState ?? {}) as Partial<CurrencyData>;
        return {
          ...currentState,
          baseCurrency: saved.baseCurrency ?? currentState.baseCurrency,
          rates: {
            ...DEFAULT_RATES_TO_EGP,
            ...(saved.rates ?? {}),
            [RATE_ANCHOR]: 1,
          },
          metals: {
            gold24PerGram: saved.metals?.gold24PerGram ?? null,
            silverPerGram: saved.metals?.silverPerGram ?? null,
          },
          updatedAt: saved.updatedAt ?? null,
          source: saved.source ?? 'default',
        };
      },
    }
  )
);

/** True once AsyncStorage data has been loaded into the store. */
export function useCurrencyHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useCurrencyStore.persist.hasHydrated()
  );

  useEffect(() => {
    const unsubscribe = useCurrencyStore.persist.onFinishHydration(() =>
      setHydrated(true)
    );
    setHydrated(useCurrencyStore.persist.hasHydrated());
    return unsubscribe;
  }, []);

  return hydrated;
}