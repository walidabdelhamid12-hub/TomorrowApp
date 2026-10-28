import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { moduleColors, useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: 'index' | 'spiritual' | 'health' | 'english';
  title: string;
  icon: IconName;
  iconActive: IconName;
  accent: string;
}

const TABS: TabConfig[] = [
  {
    name: 'index',
    title: 'Finance',
    icon: 'wallet-outline',
    iconActive: 'wallet',
    accent: moduleColors.finance,
  },
  {
    name: 'spiritual',
    title: 'Spiritual',
    icon: 'moon-outline',
    iconActive: 'moon',
    accent: moduleColors.spiritual,
  },
  {
    name: 'health',
    title: 'Health',
    icon: 'heart-outline',
    iconActive: 'heart',
    accent: moduleColors.health,
  },
  {
    name: 'english',
    title: 'English',
    icon: 'book-outline',
    iconActive: 'book',
    accent: moduleColors.english,
  },
];

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarActiveTintColor: tab.accent,
            tabBarIcon: (props: { focused: boolean; color: string; size: number }) => (
              <Ionicons
                name={props.focused ? tab.iconActive : tab.icon}
                size={props.size}
                color={props.color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}