import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

interface ModulePlaceholderProps {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Module accent color (see moduleColors). */
  color: string;
}

/** Temporary screen shown until each module is built. */
export function ModulePlaceholder({
  title,
  subtitle,
  icon,
  color,
}: ModulePlaceholderProps) {
  const { spacing, radius, sizes } = useTheme();

  return (
    <Screen scroll>
      <AppText variant="h1">{title}</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        {subtitle}
      </AppText>

      <Card style={{ marginTop: spacing.xl, alignItems: 'center' }}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: color + '22', borderRadius: radius.full },
          ]}
        >
          <Ionicons name={icon} size={sizes.iconLg} color={color} />
        </View>
        <AppText variant="h3" style={{ marginTop: spacing.md }}>
          Coming soon
        </AppText>
        <AppText
          color="textSecondary"
          align="center"
          style={{ marginTop: spacing.xs }}
        >
          This module is under construction.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
});