import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Screen } from '@/components/ui';
import type { AddAssetFormData } from '@/features/finance/components/AddAssetModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AssetCard } from '@/features/finance/components/AssetCard';
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
  const deleteAsset = useFinanceStore((state) => state.deleteAsset);
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

  const confirmDeleteAsset = (asset: Asset) => {
    const message = 'This will permanently delete the asset and all of its recorded movements.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`Delete "${asset.name}" and all its movements?\\n\\n${message}`);
      if (confirmed) deleteAsset(asset.id);
      return;
    }

    Alert.alert(`Delete "${asset.name}"?`, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAsset(asset.id) },
    ]);
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
              <AssetCard key={asset.id} asset={asset} categoryLabel={categoryLabel}
                balanceText={originalBalance} valuationText={convertedValue} baseCurrency={baseCurrency}
                onViewEntries={() => openEntries(asset)} onEdit={() => openAsset(asset)}
                onDelete={() => confirmDeleteAsset(asset)} />
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
  list: { gap: 12, marginBottom: 14 },
  emptyCard: { minHeight: 220, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
});
