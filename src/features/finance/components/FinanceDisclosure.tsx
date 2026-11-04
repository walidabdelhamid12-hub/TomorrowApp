import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

export function FinanceDisclosure({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();
  return <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Toggle ' + title} accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <AppText variant="bodyStrong" style={{ flex: 1 }}>{title + (count === undefined ? '' : ' (' + count + ')')}</AppText>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
    </Pressable>
    {expanded && children}
  </View>;
}
