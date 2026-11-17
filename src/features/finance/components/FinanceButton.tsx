/** Finance-scoped button styling; leaves the global AppButton untouched. */
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AppButton } from '@/components/ui/AppButton';
import { getFinanceDesignTokens } from '../constants/financeDesignTokens';

type Props = React.ComponentProps<typeof AppButton>;

export function FinanceButton({ accentColor, variant = 'primary', title, onPress, disabled, loading, leftIcon, fullWidth = true, style, accessibilityLabel }: Props) {
  const { scheme } = useTheme();
  const tokens = getFinanceDesignTokens(scheme);
  const filled = variant === 'primary' || variant === 'danger';
  const foreground = filled ? '#FFFFFF' : tokens.text;
  const background = variant === 'danger' ? tokens.expense : variant === 'primary' ? accentColor ?? tokens.primaryButton : variant === 'secondary' ? tokens.surface : 'transparent';
  return <Pressable onPress={onPress} disabled={disabled || loading}
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
    style={({ pressed }) => [{ minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
      backgroundColor: background, borderColor: tokens.goldBorder, borderWidth: variant === 'outline' ? 1.5 : 0,
      alignSelf: fullWidth ? 'stretch' : 'flex-start', maxWidth: '100%', justifyContent: 'center',
      opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 }, style]}>
    {loading ? <ActivityIndicator color={foreground} /> : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {leftIcon}
      <AppText variant="button" style={{ color: foreground, flexShrink: 1, textAlign: 'center' }}>{title}</AppText>
    </View>}
  </Pressable>;
}
