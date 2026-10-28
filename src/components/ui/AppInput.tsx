import React, { forwardRef, useState } from 'react';
import {
    StyleProp,
    StyleSheet,
    TextInput,
    TextInputProps,
    View,
    ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';
import { AppText } from './AppText';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const AppInput = forwardRef<any, AppInputProps>(
  function AppInput(props, ref) {
    const {
      label,
      error,
      hint,
      leftElement,
      rightElement,
      containerStyle,
      onFocus,
      onBlur,
      editable = true,
      multiline,
      style,
      ...rest
    } = props;

    const { colors, spacing, radius, sizes, typography } = useTheme();
    const [focused, setFocused] = useState(false);

    const borderColor = error
      ? colors.danger
      : focused
        ? colors.primary
        : colors.border;

    return (
      <View style={containerStyle}>
        {label ? (
          <AppText
            variant="label"
            color="textSecondary"
            style={{ marginBottom: spacing.xs }}
          >
            {label}
          </AppText>
        ) : null}

        <View
          style={[
            styles.field,
            {
              minHeight: sizes.inputHeight,
              borderRadius: radius.md,
              borderColor,
              borderWidth: focused || error ? 1.5 : 1,
              backgroundColor: editable ? colors.surface : colors.surfaceAlt,
              paddingHorizontal: spacing.md,
              alignItems: multiline ? 'flex-start' : 'center',
            },
          ]}
        >
          {leftElement ? (
            <View style={{ marginEnd: spacing.sm }}>{leftElement}</View>
          ) : null}

          <TextInput
            {...rest}
            ref={ref}
            editable={editable}
            multiline={multiline}
            placeholderTextColor={colors.textDisabled}
            selectionColor={colors.primary}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[
              typography.body,
              styles.input,
              { color: colors.text, paddingVertical: spacing.md },
              style,
            ]}
          />

          {rightElement ? (
            <View style={{ marginStart: spacing.sm }}>{rightElement}</View>
          ) : null}
        </View>

        {error || hint ? (
          <AppText
            variant="caption"
            color={error ? 'danger' : 'textSecondary'}
            style={{ marginTop: spacing.xs }}
          >
            {error ?? hint}
          </AppText>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
  },
  input: {
    flex: 1,
    includeFontPadding: false,
  },
});