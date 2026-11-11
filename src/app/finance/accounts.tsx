import { AccountCard } from '@/features/finance/components/AccountCard';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { AccountDetails } from '@/features/finance/components/AccountDetails';

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import {
    AddAccountModal,
    type AddAccountFormData,
} from '@/features/finance/components/AddAccountModal';
import {
    useLedgerHydrated,
    useLedgerStore,
} from '@/features/finance/store/useLedgerStore';
import type { Account, AccountType } from '@/features/finance/types/ledger';
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { moduleColors, useTheme } from '@/theme';

export default function AccountsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const ready = useLedgerHydrated();

  const accounts = useLedgerStore((state) => state.accounts);
  const transactions = useLedgerStore((state) => state.transactions);
  const transfers = useLedgerStore((state) => state.transfers);

  const addAccount = useLedgerStore((state) => state.addAccount);
  const updateAccount = useLedgerStore((state) => state.updateAccount);
  const deleteAccount = useLedgerStore((state) => state.deleteAccount);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const openAdd = () => {
    setEditingAccount(null);
    setModalVisible(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingAccount(null);
  };

  const handleSave = (data: AddAccountFormData) => {
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
      const basisChanged = accountInput.initialBalance !== editingAccount.initialBalance
        || accountInput.currencyCode !== editingAccount.currencyCode;
      if (basisChanged && editingAccount.openingBalanceDate) {
        Alert.alert(
          'Opening date verification will be cleared',
          'Changing the starting balance or currency invalidates the verified opening date. The account history and existing movements will not be changed.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => {
              updateAccount(editingAccount.id, accountInput);
              closeModal();
            } },
          ],
        );
        return;
      }
      updateAccount(editingAccount.id, accountInput);
    } else {
      addAccount(accountInput);
    }

    closeModal();
  };

  const confirmDelete = (account: Account) => {
    const message =
      'Ordinary transactions will be deleted. Accounts with transfers or loan/debt history cannot be deleted.';
    const performDelete = () => {
      if (!deleteAccount(account.id)) Alert.alert('Cannot delete account', 'This account has transfers or loan/debt dependencies. Keep it to preserve its accounting history.');
    };

    confirm(`Delete "${account.name}"?`, message, performDelete, 'Delete');
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={moduleColors.finance} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {confirmation}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={23} color={colors.text} />
        </Pressable>

        <View style={styles.headerText}>
          <AppText variant="h1">Accounts</AppText>
          <AppText variant="caption" color="textSecondary">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </AppText>
        </View>
      </View>

      <AppText color="textSecondary" style={{ marginBottom: 16 }}>
        Manage your cash, bank, wallet, savings, and credit card balances.
      </AppText>

      <AppButton
        title="Add account"
        accentColor={moduleColors.finance}
        leftIcon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
        onPress={openAdd}
      />

      {accounts.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No accounts yet. Add your first account.
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {accounts.map((account) => {
            const balance = getAccountBalance(
              account,
              transactions,
              transfers,
            );

            return <AccountCard key={account.id} account={account} balance={balance}
              onPress={() => setDetailAccountId(account.id)} onEdit={() => openEdit(account)} onDelete={() => confirmDelete(account)} />;
          })}
        </View>
      )}

      <AccountDetails accountId={detailAccountId} onClose={() => setDetailAccountId(null)} />
      <AddAccountModal
        visible={modalVisible}
        account={editingAccount}
        onClose={closeModal}
        onSave={handleSave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  accountRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
  },
  accountInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  accountTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountName: {
    flexShrink: 1,
    fontWeight: '600',
  },
  balance: {
    fontWeight: '700',
    marginTop: 3,
  },
});
