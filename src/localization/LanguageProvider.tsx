import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'ar';
const STORAGE_KEY = 'tomorrow:app-language';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => void;
  isRTL: boolean;
  t: (english: string, arabic: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (active && (saved === 'en' || saved === 'ar')) setLanguageState(saved);
      })
      .catch(() => { /* English remains the fallback when storage is unavailable. */ })
      .finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    if (next !== 'en' && next !== 'ar') return;
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* In-memory selection remains usable if storage fails. */
    });
  }, []);

  const t = useCallback((english: string, arabic: string) => language === 'ar' ? arabic : english, [language]);
  const value = useMemo(() => ({ language, setLanguage, isRTL: language === 'ar', t }), [language, setLanguage, t]);
  // Avoid briefly displaying English before a saved Arabic selection is restored.
  return <LanguageContext.Provider value={value}>{hydrated ? children : null}</LanguageContext.Provider>;
}

export function useAppLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useAppLanguage must be used inside LanguageProvider');
  return context;
}
