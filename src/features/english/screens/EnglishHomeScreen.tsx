import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { moduleColors, useTheme } from '@/theme';

interface Word {
  word: string;
  meaning: string;
  example: string;
}

const DAILY_GOAL = 5;

/** Sample vocabulary. Will be replaced by the English module store. */
const WORDS: Word[] = [
  {
    word: 'Resilient',
    meaning: 'Able to recover quickly from difficulties.',
    example: 'She stayed resilient after the setback.',
  },
  {
    word: 'Diligent',
    meaning: 'Showing careful and persistent effort.',
    example: 'He is a diligent student who reviews every day.',
  },
  {
    word: 'Consistent',
    meaning: 'Doing something in the same way over time.',
    example: 'Consistent practice improves your speaking.',
  },
  {
    word: 'Fluent',
    meaning: 'Able to speak a language easily and accurately.',
    example: 'Her goal is to become fluent in English.',
  },
  {
    word: 'Improve',
    meaning: 'To become or make something better.',
    example: 'Reading daily will improve your vocabulary.',
  },
];

export default function EnglishHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const accent = moduleColors.english;

  const [index, setIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [learned, setLearned] = useState(0);

  const current = WORDS[index % WORDS.length];
  const progress = Math.min(learned / DAILY_GOAL, 1);

  const markLearned = () => {
    setLearned((n) => Math.min(n + 1, DAILY_GOAL));
    setIndex((i) => i + 1);
    setShowMeaning(false);
  };

  const skip = () => {
    setIndex((i) => i + 1);
    setShowMeaning(false);
  };

  return (
    <Screen scroll>
      <AppText variant="h1">English</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        Vocabulary, practice, and daily progress
      </AppText>

      {/* Daily goal */}
      <Card style={{ marginTop: spacing.xl }}>
        <View style={styles.rowBetween}>
          <AppText variant="h3">Daily goal</AppText>
          <AppText variant="bodyStrong" color={accent}>
            {learned}/{DAILY_GOAL} words
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

        {learned >= DAILY_GOAL ? (
          <AppText variant="caption" color="success" style={{ marginTop: spacing.sm }}>
            Goal reached. Great work today!
          </AppText>
        ) : null}
      </Card>

      {/* Word card */}
      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.row}>
          <Ionicons name="book-outline" size={18} color={accent} />
          <AppText
            variant="label"
            color={accent}
            style={{ marginStart: spacing.xs }}
          >
            WORD OF THE MOMENT
          </AppText>
        </View>

        <AppText variant="h1" style={{ marginTop: spacing.md }}>
          {current.word}
        </AppText>

        {showMeaning ? (
          <View style={{ marginTop: spacing.md }}>
            <AppText variant="body">{current.meaning}</AppText>
            <AppText
              variant="caption"
              color="textSecondary"
              style={{ marginTop: spacing.sm, fontStyle: 'italic' }}
            >
              "{current.example}"
            </AppText>
          </View>
        ) : (
          <AppText color="textSecondary" style={{ marginTop: spacing.md }}>
            Try to recall the meaning, then reveal it.
          </AppText>
        )}

        <View style={{ marginTop: spacing.xl }}>
          {showMeaning ? (
            <>
              <AppButton
                title="I learned it"
                accentColor={accent}
                onPress={markLearned}
                disabled={learned >= DAILY_GOAL}
              />
              <AppButton
                title="Skip"
                variant="ghost"
                accentColor={accent}
                onPress={skip}
                style={{ marginTop: spacing.sm }}
              />
            </>
          ) : (
            <AppButton
              title="Show meaning"
              variant="outline"
              accentColor={accent}
              onPress={() => setShowMeaning(true)}
            />
          )}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
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
});