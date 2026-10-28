import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { moduleColors, useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: {
  name: string;
  title: string;
  icon: IconName;
  iconActive: IconName;
  color: string;
}[] = [
  { name: 'index', title: 'Finance', icon: 'wallet-outline', iconActive: 'wallet', color: moduleColors.finance },
  { name: 'spiritual', title: 'Spiritual', icon: 'moon-outline', iconActive: 'moon', color: moduleColors.spiritual },
  { name: 'health', title: 'Health', icon: 'heart-outline', iconActive: 'heart', color: moduleColors.health },
  { name: 'english', title: 'English', icon: 'book-outline', iconActive: 'book', color: moduleColors.english },
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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarActiveTintColor: tab.color,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}