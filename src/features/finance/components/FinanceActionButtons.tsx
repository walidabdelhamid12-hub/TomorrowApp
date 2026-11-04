import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

interface FinanceActionButtonsProps {
  label: string;
  onEdit: () => void;
  onDelete?: () => void;
}

/** Labeled Accounts actions from ad7d5c6, with larger targets and dark surfaces. */
export function FinanceActionButtons({ label, onEdit, onDelete }: FinanceActionButtonsProps) {
  const { colors, isDark } = useTheme();
  const actions = [
    { title: 'Edit', icon: 'create-outline' as const, onPress: onEdit,
      tint: isDark ? colors.success : '#27845B', background: isDark ? colors.success + '18' : '#E8F5EE' },
    ...(onDelete ? [{ title: 'Delete', icon: 'trash-outline' as const, onPress: onDelete,
      tint: isDark ? colors.danger : '#B42323', background: isDark ? colors.danger + '18' : '#FCEEEE' }] : []),
  ];
  return (
    <View style={styles.actions}>
      {actions.map(action => (
        <Pressable key={action.title} accessibilityRole="button" accessibilityLabel={action.title + ' ' + label}
          onPress={action.onPress} style={({ pressed }) => [styles.button, {
            backgroundColor: action.background, borderColor: action.tint + '55', opacity: pressed ? 0.65 : 1,
          }]}>
          <Ionicons name={action.icon} size={17} color={action.tint} accessible={false} />
          <AppText variant="caption" color={action.tint} style={styles.label}>{action.title}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, maxWidth: '100%', flexShrink: 1 },
  button: { minWidth: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, borderWidth: 1, maxWidth: '100%' },
  label: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
