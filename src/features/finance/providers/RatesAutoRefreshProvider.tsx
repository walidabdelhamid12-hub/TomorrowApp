import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useAutoRefreshRates } from '@/features/finance/hooks/useAutoRefreshRates';
import { useCurrencyHydrated } from '@/features/finance/store/useCurrencyStore';

type RatesAutoRefreshContextValue = ReturnType<typeof useAutoRefreshRates>;

const RatesAutoRefreshContext =
  createContext<RatesAutoRefreshContextValue | null>(null);

export function RatesAutoRefreshProvider({
  children,
}: {
  children: ReactNode;
}) {
  const currencyReady = useCurrencyHydrated();
  const value = useAutoRefreshRates(currencyReady);

  return (
    <RatesAutoRefreshContext.Provider value={value}>
      {children}
    </RatesAutoRefreshContext.Provider>
  );
}

export function useRatesAutoRefresh() {
  const context = useContext(RatesAutoRefreshContext);

  if (!context) {
    throw new Error(
      'useRatesAutoRefresh must be used within RatesAutoRefreshProvider.',
    );
  }

  return context;
}
