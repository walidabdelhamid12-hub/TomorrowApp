import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

interface FinanceActionButtonsProps {
  label: string;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteTitle?: string;
}

/** Labeled Accounts actions from ad7d5c6, with larger targets and dark surfaces. */
export function FinanceActionButtons({ label, onEdit, onDelete, deleteTitle = 'Delete' }: FinanceActionButtonsProps) {
  const { colors, isDark } = useTheme();
  const actions = [
    ...(onEdit ? [{ title: 'Edit', icon: 'create-outline' as const, onPress: onEdit,
      tint: isDark ? colors.success : '#27845B', background: isDark ? colors.success + '18' : '#E8F5EE' }] : []),
    ...(onDelete ? [{ title: deleteTitle, icon: 'trash-outline' as const, onPress: onDelete,
      tint: isDark ? colors.danger : '#B42323', background: isDark ? colors.danger + '18' : '#FCEEEE' }] : []),
  ];
  return (
    <View style={styles.actions}>
      {actions.map(action => (
        <Pressable key={action.title} accessibilityRole="button" accessibilityLabel={action.title + ' ' + label}
          onPress={action.onPress} style={({ pressed }) => [styles.target, { opacity: pressed ? 0.65 : 1 }]}><View style={[styles.button, {
            backgroundColor: action.background, borderColor: action.tint + '55',
          }]}>
          <Ionicons name={action.icon} size={13} color={action.tint} accessible={false} />
          <AppText variant="caption" color={action.tint} style={styles.label}>{action.title}</AppText>
        </View></Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 0, justifyContent: 'flex-end', alignSelf: 'flex-end', maxWidth: '100%', flexShrink: 1 },
  target: { minWidth: 48, minHeight: 48, paddingHorizontal: 3, justifyContent: 'center', maxWidth: '100%' },
  button: { minHeight: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, maxWidth: '100%' },
  label: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
});
