import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { validateAccountOpeningDate } from '@/features/finance/utils/accountOpeningDate';
import { AppText } from '@/components/ui';
import { FinanceDisclosure } from './FinanceDisclosure';
import { ACCOUNT_TYPE_LABELS } from './AccountCard';
import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';

export function AccountDetails({ accountId, onClose, amountsVisible = true }: { accountId: string | null; onClose: () => void; amountsVisible?: boolean }) {
  const [openingDateDraft, setOpeningDateDraft] = useState('');
  useEffect(() => { setOpeningDateDraft(''); }, [accountId]);
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
      Alert.alert('Cannot verify opening date', result.reason);
      return;
    }
    Alert.alert('Verify opening balance date',
      'This starting balance applies before transactions on this date. Confirm only if your historical starting balance is accurate. No balances or movements will be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify', onPress: () => {
          if (verifyOpeningDate(account.id, requestedDate)) {
            setOpeningDateDraft('');
            Alert.alert('Verified', 'Opening balance date saved.');
          } else {
            Alert.alert('Not saved', 'Account history changed or verification failed. Please review and retry.');
          }
        } },
      ],
    );
  };
  const money = (v: number) => amountsVisible ? formatAmount(v, account?.currencyCode) + ' ' + account?.currencyCode : '••••••';
  const history = account ? [
    ...transactions.filter(t => t.accountId === account.id).map(t => ({ date: t.date, text: t.date + ' · ' + (t.note || t.purpose || t.type) + ' · ' + money(t.amount) })),
    ...transfers.filter(t => t.fromAccountId === account.id || t.toAccountId === account.id).map(t => ({ date: t.date, text: t.date + ' · Transfer ' + (t.fromAccountId === account.id ? 'to ' : 'from ') + (accounts.find(a => a.id === (t.fromAccountId === account.id ? t.toAccountId : t.fromAccountId))?.name ?? 'Unavailable account') + ' · ' + money(t.fromAccountId === account.id ? (t.fromAmount ?? t.amount) : (t.toAmount ?? t.amount)) })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];
  return <FinanceDetailsModal title={accountId === null ? undefined : account?.name ?? 'Account unavailable'} onClose={onClose}
    metrics={account ? [
      { label: 'Current balance', value: money(getAccountBalance(account, transactions, transfers)) },
      { label: 'Initial balance', value: money(account.initialBalance) },
      { label: 'Account type', value: ACCOUNT_TYPE_LABELS[account.type] },
      { label: 'Currency', value: account.currencyCode },
      ...(account.creditLimit !== undefined ? [{ label: 'Credit limit', value: money(account.creditLimit) }] : []),
    ] : []} lines={account ? [] : ['No unique account is available.']}>
    {account && <>
      <AppText variant="caption" color="textSecondary">{account.archived ? 'Archived' : 'Active'}</AppText>
      <View style={{ gap: 8, marginVertical: 12 }}>
        <AppText variant="bodyStrong">Opening balance date</AppText>
        <AppText variant="caption" color="textSecondary">
          {account.openingBalanceDate
            ? (storedDateStatus?.valid ? 'Verified: ' : 'Stored date needs review: ') + account.openingBalanceDate
            : 'Not verified'}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          This starting balance applies before transactions on this date. Only confirm a date you can verify.
        </AppText>
        <TextInput accessibilityLabel="Opening balance date (YYYY-MM-DD)"
          value={openingDateDraft} onChangeText={setOpeningDateDraft}
          placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"
          autoCorrect={false} maxLength={10}
          style={{ borderWidth: 1, borderColor: '#888888', borderRadius: 8,
            minHeight: 44, paddingHorizontal: 12, color: '#888888' }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Verify opening balance date"
          onPress={submitOpeningDate}
          style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 8 }}>
          <AppText variant="bodyStrong">Verify opening date</AppText>
        </Pressable>
      </View>
      {account.notes ? <AppText variant="caption">{account.notes}</AppText> : null}
      <FinanceDisclosure title="Transaction history" count={history.length}>
        {history.map((entry, index) => <AppText key={index} variant="caption" style={{ paddingVertical: 4 }}>{entry.text}</AppText>)}
        {history.length === 0 && <AppText variant="caption" color="textSecondary">No transactions recorded.</AppText>}
      </FinanceDisclosure>
      <FinanceDisclosure title="Record information">
        <AppText variant="caption" color="textSecondary">{'Created: ' + account.createdAt}</AppText>
        <AppText variant="caption" color="textSecondary">{'Updated: ' + account.updatedAt}</AppText>
      </FinanceDisclosure>
    </>}
  </FinanceDetailsModal>;
}
