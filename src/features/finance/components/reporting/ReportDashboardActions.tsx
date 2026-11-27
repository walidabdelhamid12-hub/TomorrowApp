import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import { useAppLanguage } from '@/localization/LanguageProvider';

/** Fixed dashboard-only actions; other report screens keep their existing footer. */
export function ReportDashboardActions({ busy, disabled, pdf, excel, share, statement }: {
  busy: boolean; disabled: boolean; pdf: () => void; excel: () => void; share: () => void; statement: () => void;
}) {
  const { t } = useAppLanguage();
  const actions: { label: string; icon: keyof typeof Ionicons.glyphMap; action: () => void; color: string; available: boolean }[] = [
    { label: t('Statement', 'كشف الحساب'), icon: 'document-text-outline', action: statement, color: '#2563EB', available: true },
    { label: 'PDF', icon: 'document-outline', action: pdf, color: '#DC2626', available: !busy && !disabled },
    { label: 'Excel', icon: 'grid-outline', action: excel, color: '#15803D', available: !busy && !disabled },
    { label: t('Share', 'مشاركة'), icon: 'share-social-outline', action: share, color: '#2563EB', available: !busy && !disabled },
  ];
  return <View style={{ flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#DEE7F0', backgroundColor: '#FFFFFF' }}>
    {actions.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.action === statement ? t('View Statement', 'عرض كشف الحساب') : t(`Export ${item.label}`, `تصدير ${item.label}`)}
      disabled={!item.available} onPress={() => { if (item.available) item.action(); }} style={{ flex: 1, minHeight: 49, borderRadius: 9,
        borderWidth: 1, borderColor: '#DCE5EF', alignItems: 'center', justifyContent: 'center', gap: 3,
        opacity: item.available ? 1 : 0.4 }}>
      <Ionicons name={item.icon} size={19} color={item.color} />
      <AppText variant="caption" style={{ fontSize: 10, color: '#0B315C', fontWeight: '600' }}>{item.label}</AppText>
    </Pressable>)}
  </View>;
}
