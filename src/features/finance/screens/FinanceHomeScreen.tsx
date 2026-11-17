import { useFinanceDate } from '@/features/finance/hooks/useFinanceDate';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { useFinancePreferences } from '@/features/finance/store/useFinancePreferences';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { AssetCard } from '@/features/finance/components/AssetCard';
import { AssetEntriesModal } from '@/features/finance/components/AssetEntriesModal';
import { RatesModal } from '@/features/finance/components/RatesModal';
import {
  TotalCard,
  type FinanceNetworkKey,
} from '@/features/finance/components/TotalCard';
import { TransactionsSection } from '@/features/finance/components/TransactionsSection';
import { TransferModal } from '@/features/finance/components/TransferModal';
import { useRatesAutoRefresh } from '@/features/finance/providers/RatesAutoRefreshProvider';
import { useFinanceSummary } from '@/features/finance/hooks/useFinanceSummary';
import { getTransactionDestination } from '@/features/finance/utils/transactionNavigation';
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
import { parseAmount } from '@/features/finance/utils/money';
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

type AddMenuAction = 'transaction' | 'transfer' | 'account' | 'asset' | 'documents';
type MenuIconName = ComponentProps<typeof Ionicons>['name'];

const NETWORK_ITEMS: {
  key: FinanceNetworkKey;
  title: string;
}[] = [
  { key: 'accounts', title: 'Accounts' },
  { key: 'assets', title: 'Assets' },
  { key: 'debts', title: 'Debts' },
  { key: 'income', title: 'Income' },
  { key: 'expenses', title: 'Expenses' },
  { key: 'loans', title: 'Loans' },
  { key: 'cheques', title: 'Installments' },
  { key: 'categories', title: 'Categories' },
  { key: 'transfers', title: 'Transfers' },
];

export default function FinanceHomeScreen({ modalOnlyAction, onModalOnlyClose }: {
  modalOnlyAction?: 'transaction' | 'transfer' | 'account' | 'asset';
  onModalOnlyClose?: () => void;
} = {}) {
  const router = useRouter();
  const { financeAdd, fromAdd } = useLocalSearchParams<{ financeAdd?: string; fromAdd?: string }>();
  const { colors, spacing } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const accent = moduleColors.finance;

  const amountsVisible = useFinancePreferences(state => state.amountsVisible);
  const toggleAmounts = useFinancePreferences(state => state.toggleAmounts);

  const ledgerReady = useLedgerHydrated();
  const currencyReady = useCurrencyHydrated();
  const financeReady = useFinanceHydrated();
  const ready = ledgerReady && currencyReady && financeReady;

  const { refresh, isRefreshing, lastResult } =
    useRatesAutoRefresh();

  const summary = useFinanceSummary();

  const assets = useFinanceStore((state) => state.assets);
  const addAsset = useFinanceStore((state) => state.addAsset);
  const updateAsset = useFinanceStore((state) => state.updateAsset);
  const deleteAsset = useFinanceStore((state) => state.deleteAsset);
  const addAssetEntry = useFinanceStore((state) => state.addAssetEntry);
  const updateAssetEntry = useFinanceStore(
    (state) => state.updateAssetEntry,
  );
  const deleteAssetEntry = useFinanceStore(
    (state) => state.deleteAssetEntry,
  );

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
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);

  const dateLabel = useFinanceDate();

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
        router.push('/finance/assets');
        break;

      case 'accounts':
        router.push('/finance/accounts');
        break;

      case 'debts':
        router.push('/finance/debts');
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

      case 'cheques':
        router.push('/finance/installments');
        break;

      case 'loans':
        router.push('/finance/loans');
        break;

      case 'income':
        router.push('/finance/income');
        break;

      case 'expenses':
        router.push('/finance/expenses');
        break;

      case 'categories':
        router.push('/finance/categories');
        break;

      default: {
        const item = NETWORK_ITEMS.find(
          (network) => network.key === key,
        );

        Alert.alert(
          'Coming soon',
          key === 'cheques' ? 'Installments is not implemented yet. Property contracts and postdated checks will be added in a separate phase; this shortcut does not record payments or balances.' : `${item?.title ?? 'This'} page is being prepared.`,
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
      case 'documents':
        router.push('/finance/documents' as Href);
        break;
    }
  };

  // A validated route request opens an existing Home-owned modal only once.
  // Clear the route parameter before dispatch; no financial posting occurs here.
  const [addOriginModal, setAddOriginModal] = useState<
    'transaction' | 'transfer' | 'account' | 'asset' | null
  >(null);

  useEffect(() => {
    if (typeof financeAdd !== 'string' || !financeAdd) return;
    router.setParams({ financeAdd: '' });
    if (financeAdd === 'transaction' || financeAdd === 'transfer' ||
        financeAdd === 'account' || financeAdd === 'asset') {
      handleAddMenuAction(financeAdd);
      if (fromAdd === '1') {
        setAddOriginModal(financeAdd);
      }
    }
  }, [financeAdd]);

  // Add-owned modal: keep the existing Home handlers, but render no Home UI.
  useEffect(() => {
    if (!modalOnlyAction) return;
    handleAddMenuAction(modalOnlyAction);
  }, [modalOnlyAction]);

  const [modalOnlyWasOpen, setModalOnlyWasOpen] = useState(false);
  useEffect(() => {
    if (!modalOnlyAction) return;
    const opened = modalOnlyAction === 'transaction' ? txOpen :
      modalOnlyAction === 'transfer' ? transferOpen :
      modalOnlyAction === 'account' ? accountOpen : assetOpen;
    if (opened) {
      if (!modalOnlyWasOpen) setModalOnlyWasOpen(true);
    } else if (modalOnlyWasOpen) {
      setModalOnlyWasOpen(false);
      onModalOnlyClose?.();
    }
  }, [modalOnlyAction, modalOnlyWasOpen, txOpen, transferOpen, accountOpen, assetOpen, onModalOnlyClose]);

  const [addOriginModalWasOpen, setAddOriginModalWasOpen] = useState(false);

  useEffect(() => {
    if (!addOriginModal) {
      if (addOriginModalWasOpen) {
        setAddOriginModalWasOpen(false);
      }
      return;
    }

    const modalIsOpen =
      addOriginModal === 'transaction' ? txOpen :
      addOriginModal === 'transfer' ? transferOpen :
      addOriginModal === 'account' ? accountOpen :
      assetOpen;

    if (modalIsOpen) {
      if (!addOriginModalWasOpen) {
        setAddOriginModalWasOpen(true);
      }
      return;
    }

    if (!addOriginModalWasOpen) return;

    setAddOriginModalWasOpen(false);
    setAddOriginModal(null);
    router.setParams({ fromAdd: '' });
    router.navigate('/finance/add' as Href);
  }, [
    addOriginModal,
    addOriginModalWasOpen,
    txOpen,
    transferOpen,
    accountOpen,
    assetOpen,
    router,
  ]);

  const confirmDeleteAsset = (asset: Asset) => {
    const message =
      'This will permanently delete the asset and all of its recorded movements.';

    confirm(`Delete "${asset.name}"?`, message, () => deleteAsset(asset.id), 'Delete');
  };

  const confirmDeleteAccount = (account: Account) => {
    const message =
      'Ordinary transactions will be deleted. Accounts with transfers or loan/debt history cannot be deleted.';
    const performDelete = () => {
      if (!deleteAccount(account.id)) Alert.alert('Cannot delete account', 'This account has transfers or loan/debt dependencies. Keep it to preserve its accounting history.');
    };

    confirm(`Delete "${account.name}"?`, message, performDelete, 'Delete');
  };

  const confirmDeleteTransaction = (transaction: Transaction) => {
    const message = 'This transaction will be permanently deleted.';
    const performDelete = () => {
      if (!removeTransaction(transaction.id)) {
        Alert.alert('Cannot delete transaction', 'Linked loan/debt transactions must be managed from their payment screen. Transactions with refunds are also protected.');
      }
    };

    confirm('Delete transaction?', message, performDelete, 'Delete');
  };

  const openLinkedTransaction = (transaction: Transaction) => {
    const matches = useLedgerStore.getState().transactions.filter(item => item.id === transaction.id);
    const current = matches.length === 1 ? matches[0] : undefined;
    const destination = current && getTransactionDestination(current, useFinanceStore.getState());
    if (!destination) {
      Alert.alert('Linked record unavailable', 'A unique existing loan or debt could not be determined from this transaction’s explicit links. No records were changed.');
      return;
    }
    router.push(destination.href);
  };

  const confirmDeleteTransfer = (transfer: Transfer) => {
    const title =
      transfer.type === 'credit_card_payment'
        ? 'Delete credit card payment?'
        : 'Delete transfer?';

    const message =
      'This transfer and its linked balance changes will be permanently deleted.';

    confirm(title, message, () => removeTransfer(transfer.id), 'Delete');
  };

  const handleSaveAsset = (data: AddAssetFormData) => {
    if (!data.assetName.trim()) {
      Alert.alert('Invalid asset', 'Enter an asset name.');
      return;
    }

    const amount = parseAmount(data.amount);

    if (
      !data.amount.trim() ||
      amount === null ||
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

  if (modalOnlyAction) {
    // Native Modal surfaces are rendered above the Add screen; Home stays unmounted visually.
    return (
      <View style={{ flex: 1 }}>
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
          const amount = parseAmount(data.amount);

          if (
            !data.accountName.trim() ||
            !data.amount.trim() ||
            amount === null
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

      </View>
    );
  }

  return (
    <Screen scroll style={{ backgroundColor: '#F1F5F9' }}>
      {confirmation}
      <View
        style={{
          backgroundColor: '#1E293B',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: 0,
          marginHorizontal: -spacing.md,
          marginTop: -spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open exchange rates"
            onPress={() => setRatesOpen(true)}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, transform: [{ translateX: -0.8 }], borderWidth: 1.5, borderColor: '#D6B777', backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="refresh-outline" size={19} color="#D6B777" />
            </View>
          </Pressable>
          <View accessibilityRole="header" accessibilityLabel="Tomorrow Finance" style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
          <Svg width="100%" height={48} viewBox="0 0 360 41" accessible={false}>
            <Defs>
              <LinearGradient id="financeTitleGold" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="52%" stopColor="#FFFFFF" />
                <Stop offset="100%" stopColor="#D6B777" />
              </LinearGradient>
            </Defs>
            <SvgText x="180" y="35" textAnchor="middle" fontSize="32" fontWeight="800" scaleX={1.05} originX={180} fill="url(#financeTitleGold)">
              Tomorrow Finance
            </SvgText>
          </Svg>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Finance settings"
            onPress={() => router.push('/finance/settings')}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, transform: [{ translateX: 0.8 }], borderWidth: 1.5, borderColor: '#D6B777', backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="settings-outline" size={19} color="#D6B777" /></View>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select Finance wallet"
          accessibilityState={{ expanded: walletMenuOpen }}
          onPress={() => setWalletMenuOpen(value => !value)}
          style={{ alignSelf: 'center', minHeight: 40, marginTop: -4, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }}
        >
          <Ionicons name="wallet-outline" size={17} color="#D6B777" />
          <AppText style={{ color: '#E2E8F0', fontWeight: '800', fontSize: 14, letterSpacing: 0.35 }}>Personal Wallet</AppText>
          <Ionicons name={walletMenuOpen ? 'chevron-up' : 'chevron-down'} size={17} color="#D6B777" />
        </Pressable>
        {walletMenuOpen && (
          <View style={{ backgroundColor: '#334155', borderColor: '#D6B777', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 }}>
            <AppText style={{ color: '#FFFFFF', fontWeight: '700' }}>Personal Wallet · Current</AppText>
            <AppText style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>Additional wallets are not enabled yet.</AppText>
          </View>
        )}
        <AppText style={{ color: '#CBD5E1', fontWeight: '600', fontSize: 13, textAlign: 'center', marginTop: 0, marginBottom: 9 }}>
          {dateLabel}
        </AppText>
      </View>

      <TotalCard
        baseCurrency={summary.baseCurrency}
        accountsTotal={summary.accountsTotal}
        assetsTotal={summary.assetsTotal}
        loansRemainingTotal={summary.loansRemainingTotal}
        netWorth={summary.netWorth}
        loansInstallmentsRemainingTotal={summary.loansInstallmentsRemainingTotal}
        receivablesTotal={summary.receivablesTotal}
        payablesTotal={summary.payablesTotal}
        chequesTotal={summary.chequesTotal}
        missing={summary.missing}
        income={summary.income}
        expense={summary.expense}
        amountsVisible={amountsVisible}
        onToggleAmounts={toggleAmounts}
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
        <Pressable accessibilityRole="button" accessibilityLabel="Open Finance add"
          onPress={() => router.push('/finance/add' as Href)}
          style={[styles.transactionButton, { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }]}>
          <Ionicons name="add-circle-outline" size={20} color="#1E293B" />
          <AppText variant="bodyStrong" style={{ color: '#1E293B' }}>Add</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open financial reports"
          onPress={() => router.push('/finance/reports' as Href)}
          style={[styles.transactionButton, { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }]}
        >
          <Ionicons name="stats-chart-outline" size={20} color="#1E293B" />
          <AppText variant="bodyStrong" style={{ color: '#1E293B' }}>Reports</AppText>
        </Pressable>
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.25, borderColor: '#B68C42', paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, marginTop: spacing.md }}>
        <TransactionsSection
          onManage={openLinkedTransaction}
          amountsVisible={amountsVisible}
          onEdit={openTransaction}
          onDelete={confirmDeleteTransaction}
          onEditTransfer={openTransfer}
          onDeleteTransfer={confirmDeleteTransfer}
        />
      </View>

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
          const amount = parseAmount(data.amount);

          if (
            !data.accountName.trim() ||
            !data.amount.trim() ||
            amount === null
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

            <AppText color="textSecondary" style={{ marginBottom: 12 }}>
              Track cash holdings, foreign currencies, gold, and silver, including their recorded movements and converted values.
            </AppText>

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
                    <AssetCard key={asset.id} asset={asset} categoryLabel={categoryLabel}
                      balanceText={amountsVisible ? originalBalance : '••••••'} valuationText={amountsVisible ? convertedValue : '••••••'} baseCurrency={baseCurrency}
                      onViewEntries={() => openAssetEntries(asset)} onEdit={() => openAssetForEditing(asset)}
                      onDelete={() => confirmDeleteAsset(asset)} />
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
              <MenuOption
                icon="documents-outline"
                title="Documents"
                onPress={() => handleAddMenuAction('documents')}
                accent="#38BDF8"
                background="#164E63"
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
    flex: 1,
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
});
