import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AddAccountModal, AddAssetModal } from '../components/FinanceModals';

/* -------------------------------------------------------------------------- */
/* Types and money helpers                                                    */
/* -------------------------------------------------------------------------- */

interface FinanceItem {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
}

type CurrencyTotals = Record<string, number>;

const ACCOUNTS_STORAGE_KEY = '@tomorrow_accounts';
const ASSETS_STORAGE_KEY = '@tomorrow_assets';

const THREE_DECIMALS = new Set(['OMR', 'KWD', 'JOD', 'BHD']);

function decimalsFor(currency: string): number {
  return THREE_DECIMALS.has(currency) ? 3 : 2;
}

/** Safe number parsing: accepts numbers and strings like "1,250.5"; never returns NaN. */
function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/[,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Repairs items read from storage (old data may hold strings or missing fields). */
function normalizeItems(raw: unknown): FinanceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r, index) => ({
      id: typeof r.id === 'string' ? r.id : `legacy-${index}`,
      name: typeof r.name === 'string' ? r.name : 'Unnamed',
      type: typeof r.type === 'string' ? r.type : 'Cash',
      currency: typeof r.currency === 'string' && r.currency ? r.currency : 'EGP',
      balance: parseAmount(r.balance),
    }));
}

/** Sums per currency in thousandths so 0.1 + 0.2 never drifts. */
function sumByCurrency(items: readonly FinanceItem[]): CurrencyTotals {
  const units: Record<string, number> = {};
  for (const item of items) {
    units[item.currency] = (units[item.currency] ?? 0) + Math.round(item.balance * 1000);
  }
  const totals: CurrencyTotals = {};
  for (const code of Object.keys(units)) totals[code] = units[code] / 1000;
  return totals;
}

function mergeTotals(a: CurrencyTotals, b: CurrencyTotals): CurrencyTotals {
  const codes = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: CurrencyTotals = {};
  codes.forEach((code) => {
    out[code] = Math.round(((a[code] ?? 0) + (b[code] ?? 0)) * 1000) / 1000;
  });
  return out;
}

function formatAmount(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  const d = decimalsFor(currency);
  return safe.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function FinanceScreen() {
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [isAssetModalVisible, setIsAssetModalVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [accounts, setAccounts] = useState<FinanceItem[]>([
    { id: '1', name: 'NBE', type: 'Bank', currency: 'EGP', balance: 110 },
    { id: '2', name: 'كاش', type: 'Cash', currency: 'EGP', balance: 500 },
  ]);
  const [assets, setAssets] = useState<FinanceItem[]>([]);

  useEffect(() => {
    loadStoredData();
  }, []);

  const loadStoredData = async () => {
    try {
      const savedAccounts = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (savedAccounts) setAccounts(normalizeItems(JSON.parse(savedAccounts)));

      const savedAssets = await AsyncStorage.getItem(ASSETS_STORAGE_KEY);
      if (savedAssets) setAssets(normalizeItems(JSON.parse(savedAssets)));
    } catch (error) {
      console.log('Error loading data:', error);
    } finally {
      setLoaded(true);
    }
  };

  const saveAccountsToStorage = async (next: FinanceItem[]) => {
    setAccounts(next);
    try {
      await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.log('Error saving accounts:', error);
    }
  };

  const saveAssetsToStorage = async (next: FinanceItem[]) => {
    setAssets(next);
    try {
      await AsyncStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.log('Error saving assets:', error);
    }
  };

  const handleSaveAccount = (data: any) => {
    saveAccountsToStorage([
      ...accounts,
      {
        id: Date.now().toString(),
        name: data.accountName || data.name || 'Account',
        type: data.selectedType || data.type || 'Cash',
        currency: data.selectedCurrency || data.currency || 'EGP',
        balance: parseAmount(data.amount),
      },
    ]);
  };

  const handleSaveAsset = (data: any) => {
    saveAssetsToStorage([
      ...assets,
      {
        id: Date.now().toString(),
        name: data.assetName || data.name || 'Asset',
        type: data.selectedType || data.type || 'Local',
        currency: data.selectedCurrency || data.currency || 'EGP',
        balance: parseAmount(data.amount),
      },
    ]);
  };

  /* ------------------------------- Totals ---------------------------------- */

  const totals = useMemo(() => {
    const accountTotals = sumByCurrency(accounts);
    const assetTotals = sumByCurrency(assets);
    const netWorth = mergeTotals(accountTotals, assetTotals);
    return {
      accountTotals,
      assetTotals,
      netWorth,
      // Biggest absolute amount first so the main currency leads.
      codes: Object.keys(netWorth).sort((a, b) => Math.abs(netWorth[b]) - Math.abs(netWorth[a])),
    };
  }, [accounts, assets]);

  /* -------------------------------- UI ------------------------------------- */

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <Text style={styles.screenTitle}>Finance</Text>
          <Text style={styles.subtitle}>October 2026</Text>
        </View>

        {/* Net worth: one line per currency, no cross-currency guessing */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>NET WORTH</Text>

          {!loaded ? (
            <Text style={styles.totalMuted}>Loading…</Text>
          ) : totals.codes.length === 0 ? (
            <Text style={styles.totalMain}>0.00</Text>
          ) : (
            totals.codes.map((code, index) => (
              <View key={code} style={index === 0 ? styles.totalLeadRow : styles.totalRow}>
                <Text style={index === 0 ? styles.totalMain : styles.totalSecondary}>
                  {formatAmount(totals.netWorth[code], code)}
                </Text>
                <Text style={styles.totalCode}>{code}</Text>
              </View>
            ))
          )}

          {loaded && totals.codes.length > 0 ? (
            <View style={styles.breakdown}>
              {totals.codes.map((code) => (
                <Text key={code} style={styles.breakdownText}>
                  {code}: accounts {formatAmount(totals.accountTotals[code] ?? 0, code)} · assets{' '}
                  {formatAmount(totals.assetTotals[code] ?? 0, code)}
                </Text>
              ))}
            </View>
          ) : null}

          {totals.codes.length > 1 ? (
            <Text style={styles.note}>
              Currencies are shown separately. Convert them in the Rates screen to get one combined total.
            </Text>
          ) : null}
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => setIsAccountModalVisible(true)}>
            <Ionicons name="wallet-outline" size={20} color="#059669" />
            <Text style={styles.actionButtonText}>Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setIsAssetModalVisible(true)}>
            <Ionicons name="pie-chart-outline" size={20} color="#059669" />
            <Text style={styles.actionButtonText}>Asset</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Accounts</Text>
        {accounts.length === 0 ? (
          <Text style={styles.emptyText}>No accounts added yet.</Text>
        ) : (
          accounts.map((acc) => (
            <View key={acc.id} style={styles.itemCard}>
              <View>
                <Text style={styles.itemName}>{acc.name}</Text>
                <Text style={styles.itemDetails}>
                  {acc.type} · {acc.currency}
                </Text>
              </View>
              <Text style={[styles.itemAmount, acc.balance < 0 && styles.negative]}>
                {formatAmount(acc.balance, acc.currency)} {acc.currency}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Assets</Text>
        {assets.length === 0 ? (
          <Text style={styles.emptyText}>No assets added yet.</Text>
        ) : (
          assets.map((ast) => (
            <View key={ast.id} style={styles.itemCard}>
              <View>
                <Text style={styles.itemName}>{ast.name}</Text>
                <Text style={styles.itemDetails}>
                  {ast.type} · {ast.currency}
                </Text>
              </View>
              <Text style={[styles.itemAmount, ast.balance < 0 && styles.negative]}>
                {formatAmount(ast.balance, ast.currency)} {ast.currency}
              </Text>
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

  totalCard: { backgroundColor: '#059669', borderRadius: 20, padding: 18, marginBottom: 20 },
  totalLabel: { fontSize: 12, fontWeight: '600', color: '#d1fae5', letterSpacing: 0.8 },
  totalLeadRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  totalMain: { fontSize: 32, fontWeight: 'bold', color: '#fff' },
  totalSecondary: { fontSize: 20, fontWeight: '600', color: '#ecfdf5' },
  totalCode: { fontSize: 14, fontWeight: '600', color: '#d1fae5' },
  totalMuted: { fontSize: 16, color: '#d1fae5', marginTop: 6 },
  breakdown: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', gap: 2 },
  breakdownText: { fontSize: 12, color: '#d1fae5' },
  note: { fontSize: 11, color: '#a7f3d0', marginTop: 10 },

  actionButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionButton: { flex: 1, flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  actionButtonText: { fontSize: 16, fontWeight: '600', color: '#059669' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginBottom: 10, marginTop: 10 },
  itemCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#eee', alignItems: 'center' },
  itemName: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  itemDetails: { fontSize: 12, color: '#666', marginTop: 2 },
  itemAmount: { fontSize: 16, fontWeight: 'bold', color: '#059669' },
  negative: { color: '#dc2626' },
  emptyText: { fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 10 },
});