import { isValidISODate } from '@/features/finance/utils/input';
import { applyAccountForm, formPayload, submitFinanceForm } from '@/features/finance/components/explicitFinanceForm';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { FinanceSaveStatus } from '../components/FinanceSaveStatus';
import { acknowledgedFinanceHandler } from '@/features/finance/components/acknowledgedFinanceHandler';
import { useFinanceDate } from '@/features/finance/hooks/useFinanceDate';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { useFinancePreferences } from '@/features/finance/store/useFinancePreferences';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { monthlyScheduledInstallmentTotal } from '@/features/finance/utils/reportSavedInstallments';
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
import { isTransferFeeClaim, verifiedFeeOwner } from '@/features/finance/utils/transferSettlement';
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
import { useAppLanguage } from '@/localization/LanguageProvider';

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
  const { t } = useAppLanguage();
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
  const verifyAssetOpeningBalanceDate = useFinanceStore(state => state.verifyAssetOpeningBalanceDate);
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
  const savedInstallments = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  useEffect(() => {
    if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate();
  }, []);
  const scheduledThisMonth = savedInstallments.hydration === 'ready' && savedInstallments.writeStatus === 'idle' && currencyReady
    ? monthlyScheduledInstallmentTotal(savedInstallments.contracts, todayISO().slice(0, 7), baseCurrency, rates, verifiedCurrencies)
    : null;

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
          t('Coming soon', 'قريبًا'),
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

  // Consume a route request only once. Draft opening is a guarded render
  // update; navigation itself remains an external effect. An Add-owned
  // modal is keyed by its action in FinanceAddScreen.
  type ModalAction = Exclude<AddMenuAction, 'documents'>;
  const routeAction = !modalOnlyAction && typeof financeAdd === 'string' ? financeAdd : '';
  const [seenRouteAction, setSeenRouteAction] = useState('');
  const [addOriginModal, setAddOriginModal] = useState<{ action: ModalAction } | null>(null);
  if (routeAction !== seenRouteAction) {
    setSeenRouteAction(routeAction);
    if (routeAction === 'transaction' || routeAction === 'transfer' || routeAction === 'account' || routeAction === 'asset') {
      handleAddMenuAction(routeAction);
      setAddOriginModal(fromAdd === '1' ? { action: routeAction } : null);
    }
  }
  const [seenModalOnlyAction, setSeenModalOnlyAction] = useState<ModalAction | undefined>(undefined);
  if (modalOnlyAction !== seenModalOnlyAction) {
    setSeenModalOnlyAction(modalOnlyAction);
    if (modalOnlyAction) handleAddMenuAction(modalOnlyAction);
  }

  const clearedRouteAction = useRef('');
  useEffect(() => {
    if (!routeAction) {
      clearedRouteAction.current = '';
    } else if (clearedRouteAction.current !== routeAction) {
      clearedRouteAction.current = routeAction;
      router.setParams({ financeAdd: '' });
    }
  }, [routeAction, router]);

  const modalOnlySession = useRef<{ action: ModalAction | undefined; opened: boolean; closed: boolean }>({ action: undefined, opened: false, closed: false });
  useEffect(() => {
    if (modalOnlySession.current.action !== modalOnlyAction) {
      modalOnlySession.current = { action: modalOnlyAction, opened: false, closed: false };
    }
    if (!modalOnlyAction) return;
    const opened = modalOnlyAction === 'transaction' ? txOpen :
      modalOnlyAction === 'transfer' ? transferOpen :
      modalOnlyAction === 'account' ? accountOpen : assetOpen;
    if (opened) modalOnlySession.current.opened = true;
    else if (modalOnlySession.current.opened && !modalOnlySession.current.closed) {
      modalOnlySession.current.closed = true;
      onModalOnlyClose?.();
    }
  }, [modalOnlyAction, txOpen, transferOpen, accountOpen, assetOpen, onModalOnlyClose]);

  const addOriginSession = useRef<{ request: typeof addOriginModal; opened: boolean; closed: boolean }>({ request: null, opened: false, closed: false });
  useEffect(() => {
    if (addOriginSession.current.request !== addOriginModal) {
      addOriginSession.current = { request: addOriginModal, opened: false, closed: false };
    }
    if (!addOriginModal) return;
    const action = addOriginModal.action;
    const opened = action === 'transaction' ? txOpen : action === 'transfer' ? transferOpen : action === 'account' ? accountOpen : assetOpen;
    if (opened) addOriginSession.current.opened = true;
    else if (addOriginSession.current.opened && !addOriginSession.current.closed) {
      addOriginSession.current.closed = true;
      router.setParams({ fromAdd: '' });
      router.navigate('/finance/add' as Href);
    }
  }, [addOriginModal, txOpen, transferOpen, accountOpen, assetOpen, router]);

  const confirmDeleteAsset = (asset: Asset) => {
    const message =
      t('This will permanently delete the asset and all of its recorded movements.', 'سيتم حذف الأصل وجميع حركاته المسجلة نهائيًا.');

    confirm(t(`Delete "${asset.name}"?`, `حذف "${asset.name}"؟`), message, () => acknowledgedFinanceHandler("src/features/finance/screens/FinanceHomeScreen.tsx:398", () => undefined, {
      payload: { operation: 'deleteAsset', targetId: asset.id },
      mutate: () => {
        if (useFinanceStore.getState().assets.filter(item => item.id === asset.id).length !== 1) return false;
        deleteAsset(asset.id);
        return !useFinanceStore.getState().assets.some(item => item.id === asset.id);
      },
      onCommitted: result => { if (result !== true) Alert.alert(t('Cannot delete asset', 'تعذر حذف الأصل')); },
    })(), t('Delete', 'حذف'));
  };

  const confirmDeleteAccount = (account: Account) => {
    const message =
      t('Ordinary transactions will be deleted. Accounts with transfers or loan/debt history cannot be deleted.', 'سيتم حذف المعاملات العادية. لا يمكن حذف الحسابات المرتبطة بتحويلات أو بسجل قروض أو ديون.');
    const performDelete = () => acknowledgedFinanceHandler("src/features/finance/screens/FinanceHomeScreen.tsx:404", () => undefined, {
      payload: { operation: 'deleteAccount', targetId: account.id },
      mutate: () => deleteAccount(account.id),
      onCommitted: result => { if (result !== true) Alert.alert(t('Cannot delete account', 'تعذر حذف الحساب'), t('This account has transfers or loan/debt dependencies. Keep it to preserve its accounting history.', 'هذا الحساب مرتبط بتحويلات أو قروض أو ديون، ويجب الاحتفاظ به للحفاظ على سجله المحاسبي.')); },
    })();

    confirm(t(`Delete "${account.name}"?`, `حذف "${account.name}"؟`), message, performDelete, t('Delete', 'حذف'));
  };

  const confirmDeleteTransaction = (transaction: Transaction) => {
    const message = t('This transaction will be permanently deleted.', 'سيتم حذف هذه المعاملة نهائيًا.');
    const performDelete = () => acknowledgedFinanceHandler("src/features/finance/screens/FinanceHomeScreen.tsx:413", () => undefined, {
      payload: { operation: 'removeTransaction', targetId: transaction.id },
      mutate: () => removeTransaction(transaction.id),
      onCommitted: result => { if (result !== true) Alert.alert(t('Cannot delete transaction', 'تعذر حذف المعاملة'), t('Linked loan/debt transactions must be managed from their payment screen. Transactions with refunds are also protected.', 'يجب إدارة معاملات القروض والديون المرتبطة من شاشة السداد. المعاملات التي تحتوي على استردادات محمية أيضًا.')); },
    })();

    confirm(t('Delete transaction?', 'حذف المعاملة؟'), message, performDelete, t('Delete', 'حذف'));
  };

  const openLinkedTransaction = (transaction: Transaction) => {
    const matches = useLedgerStore.getState().transactions.filter(item => item.id === transaction.id);
    const current = matches.length === 1 ? matches[0] : undefined;
    const ledger = useLedgerStore.getState();
    if (current && isTransferFeeClaim(current, ledger)) {
      const owner = verifiedFeeOwner(current, ledger);
      if (owner) openTransfer(owner);
      else Alert.alert(t('Linked transfer unavailable', 'التحويل المرتبط غير متاح'));
      return;
    }
    const destination = current && getTransactionDestination(current, useFinanceStore.getState());
    if (!destination) {
      Alert.alert(t('Linked record unavailable', 'السجل المرتبط غير متاح'), t('A unique existing loan or debt could not be determined from this transaction’s explicit links. No records were changed.', 'تعذر تحديد قرض أو دين واحد من روابط هذه المعاملة. لم يتم تغيير أي سجلات.'));
      return;
    }
    router.push(destination.href);
  };

  const confirmDeleteTransfer = (transfer: Transfer) => {
    const title =
      transfer.type === 'credit_card_payment'
        ? t('Delete credit card payment?', 'حذف سداد البطاقة الائتمانية؟')
        : t('Delete transfer?', 'حذف التحويل؟');

    const message =
      t('This transfer and its linked balance changes will be permanently deleted.', 'سيتم حذف التحويل وتغيرات الأرصدة المرتبطة به نهائيًا.');

    confirm(title, message, () => acknowledgedFinanceHandler("src/features/finance/screens/FinanceHomeScreen.tsx:442", () => undefined, {
      payload: { operation: 'removeTransfer', targetId: transfer.id },
      mutate: () => {
        if (useLedgerStore.getState().transfers.filter(item => item.id === transfer.id).length !== 1) return false;
        removeTransfer(transfer.id);
        return !useLedgerStore.getState().transfers.some(item => item.id === transfer.id);
      },
      onCommitted: result => { if (result !== true) Alert.alert(t('Cannot delete transfer', 'تعذر حذف التحويل')); },
    })(), t('Delete', 'حذف'));
  };

  const handleSaveAsset = (data: AddAssetFormData) => {
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
    return submitFinanceForm("src/features/finance/screens/FinanceHomeScreen.tsx:445", formPayload(targetId ? 'asset.edit' : 'asset.create', targetId, input,
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
        <FinanceSaveStatus />
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
    if (!data.accountName.trim() || amount === null || !hasValidCurrencyPrecision(data.amount, data.selectedCurrency)) {
      Alert.alert(t('Invalid account', 'حساب غير صالح'), t('Enter a valid name and starting balance.', 'أدخل اسمًا ورصيدًا افتتاحيًا صالحين.'));
      return;
    }
    const accountTypes: Record<AddAccountFormData['selectedType'], AccountType> = {
      Cash: 'cash', Bank: 'bank', Wallet: 'wallet', Savings: 'savings', 'Credit card': 'credit_card',
    };
    const accountInput = { name: data.accountName.trim(), type: accountTypes[data.selectedType],
      currencyCode: data.selectedCurrency, initialBalance: amount };
    const targetId = editingAccount?.id ?? null;
    const openingDate = targetId ? undefined : data.openingBalanceDate;
    if (openingDate !== undefined && !isValidISODate(openingDate)) {
      Alert.alert(t('Invalid opening date', 'تاريخ افتتاح غير صالح'), t('Enter a real calendar date.', 'أدخل تاريخًا صحيحًا.'));
      return;
    }
    const expectedUpdatedAt = editingAccount?.updatedAt;
    const reject = () => Alert.alert(t('Account not saved', 'لم يتم حفظ الحساب'), t('Review the account details and try again.', 'راجع بيانات الحساب وحاول مرة أخرى.'));
    const commit = () => submitFinanceForm("src/features/finance/screens/FinanceHomeScreen.tsx:610",
      formPayload(targetId ? 'account.edit' : 'account.create', targetId, accountInput, { openingDate, expectedUpdatedAt }),
      () => applyAccountForm(useLedgerStore.getState, targetId, accountInput, openingDate, expectedUpdatedAt),
      () => { setAccountOpen(false); setEditingAccount(null); }, reject);
    if (editingAccount?.openingBalanceDate && (accountInput.initialBalance !== editingAccount.initialBalance || accountInput.currencyCode !== editingAccount.currencyCode)) {
      Alert.alert(t('Opening date verification will be cleared', 'سيتم إلغاء التحقق من تاريخ الرصيد الافتتاحي'),
        t('Changing the starting balance or currency invalidates the verified opening date.', 'تغيير الرصيد الافتتاحي أو العملة يلغي التحقق من التاريخ الافتتاحي.'),
        [{ text: t('Cancel', 'إلغاء'), style: 'cancel' }, { text: t('Continue', 'متابعة'), onPress: commit }]);
      return;
    }
    return commit();
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
      <FinanceSaveStatus />
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
          <Pressable accessibilityRole="button" accessibilityLabel={t("Open exchange rates", "فتح أسعار الصرف")}
            onPress={() => setRatesOpen(true)}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, transform: [{ translateX: -0.8 }], borderWidth: 1.5, borderColor: '#D6B777', backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="refresh-outline" size={19} color="#D6B777" />
            </View>
          </Pressable>
          <View accessibilityRole="header" accessibilityLabel={t("Tomorrow Finance", "تمويل Tomorrow")} style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
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
          <Pressable accessibilityRole="button" accessibilityLabel={t("Open Finance settings", "فتح إعدادات المالية")}
            onPress={() => router.push('/finance/settings')}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, transform: [{ translateX: 0.8 }], borderWidth: 1.5, borderColor: '#D6B777', backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="settings-outline" size={19} color="#D6B777" /></View>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Select Finance wallet", "اختيار محفظة المالية")}
          accessibilityState={{ expanded: walletMenuOpen }}
          onPress={() => setWalletMenuOpen(value => !value)}
          style={{ alignSelf: 'center', minHeight: 40, marginTop: -4, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }}
        >
          <Ionicons name="wallet-outline" size={17} color="#D6B777" />
          <AppText style={{ color: '#E2E8F0', fontWeight: '800', fontSize: 14, letterSpacing: 0.35 }}>{t("Personal Wallet", "المحفظة الشخصية")}</AppText>
          <Ionicons name={walletMenuOpen ? 'chevron-up' : 'chevron-down'} size={17} color="#D6B777" />
        </Pressable>
        {walletMenuOpen && (
          <View style={{ backgroundColor: '#334155', borderColor: '#D6B777', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 }}>
            <AppText style={{ color: '#FFFFFF', fontWeight: '700' }}>{t("Personal Wallet · Current", "المحفظة الشخصية · الحالية")}</AppText>
            <AppText style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>{t("Additional wallets are not enabled yet.", "المحافظ الإضافية غير متاحة حاليًا.")}</AppText>
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
        scheduledThisMonth={scheduledThisMonth}
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
              {t("Incomplete financial summary", "الملخص المالي غير مكتمل")}
            </AppText>

            <AppText
              color="textSecondary"
              style={{ marginTop: 4 }}
            >
              {t(`${summary.missing} item(s) could not be converted because a verified exchange rate is unavailable. The displayed totals are partial. Review your exchange rates to complete the calculations.`, `تعذّر تحويل ${summary.missing} عنصر لعدم توفر سعر صرف موثّق. الإجماليات المعروضة جزئية؛ راجع أسعار الصرف لاستكمال الحسابات.`)}
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
                {t("Review exchange rates", "مراجعة أسعار الصرف")}
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.actionRow, { marginTop: spacing.lg }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("Open Finance add", "فتح إضافة عنصر مالي")}
          onPress={() => router.push('/finance/add' as Href)}
          style={[styles.transactionButton, { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }]}>
          <Ionicons name="add-circle-outline" size={20} color="#1E293B" />
          <AppText variant="bodyStrong" style={{ color: '#1E293B' }}>{t("Add", "إضافة")}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Open financial reports", "فتح التقارير المالية")}
          onPress={() => router.push('/finance/reports' as Href)}
          style={[styles.transactionButton, { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#D6B777', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }]}
        >
          <Ionicons name="stats-chart-outline" size={20} color="#1E293B" />
          <AppText variant="bodyStrong" style={{ color: '#1E293B' }}>{t("Reports", "التقارير")}</AppText>
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
    if (!data.accountName.trim() || amount === null || !hasValidCurrencyPrecision(data.amount, data.selectedCurrency)) {
      Alert.alert(t('Invalid account', 'حساب غير صالح'), t('Enter a valid name and starting balance.', 'أدخل اسمًا ورصيدًا افتتاحيًا صالحين.'));
      return;
    }
    const accountTypes: Record<AddAccountFormData['selectedType'], AccountType> = {
      Cash: 'cash', Bank: 'bank', Wallet: 'wallet', Savings: 'savings', 'Credit card': 'credit_card',
    };
    const accountInput = { name: data.accountName.trim(), type: accountTypes[data.selectedType],
      currencyCode: data.selectedCurrency, initialBalance: amount };
    const targetId = editingAccount?.id ?? null;
    const openingDate = targetId ? undefined : data.openingBalanceDate;
    if (openingDate !== undefined && !isValidISODate(openingDate)) {
      Alert.alert(t('Invalid opening date', 'تاريخ افتتاح غير صالح'), t('Enter a real calendar date.', 'أدخل تاريخًا صحيحًا.'));
      return;
    }
    const expectedUpdatedAt = editingAccount?.updatedAt;
    const reject = () => Alert.alert(t('Account not saved', 'لم يتم حفظ الحساب'), t('Review the account details and try again.', 'راجع بيانات الحساب وحاول مرة أخرى.'));
    const commit = () => submitFinanceForm("src/features/finance/screens/FinanceHomeScreen.tsx:848",
      formPayload(targetId ? 'account.edit' : 'account.create', targetId, accountInput, { openingDate, expectedUpdatedAt }),
      () => applyAccountForm(useLedgerStore.getState, targetId, accountInput, openingDate, expectedUpdatedAt),
      () => { setAccountOpen(false); setEditingAccount(null); }, reject);
    if (editingAccount?.openingBalanceDate && (accountInput.initialBalance !== editingAccount.initialBalance || accountInput.currencyCode !== editingAccount.currencyCode)) {
      Alert.alert(t('Opening date verification will be cleared', 'سيتم إلغاء التحقق من تاريخ الرصيد الافتتاحي'),
        t('Changing the starting balance or currency invalidates the verified opening date.', 'تغيير الرصيد الافتتاحي أو العملة يلغي التحقق من التاريخ الافتتاحي.'),
        [{ text: t('Cancel', 'إلغاء'), style: 'cancel' }, { text: t('Continue', 'متابعة'), onPress: commit }]);
      return;
    }
    return commit();
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
        onSave={(assetId, entryId, patch) => updateAssetEntry(assetId, entryId, patch)}
        onDelete={(assetId, entryId) => deleteAssetEntry(assetId, entryId)}
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
                <AppText variant="h3">{t("My assets", "أصولي")}</AppText>
                <AppText color="textSecondary">
                  {t(`${assets.length} asset(s)`, `${assets.length} أصل`)}
                </AppText>
              </View>

              <Pressable
                onPress={() => setAssetsOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("Close assets", "إغلاق الأصول")}
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
                    title={t("Add your first asset", "أضف أول أصل")}
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
                title={t("Add asset", "إضافة أصل")}
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
                accessibilityLabel={t("Close add menu", "إغلاق قائمة الإضافة")}
                onPress={() => setAddMenuOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.menuOptionsRow}>
              <MenuOption
                icon="swap-horizontal-outline"
                title={t("Transaction", "معاملة")}
                onPress={() => handleAddMenuAction('transaction')}
                accent="#60A5FA"
                background="#1E3A5F"
              />

              <MenuOption
                icon="repeat-outline"
                title={t("Transfer", "تحويل")}
                onPress={() => handleAddMenuAction('transfer')}
                accent="#A78BFA"
                background="#3B246B"
              />

              <MenuOption
                icon="wallet-outline"
                title={t("Account", "حساب")}
                onPress={() => handleAddMenuAction('account')}
                accent="#34D399"
                background="#064E3B"
              />

              <MenuOption
                icon="diamond-outline"
                title={t("Asset", "أصل")}
                onPress={() => handleAddMenuAction('asset')}
                accent="#FBBF24"
                background="#78350F"
              />
              <MenuOption
                icon="documents-outline"
                title={t("Documents", "المستندات")}
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
