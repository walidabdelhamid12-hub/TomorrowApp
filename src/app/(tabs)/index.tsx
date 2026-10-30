
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { AccountsSection } from '@/features/finance/components/AccountsSection';
import type { AddAccountFormData } from '@/features/finance/components/AddAccountModal';
import { AddAccountModal } from '@/features/finance/components/AddAccountModal';
import type { AddAssetFormData } from '@/features/finance/components/AddAssetModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AddTransactionModal } from '@/features/finance/components/AddTransactionModal';
import { AssetRow } from '@/features/finance/components/AssetRow';
import { RatesModal } from '@/features/finance/components/RatesModal';
import { TotalCard } from '@/features/finance/components/TotalCard';
import { TransactionsSection } from '@/features/finance/components/TransactionsSection';
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
import type {
  Account,
  AccountType,
  Transaction,
} from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import { moduleColors, useTheme } from '@/theme';

type AddMenuAction = 'transaction' | 'account' | 'asset' | 'rates';
type MenuIconName = ComponentProps<typeof Ionicons>['name'];

export default function FinanceRoute() {
  const { colors, spacing } = useTheme();
  const accent = moduleColors.finance;

  const ledgerReady = useLedgerHydrated();
  const currencyReady = useCurrencyHydrated();
  const financeReady = useFinanceHydrated();
  const ready = ledgerReady && currencyReady && financeReady;

  useAutoRefreshRates(ready);

  const summary = useFinanceSummary();

  const assets = useFinanceStore((state) => state.assets);
  const deleteAsset = useFinanceStore((state) => state.deleteAsset);
  const addAsset = useFinanceStore((state) => state.addAsset);
  const addAssetEntry = useFinanceStore((state) => state.addAssetEntry);
  const clearAssets = useFinanceStore((state) => state.clearAssets);

  const baseCurrency = useCurrencyStore((state) => state.baseCurrency);
  const silverPerGram = useCurrencyStore(
    (state) => state.metals.silverPerGram,
  );

  const addAccount = useLedgerStore((state) => state.addAccount);
  const updateAccount = useLedgerStore((state) => state.updateAccount);
  const clearAccountsAndTransactions = useLedgerStore(
    (state) => state.clearAccountsAndTransactions,
  );

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
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

  const openAccount = (account: Account | null) => {
    setEditingAccount(account);
    setAccountOpen(true);
  };

  const handleAddMenuAction = (action: AddMenuAction) => {
    setAddMenuOpen(false);

    switch (action) {
      case 'transaction':
        openTransaction(null);
        break;
      case 'account':
        openAccount(null);
        break;
      case 'asset':
        setAssetOpen(true);
        break;
      case 'rates':
        setRatesOpen(true);
        break;
    }
  };

  const confirmDeleteAsset = (id: string, name: string) => {
    Alert.alert(
      `Delete "${name}"?`,
      'All of its dated entries will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAsset(id),
        },
      ],
    );
  };

  const confirmClearTestData = () => {
    Alert.alert(
      'Clear test data?',
      'This will permanently delete all assets, accounts, and transactions. Categories, currencies, exchange rates, debts, loans, and cheques will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete data',
          style: 'destructive',
          onPress: () => {
            clearAssets();
            clearAccountsAndTransactions();

            Alert.alert(
              'Done',
              'Assets, accounts, and transactions have been cleared.',
            );
          },
        },
      ],
    );
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
      />

      <View style={{ marginTop: spacing.lg }}>
        <AppButton
          title="Add transaction"
          accentColor={accent}
          leftIcon={
            <Ionicons name="add" size={20} color={colors.onPrimary} />
          }
          onPress={() => setAddMenuOpen(true)}
        />
      </View>

      <AccountsSection
        accounts={summary.activeAccounts}
        baseCurrency={summary.baseCurrency}
        rates={summary.rates}
        onEdit={openAccount}
      />

      <AppText
        variant="h3"
        style={{ marginTop: spacing.xl, marginBottom: spacing.md }}
      >
        Assets
      </AppText>

      {assets.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No assets yet. Use "Add transaction" to add currency, gold or silver.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {assets.map((asset, index) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              baseCurrency={summary.baseCurrency}
              rates={summary.rates}
              gold24PerGram={summary.gold24PerGram}
              silverPerGram={silverPerGram}
              first={index === 0}
              onDelete={() => confirmDeleteAsset(asset.id, asset.name)}
            />
          ))}
        </Card>
      )}

      <TransactionsSection onEdit={openTransaction} />

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
        onClose={() => setAssetOpen(false)}
        onSave={(data: AddAssetFormData) => {
          const amount = Number(data.amount);

          if (
            !data.assetName.trim() ||
            !data.amount.trim() ||
            !Number.isFinite(amount) ||
            amount < 0
          ) {
            Alert.alert(
              'Invalid asset',
              'Enter an asset name and a valid non-negative amount.',
            );
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

          setAssetOpen(false);
        }}
      />

      <RatesModal
        visible={ratesOpen}
        onClose={() => setRatesOpen(false)}
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
                icon="trending-up-outline"
                title="Rates"
                onPress={() => handleAddMenuAction('rates')}
                accent="#C4B5FD"
                background="#4C1D95"
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
