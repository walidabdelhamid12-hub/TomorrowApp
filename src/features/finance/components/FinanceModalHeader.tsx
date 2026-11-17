import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { financeChrome } from './financeChrome';

export function FinanceModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <View style={financeChrome.modalHeader}>
    <AppText variant="h3" style={financeChrome.title}>{title}</AppText>
    <Pressable onPress={onClose} style={financeChrome.close} accessibilityRole="button" accessibilityLabel="Close">
      <Ionicons name="close" size={24} color="#FFFFFF" />
    </Pressable>
  </View>;
}
