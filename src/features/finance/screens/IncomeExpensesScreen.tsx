import { classifyReportTransactions } from '@/features/finance/utils/reportTransactionClassifier';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { useMonthlyFinanceSummary } from '@/features/finance/hooks/useMonthlyFinanceSummary';
import { AddTransactionModal } from '@/features/finance/components/AddTransactionModal';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { ReportPicker } from '@/features/finance/components/reporting/ReportPrimitives';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';
import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { acknowledgedFinanceHandler } from '@/features/finance/components/acknowledgedFinanceHandler';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { isProtectedTransaction } from '@/features/finance/utils/paymentTransactionOwnership';
import { isTransferFeeClaim } from '@/features/finance/utils/transferSettlement';
import { shouldStackFinanceFields } from '@/features/finance/utils/formLayout';
import type { Transaction } from '@/features/finance/types/ledger';

type EntryKind = 'income' | 'expense';
interface IncomeExpensesScreenProps { kind: EntryKind; }

export function IncomeExpensesScreen({ kind }: IncomeExpensesScreenProps) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { t } = useAppLanguage();
  const { confirm, confirmation } = useFinanceConfirmation();
  const ready = useLedgerHydrated();
  const transactions = useLedgerStore((state) => state.transactions);
  const categories = useLedgerStore((state) => state.categories);
  const accounts = useLedgerStore((state) => state.accounts);
  const { width, fontScale } = useWindowDimensions();
  const stackFilters = shouldStackFinanceFields(width, fontScale);
  const loans = useFinanceStore(state => state.loans);
  const debts = useFinanceStore(state => state.debts);
  const transfers = useLedgerStore(state => state.transfers);
  const assets = useFinanceStore(state => state.assets);
  const cheques = useFinanceStore(state => state.cheques);
  const classified = classifyReportTransactions({ledger: {accounts, categories, transactions, transfers}, finance: {loans, debts, assets, cheques}});
  const byId = new Map(classified.map(item => [item.id, item]));
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const unique = (id: string | null) => {
    const matches = transactions.filter(item => item.id === id);
    return matches.length === 1 && matches[0].type === kind ? matches[0] : undefined;
  };
  const locked = (item: Transaction) => isProtectedTransaction(item, { loans, debts }) || isTransferFeeClaim(item, { transfers });
  const hasRefunds = (item: Transaction) => transactions.some(row => row.entryType === 'refund' && row.relatedTransactionId === item.id);
  const latestEditable = (id: string, editing: boolean) => {
    const ledger = useLedgerStore.getState();
    const matches = ledger.transactions.filter(item => item.id === id);
    if (matches.length !== 1) return undefined;
    const item = matches[0];
    if (item.type !== kind || isProtectedTransaction(item, useFinanceStore.getState()) || isTransferFeeClaim(item, ledger)
        || ledger.transactions.some(row => row.entryType === 'refund' && row.relatedTransactionId === id)
        || (editing && item.entryType === 'refund')) return undefined;
    return item;
  };
  const openEdit = (id: string) => {
    if (!latestEditable(id, true)) return;
    setDetailId(null); setRefundOpen(false); setEditId(id); setAddOpen(true);
  };
  const deleteRow = (id: string) => {
    if (!latestEditable(id, false)) return;
    confirm(t('Delete transaction?', 'حذف المعاملة؟'), t('This transaction will be permanently deleted.', 'سيتم حذف هذه المعاملة نهائيًا.'), () => {
        if (!latestEditable(id, false)) return false;
        // Reuse the existing durable deletion scope and canonical payload from FinanceHomeScreen.
        return acknowledgedFinanceHandler('src/features/finance/screens/FinanceHomeScreen.tsx:413', () => undefined, {
          payload: { operation: 'removeTransaction', targetId: id },
          mutate: () => latestEditable(id, false) ? useLedgerStore.getState().removeTransaction(id) : false,
          onCommitted: result => { if (result === true) setDetailId(current => current === id ? null : current);
            else Alert.alert(t('Cannot delete transaction', 'تعذر حذف المعاملة')); },
        })();
    }, t('Delete', 'حذف'));
  };
  const openAdd = (refund: boolean) => { setEditId(null); setRefundOpen(refund); setAddOpen(true); };
  const detail = unique(detailId);
  const edit = unique(editId);
  const detailLines = detail ? [
    t('Account', 'الحساب') + ': ' + (accounts.find(a => a.id === detail.accountId)?.name ?? t('Unavailable', 'غير متاح')),
    t('Category', 'التصنيف') + ': ' + (byId.get(detail.id)?.kind === 'loan_payment' ? t('Loan financing cost', 'تكلفة تمويل القرض') : categories.find(c => c.id === detail.categoryId)?.name ?? t('Unavailable', 'غير متاح')),
    ...(byId.get(detail.id)?.kind === 'loan_payment' ? [t('Financing cost', 'تكلفة التمويل') + ': ' + formatAmount(byId.get(detail.id)!.expenseAmount, detail.currencyCode) + ' ' + detail.currencyCode] : []),
    t('Account amount', 'مبلغ الحساب') + ': ' + formatAmount(detail.amount, detail.currencyCode) + ' ' + detail.currencyCode,
    t('Date', 'التاريخ') + ': ' + detail.date,
    ...(detail.originalCurrencyCode && detail.originalAmount !== undefined ? [t('Original amount', 'المبلغ الأصلي') + ': ' + formatAmount(detail.originalAmount, detail.originalCurrencyCode) + ' ' + detail.originalCurrencyCode] : []),
    ...(detail.directHistoricalFx ? [t('Historical quote', 'سعر الصرف التاريخي') + ': ' + detail.directHistoricalFx.rate + ' ' + detail.directHistoricalFx.transactionCurrencyCode + ' / ' + detail.directHistoricalFx.accountCurrencyCode] : []),
    ...(detail.accountFxRate !== undefined && detail.originalCurrencyCode ? [t('Effective rate', 'السعر الفعلي') + ': ' + detail.accountFxRate + ' ' + detail.currencyCode + ' / ' + detail.originalCurrencyCode] : []),
    ...(detail.relatedTransactionId ? [t('Original purchase ID', 'معرف الشراء الأصلي') + ': ' + detail.relatedTransactionId] : []),
    ...transactions.filter(row => row.entryType === 'refund' && row.relatedTransactionId === detail.id).map(row => t('Refund', 'استرداد') + ': ' + row.date + ' · ' + formatAmount(row.amount, row.currencyCode) + ' ' + row.currencyCode),
    ...(detail.note ? [t('Note', 'ملاحظة') + ': ' + detail.note] : []),
  ] : [];
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'filter' | 'add' | null>(null);
  const [entryFilter, setEntryFilter] = useState<'all' | 'normal' | 'refund'>('all');
  const search = query.trim().normalize('NFKC').toLowerCase();
  const isIncome = kind === 'income';
  const accent = isIncome ? '#209B70' : '#D65353';
  const rows = transactions.filter((item) => {
    const classification = byId.get(item.id);
    if (!classification || (kind === 'income' ? classification.incomeAmount === 0 : classification.expenseAmount === 0)) return false;
    if (item.type !== kind || (entryFilter !== 'all' && (item.entryType ?? 'normal') !== entryFilter)) return false;
    if ((accountFilter && item.accountId !== accountFilter)
      || (categoryFilter && item.categoryId !== categoryFilter)) return false;
    if (!search) return true;
    return [item.note, item.date, item.currencyCode, String(item.amount),
      item.originalCurrencyCode, item.originalAmount?.toString(),
      accounts.find(account => account.id === item.accountId)?.name,
      categories.find(category => category.id === item.categoryId)?.name]
      .some(value => value?.normalize('NFKC').toLowerCase().includes(search));
  })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const summary = useMonthlyFinanceSummary();
  const total = isIncome ? summary.income : summary.expense;

  if (!ready) return <Screen><View style={styles.center}><ActivityIndicator color={moduleColors.finance} /></View></Screen>;

  return (
    <Screen scroll edges={['top','bottom']} style={{ backgroundColor: '#F1F5F9' }}>
      <View style={financeChrome.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t("Go back", "رجوع")} style={financeChrome.back}>
          <Ionicons name="arrow-back" size={21} color="#D6B777" />
        </Pressable>
        <View style={styles.flex}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{isIncome ? t('Income', 'الدخل') : t('Expenses', 'المصروفات')}</AppText>
          <AppText variant="caption" style={{ color: '#CBD5E1' }}>{rows.length} {t('transactions', 'معاملة')}</AppText>
        </View>
      </View>
      <Card style={{ borderWidth: 1, borderColor: '#D6B777', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={isIncome ? 'trending-up' : 'trending-down'} size={22} color={accent} />
          <View style={styles.flex}><AppText variant="bodyStrong">{summary.missing > 0 ? t('Partial total', 'إجمالي جزئي') : t('Total', 'إجمالي')} {isIncome ? t('income', 'الدخل') : t('expenses', 'المصروفات')}</AppText></View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('About monthly total', 'عن الإجمالي الشهري')} onPress={() => Alert.alert(t('About monthly total', 'عن الإجمالي الشهري'), t('Monthly total uses verified exchange rates and excludes financing principal. Loan costs include interest and late fees; full cash movements remain in transaction history.', 'الإجمالي الشهري بأسعار صرف معتمدة ويستبعد أصل التمويل. تشمل تكلفة القرض الفوائد ورسوم التأخير، وتظل الحركات النقدية في السجل.'))}>
            <Ionicons name="information-circle-outline" size={24} color="#B59A5E" />
          </Pressable>
        </View>
        <AppText variant="h1" style={{ color: accent }}>{formatAmount(total, summary.baseCurrency)} {summary.baseCurrency}</AppText>
        <View style={{ borderTopWidth: 1, borderColor: '#D6B777', paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={17} color="#D6B777" />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>{t('This month', 'هذا الشهر')} ({summary.monthKey})</AppText>
          <AppText variant="caption">{getCurrencyFlag(summary.baseCurrency)} {summary.baseCurrency}</AppText>
        </View>
        {summary.missing > 0 ? <AppText color="textSecondary">{t('Monthly total incomplete:', 'الإجمالي الشهري غير مكتمل:')} {summary.missing} {t('transaction(s) could not be converted. Check verified exchange rates.', 'معاملة تعذّر تحويلها. راجع أسعار الصرف المعتمدة.')}</AppText> : null}
      </Card>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: openMenu === 'filter' }} onPress={() => setOpenMenu(openMenu === 'filter' ? null : 'filter')} style={[styles.addButton, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#D6B777', justifyContent: 'space-between' }]}>
          <Ionicons name="filter-outline" size={19} color="#B59A5E" />
          <AppText variant="bodyStrong">{entryFilter === 'all' ? t('All', 'الكل') : entryFilter === 'refund' ? t('Refunds', 'الاستردادات') : isIncome ? t('Income', 'الدخل') : t('Expenses', 'المصروفات')}</AppText>
          <Ionicons name="chevron-down" size={16} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: openMenu === 'add' }} onPress={() => setOpenMenu(openMenu === 'add' ? null : 'add')} style={[styles.addButton, { flex: 1, justifyContent: 'space-between', backgroundColor: '#1E293B' }]}>
          <Ionicons name="add" size={19} color="#D6B777" /><AppText style={styles.addText}>{t('Add', 'إضافة')}</AppText><Ionicons name="chevron-down" size={16} color="#FFFFFF" />
        </Pressable>
      </View>
      {openMenu === 'filter' ? <Card style={{ borderWidth: 1, borderColor: '#D6B777', marginTop: 6 }}>
        {([{ id: 'all', label: t('All', 'الكل') }, { id: 'normal', label: isIncome ? t('Income', 'الدخل') : t('Expenses', 'المصروفات') }, ...(!isIncome ? [{ id: 'refund' as const, label: t('Refunds', 'الاستردادات') }] : [])] as const).map(option => (
          <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: entryFilter === option.id }} onPress={() => { setEntryFilter(option.id); setOpenMenu(null); }} style={{ minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, backgroundColor: entryFilter === option.id ? '#F3EBD9' : colors.surface }}>
            <AppText variant="bodyStrong" style={{ color: entryFilter === option.id ? '#1E293B' : colors.text }}>{option.label}</AppText>{entryFilter === option.id ? <Ionicons name="checkmark" size={18} color="#B59A5E" /> : null}
          </Pressable>))}
      </Card> : null}
      {openMenu === 'add' ? <Card style={{ borderWidth: 1, borderColor: '#D6B777', marginTop: 6 }}>
        <Pressable accessibilityRole="button" onPress={() => { setOpenMenu(null); openAdd(false); }} style={styles.menuAction}><Ionicons name={isIncome ? 'trending-up' : 'trending-down'} size={20} color={accent} /><AppText variant="bodyStrong">{isIncome ? t('Add income', 'إضافة دخل') : t('Add expense', 'إضافة مصروف')}</AppText></Pressable>
        {!isIncome ? <Pressable accessibilityRole="button" onPress={() => { setOpenMenu(null); openAdd(true); }} style={styles.menuAction}><Ionicons name="return-down-back-outline" size={20} color="#209B70" /><AppText variant="bodyStrong">{t('Add refund', 'إضافة استرداد')}</AppText></Pressable> : null}
      </Card> : null}
      <View style={{ flexDirection: stackFilters ? 'column' : 'row', alignItems: 'stretch', gap: 8, marginTop: 12, marginBottom: 12 }}>
      <ReportPicker label={t('Accounts', 'الحسابات')} value={accountFilter} onSelect={setAccountFilter}
        options={[{ id: '', label: t('All accounts', 'كل الحسابات') },
          ...accounts.map(account => ({ id: account.id, label: account.name }))]} />
      <ReportPicker label={t('Category', 'التصنيف')} value={categoryFilter} onSelect={setCategoryFilter}
        options={[{ id: '', label: t('All categories', 'كل التصنيفات') },
          ...categories.filter(category => category.kind === kind).map(category => ({ id: category.id, label: category.name }))]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={[styles.flex, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="receipt" size={21} color={colors.finance.balance.accent} accessible={false} />
          <AppText variant="bodyStrong" accessibilityRole="header" style={{ color: colors.text, fontWeight: '800', flexShrink: 1 }}>{t('Transactions', 'المعاملات')}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? t('Close search', 'إغلاق البحث') : t('Search transactions', 'ابحث في المعاملات')}
          accessibilityState={{ expanded: searchOpen }} onPress={() => { if (searchOpen) setQuery(''); setSearchOpen(!searchOpen); }}
          style={{ minHeight: 44, minWidth: 44, borderWidth: 1, borderColor: '#D6B777', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={searchOpen ? 'close' : 'search'} size={20} color={colors.text} />
        </Pressable>
      </View>
      {searchOpen ? (
      <TextInput value={query} onChangeText={setQuery}
        placeholder={t('Search transactions', 'ابحث في المعاملات')}
        accessibilityLabel={t('Search transactions', 'ابحث في المعاملات')}
        style={{ padding: spacing.md, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12 }}
      />
      ) : null}
      {rows.length === 0 ? <Card variant="filled"><AppText color="textSecondary" align="center">{t('No matching transactions.', 'لا توجد معاملات مطابقة.')}</AppText></Card> : (
        <View style={{ gap: 6 }}>
          {rows.map((item) => {
            const category = categories.find((entry) => entry.id === item.categoryId);
            const account = accounts.find((entry) => entry.id === item.accountId);
            const isRefund = item.entryType === 'refund';
            const categoryIcon = category?.icon && Ionicons.glyphMap?.[category.icon as keyof typeof Ionicons.glyphMap]
              ? category.icon as keyof typeof Ionicons.glyphMap : undefined;
            return (
              <View key={item.id} style={{ padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Transaction details', 'تفاصيل المعاملة')} onPress={() => { if (unique(item.id)) setDetailId(item.id); }} style={styles.row}>
                <View style={styles.iconColumn}><View style={[styles.icon, { backgroundColor: isIncome || isRefund ? '#E7F5EF' : '#FBECEC' }]}>
                  <Ionicons name={isRefund ? 'arrow-undo-outline' : categoryIcon ?? (isIncome ? 'arrow-down-outline' : 'arrow-up-outline')} size={19} color={isRefund ? '#209B70' : category?.color ?? accent} />
                </View>{isRefund ? <AppText variant="caption" style={{ color: '#209B70', fontSize: 10, textAlign: 'center' }}>{t('Refund', 'استرداد')}</AppText> : null}</View>
                <View style={styles.flex}>
                  <AppText style={styles.name}>{byId.get(item.id)?.kind === 'loan_payment' ? t('Loan financing cost', 'تكلفة تمويل القرض') : category?.name ?? t('Uncategorized', 'غير مصنف')}</AppText>
                  <AppText variant="caption" color="textSecondary">{item.date} · {account?.name ?? t('Account unavailable', 'الحساب غير متاح')}</AppText>
                  {item.note ? <AppText variant="caption" color="textSecondary">{item.note}</AppText> : null}
                </View>
                <View style={styles.amountColumn}>
                <AppText style={{ color: isRefund ? '#209B70' : accent, fontWeight: '700', flexShrink: 1 }}>{formatAmount(Math.abs(isIncome ? byId.get(item.id)!.incomeAmount : byId.get(item.id)!.expenseAmount), item.currencyCode)} {item.currencyCode}</AppText>
                  {item.originalAmount !== undefined && item.originalCurrencyCode ? (
                    <AppText variant="caption" color="textSecondary" style={{ textAlign: 'right' }}>{t('Original', 'الأصلي')}: {formatAmount(item.originalAmount, item.originalCurrencyCode)} {item.originalCurrencyCode}</AppText>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </Pressable>
              </View>
            );
          })}
        </View>
      )}
      <FinanceDetailsModal title={detail ? t('Transaction details', 'تفاصيل المعاملة') : undefined} lines={detailLines} compact onClose={() => setDetailId(null)}>
        {detail && !locked(detail) && !hasRefunds(detail) && <FinanceActionButtons label={t('transaction', 'معاملة')} onEdit={detail.entryType === 'refund' ? undefined : () => openEdit(detail.id)} onDelete={() => deleteRow(detail.id)} />}
      </FinanceDetailsModal>
      <AddTransactionModal visible={addOpen && (editId === null || !!edit)} transaction={edit ?? null} fixedKind={kind} initialRefund={refundOpen} onClose={() => { setAddOpen(false); setEditId(null); setRefundOpen(false); }} />
      {confirmation}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, backgroundColor: '#1E293B', borderRadius: 20, padding: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#D6B777', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12 },
  addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  menuAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  addText: { color: '#FFFFFF', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  iconColumn: { alignItems: 'center', flexShrink: 0, width: 40, gap: 2 },
  amountColumn: { alignItems: 'flex-end', maxWidth: '46%', flexShrink: 1, minWidth: 0, gap: 2 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '600' },
});
