/**
 * Spacing, radius, and sizing scales (4pt grid).
 * Always use these tokens instead of hard-coded numbers in StyleSheets.
 */

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/** Common fixed sizes (touch targets, icons, inputs). */
export const sizes = {
  iconSm: 16,
  iconMd: 24,
  iconLg: 32,
  /** Minimum touch target recommended by iOS/Android guidelines. */
  touchTarget: 44,
  inputHeight: 52,
  buttonHeight: 52,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;