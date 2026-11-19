import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { financeChrome } from '@/features/finance/components/financeChrome';
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

import { AppText, Card, Screen } from '@/components/ui';
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
import { isValidISODate } from '@/features/finance/utils/input';
import { moduleColors, useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

export default function AccountsScreen() {
  const router = useRouter();
  const { t, isRTL } = useAppLanguage();
  const { colors } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const ready = useLedgerHydrated();

  const accounts = useLedgerStore((state) => state.accounts);
  const transactions = useLedgerStore((state) => state.transactions);
  const transfers = useLedgerStore((state) => state.transfers);

  const addAccount = useLedgerStore((state) => state.addAccount);
  const verifyOpeningDate = useLedgerStore((state) => state.verifyAccountOpeningBalanceDate);
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
        t('Invalid account', 'حساب غير صالح'),
        t('Enter an account name and a valid starting balance.', 'أدخل اسم الحساب ورصيدًا افتتاحيًا صالحًا.'),
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
      const hasHistory = transactions.some(tx => tx.accountId === editingAccount.id)
        || transfers.some(transfer => transfer.fromAccountId === editingAccount.id
          || transfer.toAccountId === editingAccount.id);
      const basisChanged = accountInput.initialBalance !== editingAccount.initialBalance
        || (!hasHistory && accountInput.currencyCode !== editingAccount.currencyCode);
      if (basisChanged && editingAccount.openingBalanceDate) {
        Alert.alert(
          t('Opening date verification will be cleared', 'سيتم إلغاء التحقق من تاريخ الرصيد الافتتاحي'),
          t('Changing the starting balance or currency invalidates the verified opening date. The account history and existing movements will not be changed.', 'تغيير الرصيد الافتتاحي أو العملة يلغي التحقق من التاريخ الافتتاحي. لن تتغير الحركات والسجلات السابقة.'),
          [
            { text: t('Cancel', 'إلغاء'), style: 'cancel' },
            { text: t('Continue', 'متابعة'), onPress: () => {
              updateAccount(editingAccount.id, accountInput);
              closeModal();
            } },
          ],
        );
        return;
      }
      updateAccount(editingAccount.id, accountInput);
    } else {
      if (data.openingBalanceDate && !isValidISODate(data.openingBalanceDate)) {
        Alert.alert(t('Invalid opening date', 'تاريخ افتتاح غير صالح'), t('Enter a real calendar date in YYYY-MM-DD format.', 'أدخل تاريخًا صحيحًا بصيغة YYYY-MM-DD.'));
        return;
      }
      const newAccountId = addAccount(accountInput);
      if (!newAccountId) {
        Alert.alert(t('Account not saved', 'لم يتم حفظ الحساب'), t('Check the starting balance and currency.', 'راجع الرصيد الافتتاحي والعملة.'));
        return;
      }
      if (data.openingBalanceDate && !verifyOpeningDate(newAccountId, data.openingBalanceDate)) {
        Alert.alert(t('Opening date not verified', 'لم يتم التحقق من تاريخ الافتتاح'),
          t('The account was created, but its opening date could not be verified. Open account details to review and verify it.', 'تم إنشاء الحساب، لكن تعذر التحقق من تاريخ افتتاحه. افتح تفاصيل الحساب لمراجعته والتحقق منه.'));
      }
    }

    closeModal();
  };

  const confirmDelete = (account: Account) => {
    const message =
      t('Ordinary transactions will be deleted. Accounts with transfers or loan/debt history cannot be deleted.', 'سيتم حذف المعاملات العادية. لا يمكن حذف حساب مرتبط بتحويلات أو بسجل قروض أو ديون.');
    const performDelete = () => {
      if (!deleteAccount(account.id)) Alert.alert(t('Cannot delete account', 'لا يمكن حذف الحساب'), t('This account has transfers or loan/debt dependencies. Keep it to preserve its accounting history.', 'هذا الحساب مرتبط بتحويلات أو قروض أو ديون. احتفظ به للحفاظ على سجله المحاسبي.'));
    };

    confirm(t(`Delete "${account.name}"?`, `حذف "${account.name}"؟`), message, performDelete, t('Delete', 'حذف'));
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
    <Screen scroll style={{ backgroundColor: '#F1F5F9' }}>
      {confirmation}
      <View style={financeChrome.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('Go back', 'رجوع')}
          style={financeChrome.back}
        >
          <Ionicons name="arrow-back" size={23} color="#D6B777" />
        </Pressable>

        <View style={[styles.headerText, isRTL && { alignItems: 'flex-end' }]}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20, textAlign: isRTL ? 'right' : 'left' }}>{t('Accounts', 'الحسابات')}</AppText>
          <AppText variant="caption" style={{ color: '#CBD5E1', textAlign: isRTL ? 'right' : 'left' }}>
            {accounts.length} {t(accounts.length === 1 ? 'account' : 'accounts', accounts.length === 1 ? 'حساب' : 'حسابات')}
          </AppText>
        </View>
      </View>

      <AppText color="textSecondary" style={{ marginBottom: 16 }}>
        {t('Manage your cash, bank, wallet, savings, and credit card balances.', 'إدارة أرصدة الحسابات النقدية والبنكية والمحافظ والادخار والبطاقات الائتمانية.')}
      </AppText>

      <AppButton
        title={t('Add account', 'إضافة حساب')}
        accentColor="#1E293B"
        leftIcon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
        onPress={openAdd}
      />

      {accounts.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            {t('No accounts yet. Add your first account.', 'لا توجد حسابات بعد. أضف حسابك الأول.')}
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
    minWidth: 0,
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
