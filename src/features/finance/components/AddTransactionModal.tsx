import { FinanceSubmissionReceipt } from './FinanceSubmissionReceipt';
import { formPayload, matchesUniqueRevision, submitFinanceForm } from './explicitFinanceForm';
import { afterFinanceSave } from '@/features/finance/components/acknowledgedFinanceHandler';
import { FinanceModalHeader } from './FinanceModalHeader';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { FinanceDateField as DateField } from '@/features/finance/components/FinanceDateField';
import { FinanceInput as AppInput } from '@/features/finance/components/FinanceInput';
import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { AccountDropdown } from '@/features/finance/components/AccountDropdown';
import { CurrencyDropdown } from '@/features/finance/components/CurrencyDropdown';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppText, ChipSelect } from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import { HistoricalFxField } from '@/features/finance/components/HistoricalFxField';
import { DirectHistoricalFxField } from '@/features/finance/components/DirectHistoricalFxField';
import { getHistoricalRate, createManualHistoricalRate } from '@/services/historicalRates';
import { isValidHistoricalFx } from '@/features/finance/utils/historicalFx';
import { ScanDocumentButton } from '@/features/finance/components/ScanDocumentButton';
import { getCurrencyLabel, getCurrencyDecimals } from '@/features/finance/constants/currencies';
import type { ScanResult } from '@/features/finance/scanner/types';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { isProtectedTransaction } from '@/features/finance/utils/paymentTransactionOwnership';
import type {
  Category,
  NewCategoryInput,
  NewTransactionInput,
  TransactionPatch,
  HistoricalFxSnapshot,
  DirectHistoricalFxSnapshot,
  Transaction,
  TransactionType,
} from '@/features/finance/types/ledger';
import { roundMoney, todayISO } from '@/features/finance/utils/finance';
import { calculateCrossCurrency, calculateDirectHistoricalRate } from '@/features/finance/utils/crossCurrency';
import { formatMoney } from '@/features/finance/utils/money';
import { resolveAmountExpression } from '@/features/finance/utils/amountExpression';
import { evaluateExpression } from '@/features/finance/utils/calculator';
import { moduleColors, useTheme } from '@/theme';
import { isValidISODate } from '@/utils/input';
import { shouldStackFinanceFields } from '../utils/formLayout';

function resolveHistoricalRateExpression(input: string): number | null {
  const text = input.trim();
  if (!text || /[+\-×÷*/]$/.test(text)) return null;
  if (!/^[0-9.+\-×÷*/()]+$/.test(text)) return null;

  const value = evaluateExpression(
    text.replace(/\*/g, '×').replace(/\//g, '÷'),
  );

  return value !== null && Number.isFinite(value) && value > 0
    ? value
    : null;
}

type EntryMode = 'normal' | 'refund';

const ICON_OPTIONS = [
  'cash-outline',
  'briefcase-outline',
  'laptop-outline',
  'gift-outline',
  'add-circle-outline',
  'restaurant-outline',
  'cart-outline',
  'car-outline',
  'receipt-outline',
  'medkit-outline',
  'school-outline',
  'bag-outline',
  'heart-outline',
  'home-outline',
  'airplane-outline',
  'fitness-outline',
  'paw-outline',
  'ellipsis-horizontal-circle-outline',
] as const;

const COLOR_OPTIONS = [
  '#10B981',
  '#14B8A6',
  '#F59E0B',
  '#64748B',
  '#F97316',
  '#84CC16',
  '#3B82F6',
  '#EF4444',
  '#F43F5E',
  '#6366F1',
  '#EC4899',
  '#8B5CF6',
  '#0EA5E9',
  '#A855F7',
];

export function AddTransactionModal({
  visible,
  onClose,
  transaction,
  fixedKind,
  initialRefund = false,
}: AddTransactionModalProps) {
  const { colors, spacing, radius } = useTheme();
  const { t } = useAppLanguage();
  const { width, fontScale } = useWindowDimensions();
  const stackFields = shouldStackFinanceFields(width, fontScale);
  const fieldColumn = { flex: stackFields ? 0 : 1, minWidth: 0, gap: 4 };
  const stackRefundFields = stackFields || width / fontScale < 460;
  const refundFieldColumn = { flex: stackRefundFields ? 0 : 1, minWidth: 0, gap: 4 };

  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const transactions = useLedgerStore((s) => s.transactions);
  const loans = useFinanceStore((s) => s.loans);
  const debts = useFinanceStore((s) => s.debts);
  const addTransaction = useLedgerStore((s) => s.addTransaction);
  const updateTransaction = useLedgerStore((s) => s.updateTransaction);
  const addCategory = useLedgerStore((s) => s.addCategory);
  const updateCategory = useLedgerStore((s) => s.updateCategory);
  const archiveCategory = useLedgerStore((s) => s.archiveCategory);
  const deleteCategory = useLedgerStore((s) => s.deleteCategory);

  const [type, setType] = useState<TransactionType>('expense');
  const [entryMode, setEntryMode] = useState<EntryMode>('normal');
  const [amount, setAmount] = useState('');
  const [transactionCurrency, setTransactionCurrency] = useState('');
  const [actualAccountDebit, setActualAccountDebit] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [originalTransactionId, setOriginalTransactionId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  const fxRequestId = useRef(0);
  const [fxReadyFor, setFxReadyFor] = useState<string | null>(null);
  const [fxRecord, setFxRecord] = useState<{
    key: string;
    snapshot: HistoricalFxSnapshot;
  } | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxManualMode, setFxManualMode] = useState(false);
  const [fxManualRate, setFxManualRate] = useState('');
  const [fxManualRateKey, setFxManualRateKey] = useState<string | null>(null);
  const [fxError, setFxError] = useState<string | undefined>();
  const originalFxRequestId = useRef(0);
  const [originalFxRecord, setOriginalFxRecord] = useState<{
    key: string;
    snapshot: HistoricalFxSnapshot;
  } | null>(null);
  const [originalFxLoading, setOriginalFxLoading] = useState(false);
  const [originalFxError, setOriginalFxError] = useState<string | undefined>();
  const [originalFxManualMode, setOriginalFxManualMode] = useState(false);
  const [originalFxManualRate, setOriginalFxManualRate] = useState('');
  const [originalFxManualRateKey, setOriginalFxManualRateKey] = useState<string | null>(null);
  const [directFxManualMode, setDirectFxManualMode] = useState(false);
  const [directFxManualRate, setDirectFxManualRate] = useState('');
  const [directFxManualKey, setDirectFxManualKey] = useState<string | null>(null);

  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [scanSource, setScanSource] = useState<'camera' | 'gallery' | 'file' | null>(null);
  const [confirmUnusedDeleteCategory, setConfirmUnusedDeleteCategory] = useState<Category | null>(null);
  const [selectedManagerCategoryId, setSelectedManagerCategoryId] = useState('');
  const [categoryFormVisible, setCategoryFormVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>(
    ICON_OPTIONS[0],
  );
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0]);

  const isEditingRefund = transaction?.entryType === 'refund';

  // Initialize a draft only when its modal session changes. A render-phase
  // guarded update avoids committing the previous transaction's draft.
  const [loadedTransactionDraft, setLoadedTransactionDraft] = useState<{
    visible: boolean; transaction: Transaction | null | undefined;
  } | null>(null);
  if (!loadedTransactionDraft || loadedTransactionDraft.visible !== visible || loadedTransactionDraft.transaction !== transaction) {
    setLoadedTransactionDraft({ visible, transaction });
    if (!visible) {
      setFxReadyFor(null);
    } else {
      setError(undefined);
      setCategoryManagerVisible(false);
      setTypePickerOpen(false);
      setCategoryPickerOpen(false);
      setAttachPickerOpen(false);
      setScanSource(null);
      setConfirmUnusedDeleteCategory(null);
      setCategoryFormVisible(false);
      setEditingCategory(null);

      if (transaction) {
        setType(transaction.type);
        setEntryMode(transaction.entryType === 'refund' ? 'refund' : 'normal');
        setAmount(String(transaction.originalAmount ?? transaction.amount));
        setTransactionCurrency(transaction.originalCurrencyCode ?? transaction.currencyCode);
        setActualAccountDebit(transaction.originalCurrencyCode ? String(transaction.amount) : '');
        setAccountId(transaction.accountId);
        setCategoryId(transaction.categoryId);
        setOriginalTransactionId(transaction.relatedTransactionId ?? '');
        setDate(transaction.date);
        setNote(transaction.note ?? '');
      } else {
        setType(fixedKind ?? 'expense');
        setEntryMode(initialRefund && fixedKind === 'expense' ? 'refund' : 'normal');
        setAmount('');
        setTransactionCurrency('');
        setActualAccountDebit('');
        setAccountId('');
        setCategoryId('');
        setOriginalTransactionId('');
        setDate(todayISO());
        setNote('');
      }
      setFxReadyFor(transaction?.id ?? 'new');
    }
  }

  const selectableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => !account.archived || account.id === transaction?.accountId,
      ),
    [accounts, transaction],
  );

  const kindCategories = useMemo(
    () => categories.filter((category) => category.kind === type && (!category.archived || category.id === transaction?.categoryId)),
    [categories, type, transaction?.categoryId],
  );

  const refundableTransactions = useMemo(() => {
    return transactions
      .filter(
        (item) =>
          item.type === 'expense' &&
          item.entryType !== 'refund' &&
          !isProtectedTransaction(item, { loans, debts }) &&
          item.id !== transaction?.id,
      )
      .map((item) => {
        const currency = item.originalCurrencyCode ?? item.currencyCode;
        const related = transactions.filter(refund => refund.entryType === 'refund'
          && refund.relatedTransactionId === item.id);
        const ambiguous = !!item.originalCurrencyCode
          && related.some(refund => refund.originalCurrencyCode !== currency);
        const refundedAmount = roundMoney(
          related.reduce((total, refund) => total + (refund.originalAmount ?? refund.amount), 0),
          getCurrencyDecimals(currency),
        );

        const remainingAmount = ambiguous ? 0 : roundMoney(
          Math.max(0, (item.originalAmount ?? item.amount) - refundedAmount),
          getCurrencyDecimals(currency),
        );

        return {
          transaction: item,
          refundedAmount,
          remainingAmount,
        };
      })
      .filter((item) => item.remainingAmount > 0)
      .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
  }, [transactions, transaction, loans, debts]);

  const selectedOriginal = refundableTransactions.find(
    (item) => item.transaction.id === originalTransactionId,
  );

  const originalAccount = selectedOriginal
    ? accounts.find(
        (account) => account.id === selectedOriginal.transaction.accountId,
      )
    : undefined;

  const originalCategory = selectedOriginal
    ? categories.find(
        (category) => category.id === selectedOriginal.transaction.categoryId,
      )
    : undefined;

  const activeAccountId =
    entryMode === 'refund'
      ? (originalAccount?.id ?? '')
      : selectableAccounts.some((account) => account.id === accountId)
        ? accountId
        : (selectableAccounts[0]?.id ?? '');

  const activeCategoryId =
    entryMode === 'refund'
      ? (originalCategory?.id ?? '')
      : kindCategories.some((category) => category.id === categoryId)
        ? categoryId
        : (kindCategories[0]?.id ?? '');

  const activeAccount =
    entryMode === 'refund'
      ? originalAccount
      : selectableAccounts.find((account) => account.id === activeAccountId);

  const fxCurrency = entryMode === 'refund'
    ? selectedOriginal?.transaction.currencyCode
    : activeAccount?.currencyCode;
  const fxKey = `${fxCurrency ?? ''}|${date}`;
  const amountCurrencyCode = entryMode === 'refund'
    ? (selectedOriginal?.transaction.originalCurrencyCode ?? selectedOriginal?.transaction.currencyCode)
    : transactionCurrency || activeAccount?.currencyCode;
  const crossCurrencySelected = entryMode !== 'refund' &&
    !!activeAccount && !!amountCurrencyCode &&
    amountCurrencyCode !== activeAccount.currencyCode;

  const fxInitializationMatches =
    fxReadyFor === (transaction?.id ?? 'new');
  const fxSnapshot =
    fxRecord?.key === fxKey &&
    fxCurrency &&
    isValidHistoricalFx(fxRecord.snapshot, fxCurrency, date)
      ? fxRecord.snapshot
      : undefined;

  const manualFxValue = resolveHistoricalRateExpression(fxManualRate);
  const manualFxResult =
    fxManualMode && fxManualRateKey === fxKey && fxCurrency && manualFxValue !== null
      ? createManualHistoricalRate(fxCurrency, date, manualFxValue)
      : null;

  const directFxKey = `${activeAccount?.currencyCode ?? ''}|${amountCurrencyCode ?? ''}|${date}`;
  const manualDirectRate = directFxManualMode && directFxManualKey === directFxKey
    ? resolveHistoricalRateExpression(directFxManualRate) : null;
  const manualDirectSelected = directFxManualMode && directFxManualKey === directFxKey;

  const originalFxCurrency = crossCurrencySelected ? amountCurrencyCode : undefined;
  const originalFxKey = `${originalFxCurrency ?? ''}|${date}`;
  const originalFxSnapshot =
    originalFxRecord?.key === originalFxKey &&
    originalFxCurrency &&
    isValidHistoricalFx(originalFxRecord.snapshot, originalFxCurrency, date)
      ? originalFxRecord.snapshot
      : undefined;

  const originalManualValue = resolveHistoricalRateExpression(originalFxManualRate);
  const originalManualResult =
    originalFxManualMode &&
    originalFxManualRateKey === originalFxKey &&
    originalFxCurrency &&
    originalManualValue !== null
      ? createManualHistoricalRate(originalFxCurrency, date, originalManualValue)
      : null;

  const directDraftContext = { visible, transaction, directFxKey };
  const [loadedDirectDraft, setLoadedDirectDraft] = useState<typeof directDraftContext | null>(null);
  if (!loadedDirectDraft || loadedDirectDraft.visible !== visible || loadedDirectDraft.transaction !== transaction || loadedDirectDraft.directFxKey !== directFxKey) {
    setLoadedDirectDraft(directDraftContext);
    const existing = transaction?.directHistoricalFx;
    const matches = visible && existing && transaction?.date === date &&
      existing.accountCurrencyCode === activeAccount?.currencyCode &&
      existing.transactionCurrencyCode === amountCurrencyCode && existing.source === 'manual';
    setDirectFxManualMode(Boolean(matches));
    setDirectFxManualRate(matches && existing ? String(existing.rate) : '');
    setDirectFxManualKey(matches ? directFxKey : null);
  }

  const selectedOriginalFx =
    originalFxManualMode
      ? (originalManualResult?.ok ? originalManualResult.snapshot : undefined)
      : originalFxSnapshot;

  // Reset a request's draft at the render boundary; asynchronous effects
  // only fetch evidence. Keys and cleanup keep stale results out of new drafts.
  const originalRequestContext = { visible, fxInitializationMatches, originalFxKey, transaction };
  const [loadedOriginalRequest, setLoadedOriginalRequest] = useState<typeof originalRequestContext | null>(null);
  if (!loadedOriginalRequest || loadedOriginalRequest.visible !== originalRequestContext.visible ||
      loadedOriginalRequest.fxInitializationMatches !== originalRequestContext.fxInitializationMatches ||
      loadedOriginalRequest.originalFxKey !== originalRequestContext.originalFxKey ||
      loadedOriginalRequest.transaction !== originalRequestContext.transaction) {
    setLoadedOriginalRequest(originalRequestContext);
    const valid = visible && fxInitializationMatches && !!originalFxCurrency && isValidISODate(date);
    const existing = transaction?.accountFxSnapshot;
    const saved = valid && originalFxCurrency && transaction?.date === date &&
      transaction.originalCurrencyCode === originalFxCurrency && existing &&
      isValidHistoricalFx(existing, originalFxCurrency, date) ? existing : undefined;
    setOriginalFxRecord(saved ? { key: originalFxKey, snapshot: saved } : null);
    setOriginalFxError(undefined);
    setOriginalFxManualMode(saved?.source === 'manual');
    setOriginalFxManualRate(saved?.source === 'manual' ? String(saved.rate) : '');
    setOriginalFxManualRateKey(saved?.source === 'manual' ? originalFxKey : null);
    setOriginalFxLoading(valid && !saved);
  }
  useEffect(() => {
    const requestId = ++originalFxRequestId.current;
    if (!visible || !fxInitializationMatches || !originalFxCurrency || !isValidISODate(date)) return;
    const existing = transaction?.accountFxSnapshot;
    if (transaction?.date === date && transaction.originalCurrencyCode === originalFxCurrency &&
        existing && isValidHistoricalFx(existing, originalFxCurrency, date)) return;
    void getHistoricalRate(originalFxCurrency, date).then((result) => {
      if (originalFxRequestId.current !== requestId) return;
      setOriginalFxLoading(false);
      if (result.ok && isValidHistoricalFx(result.snapshot, originalFxCurrency, date)) {
        setOriginalFxRecord({ key: originalFxKey, snapshot: result.snapshot });
      } else {
        setOriginalFxError(result.ok ? 'Original currency historical rate is invalid.' : result.reason);
      }
    });
    return () => { originalFxRequestId.current += 1; };
  }, [visible, fxInitializationMatches, originalFxKey, originalFxCurrency, date, transaction]);
  const selectedFx =
    fxManualMode
      ? (manualFxResult?.ok ? manualFxResult.snapshot : undefined)
      : fxSnapshot;

  const accountRequestContext = { visible, fxInitializationMatches, fxKey, transaction, isEditingRefund };
  const [loadedAccountRequest, setLoadedAccountRequest] = useState<typeof accountRequestContext | null>(null);
  if (!loadedAccountRequest || loadedAccountRequest.visible !== accountRequestContext.visible ||
      loadedAccountRequest.fxInitializationMatches !== accountRequestContext.fxInitializationMatches ||
      loadedAccountRequest.fxKey !== accountRequestContext.fxKey ||
      loadedAccountRequest.transaction !== accountRequestContext.transaction ||
      loadedAccountRequest.isEditingRefund !== accountRequestContext.isEditingRefund) {
    setLoadedAccountRequest(accountRequestContext);
    const valid = visible && fxInitializationMatches && !!fxCurrency && isValidISODate(date) && !isEditingRefund;
    const existing = transaction?.historicalFx;
    const saved = valid && fxCurrency && transaction?.date === date && transaction.currencyCode === fxCurrency &&
      existing && isValidHistoricalFx(existing, fxCurrency, date) ? existing : undefined;
    setFxRecord(saved ? { key: fxKey, snapshot: saved } : null);
    setFxError(undefined);
    setFxManualMode(saved?.source === 'manual');
    setFxManualRate(saved?.source === 'manual' ? String(saved.rate) : '');
    setFxManualRateKey(saved?.source === 'manual' ? fxKey : null);
    setFxLoading(valid && !saved);
  }
  useEffect(() => {
    const requestId = ++fxRequestId.current;
    if (!visible || !fxInitializationMatches || !fxCurrency || !isValidISODate(date) || isEditingRefund) return;
    const existing = transaction?.historicalFx;
    if (transaction?.date === date && transaction.currencyCode === fxCurrency && existing &&
        isValidHistoricalFx(existing, fxCurrency, date)) return;
    void getHistoricalRate(fxCurrency, date).then((result) => {
      if (fxRequestId.current !== requestId) return;
      setFxLoading(false);
      if (result.ok && isValidHistoricalFx(result.snapshot, fxCurrency, date)) {
        setFxRecord({ key: fxKey, snapshot: result.snapshot });
        setFxError(undefined);
      } else {
        setFxRecord(null);
        setFxError(result.ok ? 'Historical rate does not match the selected date or currency.' : result.reason);
      }
    });
    return () => { fxRequestId.current += 1; };
  }, [visible, fxInitializationMatches, fxKey, fxCurrency, date, transaction, isEditingRefund]);

  const fetchFx = () => {
    if (!fxCurrency || !isValidISODate(date)) {
      setFxError('Select a valid currency and transaction date.');
      return;
    }
    const requestId = ++fxRequestId.current;
    setFxManualMode(false);
    setFxRecord(null);
    setFxError(undefined);
    setFxLoading(true);
    void getHistoricalRate(fxCurrency, date).then((result) => {
      if (fxRequestId.current !== requestId) return;
      setFxLoading(false);
      if (
        result.ok &&
        isValidHistoricalFx(result.snapshot, fxCurrency, date)
      ) {
        setFxRecord({ key: fxKey, snapshot: result.snapshot });
        setFxError(undefined);
      } else {
        setFxRecord(null);
        setFxError(result.ok
          ? 'Historical rate does not match the selected date or currency.'
          : result.reason);
      }
    });
  };

  const toggleManualFx = () => {
    fxRequestId.current += 1;
    setFxLoading(false);
    setFxError(undefined);
    if (fxManualMode) {
      setFxManualMode(false);
      fetchFx();
    } else {
      setFxManualMode(true);
      setFxManualRate('');
      setFxManualRateKey(null);
      setFxRecord(null);
    }
  };

  const originalValue = amountCurrencyCode
    ? resolveAmountExpression(amount, amountCurrencyCode)
    : null;

  const actualDebitValue = activeAccount && actualAccountDebit.trim()
    ? resolveAmountExpression(actualAccountDebit, activeAccount.currencyCode)
    : null;

  const directHistoricalRateFromApi =
    crossCurrencySelected &&
    activeAccount &&
    amountCurrencyCode &&
    selectedOriginalFx &&
    selectedFx
      ? calculateDirectHistoricalRate(
          selectedOriginalFx,
          selectedFx,
          amountCurrencyCode,
          activeAccount.currencyCode,
          date,
        )
      : null;
  const directHistoricalRate = manualDirectSelected ? manualDirectRate : directHistoricalRateFromApi;
  const manualEstimatedAmount = manualDirectRate !== null && originalValue !== null && activeAccount
    ? roundMoney(originalValue / manualDirectRate, getCurrencyDecimals(activeAccount.currencyCode))
    : null;
  const manualAccountAmount = manualEstimatedAmount !== null &&
    (!actualAccountDebit.trim() || actualDebitValue !== null)
    ? (actualAccountDebit.trim() ? actualDebitValue : manualEstimatedAmount)
    : null;
  const manualEffectiveRate = manualAccountAmount !== null && originalValue !== null && originalValue > 0 && manualAccountAmount > 0
    ? manualAccountAmount / originalValue : null;
  const crossCurrencyPreview =
    crossCurrencySelected &&
    activeAccount &&
    amountCurrencyCode &&
    originalValue !== null &&
    !manualDirectSelected &&
    selectedOriginalFx &&
    selectedFx &&
    (!actualAccountDebit.trim() || actualDebitValue !== null)
      ? calculateCrossCurrency({
          originalAmount: originalValue,
          originalCurrencyCode: amountCurrencyCode,
          accountCurrencyCode: activeAccount.currencyCode,
          transactionDate: date,
          originalFx: selectedOriginalFx,
          accountFx: selectedFx,
          actualAccountAmount: actualAccountDebit.trim()
            ? actualDebitValue!
            : undefined,
        })
      : null;
  const estimatedAccountAmount = manualDirectSelected ? manualEstimatedAmount : crossCurrencyPreview?.estimatedAccountAmount;
  const amountToRecord = manualDirectSelected ? manualAccountAmount : crossCurrencyPreview?.accountAmount;

  const openCategoryManager = () => {
    setSelectedManagerCategoryId(activeCategoryId);
    setCategoryManagerVisible(true);
  };

  const openNewCategoryForm = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryIcon(ICON_OPTIONS[0]);
    setNewCategoryColor(
      type === 'income' ? COLOR_OPTIONS[0] : COLOR_OPTIONS[4],
    );
    setCategoryFormVisible(true);
  };

  const openEditCategoryForm = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryIcon(category.icon);
    setNewCategoryColor(category.color);
    setCategoryFormVisible(true);
  };

  const closeCategoryForm = () => {
    setCategoryFormVisible(false);
    setEditingCategory(null);
  };

  const saveCategory = () => {
    const cleanName = newCategoryName.trim();

    if (!cleanName) {
      afterFinanceSave(() => Alert.alert(t('Missing name', 'الاسم مطلوب'), t('Please enter a category name.', 'يرجى إدخال اسم التصنيف.')));
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.kind === type &&
        category.id !== editingCategory?.id &&
        category.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    if (duplicate) {
      afterFinanceSave(() => Alert.alert(
        t('Category already exists', 'التصنيف موجود بالفعل'),
        t('A category with this name already exists.', 'يوجد تصنيف بنفس الاسم.'),
      ));
      return;
    }

    const targetId = editingCategory?.id ?? null;
    const input: NewCategoryInput = { name: cleanName, kind: type, icon: newCategoryIcon, color: newCategoryColor };
    const patch = { name: input.name, icon: input.icon, color: input.color };
    return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:627",
      formPayload(targetId ? 'category.edit' : 'category.create', targetId, targetId ? patch : input),
      () => {
        if (!targetId) return addCategory(input) || null;
        const matches = useLedgerStore.getState().categories.filter(item => item.id === targetId);
        if (matches.length !== 1) return false;
        updateCategory(targetId, patch);
        const after = useLedgerStore.getState().categories.find(item => item.id === targetId);
        return !!after && after.name === patch.name && after.icon === patch.icon && after.color === patch.color;
      },
      result => { if (typeof result === 'string') setCategoryId(result); closeCategoryForm(); setError(undefined); },
      () => setError(t('Could not save category.', 'تعذر حفظ التصنيف.')));

  };

  const requestDeleteCategory = (category: Category) => {
    const isUsed = transactions.some(
      (item) => item.categoryId === category.id,
    );

    if (isUsed) {
      Alert.alert(t('Archive category?', 'أرشفة التصنيف؟'),
        t('Existing transactions will keep this category.', 'ستحتفظ المعاملات السابقة بهذا التصنيف.'), [
          { text: t('Cancel', 'إلغاء'), style: 'cancel' },
          { text: t('Archive', 'أرشفة'), onPress: () => {
            return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:686",
              formPayload('category.archive', category.id, { archived: true }),
              () => archiveCategory(category.id),
              () => { if (categoryId === category.id && transaction?.categoryId !== category.id) setCategoryId(''); },
              () => setError(t('Could not archive category.', 'تعذرت أرشفة التصنيف.')));
          } },
        ]);
      return;
    }

    setConfirmUnusedDeleteCategory(category);
  };

  const handleEntryModeChange = (value: string) => {
    setError(undefined);

    if (value === 'refund') {
      setEntryMode('refund');
      setType('expense');
      setOriginalTransactionId('');
      setAmount('');
      setAccountId('');
      setCategoryId('');
      return;
    }

    setEntryMode('normal');
    setOriginalTransactionId('');
    setAmount('');
    setType(value as TransactionType);
  };

  const applyScan = (result: ScanResult) => {
    if (result.amount !== undefined) setAmount(String(result.amount));
    if (result.date && isValidISODate(result.date)) setDate(result.date);
    if (result.merchant && !note.trim()) setNote(result.merchant);

    if (result.currencyCode) {
      const match = selectableAccounts.find(
        (account) => account.currencyCode === result.currencyCode,
      );
      if (match) setAccountId(match.id);
    }

    setError(undefined);
  };

  const [refundCredit, setRefundCredit] = useState('');
  const [refundRate, setRefundRate] = useState('');
  // The draft belongs to exactly one visible refund context. A context change
  // clears both fields before a render can expose another purchase's credit/rate.
  const refundContext = visible && entryMode === 'refund' && selectedOriginal
    ? JSON.stringify([transaction?.id ?? null, selectedOriginal.transaction.id,
        originalAccount?.id, originalAccount?.currencyCode,
        selectedOriginal.transaction.originalCurrencyCode, date])
    : null;
  const [loadedRefundContext, setLoadedRefundContext] = useState<string | null>(null);
  if (loadedRefundContext !== refundContext) {
    setLoadedRefundContext(refundContext);
    setRefundCredit('');
    setRefundRate('');
  }

  const submit = () => {
    const current = transaction &&
      useLedgerStore.getState().transactions.find(t => t.id === transaction.id);

    if (transaction && !current) {
      setError(t('Transaction no longer exists.', 'المعاملة لم تعد موجودة.'));
      return;
    }
    if (current && isProtectedTransaction(current, useFinanceStore.getState())) {
      afterFinanceSave(() => setError(t('This transaction belongs to a loan or debt. Manage its payment from Loans or Debts.', 'هذه المعاملة مرتبطة بقرض أو دين. أدِر سدادها من القروض أو الديون.')));
      return;
    }

    const amountCurrency = entryMode === 'refund'
      ? (selectedOriginal?.transaction.originalCurrencyCode ?? selectedOriginal?.transaction.currencyCode)
      : amountCurrencyCode;

    if (!amountCurrency) {
      afterFinanceSave(() => setError(t('Select a valid account and currency.', 'اختر حسابًا وعملة صالحين.')));
      return;
    }

    const value = resolveAmountExpression(amount, amountCurrency);

    if (value === null) {
      afterFinanceSave(() => setError(`Enter a valid positive amount. ${amountCurrency} allows up to ${getCurrencyDecimals(amountCurrency)} decimal places.`));
      return;
    }

    if (!isValidISODate(date)) {
      afterFinanceSave(() => setError(t('Date must be a real date in the format YYYY-MM-DD.', 'يجب إدخال تاريخ صحيح بالصيغة YYYY-MM-DD.')));
      return;
    }

    if (entryMode === 'refund') {
      if (!selectedOriginal || !originalAccount || !originalCategory) {
        afterFinanceSave(() => setError(t('Choose an original purchase to refund.', 'اختر عملية الشراء الأصلية للاسترداد.')));
        return;
      }

      if (value > selectedOriginal.remainingAmount) {
        setError(
          `The remaining refundable amount is ${formatMoney(selectedOriginal.remainingAmount, selectedOriginal.transaction.originalCurrencyCode ?? selectedOriginal.transaction.currencyCode)}.`,
        );
        return;
      }

      const original = selectedOriginal.transaction;
      const credit = original.originalCurrencyCode
        ? resolveAmountExpression(refundCredit, originalAccount.currencyCode) : value;
      const rate = resolveHistoricalRateExpression(refundRate);
      if (credit === null || (original.originalCurrencyCode && (rate === null || rate <= 0))) {
        setError(t('Enter the actual bank credit and historical exchange rate.', 'أدخل المبلغ الفعلي المضاف إلى الحساب وسعر الصرف التاريخي.'));
        return;
      }
      const refundFx = original.originalCurrencyCode && rate !== null ? {
        originalAmount: value,
        originalCurrencyCode: original.originalCurrencyCode,
        accountFxRate: credit / value,
        directHistoricalFx: {
          source: 'manual' as const,
          accountCurrencyCode: originalAccount.currencyCode,
          transactionCurrencyCode: original.originalCurrencyCode,
          rateDate: date,
          rate,
        },
      } : {};
      const input: NewTransactionInput = {
        type: 'expense',
        entryType: 'refund',
        relatedTransactionId: selectedOriginal.transaction.id,
        historicalFx: original.originalCurrencyCode ? undefined : selectedFx,
        amount: credit,
        ...refundFx,
        accountId: selectedOriginal.transaction.accountId,
        categoryId: selectedOriginal.transaction.categoryId,
        date,
        note: note.trim() || undefined,
      };
      return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:746",
        formPayload('refund.create', selectedOriginal.transaction.id, input),
        operationId => addTransaction(input, operationId),
        () => onClose(), () => setError(t('Could not add the refund. Please check the refundable amount.', 'تعذر إضافة الاسترداد. تحقق من المبلغ القابل للاسترداد.')));

    }


    if (!activeAccount) {
      afterFinanceSave(() => setError(t('Create an account first.', 'أنشئ حسابًا أولًا.')));
      return;
    }

    if (!activeCategoryId) {
      afterFinanceSave(() => setError(t('Choose a category.', 'اختر تصنيفًا.')));
      return;
    }

    const isCross = amountCurrency !== activeAccount.currencyCode;

    const financialUnchanged = !isCross && !!current &&
      current.accountId === activeAccount.id &&
      current.date === date &&
      (current.originalCurrencyCode ?? current.currencyCode) === amountCurrency &&
      (current.originalAmount ?? current.amount) === value &&
      (
        current.originalCurrencyCode
          ? actualAccountDebit.trim() !== '' &&
            resolveAmountExpression(
              actualAccountDebit,
              activeAccount.currencyCode
            ) === current.amount
          : !isCross
      );

    if (financialUnchanged && current) {
      const patch = { type, categoryId: activeCategoryId, note: note.trim() };
      return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:746",
        formPayload('transaction.edit', current.id, patch, { expectedUpdatedAt: transaction!.updatedAt }),
        () => matchesUniqueRevision(useLedgerStore.getState().transactions, current.id, transaction!.updatedAt) && updateTransaction(current.id, patch),
        () => onClose(), () => setError(t('Could not save the changes.', 'تعذر حفظ التغييرات.')));
    }

    const legacyUnchanged = !!current &&
      !current.historicalFx &&
      !isCross &&
      current.date === date &&
      current.currencyCode === activeAccount.currencyCode;

    if (
      !legacyUnchanged && !(isCross && manualDirectSelected) &&
      (!fxInitializationMatches || fxLoading || !selectedFx ||
        !isValidHistoricalFx(
          selectedFx, activeAccount.currencyCode, date
        ))
    ) {
      afterFinanceSave(() => setError(t('A valid account-currency historical rate is required.', 'يلزم سعر صرف تاريخي صالح لعملة الحساب.')));
      return;
    }

    if (isCross && !manualDirectSelected && (
      !fxInitializationMatches ||
      originalFxLoading ||
      !selectedOriginalFx ||
      !isValidHistoricalFx(selectedOriginalFx, amountCurrency, date) ||
      !crossCurrencyPreview
    )) {
      afterFinanceSave(() => setError(t('A valid original-currency rate and account amount are required.', 'يلزم سعر صرف صالح للعملة الأصلية ومبلغ الحساب.')));
      return;
    }

    if (isCross && manualDirectSelected && (
      !fxInitializationMatches || manualDirectRate === null ||
      manualAccountAmount === null || manualAccountAmount <= 0 ||
      manualEffectiveRate === null
    )) {
      afterFinanceSave(() => setError('Enter a valid manual rate and account amount.'));
      return;
    }

    const accountAmount = isCross ? amountToRecord! : value;
    const directHistoricalFx: DirectHistoricalFxSnapshot | undefined =
      isCross && manualDirectSelected && manualDirectRate !== null
        ? { accountCurrencyCode: activeAccount.currencyCode,
            transactionCurrencyCode: amountCurrency, rate: manualDirectRate,
            rateDate: date, source: 'manual' }
        : undefined;
    const crossFields = isCross
      ? { originalAmount: value, originalCurrencyCode: amountCurrency,
          accountFxRate: manualDirectSelected ? manualEffectiveRate! : crossCurrencyPreview!.effectiveAccountRate,
          accountFxSnapshot: manualDirectSelected ? undefined : selectedOriginalFx!,
        }
      : {};

    if (current) {
      const patch: TransactionPatch = {
        type,
        historicalFx: manualDirectSelected ? undefined : selectedFx,
        directHistoricalFx,
        amount: accountAmount,
        accountId: activeAccount.id,
        categoryId: activeCategoryId,
        date,
        note: note.trim(),
        ...crossFields,
        ...(!isCross ? {
          originalAmount: undefined,
          originalCurrencyCode: undefined,
          accountFxRate: undefined,
          accountFxSnapshot: undefined,
        } : {}),
      };
      return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:746",
        formPayload('transaction.edit', current.id, patch, { expectedUpdatedAt: transaction!.updatedAt }),
        () => matchesUniqueRevision(useLedgerStore.getState().transactions, current.id, transaction!.updatedAt) && updateTransaction(current.id, patch),
        () => onClose(), () => setError(t('Could not save the changes.', 'تعذر حفظ التغييرات.')));
    } else {
      const input: NewTransactionInput = {
        type,
        historicalFx: manualDirectSelected ? undefined : selectedFx,
        directHistoricalFx,
        amount: accountAmount,
        accountId: activeAccount.id,
        categoryId: activeCategoryId,
        date,
        note: note.trim() || undefined,
        ...crossFields,
      };
      return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:746",
        formPayload('transaction.create', null, input),
        operationId => addTransaction(input, operationId),
        () => onClose(), () => setError(t('Could not add the transaction.', 'تعذرت إضافة المعاملة.')));
    }

  };

  const requestClose = () => {
    Alert.alert(t('Close without saving?', 'إغلاق دون حفظ؟'), t('Unsaved form changes will be discarded.', 'سيتم تجاهل تغييرات النموذج غير المحفوظة.'), [
      { text: t('Continue editing', 'متابعة التعديل'), style: 'cancel' },
      { text: t('Discard', 'تجاهل'), style: 'destructive', onPress: onClose },
    ]);
  };
  return (
    <>
      <FormModal
        visible={visible}
        title={
          isEditingRefund
            ? t('Refund details', 'تفاصيل الاسترداد')
            : transaction
              ? transaction.type === 'income' ? t('Edit Income Transaction', 'تعديل معاملة دخل') : t('Edit Expense Transaction', 'تعديل معاملة مصروف')
              : initialRefund ? t('Add Refund', 'إضافة استرداد')
              : fixedKind === 'income' ? t('Add Income Transaction', 'إضافة معاملة دخل')
              : fixedKind === 'expense' ? t('Add Expense Transaction', 'إضافة معاملة مصروف')
              : t('Add transaction', 'إضافة معاملة')
        }
        onClose={requestClose}
        onBack={requestClose}
        compactTitle
      >
        <FinanceSubmissionReceipt scope="src/features/finance/components/AddTransactionModal.tsx:746" onCommitted={() => onClose()} />
        {isEditingRefund ? (
          <AppText color="textSecondary">
            {t('Refund records cannot be edited here. Remove the refund and add it again with the correct details.', 'لا يمكن تعديل الاسترداد هنا. احذف الاسترداد وأضفه مرة أخرى بالبيانات الصحيحة.')}
          </AppText>
        ) : entryMode === 'normal' && selectableAccounts.length === 0 ? (
          <AppText color="textSecondary">
            {t('You need at least one account before adding a transaction. Close this and tap \"Account\" first.', 'تحتاج إلى حساب واحد على الأقل قبل إضافة معاملة. أغلق هذه النافذة وأضف حسابًا أولًا.')}
          </AppText>
        ) : (
          <>
                         <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: 10 }}>
               {!fixedKind && !transaction && <View style={fieldColumn}>
                 <AppText variant="label" color="textSecondary">{t('TYPE', 'النوع')}</AppText>
                 <Pressable accessibilityRole="button" accessibilityLabel={t('Transaction type', 'نوع المعاملة')} onPress={() => !transaction && setTypePickerOpen(true)}
                   style={[styles.dropdownButton, { borderColor: '#D6B777', backgroundColor: '#FFFFFF' }]}>
                   <Ionicons name={entryMode === 'refund' ? 'return-down-back-outline' : type === 'income' ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} size={19} color={entryMode === 'refund' ? '#3B82F6' : type === 'income' ? '#10B981' : '#EF4444'} />
                   <AppText style={{ flex: 1 }}>{entryMode === 'refund' ? t('Refund', 'استرداد') : type === 'income' ? t('Income', 'دخل') : t('Expense', 'مصروف')}</AppText>
                   <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                 </Pressable>
               </View>}
               <View style={fieldColumn}>
                 <AppText variant="label" color="textSecondary">{t('ATTACH (OPTIONAL)', 'إرفاق (اختياري)')}</AppText>
                 <Pressable accessibilityRole="button" accessibilityLabel={t('Scan from camera, gallery or PDF', 'المسح بالكاميرا أو المعرض أو PDF')} onPress={() => setAttachPickerOpen(true)}
                   style={[styles.dropdownButton, { borderColor: '#D6B777', backgroundColor: '#FFFFFF' }]}>
                   <Ionicons name="attach-outline" size={19} color={colors.textSecondary} />
                   <AppText style={{ flex: 1 }}>{t('— None', '— لا يوجد')}</AppText>
                   <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                 </Pressable>
               </View>
             </View>
             {scanSource ? <ScanDocumentButton onResult={applyScan} initialSource={scanSource} onFinished={() => setScanSource(null)} /> : null}
{entryMode === 'refund' ? (
              <>
                {refundableTransactions.length === 0 ? (
                  <AppText color="textSecondary">
                    {t('There are no purchases with a refundable balance.', 'لا توجد مشتريات قابلة للاسترداد.')}
                  </AppText>
                ) : (
                  <ChipSelect<string>
                    label={t('ORIGINAL PURCHASE', 'عملية الشراء الأصلية')}
                    options={refundableTransactions.map((item) => ({
                      value: item.transaction.id,
                      label: `${item.transaction.date} · ${item.transaction.note?.trim() || t('Purchase', 'شراء')} · ${formatMoney(item.transaction.originalAmount ?? item.transaction.amount, item.transaction.originalCurrencyCode ?? item.transaction.currencyCode)} ${getCurrencyLabel(item.transaction.originalCurrencyCode ?? item.transaction.currencyCode)}`,
                      color: moduleColors.finance,
                    }))}
                    value={originalTransactionId}
                    onChange={(value) => {
                      setOriginalTransactionId(value);
                      setAmount('');
                      setError(undefined);
                    }}
                  />
                )}

                {selectedOriginal ? (
                  <View style={{ borderWidth: 1, borderColor: '#D6B777', borderRadius: 12, padding: 10, gap: 8 }}>
                    {[
                      [t('Original purchase', 'المصروف الأصلي'), selectedOriginal.transaction.originalAmount ?? selectedOriginal.transaction.amount, selectedOriginal.transaction.originalCurrencyCode ?? selectedOriginal.transaction.currencyCode],
                      [t('Actual debit', 'الخصم الفعلي'), selectedOriginal.transaction.amount, selectedOriginal.transaction.currencyCode],
                      [t('Already refunded', 'المسترد'), selectedOriginal.refundedAmount, selectedOriginal.transaction.originalCurrencyCode ?? selectedOriginal.transaction.currencyCode],
                      [t('Remaining', 'المتبقي'), selectedOriginal.remainingAmount, selectedOriginal.transaction.originalCurrencyCode ?? selectedOriginal.transaction.currencyCode],
                    ].map(([label, value, code], index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 5, borderRadius: 8, backgroundColor: index === 3 ? '#F1E8D6' : undefined }}>
                      <AppText variant="caption" style={{ flex: 1 }}>{label}</AppText>
                      <AppText style={{ fontWeight: '700', color: index === 3 ? '#1E293B' : colors.text }}>{formatMoney(Number(value), String(code))} {code}</AppText>
                    </View>)}
                  </View>
                ) : null}
                {selectedOriginal && originalAccount ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                    <Ionicons name="layers-outline" size={19} color="#B59A5E" />
                    <AppText style={{ flex: 1 }} variant="caption">{originalAccount.name} · {getCurrencyLabel(originalAccount.currencyCode)} · {originalCategory?.name ?? ''}</AppText>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                                 <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: 10 }}>
                   <AccountDropdown label={t('ACCOUNT', 'الحساب')} options={selectableAccounts} value={activeAccountId}
                     containerStyle={stackFields ? { flex: 0 } : undefined}
                     onChange={setAccountId} emptyMessage={t('No accounts', 'لا توجد حسابات')} />
                   <View style={fieldColumn}>
                     <AppText variant="label" color="textSecondary">{t('CATEGORY', 'التصنيف')}</AppText>
                     <Pressable accessibilityRole="button" accessibilityLabel={t('Choose or manage category', 'اختيار أو إدارة التصنيف')} onPress={() => setCategoryPickerOpen(true)}
                       style={[styles.dropdownButton, { borderColor: '#D6B777', backgroundColor: '#FFFFFF' }]}>
                       {kindCategories.find(item => item.id === activeCategoryId) ? <Ionicons name={kindCategories.find(item => item.id === activeCategoryId)!.icon as keyof typeof Ionicons.glyphMap} size={19} color={kindCategories.find(item => item.id === activeCategoryId)!.color} /> : <Ionicons name="pricetag-outline" size={19} color={colors.textSecondary} />}
                       <AppText style={{ flex: 1 }}>{kindCategories.find(item => item.id === activeCategoryId)?.name ?? t('Choose category', 'اختر التصنيف')}</AppText>
                       <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                     </Pressable>
                   </View>
                 </View>
</>
            )}
            <View style={{ flexDirection: entryMode === 'refund' && !stackRefundFields ? 'row' : 'column', gap: 10 }}>
            {entryMode === 'normal' && activeAccount ? (
              <View style={{ flexDirection: stackFields ? 'column' : 'row', alignItems: 'stretch', gap: 10 }}>
                <AppInput
              label={t('Amount', 'المبلغ')}
              containerStyle={fieldColumn}
              fieldStyle={{ minHeight: 52, borderColor: '#D6B777', backgroundColor: '#FFFFFF' }}
              style={{ paddingVertical: 0 }}
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setError(undefined);
              }}
              onBlur={() => {
                const currencyCode = amountCurrencyCode;

                if (!currencyCode || !amount.trim()) return;

                const result = resolveAmountExpression(amount, currencyCode);

                if (result !== null) {
                  setAmount(String(result));
                } else {
                  setError(t('Invalid amount or calculation. Please correct it.', 'المبلغ أو العملية الحسابية غير صالحين. يرجى التصحيح.'));
                }
              }}
              onSubmitEditing={() => {
                const currencyCode = amountCurrencyCode;

                if (!currencyCode || !amount.trim()) return;

                const result = resolveAmountExpression(amount, currencyCode);

                if (result !== null) {
                  setAmount(String(result));
                } else {
                  setError(t('Invalid amount or calculation. Please correct it.', 'المبلغ أو العملية الحسابية غير صالحين. يرجى التصحيح.'));
                }
              }}
              keyboardType="decimal-pad"
              placeholder=""
            />
                <CurrencyDropdown
                  containerStyle={stackFields ? { flex: 0 } : undefined}
                  label={t('CURRENCY', 'العملة')}
                  value={amountCurrencyCode ?? activeAccount.currencyCode}
                  onChange={(value) => {
                    setTransactionCurrency(value);
                    setError(undefined);
                  }}
                />
              </View>
            ) : (
              <AppInput
              containerStyle={entryMode === 'refund' ? refundFieldColumn : undefined}
              label={t('Amount', 'المبلغ')}
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setError(undefined);
              }}
              onBlur={() => {
                const currencyCode = amountCurrencyCode;

                if (!currencyCode || !amount.trim()) return;

                const result = resolveAmountExpression(amount, currencyCode);

                if (result !== null) {
                  setAmount(String(result));
                } else {
                  setError(t('Invalid amount or calculation. Please correct it.', 'المبلغ أو العملية الحسابية غير صالحين. يرجى التصحيح.'));
                }
              }}
              onSubmitEditing={() => {
                const currencyCode = amountCurrencyCode;

                if (!currencyCode || !amount.trim()) return;

                const result = resolveAmountExpression(amount, currencyCode);

                if (result !== null) {
                  setAmount(String(result));
                } else {
                  setError(t('Invalid amount or calculation. Please correct it.', 'المبلغ أو العملية الحسابية غير صالحين. يرجى التصحيح.'));
                }
              }}
              keyboardType="decimal-pad"
              placeholder=""
              leftElement={
                <AppText color="textSecondary">
                  {amountCurrencyCode
                    ? getCurrencyLabel(amountCurrencyCode)
                    : ''}
                </AppText>
              }
            />
            )}

            <View style={entryMode === 'refund' ? refundFieldColumn : undefined}><DateField value={date} onChange={setDate} pickerOnly /></View>
            </View>

            {!isEditingRefund && fxCurrency && !crossCurrencySelected && !(entryMode === 'refund' && selectedOriginal?.transaction.originalCurrencyCode) ? (
              <HistoricalFxField
                currencyCode={fxCurrency}
                transactionDate={date}
                snapshot={selectedFx}
                loading={fxLoading}
                manualMode={fxManualMode}
                manualRate={fxManualRate}
                error={fxError}
                onFetch={fetchFx}
                onManualMode={toggleManualFx}
                onManualRateChange={(value) => {
                  setFxManualRate(value);
                  setFxManualRateKey(fxKey);
                  setFxError(undefined);
                }}
              />
            ) : null}

            {entryMode === 'refund' && selectedOriginal?.transaction.originalCurrencyCode && originalAccount ? (
              <View style={{ gap: 8 }}>
                <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>{t('Historical Exchange Rate', 'سعر الصرف التاريخي')}</AppText>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                  <View style={{ flex: 38, minWidth: 0, gap: 4 }}><AppText variant="caption" color={colors.finance.neutral.accent} align="center" style={{ fontWeight: '700' }}>FROM</AppText><View style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D6B777', backgroundColor: colors.surfaceAlt, borderRadius: 10 }}><AppText numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700' }}>{getCurrencyLabel(originalAccount.currencyCode)}</AppText></View></View>
                  <View style={{ flex: 24, minWidth: 0, gap: 4 }}><AppText variant="caption" color={colors.finance.neutral.accent} align="center" style={{ fontWeight: '700' }}>RATE</AppText><AppInput accessibilityLabel={t('Historical exchange rate', 'سعر الصرف التاريخي')} keyboardType="decimal-pad" value={refundRate} onChangeText={setRefundRate} fieldStyle={{ minHeight: 48, paddingHorizontal: 5, borderColor: '#D6B777' }} style={{ paddingVertical: 0, textAlign: 'center', fontWeight: '700' }} /></View>
                  <View style={{ flex: 38, minWidth: 0, gap: 4 }}><AppText variant="caption" color={colors.finance.neutral.accent} align="center" style={{ fontWeight: '700' }}>TO</AppText><View style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.finance.balance.border, backgroundColor: colors.finance.balance.surface, borderRadius: 10 }}><AppText numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700' }}>{getCurrencyLabel(selectedOriginal.transaction.originalCurrencyCode)}</AppText></View></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}><AppText align="center" style={{ fontWeight: '700' }}>{t('Actual', 'الفعلي')}</AppText><AppInput accessibilityLabel={t('Actual bank credit', 'المبلغ الفعلي المضاف للحساب')} keyboardType="decimal-pad" value={refundCredit} onChangeText={setRefundCredit} rightElement={<AppText variant="caption">{originalAccount.currencyCode}</AppText>} fieldStyle={{ minHeight: 44, paddingHorizontal: 5 }} style={{ paddingVertical: 0, fontWeight: '700' }} /></View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}><AppText align="center" style={{ fontWeight: '700' }}>{t('Recorded', 'المسجل')}</AppText><View style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><AppText numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700' }}>{resolveAmountExpression(refundCredit, originalAccount.currencyCode) === null ? '—' : formatMoney(resolveAmountExpression(refundCredit, originalAccount.currencyCode)!, originalAccount.currencyCode)} {originalAccount.currencyCode}</AppText></View></View>
                </View>
              </View>
            ) : null}
            {crossCurrencySelected && activeAccount && amountCurrencyCode ? (
              <DirectHistoricalFxField
                compact
                accountCurrencyCode={activeAccount.currencyCode}
                transactionCurrencyCode={amountCurrencyCode}
                rate={directHistoricalRate}
                loading={fxLoading || originalFxLoading}
                manualMode={manualDirectSelected}
                manualRate={directFxManualRate}
                transactionDate={date}
                error={manualDirectSelected ? undefined : (fxError || originalFxError)}
                onFetch={() => {
                  if (!activeAccount || !amountCurrencyCode || !isValidISODate(date)) {
                    setError('Select valid currencies and date.');
                    return;
                  }

                  setDirectFxManualMode(false);
                  setDirectFxManualRate('');
                  setDirectFxManualKey(null);
                  const accountRequestId = ++fxRequestId.current;
                  const originalRequestId = ++originalFxRequestId.current;

                  setFxLoading(true);
                  setOriginalFxLoading(true);
                  setFxError(undefined);
                  setOriginalFxError(undefined);
                  setFxRecord(null);
                  setOriginalFxRecord(null);
                  setFxManualMode(false);
                  setOriginalFxManualMode(false);

                  void Promise.all([
                    getHistoricalRate(activeAccount.currencyCode, date),
                    getHistoricalRate(amountCurrencyCode, date),
                  ]).then(([accountResult, originalResult]) => {
                    if (
                      fxRequestId.current !== accountRequestId ||
                      originalFxRequestId.current !== originalRequestId
                    ) return;

                    setFxLoading(false);
                    setOriginalFxLoading(false);

                    if (accountResult.ok) {
                      setFxRecord({ key: fxKey, snapshot: accountResult.snapshot });
                    } else {
                      setFxError(accountResult.reason);
                    }

                    if (originalResult.ok) {
                      setOriginalFxRecord({
                        key: originalFxKey,
                        snapshot: originalResult.snapshot,
                      });
                    } else {
                      setOriginalFxError(originalResult.reason);
                    }
                  });
                }}
                onManualMode={() => {
                  if (manualDirectSelected) {
                    setDirectFxManualMode(false);
                    setDirectFxManualRate('');
                    setDirectFxManualKey(null);
                  } else {
                    fxRequestId.current += 1;
                    originalFxRequestId.current += 1;
                    setFxLoading(false);
                    setOriginalFxLoading(false);
                    setDirectFxManualMode(true);
                    setDirectFxManualRate('');
                    setDirectFxManualKey(directFxKey);
                    setError(undefined);
                  }
                }}
                onManualRateChange={(value) => {
                  setDirectFxManualRate(value);
                  setDirectFxManualKey(directFxKey);
                  setError(undefined);
                }}
              />
            ) : null}
            {crossCurrencySelected && activeAccount ? (
              <View style={{ flexDirection: stackFields ? 'column' : 'row', gap: 6, alignItems: 'stretch' }}>
                <View style={{ flex: stackFields ? 0 : 1, minWidth: 0, gap: 5, alignItems: 'center' }}>
                  <AppText variant="caption" style={{ fontWeight: '700' }}>{t('Estimated', 'التقديري')}</AppText>
                  <View style={{ minHeight: 44, justifyContent: 'center' }}><AppText numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700' }}>{estimatedAccountAmount != null ? formatMoney(estimatedAccountAmount, activeAccount.currencyCode) : '—'} {activeAccount.currencyCode}</AppText></View>
                </View>
                <View style={{ flex: stackFields ? 0 : 1, minWidth: 0, gap: 5 }}>
                  <AppText variant="caption" align="center" style={{ fontWeight: '700' }}>{t('Actual', 'الفعلي')}</AppText>
                  <AppInput containerStyle={{ minWidth: 0 }} fieldStyle={{ minHeight: 44, paddingHorizontal: 5 }} style={{ paddingVertical: 0, fontWeight: '700', fontSize: 14 }}
                    value={actualAccountDebit} onChangeText={(value) => { setActualAccountDebit(value); setError(undefined); }} keyboardType="decimal-pad"
                    accessibilityLabel={t('Actual amount', 'المبلغ الفعلي')} rightElement={<AppText variant="caption">{activeAccount.currencyCode}</AppText>} />
                </View>
                <View style={{ flex: stackFields ? 0 : 1, minWidth: 0, gap: 5, alignItems: 'center' }}>
                  <AppText variant="caption" style={{ fontWeight: '700' }}>{t('Recorded', 'المسجل')}</AppText>
                  <View style={{ minHeight: 44, justifyContent: 'center' }}><AppText numberOfLines={1} adjustsFontSizeToFit style={{ fontWeight: '700' }}>{amountToRecord != null ? formatMoney(amountToRecord, activeAccount.currencyCode) : '—'} {activeAccount.currencyCode}</AppText></View>
                </View>
              </View>
            ) : null}
            <AppInput
              label={t('Note (optional)', 'ملاحظة (اختياري)')}
              value={note}
              onChangeText={setNote}
              placeholder={t('e.g. Fuel', 'مثال: وقود')}
            />

            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}

            <AppButton
              title={
                entryMode === 'refund'
                  ? t('Add refund', 'إضافة استرداد')
                  : transaction
                    ? t('Save changes', 'حفظ التغييرات')
                    : t('Add transaction', 'إضافة معاملة')
              }
              accentColor={'#1E293B'}
              disabled={fxLoading && !isEditingRefund}
              onPress={submit}
              style={{ marginTop: spacing.xs }}
            />
          </>
        )}
      </FormModal>

      {/* Category manager */}
      <Modal
        visible={visible && categoryManagerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryManagerVisible(false)}
      >
        <View style={styles.categoryModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCategoryManagerVisible(false)}
          />

          <View
            style={[
              styles.categoryModalContent,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
            ]}
          >
            <View style={{ marginHorizontal: -20, marginTop: -20 }}><FinanceModalHeader title={t('Edit Categories', 'تعديل التصنيفات')} onClose={() => setCategoryManagerVisible(false)} /></View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categoryManagerList}
            >
              {kindCategories.length === 0 ? (
                <AppText color="textSecondary">
                  {t('No categories yet. Add your first category below.', 'لا توجد تصنيفات بعد. أضف أول تصنيف أدناه.')}
                </AppText>
              ) : (
                kindCategories.map((category) => {
                  const selected = selectedManagerCategoryId === category.id;

                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="button"
                      accessibilityLabel={category.name}
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedManagerCategoryId(category.id)}
                      style={[
                        styles.compactGridTile,
                        {
                          backgroundColor: selected
                            ? colors.surfaceAlt
                            : colors.surface,
                          borderColor: selected
                            ? category.color
                            : colors.border,
                          borderWidth: selected ? 2 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={category.icon as keyof typeof Ionicons.glyphMap}
                        size={23}
                        color={category.color}
                      />
                      <AppText
                        variant="label"
                        color={selected ? category.color : colors.text}
                      >
                        {category.name}
                      </AppText>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            {kindCategories
              .filter((category) => category.id === selectedManagerCategoryId)
              .map((category) => (
                <View key={category.id} style={styles.sharedCategoryActions}>
                  <FinanceActionButtons
                    label={category.name}
                    onEdit={() => openEditCategoryForm(category)}
                    onDelete={() => requestDeleteCategory(category)}
                  />
                </View>
              ))}

            <View style={styles.categoryManagerActions}>
              <Pressable
                onPress={openNewCategoryForm}
                style={[
                  styles.categoryActionButton,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons name="add" size={19} color={colors.onPrimary} />
                <AppText color="onPrimary" variant="label">
                  {t('Add Category', 'إضافة تصنيف')}
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => setCategoryManagerVisible(false)}
                style={[
                  styles.categoryActionButton,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <AppText>{t('Done', 'تم')}</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / edit category form */}
      <Modal
        visible={visible && categoryFormVisible}
        transparent
        animationType="slide"
        onRequestClose={closeCategoryForm}
      >
        <View style={styles.categoryModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeCategoryForm}
          />

          <View
            style={[
              styles.categoryModalContent,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
            ]}
          >
            <View style={{ marginHorizontal: -20, marginTop: -20 }}><FinanceModalHeader title={editingCategory ? t('Edit Category', 'تعديل التصنيف') : t('Add Category', 'إضافة تصنيف')} onClose={closeCategoryForm} /></View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categoryModalScroll}
            >
              <AppText color="textSecondary" variant="label">
                {t('Category name', 'اسم التصنيف')}
              </AppText>

              <TextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder={t('Enter category name', 'أدخل اسم التصنيف')}
                placeholderTextColor={colors.textDisabled}
                maxLength={40}
                style={[
                  styles.categoryNameInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceAlt,
                    borderColor: '#D6B777',
                    borderRadius: radius.md,
                  },
                ]}
              />

              <AppText color="textSecondary" variant="label">
                {t('Choose an icon', 'اختر أيقونة')}
              </AppText>

              <View style={styles.categoryIconGrid}>
                {ICON_OPTIONS.map((icon) => {
                  const selected = newCategoryIcon === icon;

                  return (
                    <Pressable
                      key={icon}
                      onPress={() => setNewCategoryIcon(icon)}
                      style={[
                        styles.categoryIconOption,
                        {
                          backgroundColor: selected
                            ? newCategoryColor
                            : colors.surfaceAlt,
                          borderColor: selected
                            ? newCategoryColor
                            : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={icon as keyof typeof Ionicons.glyphMap}
                        size={22}
                        color={selected ? '#FFFFFF' : colors.text}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <AppText color="textSecondary" variant="label">
                {t('Choose a color', 'اختر لونًا')}
              </AppText>

              <View style={styles.categoryColorGrid}>
                {COLOR_OPTIONS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setNewCategoryColor(color)}
                    style={[
                      styles.categoryColorOption,
                      { backgroundColor: color },
                      newCategoryColor === color &&
                        styles.categorySelectedColor,
                    ]}
                  >
                    {newCategoryColor === color ? (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View style={styles.categoryModalActions}>
                <Pressable
                  onPress={closeCategoryForm}
                  style={[
                    styles.categoryActionButton,
                    { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <AppText>{t('Cancel', 'إلغاء')}</AppText>
                </Pressable>

                <Pressable
                  onPress={saveCategory}
                  style={[
                    styles.categoryActionButton,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <AppText color="onPrimary" variant="label">
                    {editingCategory ? t('Save Changes', 'حفظ التغييرات') : t('Save Category', 'حفظ التصنيف')}
                  </AppText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <FormModal visible={visible && typePickerOpen} title={t('TYPE', 'النوع')} onClose={() => setTypePickerOpen(false)}>
        {(['expense', 'income', 'refund'] as const).map(option => (
          <Pressable key={option} onPress={() => { handleEntryModeChange(option); setTypePickerOpen(false); }} style={[styles.pickerRow, { borderColor: '#D6B777', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Ionicons name={option === 'expense' ? 'arrow-down-circle-outline' : option === 'income' ? 'arrow-up-circle-outline' : 'return-down-back-outline'} size={20} color={option === 'expense' ? '#EF4444' : option === 'income' ? '#10B981' : '#3B82F6'} />
            <AppText>{option === 'expense' ? t('Expense', 'مصروف') : option === 'income' ? t('Income', 'دخل') : t('Refund', 'استرداد')}</AppText>
          </Pressable>
        ))}
      </FormModal>
      <FormModal visible={visible && categoryPickerOpen} title={t('CATEGORY', 'التصنيف')} onClose={() => setCategoryPickerOpen(false)}>
        <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
          {kindCategories.map(category => (
            <Pressable key={category.id} onPress={() => { setCategoryId(category.id); setCategoryPickerOpen(false); }} style={[styles.pickerRow, { borderColor: '#D6B777', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={20} color={category.color} />
              <AppText style={{ flex: 1 }}>{category.name}</AppText>
              {activeCategoryId === category.id ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
          <Pressable onPress={() => { setCategoryPickerOpen(false); openNewCategoryForm(); }} style={[styles.pickerRow, { borderColor: '#D6B777', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <AppText color={colors.primary}>{t('Add New Category', 'إضافة تصنيف جديد')}</AppText>
          </Pressable>
          <Pressable onPress={() => { setCategoryPickerOpen(false); openCategoryManager(); }} style={[styles.pickerRow, { borderColor: '#D6B777', flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Ionicons name="settings-outline" size={20} color={colors.primary} />
            <AppText color={colors.primary}>{t('Manage Categories', 'إدارة التصنيفات')}</AppText>
          </Pressable>
        </ScrollView>
      </FormModal>
      <FormModal visible={visible && attachPickerOpen} title={t('ATTACH (OPTIONAL)', 'إرفاق (اختياري)')} onClose={() => setAttachPickerOpen(false)}>
        {([['camera', t('📷 Camera', '📷 الكاميرا')], ['gallery', t('🖼 Gallery', '🖼 المعرض')], ['file', '📄 PDF']] as const).map(([source, label]) => (
          <Pressable key={source} onPress={() => { setAttachPickerOpen(false); setScanSource(source); }} style={[styles.pickerRow, { borderColor: colors.border }]}>
            <AppText>{label}</AppText>
          </Pressable>
        ))}
        <Pressable onPress={() => { setScanSource(null); setAttachPickerOpen(false); }} style={[styles.pickerRow, { borderColor: colors.border }]}><AppText>{t('— None', '— لا يوجد')}</AppText></Pressable>
      </FormModal>
      <Modal visible={visible && !!confirmUnusedDeleteCategory} transparent animationType="fade" onRequestClose={() => setConfirmUnusedDeleteCategory(null)}>
        <View style={styles.replacementBackdrop}>
          <View style={[styles.replacementCard, { backgroundColor: colors.surface, borderRadius: radius.xl }]}>
            <AppText variant="h2" color="danger">{t('Delete category?', 'حذف التصنيف؟')}</AppText>
            <AppText color="textSecondary">{t('Are you sure you want to delete', 'هل أنت متأكد من حذف')} {'"'}{confirmUnusedDeleteCategory?.name}{'"'}؟</AppText>
            <View style={styles.categoryModalActions}>
              <Pressable style={[styles.categoryActionButton, { backgroundColor: colors.surfaceAlt }]} onPress={() => setConfirmUnusedDeleteCategory(null)}><AppText>{t('Cancel', 'إلغاء')}</AppText></Pressable>
              <Pressable style={[styles.categoryActionButton, { backgroundColor: colors.danger }]} onPress={() => {
                const target = confirmUnusedDeleteCategory;
                if (!target) return;
                return submitFinanceForm("src/features/finance/components/AddTransactionModal.tsx:1613",
                  formPayload('category.delete', target.id, {}), () => deleteCategory(target.id),
                  () => { setConfirmUnusedDeleteCategory(null); if (categoryId === target.id) setCategoryId(''); },
                  () => Alert.alert(t('Could not delete category', 'تعذر حذف التصنيف'), t('Please try again.', 'حاول مرة أخرى.')));
  }}><AppText color="onPrimary">{t('Delete', 'حذف')}</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </>
  );
}

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pass a transaction to edit it, or null/undefined to add a new one. */
  transaction?: Transaction | null;
  fixedKind?: TransactionType;
  initialRefund?: boolean;
}

const styles = StyleSheet.create({
  dropdownButton: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickerRow: { minHeight: 48, paddingVertical: 12, borderBottomWidth: 1 },
  compactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactGridTile: {
    width: '31%',
    minHeight: 72,
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  addCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  categoryModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  categoryModalContent: {
    maxHeight: '90%',
    padding: 20,
    gap: 14,
  },
  categoryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryModalScroll: {
    gap: 13,
    paddingBottom: 12,
  },
  categoryManagerList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 8,
  },
  sharedCategoryActions: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  categoryManagerRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    gap: 9,
  },
  categoryManagerIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryManagerInfo: {
    flex: 1,
    gap: 3,
  },
  categoryNameInput: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  categoryIconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  categoryIconOption: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  categoryColorOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySelectedColor: {
    borderWidth: 3,
    borderColor: '#1F2937',
  },
  categoryModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  categoryManagerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  categoryActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  replacementBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  replacementCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    padding: 20,
    gap: 14,
  },
  replacementList: {
    flexGrow: 0,
    maxHeight: 280,
  },
  replacementRow: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 11,
    padding: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
