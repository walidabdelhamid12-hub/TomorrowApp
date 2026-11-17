/**
 * Finance-only visual identity.
 *
 * Additive design contract: no global theme overrides, financial logic,
 * persistence, navigation, or posting behavior is changed by this module.
 * Existing screens are NOT migrated by adding this file.
 */
import { radius, sizes, spacing } from '@/theme/spacing';
import type { ColorScheme } from '@/theme/colors';

export const financeBrand = {
  navy: '#1E293B',
  gold: '#D6B777',
  white: '#FFFFFF',
} as const;

export const financeDesignTokens = {
  light: {
    header: financeBrand.navy,
    onHeader: financeBrand.white,
    primaryButton: financeBrand.navy,
    onPrimaryButton: financeBrand.white,
    goldBorder: financeBrand.gold,
    background: '#F8FAFC',
    surface: financeBrand.white,
    text: '#0F172A',
    secondaryText: '#64748B',
    inputBorder: '#CBD5E1',
    income: '#16A34A',
    expense: '#DC2626',
  },
  dark: {
    header: financeBrand.navy,
    onHeader: financeBrand.white,
    primaryButton: financeBrand.navy,
    onPrimaryButton: financeBrand.white,
    goldBorder: financeBrand.gold,
    background: '#0B1120',
    surface: '#111827',
    text: '#F1F5F9',
    secondaryText: '#94A3B8',
    inputBorder: '#475569',
    income: '#4ADE80',
    expense: '#F87171',
  },
} as const;

export const financeLayoutTokens = {
  spacing,
  radius,
  sizes,
  modalTopBorderWidth: 2,
  cardBorderWidth: 1,
  headerRadius: radius.lg,
  modalRadius: radius.xl,
} as const;

/** Read-only palette selector. Caller supplies the current theme scheme. */
export function getFinanceDesignTokens(scheme: ColorScheme) {
  return financeDesignTokens[scheme];
}
