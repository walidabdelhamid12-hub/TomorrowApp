
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppButton, AppText, Screen } from '@/components/ui';
import type { AddAccountFormData } from '@/features/finance/components/AddAccountModal';
import { AddAccountModal } from '@/features/finance/components/AddAccountModal';
import type { AddAssetFormData } from '@/features/finance/components/AddAssetModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AddTransactionModal } from '@/features/finance/components/AddTransactionModal';
import { AssetEntriesModal } from '@/features/finance/components/AssetEntriesModal';
import { RatesModal } from '@/features/finance/components/RatesModal';
import {
  TotalCard,
  type FinanceNetworkKey,
} from '@/features/finance/components/TotalCard';
import { TransactionsSection } from '@/features/finance/components/TransactionsSection';
import { TransferModal } from '@/features/finance/components/TransferModal';
import { useAutoRefreshRates } from '@/features/finance/hooks/useAutoRefreshRates';
import { useFinanceSummary } from '@/features/finance/hooks/useFinanceSummary';
import {
  useCurrencyHydrated,
  useCurrencyStore,
} from '@/features/finance/store/useCurrencyStore';
import {
  useFinanceHydrated,
  useFinanceStore,
} from '@/features/finance/store/useFinanceStore';
import {
  useLedgerHydrated,
  useLedgerStore,
} from '@/features/finance/store/useLedgerStore';
import type { Asset } from '@/features/finance/types/finance';
import type {
  Account,
  AccountType,
  Transaction,
  Transfer,
} from '@/features/finance/types/ledger';
import {
  getAssetBalance,
  roundMoney,
  todayISO,
} from '@/features/finance/utils/finance';
import {
  formatMoney,
  formatNumber,
} from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { moduleColors, useTheme } from '@/theme';

type AddMenuAction = 'transaction' | 'transfer' | 'account' | 'asset';
type MenuIconName = ComponentProps<typeof Ionicons>['name'];

const NETWORK_ITEMS: {
  key: FinanceNetworkKey;
  title: string;
}[] = [
  { key: 'accounts', title: 'Accounts' },
  { key: 'assets', title: 'Assets' },
  { key: 'receivable', title: 'Receivable' },
  { key: 'payable', title: 'Payable' },
  { key: 'income', title: 'Income' },
  { key: 'expenses', title: 'Expenses' },
  { key: 'loans', title: 'Loans' },
  { key: 'cheques', title: 'Cheques' },
  { key: 'categories', title: 'Categories' },
  { key: 'transfers', title: 'Transfers' },
];

export default function FinanceHomeScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const accent = moduleColors.finance;

  const [amountsVisible, setAmountsVisible] = useState(false);

  const ledgerReady = useLedgerHydrated();
  const currencyReady = useCurrencyHydrated();
  const financeReady = useFinanceHydrated();
  const ready = ledgerReady && currencyReady && financeReady;

  const { refresh, isRefreshing, lastResult } =
    useAutoRefreshRates(ready);

  const summary = useFinanceSummary();

  const assets = useFinanceStore((state) => state.assets);
  const addAsset = useFinanceStore((state) => state.addAsset);
  const updateAsset = useFinanceStore((state) => state.updateAsset);
  const addAssetEntry = useFinanceStore((state) => state.addAssetEntry);
  const updateAssetEntry = useFinanceStore(
    (state) => state.updateAssetEntry,
  );
  const deleteAssetEntry = useFinanceStore(
    (state) => state.deleteAssetEntry,
  );
  const clearAssets = useFinanceStore((state) => state.clearAssets);

  const baseCurrency = useCurrencyStore((state) => state.baseCurrency);
  const rates = useCurrencyStore((state) => state.rates);
  const verifiedCurrencies = useCurrencyStore(
    (state) => state.verifiedCurrencies,
  );
  const metals = useCurrencyStore((state) => state.metals);
  const metalSources = useCurrencyStore((state) => state.metalSources);

  const addAccount = useLedgerStore((state) => state.addAccount);
  const updateAccount = useLedgerStore((state) => state.updateAccount);
  const deleteAccount = useLedgerStore((state) => state.deleteAccount);

  const removeTransaction = useLedgerStore(
    (state) => state.removeTransaction,
  );
  const removeTransfer = useLedgerStore(
    (state) => state.removeTransfer,
  );

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] =
    useState<Transfer | null>(null);

  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const [assetsOpen, setAssetsOpen] = useState(false);

  const [entriesOpen, setEntriesOpen] = useState(false);
  const [entriesAsset, setEntriesAsset] = useState<Asset | null>(null);

  const [ratesOpen, setRatesOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const monthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const openTransaction = (transaction: Transaction | null) => {
    setEditingTx(transaction);
    setTxOpen(true);
  };

  const openTransfer = (transfer: Transfer | null) => {
    setEditingTransfer(transfer);
    setTransferOpen(true);
  };

  const openAccount = (account: Account | null) => {
    setEditingAccount(account);
    setAccountOpen(true);
  };

  const openAsset = (asset: Asset | null) => {
    setEditingAsset(asset);
    setAssetOpen(true);
  };

  const closeAssetModal = () => {
    setAssetOpen(false);
    setEditingAsset(null);
  };

  const closeAssetEntries = () => {
    setEntriesOpen(false);
    setEntriesAsset(null);
  };

  const getAssetValuation = (asset: Asset): number | null => {
    const goldPrice =
      metalSources.gold24PerGram !== 'default'
        ? metals.gold24PerGram
        : null;

    const silverPrice =
      metalSources.silverPerGram !== 'default'
        ? metals.silverPerGram
        : null;

    return getAssetValueInBase(
      asset,
      baseCurrency,
      rates,
      goldPrice,
      silverPrice,
      verifiedCurrencies,
    );
  };

  const openAssetEntries = (asset: Asset) => {
    setEntriesAsset(asset);
    setEntriesOpen(true);
    setAssetsOpen(false);
  };

  const openAssetForEditing = (asset: Asset) => {
    setAssetsOpen(false);
    openAsset(asset);
  };

  const handleNetworkPress = (key: FinanceNetworkKey) => {
    switch (key) {
      case 'assets':
        setAssetsOpen(true);
        break;

      case 'accounts':
        router.push('/finance/accounts');
        break;

      case 'receivable':
        router.push({
          pathname: '/finance/debts',
          params: { direction: 'receivable' },
        });
        break;

      case 'payable':
        router.push({
          pathname: '/finance/debts',
          params: { direction: 'payable' },
        });
        break;

      case 'transfers':
        openTransfer(null);
        break;

      default: {
        const item = NETWORK_ITEMS.find(
          (network) => network.key === key,
        );

        Alert.alert(
          'Coming soon',
          `${item?.title ?? 'This'} page is being prepared.`,
        );
      }
    }
  };

  const handleAddMenuAction = (action: AddMenuAction) => {
    setAddMenuOpen(false);

    switch (action) {
      case 'transaction':
        openTransaction(null);
        break;
      case 'transfer':
        openTransfer(null);
        break;
      case 'account':
        openAccount(null);
        break;
      case 'asset':
        openAsset(null);
        break;
    }
  };

  const performClearTestData = () => {
    clearAssets();

    useLedgerStore.setState({
      accounts: [],
      transactions: [],
      transfers: [],
    });
  };

  const confirmDeleteAccount = (account: Account) => {
    const message =
      'Deleting this account may also delete its linked transactions and transfers.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Delete "${account.name}"?\n\n${message}`,
      );

      if (confirmed) deleteAccount(account.id);
      return;
    }

    Alert.alert(`Delete "${account.name}"?`, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteAccount(account.id),
      },
    ]);
  };

  const confirmDeleteTransaction = (transaction: Transaction) => {
    const message = 'This transaction will be permanently deleted.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Delete this transaction?\n\n${message}`,
      );

      if (confirmed) removeTransaction(transaction.id);
      return;
    }

    Alert.alert('Delete transaction?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeTransaction(transaction.id),
      },
    ]);
  };

  const confirmDeleteTransfer = (transfer: Transfer) => {
    const title =
      transfer.type === 'credit_card_payment'
        ? 'Delete credit card payment?'
        : 'Delete transfer?';

    const message =
      'This transfer and its linked balance changes will be permanently deleted.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${title}\n\n${message}`);

      if (confirmed) removeTransfer(transfer.id);
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeTransfer(transfer.id),
      },
    ]);
  };

  const confirmClearTestData = () => {
    const message =
      'This will permanently delete all assets, accounts, transactions, and transfers.\n\n' +
      'Categories, currencies, exchange rates, debts, loans, and cheques will be kept.';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Clear test data?\n\n${message}`,
      );

      if (!confirmed) return;

      performClearTestData();

      window.alert(
        'Done!\n\nAssets, accounts, transactions, and transfers have been cleared.',
      );
      return;
    }

    Alert.alert('Clear test data?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete data',
        style: 'destructive',
        onPress: () => {
          performClearTestData();

          Alert.alert(
            'Done',
            'Assets, accounts, transactions, and transfers have been cleared.',
          );
        },
      },
    ]);
  };

  const handleSaveAsset = (data: AddAssetFormData) => {
    if (!data.assetName.trim()) {
      Alert.alert('Invalid asset', 'Enter an asset name.');
      return;
    }

    const amount = Number(data.amount);

    if (
      !data.amount.trim() ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      Alert.alert(
        'Invalid asset',
        'Enter a valid non-negative amount.',
      );
      return;
    }

    if (editingAsset) {
      if (editingAsset.category !== data.selectedType) {
        Alert.alert(
          'Asset type cannot be changed',
          'The type of an existing asset cannot be changed.',
        );
        return;
      }

      if (editingAsset.category === 'gold') {
        updateAsset(editingAsset.id, {
          name: data.assetName.trim(),
          karat: data.karat,
        });
      } else if (
        editingAsset.category === 'local_currency' ||
        editingAsset.category === 'foreign_currency'
      ) {
        updateAsset(editingAsset.id, {
          name: data.assetName.trim(),
          currencyCode: data.selectedCurrency,
        });
      } else {
        updateAsset(editingAsset.id, {
          name: data.assetName.trim(),
        });
      }

      // Read the latest persisted asset state at save time. The modal may
      // have been opened from an older render, so never calculate a balance
      // adjustment from a potentially stale asset object.
      const latestAsset = useFinanceStore
        .getState()
        .assets.find((item) => item.id === editingAsset.id);

      if (!latestAsset) {
        Alert.alert(
          'Asset not found',
          'This asset could not be found. No balance movement was recorded.',
        );
        return;
      }

      const difference = roundMoney(
        amount - getAssetBalance(latestAsset),
      );

      if (difference !== 0) {
        const entryId = addAssetEntry(latestAsset.id, {
          date: todayISO(),
          amount: difference,
          note: 'Balance adjustment',
        });

        if (!entryId) {
          Alert.alert(
            'Adjustment not saved',
            'The asset balance was not changed because the movement could not be saved.',
          );
          return;
        }
      }

      closeAssetModal();
      return;
    }

    let assetId: string;

    if (data.selectedType === 'gold') {
      assetId = addAsset({
        name: data.assetName.trim(),
        category: 'gold',
        karat: data.karat,
      });
    } else if (data.selectedType === 'silver') {
      assetId = addAsset({
        name: data.assetName.trim(),
        category: 'silver',
      });
    } else if (data.selectedType === 'local_currency') {
      assetId = addAsset({
        name: data.assetName.trim(),
        category: 'local_currency',
        currencyCode: baseCurrency,
      });
    } else {
      assetId = addAsset({
        name: data.assetName.trim(),
        category: 'foreign_currency',
        currencyCode: data.selectedCurrency,
      });
    }

    if (amount !== 0) {
      addAssetEntry(assetId, {
        date: todayISO(),
        amount,
        note: 'Opening balance',
      });
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
      <AppText variant="h1">Finance</AppText>

      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        {monthLabel}
      </AppText>

      <TotalCard
        baseCurrency={summary.baseCurrency}
        total={summary.total}
        accountsTotal={summary.accountsTotal}
        assetsTotal={summary.assetsTotal}
        loansRemainingTotal={summary.loansRemainingTotal}
        receivablesTotal={summary.receivablesTotal}
        payablesTotal={summary.payablesTotal}
        chequesTotal={summary.chequesTotal}
        missing={summary.missing}
        income={summary.income}
        expense={summary.expense}
        amountsVisible={amountsVisible}
        onToggleAmounts={() =>
          setAmountsVisible((current) => !current)
        }
        onNetworkPress={handleNetworkPress}
      />

      {!summary.isComplete && (
        <View
          style={{
            marginTop: spacing.md,
            padding: spacing.md,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#D97706',
            backgroundColor: colors.surface,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: spacing.sm,
          }}
        >
          <Ionicons
            name="warning-outline"
            size={21}
            color="#D97706"
          />

          <View style={{ flex: 1 }}>
            <AppText style={{ color: '#D97706', fontWeight: '700' }}>
              Incomplete financial summary
            </AppText>

            <AppText
              color="textSecondary"
              style={{ marginTop: 4 }}
            >
              {summary.missing} item(s) could not be converted because
              a verified exchange rate is unavailable. The displayed
              totals are partial. Review your exchange rates to complete
              the calculations.
            </AppText>

            <Pressable
              accessibilityRole="button"
              onPress={() => setRatesOpen(true)}
              style={{ marginTop: 10, alignSelf: 'flex-start' }}
            >
              <AppText
                style={{
                  color: moduleColors.finance,
                  fontWeight: '700',
                }}
              >
                Review exchange rates
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.actionRow, { marginTop: spacing.lg }]}>
        <View style={styles.transactionButton}>
          <AppButton
            title="Add transaction"
            accentColor={accent}
            leftIcon={
              <Ionicons name="add" size={20} color={colors.onPrimary} />
            }
            onPress={() => setAddMenuOpen(true)}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open exchange rates"
          onPress={() => setRatesOpen(true)}
          style={({ pressed }) => [
            styles.ratesButton,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Ionicons
            name="trending-up-outline"
            size={20}
            color={accent}
          />
          <AppText style={[styles.ratesButtonText, { color: accent }]}>
            Rates
          </AppText>
        </Pressable>
      </View>

      <TransactionsSection
        amountsVisible={amountsVisible}
        onEdit={openTransaction}
        onDelete={confirmDeleteTransaction}
        onEditTransfer={openTransfer}
        onDeleteTransfer={confirmDeleteTransfer}
      />

      <Pressable
        accessibilityRole="button"
        onPress={confirmClearTestData}
        style={styles.clearDataButton}
      >
        <AppText style={styles.clearDataButtonText}>
          Clear test data
        </AppText>
      </Pressable>

      <AddTransactionModal
        visible={txOpen}
        transaction={editingTx}
        onClose={() => setTxOpen(false)}
      />

      <TransferModal
        visible={transferOpen}
        transfer={editingTransfer}
        onClose={() => {
          setTransferOpen(false);
          setEditingTransfer(null);
        }}
      />

      <AddAccountModal
        visible={accountOpen}
        account={editingAccount}
        onClose={() => {
          setAccountOpen(false);
          setEditingAccount(null);
        }}
        onSave={(data: AddAccountFormData) => {
          const amount = Number(data.amount);

          if (
            !data.accountName.trim() ||
            !data.amount.trim() ||
            !Number.isFinite(amount)
          ) {
            Alert.alert(
              'Invalid account',
              'Enter an account name and a valid starting balance.',
            );
            return;
          }

          const accountTypes: Record<
            AddAccountFormData['selectedType'],
            AccountType
          > = {
            Cash: 'cash',
            Bank: 'bank',
            Wallet: 'wallet',
            Savings: 'savings',
            'Credit card': 'credit_card',
          };

          const accountInput = {
            name: data.accountName.trim(),
            type: accountTypes[data.selectedType],
            currencyCode: data.selectedCurrency,
            initialBalance: amount,
          };

          if (editingAccount) {
            updateAccount(editingAccount.id, accountInput);
          } else {
            addAccount(accountInput);
          }

          setAccountOpen(false);
          setEditingAccount(null);
        }}
      />

      <AddAssetModal
        visible={assetOpen}
        asset={editingAsset}
        onClose={closeAssetModal}
        onSave={handleSaveAsset}
      />

      <AssetEntriesModal
        visible={entriesOpen}
        asset={currentEntriesAsset}
        onClose={closeAssetEntries}
        onSave={(assetId, entryId, patch) => {
          updateAssetEntry(assetId, entryId, patch);
        }}
        onDelete={(assetId, entryId) => {
          deleteAssetEntry(assetId, entryId);
        }}
      />

      <Modal
        visible={assetsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAssetsOpen(false)}
      >
        <View style={styles.assetsBackdrop}>
          <View
            style={[
              styles.assetsContainer,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.assetsHeader}>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">My assets</AppText>
                <AppText color="textSecondary">
                  {assets.length} asset(s)
                </AppText>
              </View>

              <Pressable
                onPress={() => setAssetsOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close assets"
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.assetsList}
            >
              {assets.length === 0 ? (
                <View style={styles.emptyAssets}>
                  <Ionicons
                    name="diamond-outline"
                    size={38}
                    color={colors.textSecondary}
                  />

                  <AppText color="textSecondary">
                    No assets added yet.
                  </AppText>

                  <AppButton
                    title="Add your first asset"
                    accentColor={accent}
                    onPress={() => {
                      setAssetsOpen(false);
                      openAsset(null);
                    }}
                  />
                </View>
              ) : (
                assets.map((asset) => {
                  const balance = getAssetBalance(asset);

                  const isMetal =
                    asset.category === 'gold' ||
                    asset.category === 'silver';

                  const originalBalance = isMetal
                    ? `${formatNumber(balance, 3)} g`
                    : `${formatMoney(balance, asset.currencyCode)} ${asset.currencyCode}`;

                  const valuation = getAssetValuation(asset);

                  const convertedValue =
                    valuation === null
                      ? 'Valuation unavailable'
                      : `${formatMoney(valuation, baseCurrency)} ${baseCurrency}`;

                  const categoryLabel =
                    asset.category === 'local_currency'
                      ? 'Local currency'
                      : asset.category === 'foreign_currency'
                        ? 'Foreign currency'
                        : asset.category === 'gold'
                          ? `Gold · ${asset.karat}K`
                          : 'Silver';

                  return (
                    <View
                      key={asset.id}
                      style={[
                        styles.assetListCard,
                        { borderColor: colors.border },
                      ]}
                    >
                      <Pressable
                        onPress={() => openAssetEntries(asset)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <View style={styles.assetListTop}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="bodyStrong">
                              {asset.name}
                            </AppText>

                            <AppText
                              color="textSecondary"
                              style={{ marginTop: 3 }}
                            >
                              {categoryLabel}
                            </AppText>
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.textSecondary}
                          />
                        </View>

                        <View style={styles.assetListValues}>
                          <View style={{ flex: 1 }}>
                            <AppText color="textSecondary">
                              Original balance
                            </AppText>

                            <AppText variant="bodyStrong">
                              {originalBalance}
                            </AppText>
                          </View>

                          <View style={{ flex: 1 }}>
                            <AppText color="textSecondary">
                              Value in {baseCurrency}
                            </AppText>

                            <AppText
                              variant="bodyStrong"
                              style={{
                                color:
                                  valuation === null
                                    ? colors.textSecondary
                                    : accent,
                              }}
                            >
                              {convertedValue}
                            </AppText>
                          </View>
                        </View>
                      </Pressable>

                      <View
                        style={[
                          styles.assetListActions,
                          { borderTopColor: colors.border },
                        ]}
                      >
                        <Pressable
                          onPress={() => openAssetEntries(asset)}
                          style={styles.assetListAction}
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name="list-outline"
                            size={17}
                            color={accent}
                          />

                          <AppText style={{ color: accent }}>
                            Movements
                          </AppText>
                        </Pressable>

                        <Pressable
                          onPress={() => openAssetForEditing(asset)}
                          style={styles.assetListAction}
                          accessibilityRole="button"
                        >
                          <Ionicons
                            name="create-outline"
                            size={17}
                            color={accent}
                          />

                          <AppText style={{ color: accent }}>
                            Edit
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {assets.length > 0 && (
              <AppButton
                title="Add asset"
                accentColor={accent}
                leftIcon={
                  <Ionicons
                    name="add"
                    size={19}
                    color={colors.onPrimary}
                  />
                }
                onPress={() => {
                  setAssetsOpen(false);
                  openAsset(null);
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <RatesModal
        visible={ratesOpen}
        onClose={() => setRatesOpen(false)}
        refreshRates={refresh}
        isRefreshing={isRefreshing}
        lastResult={lastResult}
      />

      <Modal
        visible={addMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAddMenuOpen(false)}
        >
          <Pressable
            style={[
              styles.menuCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {}}
          >
            <View style={styles.menuHeader}>
              <AppText variant="h3">
                What would you like to add?
              </AppText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close add menu"
                onPress={() => setAddMenuOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.menuOptionsRow}>
              <MenuOption
                icon="swap-horizontal-outline"
                title="Transaction"
                onPress={() => handleAddMenuAction('transaction')}
                accent="#60A5FA"
                background="#1E3A5F"
              />

              <MenuOption
                icon="repeat-outline"
                title="Transfer"
                onPress={() => handleAddMenuAction('transfer')}
                accent="#A78BFA"
                background="#3B246B"
              />

              <MenuOption
                icon="wallet-outline"
                title="Account"
                onPress={() => handleAddMenuAction('account')}
                accent="#34D399"
                background="#064E3B"
              />

              <MenuOption
                icon="diamond-outline"
                title="Asset"
                onPress={() => handleAddMenuAction('asset')}
                accent="#FBBF24"
                background="#78350F"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

interface MenuOptionProps {
  icon: MenuIconName;
  title: string;
  onPress: () => void;
  accent: string;
  background: string;
}

function MenuOption({
  icon,
  title,
  onPress,
  accent,
  background,
}: MenuOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuOption,
        {
          backgroundColor: pressed ? background : 'transparent',
          borderColor: `${accent}45`,
        },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={24} color={accent} />
      </View>

      <AppText style={[styles.menuOptionTitle, { color: accent }]}>
        {title}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  transactionButton: {
    flex: 3,
    minWidth: 0,
  },
  ratesButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 4,
  },
  ratesButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clearDataButton: {
    marginTop: 24,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC2626',
    alignItems: 'center',
  },
  clearDataButtonText: {
    color: '#DC2626',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  menuCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 14,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 8,
  },
  menuOptionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 6,
  },
  menuOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOptionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  assetsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 14,
  },
  assetsContainer: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 16,
  },
  assetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  assetsList: {
    gap: 10,
    paddingBottom: 12,
  },
  emptyAssets: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 35,
    gap: 12,
  },
  assetListCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  assetListTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assetListValues: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  assetListActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  assetListAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
});
