import { useEffect } from 'react';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { refreshLiveRates } from '@/services/liveRates';

const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * Refreshes rates once when the screen is ready, if they are older than 6 hours.
 * Rates you edited by hand are left alone (use the button in Rates to override).
 */
export function useAutoRefreshRates(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const { source, updatedAt } = useCurrencyStore.getState();
    if (source === 'manual') return;
    const last = updatedAt ? Date.parse(updatedAt) : 0;
    if (source === 'live' && Date.now() - last < STALE_MS) return;
    void refreshLiveRates();
  }, [enabled]);
}