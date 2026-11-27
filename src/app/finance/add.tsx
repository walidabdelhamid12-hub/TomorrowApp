import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState, type ComponentProps } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import DocumentsScreen from './documents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { financeLayoutTokens, getFinanceDesignTokens } from '@/features/finance/constants/financeDesignTokens';
import FinanceHomeScreen from '@/features/finance/screens/FinanceHomeScreen';
import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

type AddAction = 'transaction' | 'transfer' | 'account' | 'asset' | 'documents';
const ITEMS: { action: AddAction; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { action: 'transaction', label: 'Transaction', icon: 'receipt-outline' },
  { action: 'transfer', label: 'Transfer', icon: 'swap-horizontal-outline' },
  { action: 'account', label: 'Account', icon: 'wallet-outline' },
  { action: 'asset', label: 'Asset', icon: 'diamond-outline' },
  { action: 'documents', label: 'Documents', icon: 'documents-outline' },
];

export default function FinanceAddScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const { spacing, colors, scheme } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const finance = getFinanceDesignTokens(scheme);
  const [activeAction, setActiveAction] = useState<AddAction | null>(null);
  const closeAction = useCallback(() => setActiveAction(null), []);
  const open = (action: AddAction) => {
    setActiveAction(action);
  };
  return <View style={{ flex: 1 }}><Screen scroll style={{ backgroundColor: '#F8FAFC' }}>
    <View testID="finance-add-header" style={{ backgroundColor: '#1E293B', marginHorizontal: -spacing.md, marginTop: -spacing.sm,
      borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingHorizontal: 13, paddingTop: 15, paddingBottom: 15, alignItems: 'center' }}>
      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', minHeight: 45, flexWrap: 'nowrap' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back', 'رجوع')} onPress={() => router.replace('/')}
          style={{ width: 45, height: 45, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={27} color="#FFFFFF" />
        </Pressable>
        <AppText accessibilityRole="header" variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}
          style={{ color: '#FFFFFF', textAlign: 'center', fontSize: width < 360 ? 15 : 18, flex: 1, minWidth: 0, fontWeight: '700' }}>Tomorrow Finance Add</AppText>
        <View style={{ width: 45, alignItems: 'center' }} />
      </View>
      <AppText style={{ color: '#CBD5E1', textAlign: 'center', fontSize: 12, marginTop: 5 }}>{t('Choose what you want to add.', 'اختر ما تريد إضافته.')}</AppText>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
      {ITEMS.map(item => <Pressable key={item.action} accessibilityRole="button" accessibilityLabel={t(`Add ${item.label}`, `إضافة ${{ transaction: 'معاملة', transfer: 'تحويل', account: 'حساب', asset: 'أصل', documents: 'مستندات' }[item.action]}`)}
        onPress={() => open(item.action)} style={{ width: '48%', minHeight: 112, backgroundColor: '#FFFFFF',
          borderWidth: 1.3, borderColor: '#B68C42', borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 10 }}>
        <Ionicons name={item.icon} size={42} color="#365575" />
        <AppText variant="bodyStrong" style={{ color: '#1E293B', textAlign: 'center' }}>{t(item.label, { transaction: 'معاملة', transfer: 'تحويل', account: 'حساب', asset: 'أصل', documents: 'مستندات' }[item.action])}</AppText>
      </Pressable>)}
    </View>
  </Screen>
    {activeAction && activeAction !== 'documents' ? (
      <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <FinanceHomeScreen key={activeAction} modalOnlyAction={activeAction} onModalOnlyClose={closeAction} />
      </View>
    ) : null}
    <Modal visible={activeAction === 'documents'} transparent animationType="slide" onRequestClose={closeAction}
      statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + 8 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={closeAction}
          accessibilityLabel={t('Close', 'إغلاق')} />
        <View testID="documents-bottom-sheet" accessibilityViewIsModal style={{ height: '92%', maxHeight: '92%', minHeight: 0,
          width: '100%', backgroundColor: finance.background, borderTopLeftRadius: financeLayoutTokens.modalRadius,
          borderTopRightRadius: financeLayoutTokens.modalRadius, overflow: 'hidden' }}>
          {activeAction === 'documents' ? <DocumentsScreen onClose={closeAction} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
