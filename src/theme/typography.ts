import { TextStyle } from 'react-native';

/**
 * Typography scale for "Tomorrow".
 * Each variant is a ready-to-spread TextStyle, used by <AppText variant="..." />.
 * Font family is left as the system default (San Francisco / Roboto);
 * to use a custom font later, set `fontFamily` here in one place.
 */

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'button'
  | 'amount';

export const typography: Record<TextVariant, TextStyle> = {
  display: {
    fontSize: fontSizes.display,
    lineHeight: 48,
    fontWeight: fontWeights.bold,
  },
  h1: {
    fontSize: fontSizes.xxxl,
    lineHeight: 40,
    fontWeight: fontWeights.bold,
  },
  h2: {
    fontSize: fontSizes.xxl,
    lineHeight: 32,
    fontWeight: fontWeights.semibold,
  },
  h3: {
    fontSize: fontSizes.xl,
    lineHeight: 28,
    fontWeight: fontWeights.semibold,
  },
  body: {
    fontSize: fontSizes.md,
    lineHeight: 24,
    fontWeight: fontWeights.regular,
  },
  bodyStrong: {
    fontSize: fontSizes.md,
    lineHeight: 24,
    fontWeight: fontWeights.semibold,
  },
  caption: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
    fontWeight: fontWeights.regular,
  },
  label: {
    fontSize: fontSizes.xs,
    lineHeight: 16,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.4,
  },
  button: {
    fontSize: fontSizes.md,
    lineHeight: 24,
    fontWeight: fontWeights.semibold,
  },
  /** Money values: tabular digits keep columns of numbers aligned. */
  amount: {
    fontSize: fontSizes.xxl,
    lineHeight: 32,
    fontWeight: fontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
};