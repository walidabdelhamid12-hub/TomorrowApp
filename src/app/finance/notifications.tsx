import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/** Honest empty inbox: no notification producer, storage, or permissions. */
export default function FinanceNotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return <Screen edges={['top', 'bottom']}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back"
        onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <AppText variant="h1" accessibilityRole="header" style={{ flex: 1 }}>Notifications</AppText>
    </View>
    <View style={{ padding: 24, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface, alignItems: 'center', gap: 12 }}>
      <Ionicons name="notifications-outline" size={36} color={colors.textSecondary} accessible={false} />
      <AppText variant="h3" style={{ textAlign: 'center' }}>No notifications yet</AppText>
      <AppText color="textSecondary" style={{ textAlign: 'center' }}>There are no notifications to show.</AppText>
    </View>
  </Screen>;
}
