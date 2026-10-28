import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (for long or form screens). */
  scroll?: boolean;
  /** Apply the default horizontal/vertical padding. Default: true. */
  padded?: boolean;
  /**
   * Which safe-area edges to respect.
   * Default is ['top'] because the bottom tab bar already handles the bottom inset.
   * Use ['top', 'bottom'] for screens outside the tabs (e.g., modals).
   */
  edges?: Edge[];
  /** Style for the outer container. */
  style?: StyleProp<ViewStyle>;
  /** Style for the inner content (applied to ScrollView content or inner View). */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Base wrapper for every screen: safe area, themed background,
 * consistent padding, optional scrolling, and keyboard handling.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  style,
  contentContainerStyle,
}: ScreenProps) {
  const { colors, spacing } = useTheme();

  const paddingStyle: ViewStyle | undefined = padded
    ? { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }
    : undefined;

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, { backgroundColor: colors.background }, style]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              paddingStyle,
              { paddingBottom: spacing.xxl },
              contentContainerStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, paddingStyle, contentContainerStyle]}>
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});