import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Screen } from '@/components/ui';
import type { AddAssetFormData } from '@/features/finance/components/AddAssetModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AssetEntriesModal } from '@/features/finance/components/AssetEntriesModal';
import { useCurrencyHydrated, useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance, roundMoney, todayISO } from '@/features/finance/utils/finance';
import { formatMoney, formatNumber } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { moduleColors, useTheme } from '@/theme';

export default function AssetsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const accent = moduleColors.finance;

  const financeReady = useFinanceHydrated();
  const currencyReady = useCurrencyHydrated();
  const ready = financeReady && currencyReady;

  const assets = useFinanceStore((state) => state.assets);
  const addAsset = useFinanceStore((state) => state.addAsset);
  const updateAsset = useFinanceStore((state) => state.updateAsset);
  const addAssetEntry = useFinanceStore((state) => state.addAssetEntry);
  const updateAssetEntry = useFinanceStore((state) => state.updateAssetEntry);
  const deleteAssetEntry = useFinanceStore((state) => state.deleteAssetEntry);

  const baseCurrency = useCurrencyStore((state) => state.baseCurrency);
  const rates = useCurrencyStore((state) => state.rates);
  const verifiedCurrencies = useCurrencyStore((state) => state.verifiedCurrencies);
  const metals = useCurrencyStore((state) => state.metals);
  const metalSources = useCurrencyStore((state) => state.metalSources);

  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [entriesOpen, setEntriesOpen] = useState(false);
  const [entriesAsset, setEntriesAsset] = useState<Asset | null>(null);

  const openAsset = (asset: Asset | null) => {
    setEditingAsset(asset);
    setAssetModalOpen(true);
  };

  const closeAssetModal = () => {
    setAssetModalOpen(false);
    setEditingAsset(null);
  };

  const openEntries = (asset: Asset) => {
    setEntriesAsset(asset);
    setEntriesOpen(true);
  };

  const closeEntries = () => {
    setEntriesOpen(false);
    setEntriesAsset(null);
  };

  const getValuation = (asset: Asset): number | null => {
    const goldPrice = metalSources.gold24PerGram !== 'default' ? metals.gold24PerGram : null;
    const silverPrice = metalSources.silverPerGram !== 'default' ? metals.silverPerGram : null;

    return getAssetValueInBase(
      asset,
      baseCurrency,
      rates,
      goldPrice,
      silverPrice,
      verifiedCurrencies,
    );
  };

  const saveAsset = (data: AddAssetFormData) => {
    if (!data.assetName.trim()) {
      Alert.alert('Invalid asset', 'Enter an asset name.');
      return;
    }

    const amount = Number(data.amount);
    if (!data.amount.trim() || !Number.isFinite(amount) || amount < 0) {
      Alert.alert('Invalid asset', 'Enter a valid non-negative amount.');
      return;
    }

    if (editingAsset) {
      if (editingAsset.category !== data.selectedType) {
        Alert.alert('Asset type cannot be changed', 'The type of an existing asset cannot be changed.');
        return;
      }

      if (editingAsset.category === 'gold') {
        updateAsset(editingAsset.id, { name: data.assetName.trim(), karat: data.karat });
      } else if (editingAsset.category === 'local_currency' || editingAsset.category === 'foreign_currency') {
        updateAsset(editingAsset.id, { name: data.assetName.trim(), currencyCode: data.selectedCurrency });
      } else {
        updateAsset(editingAsset.id, { name: data.assetName.trim() });
      }

      const latestAsset = useFinanceStore.getState().assets.find((item) => item.id === editingAsset.id);
      if (!latestAsset) {
        Alert.alert('Asset not found', 'This asset could not be found. No balance movement was recorded.');
        return;
      }

      const difference = roundMoney(amount - getAssetBalance(latestAsset));
      if (difference !== 0) {
        const entryId = addAssetEntry(latestAsset.id, {
          date: todayISO(),
          amount: difference,
          note: 'Balance adjustment',
        });
        if (!entryId) {
          Alert.alert('Adjustment not saved', 'The asset balance was not changed because the movement could not be saved.');
          return;
        }
      }

      closeAssetModal();
      return;
    }

    let assetId: string;
    if (data.selectedType === 'gold') {
      assetId = addAsset({ name: data.assetName.trim(), category: 'gold', karat: data.karat });
    } else if (data.selectedType === 'silver') {
      assetId = addAsset({ name: data.assetName.trim(), category: 'silver' });
    } else if (data.selectedType === 'local_currency') {
      assetId = addAsset({ name: data.assetName.trim(), category: 'local_currency', currencyCode: baseCurrency });
    } else {
      assetId = addAsset({ name: data.assetName.trim(), category: 'foreign_currency', currencyCode: data.selectedCurrency });
    }

    if (amount !== 0) {
      addAssetEntry(assetId, { date: todayISO(), amount, note: 'Opening balance' });
    }
    closeAssetModal();
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      </Screen>
    );
  }

  const currentEntriesAsset = entriesAsset
    ? assets.find((item) => item.id === entriesAsset.id) ?? null
    : null;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="h1">Assets</AppText>
          <AppText color="textSecondary">{assets.length} asset(s)</AppText>
        </View>
      </View>

      <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
        Track cash holdings, foreign currencies, gold, and silver, including their recorded movements and converted values.
      </AppText>

      {assets.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="diamond-outline" size={42} color={colors.textSecondary} />
          <AppText color="textSecondary">No assets added yet.</AppText>
          <AppButton title="Add your first asset" accentColor={accent} onPress={() => openAsset(null)} />
        </View>
      ) : (
        <View style={styles.list}>
          {assets.map((asset) => {
            const balance = getAssetBalance(asset);
            const isMetal = asset.category === 'gold' || asset.category === 'silver';
            const originalBalance = isMetal
              ? `${formatNumber(balance, 3)} g`
              : `${formatMoney(balance, asset.currencyCode)} ${asset.currencyCode}`;
            const valuation = getValuation(asset);
            const convertedValue = valuation === null
              ? 'Valuation unavailable'
              : `${formatMoney(valuation, baseCurrency)} ${baseCurrency}`;
            const categoryLabel = asset.category === 'local_currency'
              ? 'Local currency'
              : asset.category === 'foreign_currency'
                ? 'Foreign currency'
                : asset.category === 'gold'
                  ? `Gold · ${asset.karat}K`
                  : 'Silver';

            return (
              <View key={asset.id} style={[styles.assetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Pressable onPress={() => openEntries(asset)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                  <View style={styles.assetTop}>
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong">{asset.name}</AppText>
                      <AppText color="textSecondary" style={styles.category}>{categoryLabel}</AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                  </View>
                  <View style={styles.values}>
                    <View style={styles.flex}>
                      <AppText color="textSecondary">Original balance</AppText>
                      <AppText variant="bodyStrong">{originalBalance}</AppText>
                    </View>
                    <View style={styles.flex}>
                      <AppText color="textSecondary">Value in {baseCurrency}</AppText>
                      <AppText variant="bodyStrong" style={{ color: valuation === null ? colors.textSecondary : accent }}>
                        {convertedValue}
                      </AppText>
                    </View>
                  </View>
                </Pressable>
                <View style={[styles.actions, { borderTopColor: colors.border }]}>
                  <Pressable onPress={() => openEntries(asset)} style={styles.action} accessibilityRole="button">
                    <Ionicons name="list-outline" size={17} color={accent} />
                    <AppText style={{ color: accent }}>Movements</AppText>
                  </Pressable>
                  <Pressable onPress={() => openAsset(asset)} style={styles.action} accessibilityRole="button">
                    <Ionicons name="create-outline" size={17} color={accent} />
                    <AppText style={{ color: accent }}>Edit</AppText>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {assets.length > 0 && (
        <AppButton
          title="Add asset"
          accentColor={accent}
          leftIcon={<Ionicons name="add" size={19} color={colors.onPrimary} />}
          onPress={() => openAsset(null)}
        />
      )}

      <AddAssetModal visible={assetModalOpen} asset={editingAsset} onClose={closeAssetModal} onSave={saveAsset} />
      <AssetEntriesModal
        visible={entriesOpen}
        asset={currentEntriesAsset}
        onClose={closeEntries}
        onSave={(assetId, entryId, patch) => updateAssetEntry(assetId, entryId, patch)}
        onDelete={(assetId, entryId) => deleteAssetEntry(assetId, entryId)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 12, marginBottom: 14 },
  emptyCard: { minHeight: 220, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
  assetCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 12 },
  assetTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  category: { marginTop: 3 },
  values: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 22, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
