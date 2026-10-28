import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { ColorScheme, ThemeColors, palettes } from './colors';
import { radius, sizes, spacing } from './spacing';
import { typography } from './typography';

/** User preference: follow the device, or force a mode. */
export type ThemeMode = 'system' | ColorScheme;

const STORAGE_KEY = 'tomorrow:theme-mode';

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  sizes: typeof sizes;
  typography: typeof typography;
  /** The resolved scheme actually being displayed. */
  scheme: ColorScheme;
  isDark: boolean;
  /** The saved preference ('system' | 'light' | 'dark'). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Quick switch between light and dark (sets an explicit mode). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Load the saved preference once on mount.
  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      })
      .catch(() => {
        // Ignore read errors: we simply fall back to the system theme.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const scheme: ColorScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Persistence is best-effort; the in-memory state is already updated.
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setMode]);

  const value = useMemo<Theme>(
    () => ({
      colors: palettes[scheme],
      spacing,
      radius,
      sizes,
      typography,
      scheme,
      isDark: scheme === 'dark',
      mode,
      setMode,
      toggleTheme,
    }),
    [scheme, mode, setMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the current theme from any component under <ThemeProvider>. */
export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside <ThemeProvider>.');
  }
  return context;
}