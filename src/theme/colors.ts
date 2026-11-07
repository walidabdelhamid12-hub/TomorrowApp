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

export type FinanceTone = 'balance' | 'asset' | 'account' | 'income' | 'expense' | 'liability' | 'transfer' | 'neutral';
export interface FinanceCardColors { surface: string; border: string; accent: string }
export type FinanceColors = Record<FinanceTone, FinanceCardColors> & {
  edit: { surface: string; text: string };
  delete: { surface: string; text: string };
};

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
  finance: FinanceColors;

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
  finance: {
    balance: { surface: '#EEF7F2', border: '#C8E1D3', accent: '#176849' },
    asset: { surface: '#F4F0FA', border: '#DFD3EE', accent: '#6B4796' },
    account: { surface: '#EDF4FC', border: '#CBDCF0', accent: '#2C619C' },
    income: { surface: '#EFF8F2', border: '#CDE6D5', accent: '#247147' },
    expense: { surface: '#FCF1F0', border: '#F0D4D0', accent: '#AC4641' },
    liability: { surface: '#FBF6EC', border: '#E9DBC0', accent: '#85601C' },
    transfer: { surface: '#EEF6F8', border: '#CADFE5', accent: '#286B7B' },
    neutral: { surface: '#F2F5F8', border: '#D6DEE7', accent: '#4E6478' },
    edit: { surface: '#E8F5EE', text: '#216E4A' },
    delete: { surface: '#FCEEEE', text: '#B42323' },
  },

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
  finance: {
    balance: { surface: '#132A23', border: '#2A4C3E', accent: '#84D3AE' },
    asset: { surface: '#251D33', border: '#48365F', accent: '#C2A3E5' },
    account: { surface: '#18283B', border: '#314D6D', accent: '#96BDEB' },
    income: { surface: '#162D23', border: '#2D5140', accent: '#8FD5A9' },
    expense: { surface: '#332021', border: '#603C3D', accent: '#E9AAA4' },
    liability: { surface: '#30291C', border: '#55482E', accent: '#DCC18C' },
    transfer: { surface: '#182C33', border: '#2D4E5A', accent: '#95CAD7' },
    neutral: { surface: '#202A36', border: '#3A4859', accent: '#B1C0D2' },
    edit: { surface: '#17372B', text: '#90D6AF' },
    delete: { surface: '#3B2529', text: '#EAA8A8' },
  },

  overlay: 'rgba(0, 0, 0, 0.65)',
  shadow: '#000000',
};

export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};
