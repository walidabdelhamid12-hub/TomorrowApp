import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState, type ComponentProps } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, View } from 'react-native';
import FinanceHomeScreen from '@/features/finance/screens/FinanceHomeScreen';
import DocumentsScreen from './documents';
import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

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
  const { spacing } = useTheme();
  const [activeAction, setActiveAction] = useState<AddAction | null>(null);
  const closeAction = useCallback(() => setActiveAction(null), []);
  const open = (action: AddAction) => {
    setActiveAction(action);
  };
  return <View style={{ flex: 1 }}><Screen scroll style={{ backgroundColor: '#F8FAFC' }}>
    <View style={{ backgroundColor: '#1E293B', marginHorizontal: -spacing.md, marginTop: -spacing.sm,
      borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 17 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.replace('/')}
          style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <AppText accessibilityRole="header" variant="h1" style={{ color: '#FFFFFF', textAlign: 'center', fontSize: 22 }}>Tomorrow Finance</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Ionicons name="add-circle-outline" size={17} color="#D6B777" />
            <AppText variant="bodyStrong" style={{ color: '#D6B777', fontSize: 14 }}>Add</AppText>
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>
      <AppText style={{ color: '#CBD5E1', textAlign: 'center', fontSize: 12 }}>Choose what you want to add.</AppText>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
      {ITEMS.map(item => <Pressable key={item.action} accessibilityRole="button" accessibilityLabel={`Add ${item.label}`}
        onPress={() => open(item.action)} style={{ width: '48%', minHeight: 112, backgroundColor: '#FFFFFF',
          borderWidth: 1, borderColor: '#D6B777', borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 10 }}>
        <Ionicons name={item.icon} size={31} color="#365575" />
        <AppText variant="bodyStrong" style={{ color: '#1E293B', textAlign: 'center' }}>{item.label}</AppText>
      </Pressable>)}
    </View>
  </Screen>
    {activeAction && activeAction !== 'documents' ? (
      <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <FinanceHomeScreen key={activeAction} modalOnlyAction={activeAction} onModalOnlyClose={closeAction} />
      </View>
    ) : null}
    <Modal visible={activeAction === 'documents'} animationType="slide" transparent
      onRequestClose={closeAction}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ height: '92%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24,
            borderTopRightRadius: 24, overflow: 'hidden' }}>
          {activeAction === 'documents' ? <DocumentsScreen onClose={closeAction} /> : null}
        </View>
      </View>
    </Modal>
  </View>;
}
