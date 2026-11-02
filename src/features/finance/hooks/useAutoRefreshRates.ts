
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { refreshLiveRates, type RefreshResult } from '@/services/liveRates';

const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;

function getLatestDueSlot(now: Date): number {
  const slot = new Date(now);
  const hour = now.getHours();

  if (hour >= 18) {
    slot.setHours(18, 0, 0, 0);
  } else if (hour >= 6) {
    slot.setHours(6, 0, 0, 0);
  } else {
    slot.setDate(slot.getDate() - 1);
    slot.setHours(18, 0, 0, 0);
  }

  return slot.getTime();
}

function isLatestSlotAlreadyUpdated(): boolean {
  const updatedAt = useCurrencyStore.getState().lastLiveUpdatedAt;

  if (!updatedAt) return false;

  const lastUpdate = Date.parse(updatedAt);

  if (!Number.isFinite(lastUpdate)) return false;

  return lastUpdate >= getLatestDueSlot(new Date());
}

export function useAutoRefreshRates(enabled: boolean) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastResult, setLastResult] = useState<RefreshResult | null>(null);

  const refreshingRef = useRef(false);
  const nextRetryAtRef = useRef(0);

  const refresh = useCallback(async (): Promise<RefreshResult | null> => {
    if (refreshingRef.current) return null;

    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const result = await refreshLiveRates();

      setLastResult(result);

      if (result.ok) {
        nextRetryAtRef.current = 0;
      } else {
        nextRetryAtRef.current = Date.now() + RETRY_DELAY_MS;
      }

      return result;
    } catch {
      const result: RefreshResult = {
        ok: false,
        message: 'Rates update failed. Please check your internet connection.',
      };

      setLastResult(result);
      nextRetryAtRef.current = Date.now() + RETRY_DELAY_MS;

      return result;
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const checkScheduledRefresh = useCallback(() => {
    if (!enabled || refreshingRef.current) return;

    if (Date.now() < nextRetryAtRef.current) return;

    if (!isLatestSlotAlreadyUpdated()) {
      void refresh();
    }
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;

    checkScheduledRefresh();

    const interval = setInterval(
      checkScheduledRefresh,
      CHECK_INTERVAL_MS,
    );

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        checkScheduledRefresh();
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [enabled, checkScheduledRefresh]);

  return {
    refresh,
    isRefreshing,
    lastResult,
  };
}
