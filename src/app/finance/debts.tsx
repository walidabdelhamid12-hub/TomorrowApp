import { allowsLegacyDebtFx, buildDebtPaymentFx } from '@/features/finance/utils/debtPaymentFx';
import { DirectHistoricalFxField } from '@/features/finance/components/DirectHistoricalFxField';
import { AccountDropdown } from '@/features/finance/components/AccountDropdown';
import { FormModal } from '@/features/finance/components/FormModal';
import { shouldStackFinanceFields } from '@/features/finance/utils/formLayout';
import { formPayload, submitFinanceForm } from "@/features/finance/components/explicitFinanceForm";
import { acknowledgedFinanceHandler, afterFinanceSave } from '@/features/finance/components/acknowledgedFinanceHandler';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { FinanceDateField } from '@/features/finance/components/FinanceDateField';
import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { editLinkedPayment, postLinkedPayment, reverseLinkedPayment } from '@/features/finance/store/paymentOperations';

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    PanResponder,
    Pressable,
    StyleSheet,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { AddDebtModal } from '@/features/finance/components/AddDebtModal';
import { DEFAULT_CATEGORIES } from '@/features/finance/constants/defaultCategories';
import {
    useFinanceHydrated,
    useFinanceStore,
} from '@/features/finance/store/useFinanceStore';
import {
    useLedgerHydrated,
    useLedgerStore,
} from '@/features/finance/store/useLedgerStore';
import type {
    Debt,
    DebtDirection,
    DebtPayment,
    NewDebtInput,
} from '@/features/finance/types/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getDebtPaid, getDebtRemaining, roundMoney } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { focusLinkedRecords } from '@/features/finance/utils/transactionNavigation';
import { moduleColors, useTheme } from '@/theme';

type DebtTab = 'receivable' | 'payable';

const getTodayDate = (): string => {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
};

const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const getPaidAmount = getDebtPaid;
const getRemainingAmount = getDebtRemaining;

const getRemainingExcludingPayment = (debt: Debt, paymentId: string) =>
  getDebtRemaining({
    ...debt,
    payments: debt.payments.filter((payment) => payment.id !== paymentId),
  });

const formatDate = (value?: string) => {
  if (!value) return 'No due date';

  const parts = value.split('-');

  if (parts.length !== 3) return value;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export default function DebtsScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const params = useLocalSearchParams<{ direction?: string; debtId?: string }>();
  const { colors } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();

  const financeReady = useFinanceHydrated();
  const ledgerReady = useLedgerHydrated();
  const ready = financeReady && ledgerReady;

  const debts = useFinanceStore((state) => state.debts);
  const addDebt = useFinanceStore((state) => state.addDebt);
  const updateDebt = useFinanceStore((state) => state.updateDebt);
  const deleteDebt = useFinanceStore((state) => state.deleteDebt);

  const accounts = useLedgerStore((state) => state.accounts);
  const categories = useLedgerStore((state) => state.categories);
  const transactions = useLedgerStore((state) => state.transactions);

  const [activeTab, setActiveTab] = useState<DebtTab>(
    params.direction === 'payable' ? 'payable' : 'receivable',
  );

  const [debtModalVisible, setDebtModalVisible] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);

  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDate());
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentFxRate, setPaymentFxRate] = useState('');
  const [paymentActual, setPaymentActual] = useState('');

  const [editingPayment, setEditingPayment] = useState<{
    debt: Debt;
    payment: DebtPayment;
  } | null>(null);

  const [detailDebtId, setDetailDebtId] = useState<string | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const detailDebt = debts.filter(d => d.id === detailDebtId).length === 1 ? debts.find(d => d.id === detailDebtId) : undefined;
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 60 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) setActiveTab(g.dx < 0 ? 'payable' : 'receivable'); },
  }), []);
  const linkedDebt = params.debtId === undefined ? undefined : focusLinkedRecords(debts, params.debtId)[0];
  const linkedDebtId = linkedDebt?.id;
  const linkedDebtDirection = linkedDebt?.direction;
  const linkedDebtContext = linkedDebtId && linkedDebtDirection
    ? JSON.stringify([linkedDebtId, linkedDebtDirection]) : null;
  const [loadedLinkedDebtContext, setLoadedLinkedDebtContext] = useState<string | null>(null);
  if (loadedLinkedDebtContext !== linkedDebtContext) {
    setLoadedLinkedDebtContext(linkedDebtContext);
    if (linkedDebtId && linkedDebtDirection) setActiveTab(linkedDebtDirection);
  }

  const visibleDebts = useMemo(
    () =>
      focusLinkedRecords(debts, params.debtId)
        .filter((debt) => debt.direction === activeTab)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [debts, activeTab, params.debtId],
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts],
  );

  const currencyTotals = useMemo(() => {
    const totals = new Map<
      string,
      { total: number; paid: number; remaining: number }
    >();

    visibleDebts.forEach((debt) => {
      const current = totals.get(debt.currencyCode) ?? {
        total: 0,
        paid: 0,
        remaining: 0,
      };

      current.total += debt.amount;
      current.paid += getPaidAmount(debt);
      current.remaining += getRemainingAmount(debt);

      totals.set(debt.currencyCode, current);
    });

    return Array.from(totals.entries())
      .map(([currencyCode, values]) => ({
        currencyCode,
        total: roundMoney(values.total),
        paid: roundMoney(values.paid),
        remaining: roundMoney(values.remaining),
      }))
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));
  }, [visibleDebts]);

  const openAddDebt = () => {
    setEditingDebt(null);
    setDebtModalVisible(true);
  };

  const openEditDebt = (debt: Debt) => {
    setEditingDebt(debt);
    setDebtModalVisible(true);
  };

  const closeDebtModal = () => {
    setDebtModalVisible(false);
    setEditingDebt(null);
  };

  const handleSaveDebt = (data: NewDebtInput) => {
    const targetId = editingDebt?.id ?? null;
    const expectedUpdatedAt = editingDebt?.updatedAt;
    return submitFinanceForm("src/app/finance/debts.tsx:239", formPayload(targetId ? 'debt.edit' : 'debt.create', targetId, data, { expectedUpdatedAt }),
      () => {
        if (!targetId) return addDebt(data) || null;
        const matches = useFinanceStore.getState().debts.filter(item => item.id === targetId);
        if (matches.length !== 1 || matches[0].updatedAt !== expectedUpdatedAt || data.amount < getPaidAmount(matches[0])) return false;
        return updateDebt(targetId, data);
      }, result => {
        const id = targetId ?? (typeof result === 'string' ? result : null);
        if (id && useFinanceStore.getState().debts.filter(item => item.id === id).length === 1) closeDebtModal();
        else Alert.alert(t('Previously saved debt is no longer present', 'الدين المحفوظ سابقًا غير موجود'), t('Prepare a new independent operation in this form to create a new debt. Nothing was created by this attempt.', 'جهز عملية مستقلة جديدة في هذا النموذج لإنشاء دين جديد. لم يتم إنشاء دين بهذه المحاولة.'));
      }, () => Alert.alert(t('Debt not saved', 'لم يُحفظ الدين'), t('Review the debt and existing payments.', 'راجع الدين والدفعات المسجلة.')));
  };

  const confirmDeleteDebt = (debt: Debt) => {
    const hasPayments = debt.payments.length > 0;

    const message = hasPayments
      ? 'This debt already has recorded payments. Deleting it could leave linked account transactions behind. Please keep it and edit its details instead.'
      : 'Are you sure you want to delete this debt?';

    if (hasPayments) {
      Alert.alert(t('Cannot delete debt', 'تعذر حذف الدين'), message);
      return;
    }

    const performDelete = () => acknowledgedFinanceHandler("src/app/finance/debts.tsx:277", () => undefined, {
      payload: { operation: 'deleteDebt', targetId: debt.id },
      mutate: () => deleteDebt(debt.id),
      onCommitted: result => { if (result !== true) Alert.alert(t('Cannot delete debt', 'تعذر حذف الدين'), t('The debt may have payment history or linked account transactions, or its accounting data is not ready. Keep it to preserve its history.', 'قد يحتوي الدين على دفعات أو معاملات مرتبطة، أو تكون البيانات المحاسبية غير جاهزة. احتفظ به للحفاظ على السجل.')); },
    })();

    confirm('Delete debt?', message, performDelete, 'Delete');
  };

  const openPayment = (debt: Debt) => {
    const remaining = getRemainingAmount(debt);

    if (remaining <= 0) {
      Alert.alert(t('Settled', 'تم السداد'), t('This debt has already been fully settled.', 'تم سداد هذا الدين بالكامل بالفعل.'));
      return;
    }

    const matchingAccounts = activeAccounts.filter(
      (account) => account.currencyCode === debt.currencyCode,
    );

    const crossAllowed = allowsLegacyDebtFx(useFinanceStore.getState(), useLedgerStore.getState());
    if (activeAccounts.length === 0 || (!crossAllowed && matchingAccounts.length === 0)) {
      Alert.alert(
        t('No matching account', 'لا يوجد حساب مطابق'),
        `You need an active account in ${debt.currencyCode} to record this ${debt.direction === 'receivable' ? 'collection' : 'payment'}.`,
      );
      return;
    }

    setPaymentDebt(debt);
    setPaymentAmount(String(remaining));
    setPaymentNote('');
    setPaymentDate(getTodayDate());
    setPaymentAccountId(matchingAccounts[0]?.id ?? '');
    setPaymentFxRate(''); setPaymentActual('');
  };

  const closePayment = () => {
    setPaymentDebt(null);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentDate(getTodayDate());
    setPaymentAccountId(''); setPaymentFxRate(''); setPaymentActual('');
  };

  const handleConfirmPayment = () => {
    if (!paymentDebt) return;

    if (!hasValidCurrencyPrecision(paymentAmount, paymentDebt.currencyCode)) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صحيحة'), paymentDebt.currencyCode + t(' allows up to ', ' تسمح حتى ') + getCurrencyDecimals(paymentDebt.currencyCode) + t(' decimal places. Please correct the amount before saving.', ' منازل عشرية. صحح المبلغ قبل الحفظ.')));
      return;
    }
    const parsedAmount = parseAmount(paymentAmount);
    const amount = parsedAmount === null ? null : roundMoney(parsedAmount);

    if (amount === null || amount <= 0) {
      afterFinanceSave(() => Alert.alert(t(t('Invalid amount', 'مبلغ غير صالح'), 'مبلغ غير صحيح'), t('Enter an amount greater than zero.', 'أدخل مبلغًا أكبر من صفر.')));
      return;
    }

    const cleanPaymentDate = paymentDate.trim();

    if (!isValidDate(cleanPaymentDate)) {
      afterFinanceSave(() => Alert.alert(
        t('Invalid date', 'تاريخ غير صالح'),
        'Please select a valid date using the calendar.',
      ));
      return;
    }

    const remaining = getRemainingAmount(paymentDebt);

    if (amount > remaining) {
      afterFinanceSave(() => Alert.alert(
        t('Amount too large', 'المبلغ كبير جدًا'),
        `The remaining amount is ${formatAmount(remaining, paymentDebt.currencyCode)} ${paymentDebt.currencyCode}.`,
      ));
      return;
    }

    const account = activeAccounts.find(
      (item) => item.id === paymentAccountId,
    );

    if (!account) {
      afterFinanceSave(() => Alert.alert(t('Select account', 'اختر حسابًا'), t('Choose an active account.', 'اختر حسابًا نشطًا.')));
      return;
    }

    const crossDebt = account.currencyCode !== paymentDebt.currencyCode;
    const actual = parseAmount(paymentActual), quotedRate = parseAmount(paymentFxRate);
    const debtFx = crossDebt && actual !== null && quotedRate !== null ? { actualAmount: actual, quotedRate } : undefined;
    if (crossDebt && (!allowsLegacyDebtFx(useFinanceStore.getState(), useLedgerStore.getState()) || !debtFx
      || !hasValidCurrencyPrecision(paymentActual, account.currencyCode)
      || !buildDebtPaymentFx(amount, paymentDebt.currencyCode, account.currencyCode, cleanPaymentDate, debtFx))) {
      afterFinanceSave(() => Alert.alert(t('Invalid exchange details', 'بيانات الصرف غير صحيحة'), t('Enter the quoted rate and confirm the actual account amount.', 'أدخل سعر الصرف وأكد المبلغ الفعلي للحساب.')));
      return;
    }

    const categoryKind =
      paymentDebt.direction === 'receivable' ? 'income' : 'expense';

    const preferredCategoryId =
      paymentDebt.direction === 'receivable'
        ? 'cat_other_in'
        : 'cat_other_out';

    const category =
      categories.find(
        (item) =>
          item.id === preferredCategoryId &&
          item.kind === categoryKind,
      ) ??
      categories.find((item) => item.kind === categoryKind) ??
      DEFAULT_CATEGORIES.find(
        (item) =>
          item.id === preferredCategoryId &&
          item.kind === categoryKind,
      );

    if (!category) {
      afterFinanceSave(() => Alert.alert(
        t('Missing category', 'التصنيف مطلوب'),
        `No ${categoryKind} category is available. Please add one before recording this operation.`,
      ));
      return;
    }

    const input = { entityType: 'debt' as const, entityId: paymentDebt.id,
      amount, date: cleanPaymentDate, note: paymentNote.trim() || undefined,
      accountId: account.id, categoryId: category.id, ...(debtFx ? { debtFx } : {}) };
    return submitFinanceForm("src/app/finance/debts.tsx:321", formPayload('debt.payment.create', paymentDebt.id, input, { currencyCode: paymentDebt.currencyCode }),
      () => {
        const result = postLinkedPayment(input);
        if (!result.ok) { afterFinanceSave(() => Alert.alert(t('Payment not saved', 'لم يُحفظ السداد'), result.reason)); return false; }
        return true;
      }, () => { closePayment(); Alert.alert(t('Saved', 'تم الحفظ'), paymentDebt.direction === 'receivable'
        ? 'The collection was recorded and added to the selected account.' : 'The payment was recorded and deducted from the selected account.'); }, () => {});
  };

  const openEditPayment = (
    debt: Debt,
    payment: DebtPayment,
  ) => {
    setEditingPayment({ debt, payment });
  };

  const confirmDeletePayment = (debt: Debt, payment: DebtPayment) => {
    const ref = { entityType: 'debt' as const, entityId: debt.id, paymentId: payment.id };
    const performDelete = () => acknowledgedFinanceHandler("src/app/finance/debts.tsx:425", () => undefined, {
      payload: { operation: 'reverseLinkedPayment', ...ref },
      mutate: () => reverseLinkedPayment(ref),
      onCommitted: value => {
        const result = value as ReturnType<typeof reverseLinkedPayment>;
        if (!result.ok) { Alert.alert(t('Cannot delete payment', 'تعذر حذف السداد'), result.reason); return; }
        Alert.alert(t('Deleted', 'تم الحذف'), t('The payment and its linked account transaction were deleted.', 'تم حذف الدفعة ومعاملة الحساب المرتبطة بها.'));
      },
    })();

    const message =
      `Delete this ${debt.direction === 'receivable' ? 'collection' : 'payment'} of ` +
      `${formatAmount(payment.amount, debt.currencyCode)} ${debt.currencyCode}? The linked account balance will be reversed.`;

    confirm('Delete payment?', message, performDelete, 'Delete');
  };

  const closeEditPayment = () => {
    setEditingPayment(null);
  };

  const handleSavePaymentEdit = (
    amountText: string,
    date: string,
    note: string,
    fxRate?: string, fxActual?: string,
  ) => {
    if (!editingPayment) return;

    const { debt, payment } = editingPayment;
    if (!hasValidCurrencyPrecision(amountText, debt.currencyCode)) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صحيحة'), debt.currencyCode + t(' allows up to ', ' تسمح حتى ') + getCurrencyDecimals(debt.currencyCode) + t(' decimal places. Please correct the amount before saving.', ' منازل عشرية. صحح المبلغ قبل الحفظ.')));
      return;
    }
    const parsedAmount = parseAmount(amountText);
    const amount = parsedAmount === null ? null : roundMoney(parsedAmount);
    const cleanDate = date.trim();

    if (amount === null || amount <= 0) {
      afterFinanceSave(() => Alert.alert(t(t('Invalid amount', 'مبلغ غير صالح'), 'مبلغ غير صحيح'), t('Enter an amount greater than zero.', 'أدخل مبلغًا أكبر من صفر.')));
      return;
    }

    if (!isValidDate(cleanDate)) {
      afterFinanceSave(() => Alert.alert(t(t('Invalid date', 'تاريخ غير صالح'), 'تاريخ غير صحيح'), t('Please enter a valid date in YYYY-MM-DD format.', 'أدخل تاريخًا صحيحًا بصيغة YYYY-MM-DD.')));
      return;
    }

    // Calculate the maximum using the shared debt-balance rule,
    // excluding the payment currently being edited.
    const maximumAllowed = getRemainingExcludingPayment(debt, payment.id);

    if (amount > maximumAllowed) {
      afterFinanceSave(() => Alert.alert(
        t('Amount too large', 'المبلغ كبير جدًا'),
        `The maximum allowed for this payment is ${formatAmount(maximumAllowed, debt.currencyCode)} ${debt.currencyCode}.`,
      ));
      return;
    }

    const ref = { entityType: 'debt' as const, entityId: debt.id, paymentId: payment.id };
    const chosen = useLedgerStore.getState().accounts.find(a => a.id === payment.accountId);
    const crossDebt = chosen && chosen.currencyCode !== debt.currencyCode;
    const quote = fxRate === undefined ? null : parseAmount(fxRate), actual = fxActual === undefined ? null : parseAmount(fxActual);
    const debtFx = crossDebt && quote !== null && actual !== null ? {actualAmount: actual, quotedRate: quote} : undefined;
    if (crossDebt && (!debtFx || !buildDebtPaymentFx(amount, debt.currencyCode, chosen.currencyCode, cleanDate, debtFx))) {
      afterFinanceSave(() => Alert.alert(t('Invalid exchange details', 'بيانات الصرف غير صحيحة'), t('Confirm the actual amount and rate.', 'أكد المبلغ الفعلي وسعر الصرف.'))); return;
    }
    const patch = { amount, date: cleanDate, note: note.trim() || undefined, ...(debtFx ? {debtFx} : {}) };
    return submitFinanceForm("src/app/finance/debts.tsx:442", formPayload('debt.payment.edit', debt.id, patch, { paymentId: payment.id, currencyCode: debt.currencyCode }),
      () => {
        const result = editLinkedPayment(ref, patch);
        if (!result.ok) { afterFinanceSave(() => Alert.alert(t('Update failed', 'فشل التحديث'), result.reason)); return false; }
        return true;
      }, () => { setEditingPayment(null); Alert.alert(t('Updated', 'تم التحديث'), 'The payment and its linked account transaction were updated.'); }, () => {});
  };

  const getStatus = (debt: Debt) => {
    const remaining = getRemainingAmount(debt);

    if (remaining <= 0) {
      return {
        label: 'Settled',
        color: '#059669',
        background: '#D1FAE5',
      };
    }

    if (getPaidAmount(debt) > 0) {
      return {
        label: 'Partial',
        color: '#D97706',
        background: '#FEF3C7',
      };
    }

    return {
      label: 'Open',
      color: '#64748B',
      background: '#F1F5F9',
    };
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
      <View {...swipe.panHandlers}>
      <View style={financeChrome.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("Go back", "رجوع")}
          style={financeChrome.back}
        >
          <Ionicons name="arrow-back" size={23} color="#D6B777" />
        </Pressable>

        <View style={styles.headerText}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{t("Debts", "الديون")}</AppText>
          <AppText variant="caption" style={{ color: '#CBD5E1' }}>
            {t("Manage money owed to you and money you owe", "إدارة الأموال المستحقة لك والأموال المستحقة عليك")}
          </AppText>
        </View>
      </View>

      {params.debtId !== undefined && (
        <Card variant="filled">
          <AppText>{visibleDebts.length ? t('Showing the debt linked to your transaction.', 'يعرض الدين المرتبط بمعاملتك.') : t('The linked debt is unavailable in this tab. No other debt has been selected.', 'الدين المرتبط غير متاح في هذا التبويب. لم يتم اختيار أي دين آخر.')}</AppText>
          <AppButton title={t("View all debts", "عرض كل الديون")} variant="ghost" onPress={() => router.replace('/finance/debts')} />
        </Card>
      )}
      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'receivable' }} onPress={() => setActiveTab('receivable')}
          style={[
            styles.tab,
            activeTab === 'receivable' && styles.receivableTabActive,
          ]}
        >
          <Ionicons
            name="arrow-down-circle-outline"
            size={18}
            color={activeTab === 'receivable' ? '#059669' : colors.textSecondary}
          />
          <AppText
            style={[
              styles.tabText,
              activeTab === 'receivable' && { color: '#059669' },
            ]}
          >
            {t("Receivable", "مستحق لي")}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'payable' }} onPress={() => setActiveTab('payable')}
          style={[
            styles.tab,
            activeTab === 'payable' && styles.payableTabActive,
          ]}
        >
          <Ionicons
            name="arrow-up-circle-outline"
            size={18}
            color={activeTab === 'payable' ? '#DC2626' : colors.textSecondary}
          />
          <AppText
            style={[
              styles.tabText,
              activeTab === 'payable' && { color: '#DC2626' },
            ]}
          >
            {t("Payable", "مستحق عليّ")}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        {([
          { label: t('Total', 'الإجمالي'), key: 'total' as const, color: colors.text },
          { label: activeTab === 'receivable' ? t('Collected', 'المحصّل') : t('Paid', 'المدفوع'), key: 'paid' as const, color: activeTab === 'receivable' ? '#059669' : '#DC2626' },
          { label: t('Remaining', 'المتبقي'), key: 'remaining' as const, color: activeTab === 'receivable' ? '#059669' : '#DC2626' },
        ]).map(metric => (
          <Card key={metric.key} style={styles.summaryCard}>
            <AppText variant="caption" color="textSecondary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{metric.label}</AppText>
            {(currencyTotals.length ? currencyTotals : [{ currencyCode: '', total: 0, paid: 0, remaining: 0 }]).map(item => (
              <View key={item.currencyCode} style={styles.summaryCurrency}>
                <AppText style={[styles.summaryAmount, { color: metric.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {formatAmount(item[metric.key], item.currencyCode)}
                </AppText>
                {item.currencyCode ? <AppText variant="caption" color="textSecondary" numberOfLines={1}>{item.currencyCode}</AppText> : null}
              </View>
            ))}
          </Card>
        ))}
      </View>

      <AppButton
        title={activeTab === 'receivable' ? t('Add receivable', 'إضافة مستحق لنا') : t('Add payable', 'إضافة مستحق علينا')}
        leftIcon={<Ionicons name="add" size={20} color="#fff" />}
        onPress={openAddDebt}
      />

      <View style={styles.sectionHeader}>
        <AppText variant="h2">
          {activeTab === 'receivable' ? t('Money owed to you', 'أموال مستحقة لك') : t('Money you owe', 'أموال مستحقة عليك')}
        </AppText>

        <AppText variant="caption" color="textSecondary">
          {visibleDebts.length}{' '}
          {visibleDebts.length === 1 ? t('record', 'سجل') : t('records', 'سجلات')}
        </AppText>
      </View>

      {visibleDebts.length === 0 ? (
        <Card variant="filled">
          <View style={styles.emptyState}>
            <Ionicons
              name="wallet-outline"
              size={34}
              color={colors.textSecondary}
            />
            <AppText color="textSecondary" align="center">
              {activeTab === 'receivable'
                ? t('No receivables yet. Add money someone owes you.', 'لا توجد مستحقات لك بعد. أضف مبلغًا مستحقًا لك.')
                : t('No payables yet. Add money you owe someone.', 'لا توجد مستحقات عليك بعد. أضف مبلغًا مستحقًا عليك.')}
            </AppText>
          </View>
        </Card>
      ) : (
        visibleDebts.map((debt) => {
          const paid = getPaidAmount(debt);
          const remaining = getRemainingAmount(debt);
          const status = getStatus(debt);
          const expanded = expandedDebtId === debt.id;

          return (
            <Card key={debt.id} style={styles.debtCard}>
              <Pressable
                onPress={() =>
                  setDetailDebtId(debt.id)
                }
                accessibilityRole="button" accessibilityLabel={t('Details for', 'تفاصيل') + ' ' + debt.personName}
                style={styles.debtMain}
              >
                <View style={styles.debtTopRow}>
                  <View style={styles.debtNameContainer}>
                    <AppText style={styles.personName}>
                      {debt.personName}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {formatDate(debt.date)}
                      {debt.dueDate ? ` · ${t('Due', 'الاستحقاق')} ${formatDate(debt.dueDate)}` : ''}
                    </AppText>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: status.background },
                    ]}
                  >
                    <AppText
                      style={[styles.statusText, { color: status.color }]}
                    >
                      {status.label === 'Settled' ? t('Settled', 'تمت التسوية') : status.label === 'Partial' ? t('Partial', 'جزئي') : t('Open', 'مفتوح')}
                    </AppText>
                  </View>
                </View>

                <View style={styles.amountRow}>
                  <View style={styles.amountColumn}>
                    <AppText variant="caption" color="textSecondary">
                      {t("Remaining", "المتبقي")}
                    </AppText>
                    <AppText style={styles.remainingAmount}>
                      {formatAmount(remaining, debt.currencyCode)} {debt.currencyCode}
                    </AppText>
                  </View>

                  <View style={styles.amountColumnRight}>
                    <AppText variant="caption" color="textSecondary">
                      {t("Original", "الأصلي")}
                    </AppText>
                    <AppText style={styles.originalAmount}>
                      {formatAmount(debt.amount, debt.currencyCode)} {debt.currencyCode}
                    </AppText>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${
                          debt.amount > 0
                            ? Math.min(100, (paid / debt.amount) * 100)
                            : 0
                        }%`,
                        backgroundColor:
                          activeTab === 'receivable' ? '#059669' : '#DC2626',
                      },
                    ]}
                  />
                </View>

                <View style={styles.progressLabels}>
                  <AppText variant="caption" color="textSecondary">
                    {t('Paid / collected', 'المدفوع / المحصّل')}: {formatAmount(paid, debt.currencyCode)}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">{t("Details", "التفاصيل")}</AppText>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={(expanded ? t('Hide', 'إخفاء') : t('Show', 'إظهار')) + ' ' + t('payment history for', 'سجل الدفعات لـ') + ' ' + debt.personName}
                accessibilityState={{ expanded }}
                onPress={() => setExpandedDebtId(expanded ? null : debt.id)}
                style={styles.historyToggle}
              >
                <AppText variant="caption" color="textSecondary">
                  {t('Payment history', 'سجل الدفعات')} ({debt.payments.length})
                </AppText>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textSecondary} />
              </Pressable>
              {expanded && (
                <View style={styles.quickHistory}>
                  {debt.payments.length === 0 ? (
                    <AppText variant="caption" color="textSecondary">{t("No payments recorded yet.", "لا توجد دفعات مسجلة بعد.")}</AppText>
                  ) : debt.payments.map(payment => (
                    <View key={payment.id} style={styles.quickPayment}>
                      <View style={styles.quickPaymentRow}>
                        <AppText style={styles.paymentDate}>{formatDate(payment.date)}</AppText>
                        <AppText style={styles.paymentAmount}>{formatAmount(payment.amount, debt.currencyCode)} {debt.currencyCode}</AppText>
                      </View>
                      <FinanceActionButtons
                        label={'payment dated ' + formatDate(payment.date)}
                        onEdit={() => openEditPayment(debt, payment)}
                        onDelete={() => confirmDeletePayment(debt, payment)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Card>
          );
        })
      )}

      <AddDebtModal
        visible={debtModalVisible}
        direction={activeTab as DebtDirection}
        debt={editingDebt}
        currencyLocked={!!editingDebt && (!ready
          || (debts.find(debt => debt.id === editingDebt.id)?.payments ?? []).length > 0
          || transactions.some(transaction => transaction.linkedEntityId === editingDebt.id))}
        onClose={closeDebtModal}
        onSave={handleSaveDebt}
      />

      <ModalPayment
        visible={paymentDebt !== null}
        debt={paymentDebt}
        amount={paymentAmount}
        note={paymentNote}
        date={paymentDate}
        accountId={paymentAccountId}
        accounts={activeAccounts.filter(account => account.currencyCode === paymentDebt?.currencyCode || allowsLegacyDebtFx(useFinanceStore.getState(), useLedgerStore.getState()))}
        rate={paymentFxRate} actual={paymentActual} onRateChange={setPaymentFxRate} onActualChange={setPaymentActual}
        onAmountChange={value => { setPaymentAmount(value); setPaymentActual(''); }}
        onNoteChange={setPaymentNote}
        onDateChange={value => { setPaymentDate(value); setPaymentFxRate(''); setPaymentActual(''); }}
        onAccountChange={value => { setPaymentAccountId(value); setPaymentFxRate(''); setPaymentActual(''); }}
        onClose={closePayment}
        onConfirm={handleConfirmPayment}
      />

      <ModalEditPayment
        visible={editingPayment !== null}
        debt={editingPayment?.debt ?? null}
        payment={editingPayment?.payment ?? null}
        onClose={closeEditPayment}
        onSave={handleSavePaymentEdit}
      />
      <FinanceDetailsModal
        compact
        title={detailDebtId === null ? undefined : detailDebt?.personName ?? t('Debt unavailable', 'الدين غير متاح')}
        subtitle={detailDebt ? t('Debt recorded on ', 'تاريخ تسجيل الدين: ') + formatDate(detailDebt.date) : undefined}
        onClose={() => setDetailDebtId(null)}
        metrics={detailDebt ? [
          { label: 'Remaining', value: formatAmount(getRemainingAmount(detailDebt), detailDebt.currencyCode) + ' ' + detailDebt.currencyCode },
          { label: 'Original', value: formatAmount(detailDebt.amount, detailDebt.currencyCode) + ' ' + detailDebt.currencyCode },
          { label: 'Paid / collected', value: formatAmount(getPaidAmount(detailDebt), detailDebt.currencyCode) + ' ' + detailDebt.currencyCode },
          { label: 'Type', value: detailDebt.direction === 'receivable' ? 'Receivable' : 'Payable' },
        ] : []}
        lines={detailDebt ? [...(detailDebt.dueDate ? ['Due: ' + formatDate(detailDebt.dueDate)] : []), ...(detailDebt.notes?.trim() ? ['Notes: ' + detailDebt.notes.trim()] : [])] : ['No unique debt is available.']}
      >
        {detailDebt && (
          <View style={{ gap: 12, paddingTop: 8 }}>
            {detailDebt.payments.length > 0 && (
              <View style={styles.paymentHistory}>
                <AppText style={styles.historyTitle}>{t("Payment history", "سجل الدفعات")}</AppText>
                {detailDebt.payments.map(payment => (
                  <View key={payment.id} style={styles.paymentRow}>
                    <View style={styles.paymentInfo}>
                      <AppText style={styles.paymentDate}>{formatDate(payment.date)}</AppText>
                      {payment.note ? <AppText variant="caption" color="textSecondary">{payment.note}</AppText> : null}
                    </View>
                    <View style={styles.paymentActions}>
                      <AppText style={styles.paymentAmount}>{formatAmount(payment.amount, detailDebt.currencyCode)} {detailDebt.currencyCode}</AppText>
                      <FinanceActionButtons label={'payment dated ' + formatDate(payment.date)}
                        onEdit={() => { setDetailDebtId(null); openEditPayment(detailDebt, payment); }}
                        onDelete={() => confirmDeletePayment(detailDebt, payment)} />
                    </View>
                  </View>
                ))}
              </View>
            )}
            {getRemainingAmount(detailDebt) > 0 && (
              <Pressable accessibilityRole="button"
                onPress={() => { setDetailDebtId(null); openPayment(detailDebt); }}
                style={[styles.primaryAction, { backgroundColor: detailDebt.direction === 'receivable' ? '#059669' : '#DC2626' }]}>
                <Ionicons name={detailDebt.direction === 'receivable' ? 'download-outline' : 'card-outline'} size={17} color="#fff" />
                <AppText style={styles.primaryActionText}>{detailDebt.direction === 'receivable' ? t('Record collection', 'تسجيل التحصيل') : t('Record payment', 'تسجيل السداد')}</AppText>
              </Pressable>
            )}
            <FinanceActionButtons label={detailDebt.personName}
              onEdit={() => { setDetailDebtId(null); openEditDebt(detailDebt); }}
              onDelete={() => confirmDeleteDebt(detailDebt)} />
          </View>
        )}
      </FinanceDetailsModal>
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Record payment modal                                                       */
/* -------------------------------------------------------------------------- */

interface ModalPaymentProps {
  visible: boolean;
  debt: Debt | null;
  amount: string;
  note: string;
  date: string;
  accountId: string;
  rate: string; actual: string; onRateChange: (value:string)=>void; onActualChange: (value:string)=>void;
  accounts: ReturnType<typeof useLedgerStore.getState>['accounts'];
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

function ModalPayment({
  visible,
  debt,
  amount,
  note,
  date,
  accountId,
  accounts, rate, actual, onRateChange, onActualChange,
  onAmountChange,
  onNoteChange,
  onDateChange,
  onAccountChange,
  onClose,
  onConfirm,
}: ModalPaymentProps) {
  const { t } = useAppLanguage();
  const { width, fontScale } = useWindowDimensions();
  const stack = shouldStackFinanceFields(width, fontScale);
  const { colors } = useTheme();
  if (!debt) return null;
  const isReceivable = debt.direction === 'receivable';
  const title = isReceivable ? t('Record collection', 'تسجيل التحصيل') : t('Record payment', 'تسجيل السداد');
  const account = accounts.find(a => a.id === accountId);
  const crossDebt = account && account.currencyCode !== debt.currencyCode;
  return <FormModal visible={visible} title={title} onClose={onClose} onBack={onClose} compactTitle>
    <Card style={{ borderWidth: 1, borderColor: colors.finance.neutral.border, gap: 4, padding: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><AppText variant="bodyStrong">{debt.personName}</AppText>
          <AppText variant="caption" color="textSecondary">{t('Remaining amount', 'المبلغ المتبقي')}</AppText></View>
        <AppText style={[styles.modalRemaining, { flexShrink: 1, textAlign: 'right' }]}>{formatAmount(getRemainingAmount(debt), debt.currencyCode)} {debt.currencyCode}</AppText>
      </View>
    </Card>
    <View style={{ flexDirection: stack ? 'column' : 'row', alignItems: 'stretch', gap: 8 }}>
      <View style={{ flex: stack ? 0 : 1, minWidth: 0, gap: 4 }}>
        <AppText variant="label" style={{ fontWeight: '700' }}>{t('Amount', 'المبلغ')} ({debt.currencyCode})</AppText>
        <TextInput style={[styles.modalInput, { minHeight: 52 }]} value={amount} onChangeText={onAmountChange} keyboardType="decimal-pad" placeholder={t('Enter amount', 'أدخل المبلغ')} placeholderTextColor="#999" />
      </View>
      <AccountDropdown containerStyle={{ flex: stack ? 0 : 1 }} label={t('Account', 'الحساب')} options={accounts} value={accountId} onChange={onAccountChange} emptyMessage={t('No matching account', 'لا يوجد حساب مطابق')} />
    </View>
    {crossDebt && <DebtFxForm currency={debt.currencyCode} accountCurrency={account.currencyCode} amount={amount} date={date} rate={rate} actual={actual} onRateChange={onRateChange} onActualChange={onActualChange} />}
    {visible && <FinanceDateField key={debt.id} label={isReceivable ? t('Collection date', 'تاريخ التحصيل') : t('Payment date', 'تاريخ الدفع')} value={date} onChange={onDateChange} pickerOnly />}
    <AppText style={styles.fieldLabel}>{t('Note (optional)', 'ملاحظة (اختياري)')}</AppText>
    <TextInput style={styles.modalInput} value={note} onChangeText={onNoteChange} placeholder={t('Add a note', 'أضف ملاحظة')} placeholderTextColor="#999" />
    <AppText variant="caption" color="textSecondary">{t('The selected account balance will change.', 'سيتغير رصيد الحساب المختار.')}</AppText>
    <View style={styles.modalButtons}>
      <AppButton title={t('Cancel', 'إلغاء')} variant="outline" onPress={onClose} style={{ flex: 1 }} />
      <AppButton title={t('Confirm', 'تأكيد')} onPress={onConfirm} disabled={!account || (!!crossDebt && (!rate.trim() || !actual.trim()))} style={{ flex: 1 }} />
    </View>
  </FormModal>;
}

function DebtFxForm({currency,accountCurrency,amount,date,rate,actual,onRateChange,onActualChange}: {currency:string;accountCurrency:string;amount:string;date:string;rate:string;actual:string;onRateChange:(v:string)=>void;onActualChange:(v:string)=>void}) {
  const {t}=useAppLanguage();
  const {colors}=useTheme();
  const quote=parseAmount(rate), obligation=parseAmount(amount), confirmed=parseAmount(actual);
  const estimated=quote && quote>0 && obligation && obligation>0 ? obligation/quote : null;
  const display = (value: number | null) => value === null || !Number.isFinite(value) || value <= 0 ? '—' : formatAmount(value,accountCurrency)+' '+accountCurrency;
  return <View style={{gap:8}}>
    <DirectHistoricalFxField accountCurrencyCode={accountCurrency} transactionCurrencyCode={currency}
      transactionDate={date} rate={quote} manualMode manualOnly compact loading={false} manualRate={rate}
      onManualRateChange={onRateChange} />
    <View style={{flexDirection:'row',gap:6,alignItems:'flex-start'}}>
      <View style={{flex:1,minWidth:0,alignItems:'center'}}><AppText variant="label" style={{fontWeight:'700'}}>{t('Estimated','تقديري')}</AppText><View style={{minHeight:52,justifyContent:'center'}}><AppText variant="bodyStrong" align="center" numberOfLines={1} adjustsFontSizeToFit>{display(estimated)}</AppText></View></View>
      <View style={{flex:1,minWidth:0}}><AppText variant="label" align="center" style={{fontWeight:'700'}}>{t('Actual','فعلي')}</AppText>
        <View style={{minHeight:52,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#D6B777',borderRadius:12,paddingHorizontal:5,gap:3,backgroundColor:colors.surface}}>
          <TextInput accessibilityLabel={t('Actual account amount','المبلغ الفعلي للحساب')} style={{flex:1,minWidth:0,color:colors.text,fontWeight:'700',padding:0,textAlign:'center'}} value={actual} onChangeText={onActualChange} keyboardType="decimal-pad" />
          <AppText variant="label">{accountCurrency}</AppText>
        </View></View>
      <View style={{flex:1,minWidth:0,alignItems:'center'}}><AppText variant="label" style={{fontWeight:'700'}}>{t('Recorded','المسجل')}</AppText><View style={{minHeight:52,justifyContent:'center'}}><AppText variant="bodyStrong" align="center" numberOfLines={1} adjustsFontSizeToFit>{display(confirmed)}</AppText></View></View>
    </View>
  </View>;
}

/* -------------------------------------------------------------------------- */
/* Edit individual payment modal                                              */
/* -------------------------------------------------------------------------- */

interface ModalEditPaymentProps {
  visible: boolean;
  debt: Debt | null;
  payment: DebtPayment | null;
  onClose: () => void;
  onSave: (amount: string, date: string, note: string, fxRate?: string, fxActual?: string) => void;
}

function ModalEditPayment({
  visible,
  debt,
  payment,
  onClose,
  onSave,
}: ModalEditPaymentProps) {
  const { t } = useAppLanguage();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [fxRate, setFxRate] = useState(''); const [fxActual, setFxActual] = useState('');
  const ledger = useLedgerStore.getState();
  const account = ledger.accounts.find(a => a.id === payment?.accountId);
  const linked = ledger.transactions.find(tx => tx.id === payment?.ledgerTransactionId);
  const crossDebt = debt && account && account.currencyCode !== debt.currencyCode;

  // Reset on a new editing session, never inside useMemo. Include the debt ID
  // because payment IDs are not sufficient to identify the parent record.
  const paymentContext = visible && debt && payment
    ? JSON.stringify([debt.id, payment.id]) : null;
  const [loadedPaymentContext, setLoadedPaymentContext] = useState<string | null>(null);
  if (loadedPaymentContext !== paymentContext) {
    setLoadedPaymentContext(paymentContext);
    setAmount(paymentContext && payment ? String(payment.amount) : '');
    setDate(paymentContext && payment ? payment.date : '');
    setNote(paymentContext && payment ? payment.note ?? '' : '');
    setFxRate(paymentContext && crossDebt && linked?.directHistoricalFx ? String(linked.directHistoricalFx.rate) : '');
    setFxActual(paymentContext && crossDebt && linked ? String(linked.amount) : '');
  }

  if (!debt || !payment) return null;

  const maximumAllowed = getRemainingExcludingPayment(debt, payment.id);

  const handleSave = () => {
    onSave(amount, date, note, crossDebt ? fxRate : undefined, crossDebt ? fxActual : undefined);
  };

  return (
    <FormModal visible={visible} title={debt.direction === 'receivable' ? t('Edit collection', 'تعديل التحصيل') : t('Edit payment', 'تعديل الدفعة')} onClose={onClose} onBack={onClose} compactTitle>
      <Card style={{ gap: 4, padding: 10 }}><AppText variant="bodyStrong">{debt.personName}</AppText>
              <AppText variant="caption" color="textSecondary">
                {t("Maximum allowed for this payment", "الحد الأقصى المسموح لهذه الدفعة")}
              </AppText>

              <AppText style={styles.modalRemaining}>
                {formatAmount(maximumAllowed, debt.currencyCode)} {debt.currencyCode}
              </AppText>

      </Card>
              <AppText style={styles.fieldLabel}>{t("Amount", "المبلغ")}</AppText>

              <TextInput
                style={styles.modalInput}
                value={amount}
                onChangeText={value=>{setAmount(value); if(crossDebt) setFxActual('');}}
                keyboardType="decimal-pad"
                placeholder={t("Enter amount", "أدخل المبلغ")}
                placeholderTextColor="#999"
              />

              {crossDebt && account && <DebtFxForm currency={debt.currencyCode} accountCurrency={account.currencyCode} amount={amount} date={date} rate={fxRate} actual={fxActual} onRateChange={setFxRate} onActualChange={setFxActual} />}
              {visible && <FinanceDateField key={paymentContext ?? undefined} label={debt.direction === 'receivable' ? t('Collection date', 'تاريخ التحصيل') : t('Payment date', 'تاريخ الدفع')} value={date} onChange={value=>{setDate(value); if(crossDebt){setFxActual('');setFxRate('');}}} pickerOnly />}

              <AppText style={styles.fieldLabel}>{t("Note (optional)", "ملاحظة (اختياري)")}</AppText>

              <TextInput
                style={styles.modalInput}
                value={note}
                onChangeText={setNote}
                placeholder={t("Add a note", "أضف ملاحظة")}
                placeholderTextColor="#999"
              />

              <View style={styles.warningBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <AppText style={styles.warningText}>
                  This edits the selected payment and its existing account
                  transaction. It does not create a new account transaction.
                </AppText>
              </View>
      <View style={styles.modalButtons}>
        <AppButton title={t('Cancel', 'إلغاء')} variant="outline" onPress={onClose} style={{ flex: 1 }} />
        <AppButton title={t('Save changes', 'حفظ التغييرات')} onPress={handleSave} style={{ flex: 1 }} />
      </View>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  historyToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4 },
  quickHistory: { paddingHorizontal: 12, paddingBottom: 6, gap: 2 },
  quickPayment: { paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#94A3B855' },
  quickPaymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
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
  tabs: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#fff',
  },
  receivableTabActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  payableTabActive: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 3,
    minHeight: 75,
    alignItems: 'center',
  },
  summaryCurrency: { alignItems: 'center', width: '100%', gap: 0 },
  summaryAmount: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 23,
    marginBottom: 11,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  debtCard: {
    marginBottom: 11,
  },
  debtMain: {
    gap: 12,
  },
  debtTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  debtNameContainer: {
    flex: 1,
    gap: 4,
  },
  personName: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountColumn: {
    flex: 1,
    gap: 3,
  },
  amountColumnRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  remainingAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  originalAmount: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    marginTop: 13,
    paddingTop: 13,
    gap: 13,
  },
  notesBox: {
    gap: 5,
  },
  paymentHistory: {
    gap: 9,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  paymentInfo: {
    flex: 1,
    gap: 3,
  },
  paymentDate: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  paymentActions: {
    alignItems: 'flex-end',
    gap: 7,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 9,
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  paymentModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '90%',
    flexShrink: 1,
  },
  paymentScroll: {
    flexShrink: 1,
  },
  paymentScrollContent: {
    paddingBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
    gap: 10,
  },
  modalRemaining: {
    fontSize: 21,
    fontWeight: '800',
    marginTop: 5,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 13,
    marginBottom: 7,
  },
  modalInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#111',
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  accountChoices: {
    gap: 5,
  },
  accountChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 8,
    padding: 8,
  },
  accountChoiceActive: {
    borderColor: '#D6B777',
    backgroundColor: '#ECFDF5',
  },
  accountChoiceName: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: '#1E40AF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    paddingTop: 4,
  },
  cancelButton: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D6B777',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
