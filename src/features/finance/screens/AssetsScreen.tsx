import { isValidISODate } from '@/features/finance/utils/input';
import { FinanceDateField } from '@/features/finance/components/FinanceDateField';
import { formPayload, submitFinanceForm } from '@/features/finance/components/explicitFinanceForm';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { acknowledgedFinanceHandler } from '@/features/finance/components/acknowledgedFinanceHandler';
import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { validateAssetOpeningDate } from '@/features/finance/utils/assetOpeningDate';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import type { AddAssetFormData } from '@/features/finance/components/AddAssetModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AssetCard } from '@/features/finance/components/AssetCard';
import { AssetEntriesModal } from '@/features/finance/components/AssetEntriesModal';
import { useCurrencyHydrated, useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance, roundMoney, todayISO } from '@/features/finance/utils/finance';
import { formatMoney, formatNumber, parseAmount } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { moduleColors, useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

export default function AssetsScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const { colors, spacing } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const accent = moduleColors.finance;

  const financeReady = useFinanceHydrated();
  const currencyReady = useCurrencyHydrated();
  const ready = financeReady && currencyReady;

  const assets = useFinanceStore((state) => state.assets);
  const addAsset = useFinanceStore((state) => state.addAsset);
  const verifyAssetOpeningBalanceDate = useFinanceStore(state => state.verifyAssetOpeningBalanceDate);
  const [verificationAssetId, setVerificationAssetId] = useState<string | null>(null);
  const [verificationDate, setVerificationDate] = useState('');
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
    const message = t('This will permanently delete the asset and all of its recorded movements.', 'سيتم حذف الأصل وجميع حركاته المسجلة نهائيًا.');

    confirm(t(`Delete "${asset.name}"?`, `حذف "${asset.name}"؟`), message, () => acknowledgedFinanceHandler("src/features/finance/screens/AssetsScreen.tsx:94", () => undefined, {
      payload: { operation: 'deleteAsset', targetId: asset.id },
      mutate: () => {
        if (useFinanceStore.getState().assets.filter(item => item.id === asset.id).length !== 1) return false;
        deleteAsset(asset.id);
        return !useFinanceStore.getState().assets.some(item => item.id === asset.id);
      },
      onCommitted: result => { if (result !== true) Alert.alert(t('Cannot delete asset', 'تعذر حذف الأصل')); },
    })(), t('Delete', 'حذف'));
  };

  const saveAsset = (data: AddAssetFormData) => {
    const amount = parseAmount(data.amount);
    const currencyCode = data.selectedType === 'local_currency' ? baseCurrency : data.selectedCurrency;
    const currencyAsset = data.selectedType === 'local_currency' || data.selectedType === 'foreign_currency';
    if (!data.assetName.trim() || amount === null || amount < 0 || !Number.isSafeInteger(Math.round(amount * 1000))
      || (currencyAsset && !hasValidCurrencyPrecision(data.amount, currencyCode))) {
      Alert.alert(t('Invalid asset', 'أصل غير صالح'), t('Enter a valid name and amount.', 'أدخل اسمًا ومبلغًا صالحين.'));
      return;
    }
    if (editingAsset && editingAsset.category !== data.selectedType) {
      Alert.alert(t('Asset type cannot be changed', 'لا يمكن تغيير نوع الأصل'));
      return;
    }
    const targetId = editingAsset?.id ?? null;
    const expectedUpdatedAt = editingAsset?.updatedAt;
    const openingDate = targetId ? undefined : data.openingBalanceDate;
    if (openingDate !== undefined && !isValidISODate(openingDate)) {
      Alert.alert(t('Invalid opening date', 'تاريخ افتتاح غير صالح'));
      return;
    }
    const date = openingDate ?? todayISO();
    const targetAmount = roundMoney(amount);
    const input = data.selectedType === 'gold' ? { name: data.assetName.trim(), category: 'gold' as const, karat: data.karat }
      : data.selectedType === 'silver' ? { name: data.assetName.trim(), category: 'silver' as const }
      : data.selectedType === 'local_currency' ? { name: data.assetName.trim(), category: 'local_currency' as const, currencyCode }
      : { name: data.assetName.trim(), category: 'foreign_currency' as const, currencyCode };
    return submitFinanceForm("src/features/finance/screens/AssetsScreen.tsx:97", formPayload(targetId ? 'asset.edit' : 'asset.create', targetId, input,
      { targetAmount, date, expectedUpdatedAt, ...(openingDate !== undefined ? { openingDate } : {}) }), () => {
        if (targetId) {
          const current = useFinanceStore.getState().assets.filter(item => item.id === targetId);
          if (current.length !== 1 || current[0].updatedAt !== expectedUpdatedAt || current[0].category !== input.category) return false;
          updateAsset(targetId, input);
        }
        const id = targetId ?? addAsset(input);
        if (!id) throw new Error('Asset creation returned no identity.');
        const matches = useFinanceStore.getState().assets.filter(item => item.id === id);
        if (matches.length !== 1 || !Object.entries(input).every(([key, value]) => (matches[0] as unknown as Record<string, unknown>)[key] === value)) {
          throw new Error('Asset metadata was not fully accepted.');
        }
        const difference = roundMoney(targetAmount - getAssetBalance(matches[0]));
        if (!Number.isSafeInteger(Math.round(difference * 1000))) throw new Error('Asset adjustment is outside the safe numeric range.');
        if (difference !== 0 && !addAssetEntry(id, { date, amount: difference, note: targetId ? 'Balance adjustment' : 'Opening balance' })) {
          // Throw inside the durable callback: restore the metadata and movement together.
          throw new Error('Asset movement rejected; the asset change must not be partially saved.');
        }
        // Explicitly confirmed history is verified within the same durable operation.
        if (openingDate !== undefined && !verifyAssetOpeningBalanceDate(id, openingDate)) {
          throw new Error('Asset opening history verification failed.');
        }
        const after = useFinanceStore.getState().assets.filter(item => item.id === id);
        if (after.length !== 1 || getAssetBalance(after[0]) !== targetAmount
          || (openingDate !== undefined && after[0].openingBalanceDate !== openingDate)) throw new Error('Asset balance or opening date postcondition failed.');
        return id;
      }, closeAssetModal, () => Alert.alert(t('Asset not saved', 'لم يُحفظ الأصل'), t('Review the current asset details.', 'راجع بيانات الأصل الحالية.')));
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
    <Screen scroll style={{ backgroundColor: '#F1F5F9' }}>
      {confirmation}
      <View style={financeChrome.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("Go back", "رجوع")}
          style={financeChrome.back}
        >
          <Ionicons name="arrow-back" size={20} color="#D6B777" />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{t("Assets", "الأصول")}</AppText>
          <AppText variant="caption" style={{ color: '#CBD5E1' }}>{assets.length} asset(s)</AppText>
        </View>
      </View>

      <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
        {t("Track cash holdings, foreign currencies, gold, and silver, including their recorded movements and converted values.", "متابعة الأرصدة النقدية والعملات الأجنبية والذهب والفضة وحركاتها المسجلة وقيمها المحوّلة.")}
      </AppText>

      <AppButton
        title={t("Add asset", "إضافة أصل")}
        accentColor="#1E293B"
        leftIcon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
        onPress={() => openAsset(null)}
      />

      {assets.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="diamond-outline" size={42} color={colors.textSecondary} />
          <AppText color="textSecondary">{t("No assets added yet.", "لم تتم إضافة أصول بعد.")}</AppText>
        </View>
      ) : (
        <View style={styles.list}>
          {assets.map((asset) => {
            const balance = getAssetBalance(asset);
            const isMetal = asset.category === 'gold' || asset.category === 'silver';
            const originalBalance = isMetal
              ? `${formatNumber(balance, 3)} Gr`
              : `${formatMoney(balance, asset.currencyCode)} ${asset.currencyCode}`;
            const valuation = getValuation(asset);
            const convertedValue = valuation === null
              ? t('Valuation unavailable', 'التقييم غير متاح')
              : `${formatMoney(valuation, baseCurrency)} ${baseCurrency}`;
            const categoryLabel = asset.category === 'local_currency'
              ? t('Local currency', 'عملة محلية')
              : asset.category === 'foreign_currency'
                ? t('Foreign currency', 'عملة أجنبية')
                : asset.category === 'gold'
                  ? `${t('Gold', 'ذهب')} · ${asset.karat}K`
                  : t('Silver', 'فضة');

            return (
              <View key={asset.id}>
                <AssetCard asset={asset} categoryLabel={categoryLabel}
                  balanceText={originalBalance} valuationText={convertedValue} baseCurrency={baseCurrency}
                  onViewEntries={() => openEntries(asset)} onEdit={() => openAsset(asset)}
                  onDelete={() => confirmDeleteAsset(asset)} />
                <AppText variant="caption" color="textSecondary">
                  {asset.openingBalanceDate ? t('Verified history starts:', 'بداية السجل المتحقق منه:') + ' ' + asset.openingBalanceDate : t('Opening history not verified', 'لم يتم التحقق من بداية السجل')}
                </AppText>
                <Pressable accessibilityRole="button" accessibilityLabel={t("Verify history for ", "التحقق من سجل ") + asset.name}
                  onPress={() => { setVerificationAssetId(asset.id); setVerificationDate(''); }}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <AppText>{t("Verify opening history date", "التحقق من تاريخ بداية السجل")}</AppText>
                </Pressable>
                {verificationAssetId === asset.id && <View style={{ gap: 8 }}>
                  <FinanceDateField label={t('Asset opening date', 'تاريخ بداية الأصل')}
                    value={verificationDate} onChange={setVerificationDate} pickerOnly />
                  <AppButton title={t("Confirm verified date", "تأكيد التاريخ المتحقق منه")} accentColor={accent} onPress={() => {
                    const date = verificationDate.trim();
                    const check = validateAssetOpeningDate(assets, asset.id, date);
                    if (!check.valid) { Alert.alert(t("Cannot verify asset history", "تعذر التحقق من سجل الأصل"), check.reason); return; }
                    Alert.alert(t("Confirm asset history", "تأكيد سجل الأصل"), t("Confirm the recorded opening quantity and all movements from this date are complete. No balances will change.", "أكد اكتمال الكمية الافتتاحية المسجلة وجميع الحركات منذ هذا التاريخ. لن تتغير الأرصدة."), [
                      { text: t("Cancel", "إلغاء"), style: 'cancel' },
                      { text: t("Verify", "تحقق"), onPress: () => {
    return submitFinanceForm("src/features/finance/screens/AssetsScreen.tsx:257",
      formPayload('asset.verify-opening-date', asset.id, { date }, { expectedUpdatedAt: asset.updatedAt }),
      () => {
        const matches = useFinanceStore.getState().assets.filter(item => item.id === asset.id);
        return matches.length === 1 && matches[0].updatedAt === asset.updatedAt && verifyAssetOpeningBalanceDate(asset.id, date);
      }, () => { setVerificationAssetId(null); Alert.alert(t("Verified", "تم التحقق"), t("Asset history start date saved.", "تم حفظ تاريخ بداية سجل الأصل.")); },
      () => Alert.alert(t("Not saved", "لم يتم الحفظ"), t("Asset history changed or verification failed.", "تغير سجل الأصل أو فشل التحقق.")));
  } },
                    ]);
                  }} />
                </View>}
              </View>
            );
          })}
        </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, backgroundColor: '#1E293B', borderRadius: 20, padding: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#D6B777', alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  list: { gap: 12, marginBottom: 14 },
  emptyCard: { minHeight: 220, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 12 },
});
