import { FinanceDateField } from '@/features/finance/components/FinanceDateField';
import { formPayload, submitFinanceForm } from './explicitFinanceForm';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { validateAccountOpeningDate } from '@/features/finance/utils/accountOpeningDate';
import { AppText } from '@/components/ui';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { FinanceDisclosure } from './FinanceDisclosure';
import { ACCOUNT_TYPE_LABELS } from './AccountCard';
import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';

export function AccountDetails({ accountId, onClose, amountsVisible = true }: { accountId: string | null; onClose: () => void; amountsVisible?: boolean }) {
  const { t } = useAppLanguage();
  const [openingDateDraft, setOpeningDateDraft] = useState('');
  const [loadedAccountId, setLoadedAccountId] = useState(accountId);
  if (loadedAccountId !== accountId) {
    setLoadedAccountId(accountId);
    setOpeningDateDraft('');
  }
  const verifyOpeningDate = useLedgerStore(s => s.verifyAccountOpeningBalanceDate);
  const accounts = useLedgerStore(s => s.accounts);
  const transactions = useLedgerStore(s => s.transactions);
  const transfers = useLedgerStore(s => s.transfers);
  const matches = accounts.filter(a => a.id === accountId);
  const account = matches.length === 1 ? matches[0] : undefined;
  const storedDateStatus = account?.openingBalanceDate
    ? validateAccountOpeningDate({ accounts, transactions, transfers, categories: [] },
        account.id, account.openingBalanceDate)
    : null;
  const submitOpeningDate = () => {
    if (!account) return;
    const requestedDate = openingDateDraft.trim();
    const result = validateAccountOpeningDate(
      { accounts, transactions, transfers, categories: [] }, account.id, requestedDate,
    );
    if (!result.valid) {
      Alert.alert(t('Cannot verify opening date', 'تعذر التحقق من تاريخ الرصيد الافتتاحي'), result.reason);
      return;
    }
    Alert.alert(t('Verify opening balance date', 'تأكيد تاريخ الرصيد الافتتاحي'),
      t('This starting balance applies before transactions on this date. Confirm only if your historical starting balance is accurate. No balances or movements will be changed.', 'يسري الرصيد الافتتاحي قبل معاملات هذا التاريخ. تأكد من صحة الرصيد التاريخي قبل التأكيد. لن تتغير الأرصدة أو الحركات.'),
      [
        { text: t('Cancel', 'إلغاء'), style: 'cancel' },
        { text: t('Verify', 'تأكيد'), onPress: () => {
          return submitFinanceForm('account-opening-date-verification:v1',
            formPayload('account.verify-opening-date', account.id, { date: requestedDate, initialBalance: account.initialBalance, currencyCode: account.currencyCode }),
            () => {
              const latest = useLedgerStore.getState().accounts.filter(a => a.id === account.id);
              if (latest.length !== 1 || latest[0].initialBalance !== account.initialBalance || latest[0].currencyCode !== account.currencyCode) return false;
              return verifyOpeningDate(account.id, requestedDate);
            },
            () => { setOpeningDateDraft(''); Alert.alert(t('Verified', 'تم التحقق'), t('Opening balance date saved.', 'تم حفظ تاريخ الرصيد الافتتاحي.')); },
            () => Alert.alert(t('Not saved', 'لم يتم الحفظ'), t('Account history changed or verification failed. Please review and retry.', 'تغيّر سجل الحساب أو تعذر التحقق. راجع البيانات وحاول مرة أخرى.')));
        } },
      ],
    );
  };
  const money = (v: number) => amountsVisible ? formatAmount(v, account?.currencyCode) + ' ' + account?.currencyCode : '••••••';
  const history = account ? [
    ...transactions.filter(t => t.accountId === account.id).map(t => ({ date: t.date, text: t.date + ' · ' + (t.note || t.purpose || t.type) + ' · ' + money(t.amount) })),
    ...transfers.filter(transfer => transfer.fromAccountId === account.id || transfer.toAccountId === account.id).map(transfer => ({ date: transfer.date, text: transfer.date + t(' · Transfer ', ' · تحويل ') + (transfer.fromAccountId === account.id ? t('to ', 'إلى ') : t('from ', 'من ')) + (accounts.find(a => a.id === (transfer.fromAccountId === account.id ? transfer.toAccountId : transfer.fromAccountId))?.name ?? t('Unavailable account', 'حساب غير متاح')) + ' · ' + money(transfer.fromAccountId === account.id ? (transfer.fromAmount ?? transfer.amount) : (transfer.toAmount ?? transfer.amount)) })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];
  return <FinanceDetailsModal title={accountId === null ? undefined : account?.name ?? t('Account unavailable', 'الحساب غير متاح')} onClose={onClose} compact
    metrics={account ? [
      { label: t('Current balance', 'الرصيد الحالي'), value: money(getAccountBalance(account, transactions, transfers)) },
      { label: t('Initial balance', 'الرصيد الافتتاحي'), value: money(account.initialBalance) },
      { label: t('Account type', 'نوع الحساب'), value: t(ACCOUNT_TYPE_LABELS[account.type], ({ cash: 'نقدي', bank: 'بنك', wallet: 'محفظة', savings: 'ادخار', credit_card: 'بطاقة ائتمان' } as const)[account.type]) },
      { label: t('Currency', 'العملة'), value: account.currencyCode },
      ...(account.creditLimit !== undefined ? [{ label: t('Credit limit', 'الحد الائتماني'), value: money(account.creditLimit) }] : []),
    ] : []} lines={account ? [] : [t('No unique account is available.', 'لا يوجد حساب واحد مطابق.')]}>
    {account && <>
      <AppText variant="caption" color="textSecondary">{account.archived ? t('Archived', 'مؤرشف') : t('Active', 'نشط')}</AppText>
      <View style={{ gap: 6, marginVertical: 4 }}>
        <AppText variant="bodyStrong">{t('Opening balance date', 'تاريخ الرصيد الافتتاحي')}</AppText>
        <AppText variant="caption" color="textSecondary">
          {account.openingBalanceDate
            ? (storedDateStatus?.valid ? t('Verified: ', 'تم التحقق: ') : t('Stored date needs review: ', 'التاريخ المحفوظ يحتاج مراجعة: ')) + account.openingBalanceDate
            : t('Not verified', 'لم يتم التحقق')}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {t('Confirm only a date you can verify.', 'أكّد فقط تاريخًا يمكنك التحقق منه.')}
        </AppText>
        <FinanceDateField label={t('Opening balance date', 'تاريخ الرصيد الافتتاحي')}
          value={openingDateDraft} onChange={setOpeningDateDraft} pickerOnly />
        <Pressable accessibilityRole="button" accessibilityLabel={t('Verify opening balance date', 'تأكيد تاريخ الرصيد الافتتاحي')}
          onPress={submitOpeningDate}
          style={{ minHeight: 52, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#1E293B', borderRadius: 12 }}>
          <AppText variant="bodyStrong" style={{ color: '#FFFFFF' }}>{t('Save opening date', 'حفظ تاريخ الافتتاح')}</AppText>
        </Pressable>
      </View>
      {account.notes ? <AppText variant="caption">{account.notes}</AppText> : null}
      <FinanceDisclosure title={t('Transaction history', 'سجل المعاملات')} count={history.length}>
        {history.map((entry, index) => <AppText key={index} variant="caption" style={{ paddingVertical: 4 }}>{entry.text}</AppText>)}
        {history.length === 0 && <AppText variant="caption" color="textSecondary">{t('No transactions recorded.', 'لا توجد معاملات مسجلة.')}</AppText>}
      </FinanceDisclosure>
      <FinanceDisclosure title={t('Record information', 'معلومات السجل')}>
        <AppText variant="caption" color="textSecondary">{t('Created: ', 'تاريخ الإنشاء: ') + account.createdAt}</AppText>
        <AppText variant="caption" color="textSecondary">{t('Updated: ', 'آخر تحديث: ') + account.updatedAt}</AppText>
      </FinanceDisclosure>
    </>}
  </FinanceDetailsModal>;
}
