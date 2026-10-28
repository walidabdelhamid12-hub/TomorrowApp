import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';

interface Prayer {
  key: string;
  name: string;
  arabic: string;
}

const PRAYERS: Prayer[] = [
  { key: 'fajr', name: 'Fajr', arabic: 'الفجر' },
  { key: 'dhuhr', name: 'Dhuhr', arabic: 'الظهر' },
  { key: 'asr', name: 'Asr', arabic: 'العصر' },
  { key: 'maghrib', name: 'Maghrib', arabic: 'المغرب' },
  { key: 'isha', name: 'Isha', arabic: 'العشاء' },
];

export default function SpiritualHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const accent = moduleColors.spiritual;

  // Which prayers were completed today (in-memory for now).
  const [done, setDone] = useState<Record<string, boolean>>({});

  const completed = PRAYERS.filter((p) => done[p.key]).length;
  const progress = completed / PRAYERS.length;

  const toggle = (key: string) => {
    setDone((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Screen scroll>
      <AppText variant="h1">Spiritual</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        Prayers, azkar, and daily worship
      </AppText>

      {/* Daily progress */}
      <Card style={{ marginTop: spacing.xl }}>
        <View style={styles.rowBetween}>
          <AppText variant="h3">Today's prayers</AppText>
          <AppText variant="bodyStrong" color={accent}>
            {completed}/{PRAYERS.length}
          </AppText>
        </View>

        <View
          style={[
            styles.track,
            {
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.full,
              marginTop: spacing.md,
            },
          ]}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              backgroundColor: accent,
              borderRadius: radius.full,
            }}
          />
        </View>

        <AppText variant="caption" color="textSecondary" style={{ marginTop: spacing.sm }}>
          {completed === PRAYERS.length
            ? 'All prayers completed. May Allah accept them.'
            : 'Tap a prayer to mark it as done.'}
        </AppText>
      </Card>

      {/* Prayer list */}
      <Card padded={false} style={{ marginTop: spacing.lg }}>
        {PRAYERS.map((prayer, index) => {
          const isDone = !!done[prayer.key];
          return (
            <Pressable
              key={prayer.key}
              onPress={() => toggle(prayer.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isDone }}
              accessibilityLabel={prayer.name}
              style={({ pressed }) => [
                styles.prayerRow,
                {
                  padding: spacing.lg,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{prayer.name}</AppText>
                <AppText variant="caption" color="textSecondary">
                  {prayer.arabic}
                </AppText>
              </View>

              <Ionicons
                name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={28}
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  track: {
    height: 10,
    overflow: 'hidden',
  },
  prayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});