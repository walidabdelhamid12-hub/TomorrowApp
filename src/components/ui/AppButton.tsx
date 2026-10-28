import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';
import { AppText } from './AppText';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Override the background color (e.g., a module accent color). */
  accentColor?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Optional element shown before the title (e.g., an icon). */
  leftIcon?: React.ReactNode;
  /** Stretch to the full width of the parent. Default: true. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Themed button with variants, loading state, and press feedback.
 */
export function AppButton({
  title,
  onPress,
  variant = 'primary',
  accentColor,
  loading = false,
  disabled = false,
  leftIcon,
  fullWidth = true,
  style,
  accessibilityLabel,
}: AppButtonProps) {
  const { colors, spacing, radius, sizes } = useTheme();

  const isDisabled = disabled || loading;
  const base = accentColor ?? colors.primary;

  // Resolve container + text colors for each variant.
  const palette = {
    primary: { bg: base, border: 'transparent', text: colors.onPrimary },
    secondary: { bg: colors.surfaceAlt, border: 'transparent', text: colors.text },
    outline: { bg: 'transparent', border: base, text: base },
    ghost: { bg: 'transparent', border: 'transparent', text: base },
    danger: { bg: colors.danger, border: 'transparent', text: '#FFFFFF' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: sizes.buttonHeight,
          borderRadius: radius.md,
          paddingHorizontal: spacing.xl,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={{ marginEnd: spacing.sm }}>{leftIcon}</View> : null}
          <AppText variant="button" color={palette.text}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});