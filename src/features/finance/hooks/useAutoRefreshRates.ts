
import { useEffect } from 'react';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { refreshLiveRates } from '@/services/liveRates';

const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * Refreshes rates once when the screen is ready,
 * if the last successful update is older than 6 hours.
 *
 * Internet rates are always the source of truth.
 * Manual values never block automatic refresh.
 */
export function useAutoRefreshRates(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const { source, updatedAt } = useCurrencyStore.getState();

    const last = updatedAt ? Date.parse(updatedAt) : 0;
    const isRecent =
      source === 'live' &&
      Number.isFinite(last) &&
      Date.now() - last < STALE_MS;

    if (isRecent) return;

    void refreshLiveRates();
  }, [enabled]);
}
