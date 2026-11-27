import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { useAppLanguage } from '@/localization/LanguageProvider';

/** Matches the approved dashboard action visuals without pretending an unavailable export works. */
export function StatementExportActions({ busy = false, disabled = false, pdf, excel, share }: {
  busy?: boolean; disabled?: boolean; pdf?: () => void; excel?: () => void; share?: () => void;
}) {
  const { t } = useAppLanguage();
  const items = [
    { label: 'PDF', icon: 'document-outline' as const, color: '#DC2626', action: pdf },
    { label: 'Excel', icon: 'grid-outline' as const, color: '#15803D', action: excel },
    { label: t('Share', 'مشاركة'), icon: 'share-social-outline' as const, color: '#2563EB', action: share },
  ];
  return <View style={{ flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#DEE7F0', backgroundColor: '#FFFFFF', marginTop: 12 }}>
    {items.map(item => {
      const available = !!item.action && !disabled && !busy;
      return <Pressable key={item.label} accessibilityRole="button"
        accessibilityLabel={available ? t(`Export ${item.label}`, `تصدير ${item.label}`) : t(`${item.label} export unavailable`, `تصدير ${item.label} غير متاح`)}
        accessibilityState={{ disabled: !available }} disabled={!available} onPress={item.action}
        style={{ flex: 1, minHeight: 49, borderRadius: 9, borderWidth: 1, borderColor: '#DCE5EF',
          alignItems: 'center', justifyContent: 'center', gap: 3, opacity: available ? 1 : 0.4 }}>
        <Ionicons name={item.icon} size={19} color={item.color} />
        <AppText variant="caption" style={{ fontSize: 10, color: '#0B315C', fontWeight: '600' }}>{item.label}</AppText>
      </Pressable>;
    })}
  </View>;
}
