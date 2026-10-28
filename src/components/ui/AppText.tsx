import { StyleProp, Text, TextProps, TextStyle } from 'react-native';

import { TextVariant, useTheme } from '@/theme';

type TextColor =
  | 'text'
  | 'textSecondary'
  | 'textDisabled'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'income'
  | 'expense'
  | 'onPrimary';

interface AppTextProps extends TextProps {
  /** Typography preset from the theme. Default: 'body'. */
  variant?: TextVariant;
  /** Theme color key, or any custom color string. Default: 'text'. */
  color?: TextColor | (string & {});
  /** Text alignment shortcut. */
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/**
 * Themed text component. Always use this instead of the raw <Text>
 * so typography and colors stay consistent and dark mode works automatically.
 */
export function AppText({
  variant = 'body',
  color = 'text',
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { colors, typography } = useTheme();

  // If `color` is a theme key use it, otherwise treat it as a raw color value.
  const resolvedColor =
    color in colors ? colors[color as keyof typeof colors] : color;

  return (
    <Text
      style={[
        typography[variant],
        { color: resolvedColor },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}