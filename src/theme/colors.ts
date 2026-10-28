/**
 * Design system colors for "Tomorrow".
 * Light and dark palettes share the same shape (ThemeColors),
 * so any component can use `useTheme().colors.x` without caring about the mode.
 */

/** Accent color per module, used for tab icons, headers, and charts. */
export const moduleColors = {
  finance: '#10B981', // emerald
  spiritual: '#8B5CF6', // violet
  health: '#F43F5E', // rose
  english: '#3B82F6', // blue
} as const;

export type ModuleKey = keyof typeof moduleColors;

export interface ThemeColors {
  // Brand
  primary: string;
  onPrimary: string;

  // Surfaces
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;

  // Text
  text: string;
  textSecondary: string;
  textDisabled: string;

  // Semantic
  success: string;
  warning: string;
  danger: string;
  info: string;

  // Finance-specific
  income: string;
  expense: string;

  // Utilities
  overlay: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  primary: '#4F46E5',
  onPrimary: '#FFFFFF',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',

  text: '#0F172A',
  textSecondary: '#64748B',
  textDisabled: '#CBD5E1',

  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#0284C7',

  income: '#16A34A',
  expense: '#DC2626',

  overlay: 'rgba(15, 23, 42, 0.5)',
  shadow: '#000000',
};

export const darkColors: ThemeColors = {
  primary: '#818CF8',
  onPrimary: '#0F172A',

  background: '#0B1120',
  surface: '#111827',
  surfaceAlt: '#1F2937',
  border: '#273449',

  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textDisabled: '#475569',

  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#38BDF8',

  income: '#4ADE80',
  expense: '#F87171',

  overlay: 'rgba(0, 0, 0, 0.65)',
  shadow: '#000000',
};

export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};