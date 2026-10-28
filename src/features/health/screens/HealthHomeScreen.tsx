import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';

const WATER_GOAL = 8;

interface Habit {
  key: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const HABITS: Habit[] = [
  { key: 'walk', title: '30 min walk', icon: 'walk-outline' },
  { key: 'sleep', title: 'Sleep 7+ hours', icon: 'bed-outline' },
  { key: 'stretch', title: 'Stretching', icon: 'body-outline' },
  { key: 'fruit', title: 'Eat fruit or vegetables', icon: 'nutrition-outline' },
];

export default function HealthHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const accent = moduleColors.health;

  const [glasses, setGlasses] = useState(0);
  const [doneHabits, setDoneHabits] = useState<Record<string, boolean>>({});

  const addGlass = () => setGlasses((g) => Math.min(g + 1, WATER_GOAL));
  const removeGlass = () => setGlasses((g) => Math.max(g - 1, 0));

  const toggleHabit = (key: string) => {
    setDoneHabits((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Screen scroll>
      <AppText variant="h1">Health</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        Habits, workouts, and wellbeing
      </AppText>

      {/* Water tracker */}
      <Card style={{ marginTop: spacing.xl }}>
        <View style={styles.rowBetween}>
          <AppText variant="h3">Water</AppText>
          <AppText variant="bodyStrong" color={accent}>
            {glasses}/{WATER_GOAL} glasses
          </AppText>
        </View>

        <View style={[styles.glassRow, { marginTop: spacing.md }]}>
          {Array.from({ length: WATER_GOAL }).map((_, i) => (
            <Ionicons
              key={i}
              name={i < glasses ? 'water' : 'water-outline'}
              size={26}
              color={i < glasses ? accent : colors.textDisabled}
            />
          ))}
        </View>

        <View style={[styles.row, { marginTop: spacing.lg }]}>
          <Pressable
            onPress={removeGlass}
            accessibilityRole="button"
            accessibilityLabel="Remove a glass"
            style={[
              styles.counterButton,
              { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, marginEnd: spacing.md },
            ]}
          >
            <Ionicons name="remove" size={22} color={colors.text} />
          </Pressable>

          <Pressable
            onPress={addGlass}
            accessibilityRole="button"
            accessibilityLabel="Add a glass"
            style={[
              styles.counterButton,
              styles.flex,
              { backgroundColor: accent, borderRadius: radius.md },
            ]}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
            <AppText variant="button" color="#FFFFFF" style={{ marginStart: spacing.xs }}>
              Add a glass
            </AppText>
          </Pressable>
        </View>
      </Card>

      {/* Daily habits */}
      <AppText variant="h3" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        Daily habits
      </AppText>

      <Card padded={false}>
        {HABITS.map((habit, index) => {
          const isDone = !!doneHabits[habit.key];
          return (
            <Pressable
              key={habit.key}
              onPress={() => toggleHabit(habit.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isDone }}
              accessibilityLabel={habit.title}
              style={({ pressed }) => [
                styles.habitRow,
                {
                  padding: spacing.lg,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.habitIcon,
                  {
                    backgroundColor: accent + '22',
                    borderRadius: radius.full,
                    marginEnd: spacing.md,
                  },
                ]}
              >
                <Ionicons name={habit.icon} size={20} color={accent} />
              </View>

              <AppText
                variant="bodyStrong"
                color={isDone ? 'textSecondary' : 'text'}
                style={[styles.flex, isDone && styles.strike]}
              >
                {habit.title}
              </AppText>

              <Ionicons
                name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                color={isDone ? accent : colors.textDisabled}
              />
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  glassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  counterButton: {
    height: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
});