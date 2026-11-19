import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { useFinancePreferences } from '@/features/finance/store/useFinancePreferences';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

const NAVY = '#1E293B';
const GOLD = '#D6B777';
const PAGE = '#F1F5F9';
const BORDER = '#CBD5E1';

/** Visual refresh only. Existing preference providers remain authoritative. */
export default function FinanceSettingsScreen() {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const { language, setLanguage, t, isRTL } = useAppLanguage();
  const amountsVisible = useFinancePreferences(state => state.amountsVisible);
  const toggleAmounts = useFinancePreferences(state => state.toggleAmounts);

  const card = { backgroundColor: '#FFFFFF', borderColor: BORDER, borderWidth: 1, borderRadius: 12 } as const;

  return <Screen scroll edges={['top', 'bottom']} style={{ backgroundColor: PAGE }}>
    <View style={{ backgroundColor: NAVY, borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
      marginHorizontal: -16, marginTop: -8, paddingHorizontal: 16, paddingTop: 7, paddingBottom: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back', 'رجوع')}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </Pressable>
        <AppText variant="h1" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 18 }}>{t('Settings', 'الإعدادات')}</AppText>
        <View style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="settings-outline" size={23} color={GOLD} /></View>
      </View>
    </View>

    <AppText variant="h3" style={{ color: NAVY, marginTop: 20, marginBottom: 9 }}>{t('Language', 'اللغة')}</AppText>
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Application language', 'لغة التطبيق')} style={[card, { padding: 8 }]}>
      {(['en', 'ar'] as const).map((value, index) => <Pressable key={value}
        accessibilityRole="radio" accessibilityLabel={value === 'en' ? 'English' : 'العربية'}
        accessibilityState={{ checked: language === value }} onPress={() => setLanguage(value)}
        style={{ minHeight: 49, paddingHorizontal: 10, borderBottomWidth: index === 1 ? 0 : 1,
          borderBottomColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <AppText style={{ flex: 1, color: NAVY }}>{value === 'en' ? 'English' : 'العربية'}</AppText>
        {language === value ? <Ionicons name="checkmark" size={23} color={GOLD} /> : <View style={{ width: 23 }} />}
      </Pressable>)}
    </View>
    <AppText style={{ color: '#64748B', fontSize: 12, marginTop: 6, textAlign: isRTL ? 'right' : 'left' }}>
      {t('Language selection is independent of your phone settings.', 'اختيار اللغة مستقل عن إعدادات لغة الهاتف.')}
    </AppText>

    <AppText variant="h3" style={{ color: NAVY, marginTop: 20, marginBottom: 9 }}>{t('Notifications', 'الإشعارات')}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel={t('Open notifications', 'فتح الإشعارات')}
      onPress={() => router.push('/finance/notifications')}
      style={[card, { minHeight: 58, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <Ionicons name="notifications-outline" size={23} color={GOLD} />
      <AppText variant="bodyStrong" style={{ flex: 1, color: NAVY }}>{t('Notifications', 'الإشعارات')}</AppText>
      <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color="#64748B" />
    </Pressable>

    <AppText variant="h3" style={{ color: NAVY, marginTop: 20, marginBottom: 9 }}>{t('Appearance', 'المظهر')}</AppText>
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Appearance', 'المظهر')} style={[card, { padding: 8 }]}>
      {(['system', 'light', 'dark'] as const).map((value, index) => <Pressable key={value}
        accessibilityRole="radio" accessibilityLabel={`Appearance: ${value}`}
        accessibilityState={{ checked: mode === value }} onPress={() => setMode(value)}
        style={{ minHeight: 49, paddingHorizontal: 10, borderBottomWidth: index === 2 ? 0 : 1,
          borderBottomColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={value === 'system' ? 'phone-portrait-outline' : value === 'light' ? 'sunny-outline' : 'moon-outline'} size={20} color={NAVY} />
        <AppText style={{ flex: 1, color: NAVY }}>{value === 'system' ? t('Use device appearance', 'حسب مظهر الجهاز') : value === 'light' ? t('Light', 'فاتح') : t('Dark', 'داكن')}</AppText>
        <Ionicons name={mode === value ? 'radio-button-on' : 'radio-button-off'} size={22} color={mode === value ? GOLD : '#94A3B8'} />
      </Pressable>)}
    </View>

    <AppText variant="h3" style={{ color: NAVY, marginTop: 20, marginBottom: 9 }}>{t('Finance privacy', 'خصوصية البيانات المالية')}</AppText>
    <Pressable accessibilityRole="switch" accessibilityLabel={t('Show Finance amounts', 'إظهار المبالغ المالية')}
      accessibilityState={{ checked: amountsVisible }} onPress={toggleAmounts}
      style={[card, { minHeight: 64, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <Ionicons name="shield-checkmark-outline" size={22} color={GOLD} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ color: NAVY }}>{t('Show Finance amounts', 'إظهار المبالغ المالية')}</AppText>
        <AppText style={{ color: '#64748B', fontSize: 12 }}>{amountsVisible ? t('Amounts are visible', 'المبالغ ظاهرة') : t('Amounts are hidden', 'المبالغ مخفية')}</AppText>
      </View>
      <Ionicons name={amountsVisible ? 'eye-outline' : 'eye-off-outline'} size={24} color={NAVY} />
    </Pressable>
    <View style={[card, { marginTop: 20, padding: 12, borderColor: GOLD, gap: 5 }]}>
      <AppText variant="bodyStrong" style={{ color: NAVY }}>{t('Wallet management', 'إدارة المحافظ')}</AppText>
      <AppText style={{ color: '#64748B', fontSize: 12 }}>{t('Personal Wallet is the current Finance view. Separate wallets are not enabled yet.', 'المحفظة الشخصية هي العرض المالي الحالي. المحافظ المنفصلة غير مفعلة بعد.')}</AppText>
    </View>
  </Screen>;
}
