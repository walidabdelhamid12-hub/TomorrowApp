import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AddAccountModal, AddAssetModal } from '../components/FinanceModals';

interface FinanceItem {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
}

export default function FinanceScreen() {
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [isAssetModalVisible, setIsAssetModalVisible] = useState(false);

  const [accounts, setAccounts] = useState<FinanceItem[]>([
    { id: '1', name: 'NBE', type: 'Bank', currency: 'EGP', balance: 110 },
    { id: '2', name: 'كاش', type: 'Cash', currency: 'EGP', balance: 500 }
  ]);
  
  const [assets, setAssets] = useState<FinanceItem[]>([]);

  const handleSaveAccount = (newAcc: any) => {
    setAccounts(prev => [...prev, {
      id: Date.now().toString(),
      name: newAcc.accountName || newAcc.name || 'Account',
      type: newAcc.selectedType || newAcc.type || 'Cash',
      currency: newAcc.selectedCurrency || newAcc.currency || 'EGP',
      balance: parseFloat(newAcc.amount) || 0
    }]);
  };

  const handleSaveAsset = (newAsset: any) => {
    setAssets(prev => [...prev, {
      id: Date.now().toString(),
      name: newAsset.assetName || newAsset.name || 'Asset',
      type: newAsset.selectedType || newAsset.type || 'Local',
      currency: newAsset.selectedCurrency || newAsset.currency || 'OMR',
      balance: parseFloat(newAsset.amount) || 0
    }]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.headerCard}>
          <Text style={styles.screenTitle}>Finance</Text>
          <Text style={styles.subtitle}>October 2026</Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => setIsAccountModalVisible(true)}
          >
            <Ionicons name="wallet-outline" size={20} color="#059669" />
            <Text style={styles.actionButtonText}>Account</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => setIsAssetModalVisible(true)}
          >
            <Ionicons name="pie-chart-outline" size={20} color="#059669" />
            <Text style={styles.actionButtonText}>Asset</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Accounts</Text>
        {accounts.map((acc) => (
          <View key={acc.id} style={styles.itemCard}>
            <View>
              <Text style={styles.itemName}>{acc.name}</Text>
              <Text style={styles.itemDetails}>{acc.type} · {acc.currency}</Text>
            </View>
            <Text style={styles.itemAmount}>{acc.balance.toFixed(2)} {acc.currency}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Assets</Text>
        {assets.length === 0 ? (
          <Text style={styles.emptyText}>No assets added yet.</Text>
        ) : (
          assets.map((ast) => (
            <View key={ast.id} style={styles.itemCard}>
              <View>
                <Text style={styles.itemName}>{ast.name}</Text>
                <Text style={styles.itemDetails}>{ast.type} · {ast.currency}</Text>
              </View>
              <Text style={styles.itemAmount}>{ast.balance.toFixed(2)} {ast.currency}</Text>
            </View>
          ))
        )}

      </ScrollView>

      <AddAccountModal
        visible={isAccountModalVisible}
        onClose={() => setIsAccountModalVisible(false)}
        onSave={handleSaveAccount}
      />

      <AddAssetModal
        visible={isAssetModalVisible}
        onClose={() => setIsAssetModalVisible(false)}
        onSave={handleSaveAsset}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  headerCard: { marginBottom: 16 },
  screenTitle: { fontSize: 28, fontWeight: 'bold', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  actionButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionButton: { flex: 1, flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  actionButtonText: { fontSize: 16, fontWeight: '600', color: '#059669' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 10, marginTop: 10 },
  itemCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#eee', alignItems: 'center' },
  itemName: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  itemDetails: { fontSize: 12, color: '#666', marginTop: 2 },
  itemAmount: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  emptyText: { fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 10 },
});