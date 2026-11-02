
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
import { TotalCard } from '@/features/finance/components/TotalCard';
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
import { moduleColors, useTheme } from '@/theme';

type AddMenuAction = 'transaction' | 'transfer' | 'account' | 'asset';
type MenuIconName = ComponentProps<typeof Ionicons>['name'];

type FinanceNetworkKey =
  | 'accounts'
  | 'assets'
  | 'receivable'
  | 'payable'
  | 'income'
  | 'expenses'
  | 'loans'
  | 'cheques'
  | 'categories';

interface NetworkItem {
  key: FinanceNetworkKey;
  title: string;
  icon: MenuIconName;
  color: string;
}

const NETWORK_ITEMS: NetworkItem[] = [
  { key: 'accounts', title: 'Accounts', icon: 'wallet-outline', color: '#34D399' },
  { key: 'assets', title: 'Assets', icon: 'diamond-outline', color: '#A78BFA' },
  { key: 'receivable', title: 'Receivable', icon: 'arrow-down-circle-outline', color: '#38BDF8' },
  { key: 'payable', title: 'Payable', icon: 'arrow-up-circle-outline', color: '#FB923C' },
  { key: 'income', title: 'Income', icon: 'trending-up-outline', color: '#4ADE80' },
  { key: 'expenses', title: 'Expenses', icon: 'trending-down-outline', color: '#F87171' },
  { key: 'loans', title: 'Loans', icon: 'hand-left-outline', color: '#FBBF24' },
  { key: 'cheques', title: 'Cheques', icon: 'document-text-outline', color: '#60A5FA' },
  { key: 'categories', title: 'Categories', icon: 'grid-outline', color: '#C084FC' },
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

  const handleNetworkPress = (key: FinanceNetworkKey) => {
    if (key === 'accounts') {
      router.push('/finance/accounts');
      return;
    }

    const item = NETWORK_ITEMS.find((network) => network.key === key);

    Alert.alert(
      'Coming soon',
      `${item?.title ?? 'This'} page is being prepared.`,
    );
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

      const difference = roundMoney(
        amount - getAssetBalance(editingAsset),
      );

      if (difference !== 0) {
        addAssetEntry(editingAsset.id, {
          date: todayISO(),
          amount: difference,
          note: 'Balance adjustment',
        });
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
        missing={summary.missing}
        income={summary.income}
        expense={summary.expense}
        amountsVisible={amountsVisible}
        onToggleAmounts={() =>
          setAmountsVisible((current) => !current)
        }
      />

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

      <FinanceNetworks onPress={handleNetworkPress} />

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

interface FinanceNetworksProps {
  onPress: (key: FinanceNetworkKey) => void;
}

function FinanceNetworks({ onPress }: FinanceNetworksProps) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.networksHeading}>
        <AppText variant="h3">Networks</AppText>
        <AppText variant="caption" color="textSecondary">
          Finance sections
        </AppText>
      </View>

      <View style={styles.networkGrid}>
        {NETWORK_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            onPress={() => onPress(item.key)}
            style={({ pressed }) => [
              styles.networkItem,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.networkIcon,
                { backgroundColor: `${item.color}20` },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={23}
                color={item.color}
              />
            </View>

            <AppText style={styles.networkTitle}>
              {item.title}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
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
  networksHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  networkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  networkItem: {
    width: '31%',
    minHeight: 104,
    flexGrow: 1,
    flexBasis: '28%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 9,
  },
  networkIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkTitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
});
