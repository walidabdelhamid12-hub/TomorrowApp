import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { financeChrome } from './financeChrome';
import { useAppLanguage } from '@/localization/LanguageProvider';

export function FinanceModalHeader({ title, onClose, onBack, compactTitle = false }: { title: string; onClose: () => void; onBack?: () => void; compactTitle?: boolean }) {
  const { t } = useAppLanguage();
  return <View style={financeChrome.modalHeader}>
    {onBack ? <Pressable onPress={onBack} style={financeChrome.back} accessibilityRole="button" accessibilityLabel={t('Back', 'رجوع')}><Ionicons name="arrow-back" size={22} color="#D6B777" /></Pressable> : null}
    <AppText variant="h3" style={compactTitle ? [financeChrome.title, { fontSize: 17 }] : financeChrome.title} numberOfLines={compactTitle ? 1 : undefined} adjustsFontSizeToFit={compactTitle} minimumFontScale={0.8}>{title}</AppText>
    <Pressable onPress={onClose} style={financeChrome.close} accessibilityRole="button" accessibilityLabel={t('Close', 'إغلاق')}>
      <Ionicons name="close" size={24} color="#FFFFFF" />
    </Pressable>
  </View>;
}
