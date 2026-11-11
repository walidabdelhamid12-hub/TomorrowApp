import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Privacy is separate from financial records and defaults to hidden during hydration. */
export const useFinancePreferences = create<{
  amountsVisible: boolean;
  toggleAmounts: () => void;
}>()(persist((set) => ({
  amountsVisible: false,
  toggleAmounts: () => set(state => ({ amountsVisible: !state.amountsVisible })),
}), {
  name: 'tomorrow-finance-preferences',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: state => ({ amountsVisible: state.amountsVisible }),
  merge: (persisted, current) => ({ ...current,
    amountsVisible: (persisted as { amountsVisible?: unknown } | undefined)?.amountsVisible === true,
  }),
}));
