import React from 'react';
import {
    Pressable,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

type CardVariant = 'elevated' | 'outlined' | 'filled';

interface CardProps {
  children: React.ReactNode;
  /** elevated: soft shadow | outlined: border only | filled: subtle tinted background. */
  variant?: CardVariant;
  /** If provided, the card becomes pressable with press feedback. */
  onPress?: () => void;
  /** Inner padding. Pass false to render edge-to-edge content (e.g., images). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Themed surface container used for balance cards, list groups, stats, etc.
 */
export function Card({
  children,
  variant = 'elevated',
  onPress,
  padded = true,
  style,
  accessibilityLabel,
}: CardProps) {
  const { colors, spacing, radius, isDark } = useTheme();

  const variantStyle: ViewStyle = {
    elevated: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      // Shadows are barely visible on dark backgrounds, so keep them subtle.
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 8,
      elevation: isDark ? 0 : 3,
      // On dark mode a thin border replaces the shadow for separation.
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
    } as ViewStyle,
    outlined: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    } as ViewStyle,
    filled: {
      backgroundColor: colors.surfaceAlt,
    } as ViewStyle,
  }[variant];

  const baseStyle: StyleProp<ViewStyle> = [
    { borderRadius: radius.lg },
    padded && { padding: spacing.lg },
    variantStyle,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [baseStyle, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} style={baseStyle}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});