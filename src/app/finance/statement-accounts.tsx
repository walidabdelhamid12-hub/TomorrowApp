import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { aggregateAccountsReport } from '@/features/finance/utils/reportAccounts';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { useTheme } from '@/theme';

/** Account-currency movement register. Reuses the report's strict reconciliation gate. */
export default function AccountsStatementScreen() {
  const router = useRouter();
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ month?: string; accountId?: string }>();
  const ready = useLedgerHydrated();
  const accounts = useLedgerStore(s => s.accounts);
  const categories = useLedgerStore(s => s.categories);
  const transactions = useLedgerStore(s => s.transactions);
  const transfers = useLedgerStore(s => s.transfers);
  const month = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const accountId = typeof params.accountId === 'string' ? params.accountId : '';
  const filterValid = params.accountId === undefined || (typeof params.accountId === 'string'
    && params.accountId.length > 0 && !/[\\s\\u0000-\\u001f\\u007f]/u.test(params.accountId));
  const period = useMemo(() => {
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    if (year < 100) return null;
    return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
  }, [month]);
  const rows = useMemo(() => {
    if (!ready || !period) return null;
    try {
      return aggregateAccountsReport({ accounts, categories, transactions, transfers }, period,
        accounts.filter(account => typeof account.openingBalanceDate === 'string')
          .map(account => ({ accountId: account.id, openingBalanceDate: account.openingBalanceDate! })));
    } catch { return null; }
  }, [ready, period, accounts, categories, transactions, transfers]);
  const selected = useMemo(() => rows?.filter(row => !accountId || row.accountId === accountId) ?? [], [rows, accountId]);
  const entries = useMemo(() => {
    if (!rows || !period) return [];
    const valid = new Set(selected.filter(row => row.status === 'available' && row.reconciled
      && row.minorUnits !== null).map(row => row.accountId));
    const txEntries = transactions.filter(tx => valid.has(tx.accountId) && tx.date >= period.from && tx.date <= period.to)
      .map(tx => ({ id: 'tx:' + tx.id, accountId: tx.accountId, date: tx.date,
        kind: tx.entryType === 'refund' ? 'Refund' : tx.type === 'income' ? 'Income' : 'Expense',
        amount: tx.type === 'expense' && tx.entryType !== 'refund' ? -tx.amount : tx.amount,
        note: tx.note }));
    const transferEntries = transfers.filter(t => t.date >= period.from && t.date <= period.to)
      .flatMap(t => [
        ...(valid.has(t.fromAccountId) ? [{ id: 'transfer-out:' + t.id, accountId: t.fromAccountId,
          date: t.date, kind: t.type === 'credit_card_payment' ? 'Credit-card repayment out' : 'Transfer out',
          amount: -(t.fromAmount ?? t.amount), note: t.note }] : []),
        ...(valid.has(t.toAccountId) ? [{ id: 'transfer-in:' + t.id, accountId: t.toAccountId,
          date: t.date, kind: t.type === 'credit_card_payment' ? 'Credit-card repayment in' : 'Transfer in',
          amount: t.toAmount ?? t.amount, note: t.note }] : []),
      ]);
    return [...txEntries, ...transferEntries].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [rows, selected, period, transactions, transfers]);
  const selectionValid = filterValid && (!accountId || accounts.filter(account => account.id === accountId).length === 1);
  const names = new Map(accounts.map(account => [account.id, { name: account.name, currency: account.currencyCode }]));
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Accounts Report"
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Accounts Report</AppText>
    </Pressable>
    <AppText variant="h1">Accounts Statement</AppText>
    <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
      {month ?? 'Invalid month'} · Account-currency movements only. Credit-card repayments are transfer legs, never additional expenses.
    </AppText>
    {!period || !selectionValid ? <Card><AppText>Invalid statement filters.</AppText></Card> :
      !ready ? <Card><AppText>Loading accounts...</AppText></Card> :
      rows === null ? <Card><AppText>Statement unavailable.</AppText></Card> :
      selected.some(row => row.status !== 'available' || !row.reconciled || row.minorUnits === null)
        ? <Card><AppText color="textSecondary">Incomplete account history. Movement details are unavailable until reconciled.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>No reconciled account movements in this month.</AppText></Card> :
      entries.map(item => {
        const account = names.get(item.accountId);
        return <Card key={item.id + ':' + item.accountId} style={{ marginBottom: spacing.sm }}>
          <AppText variant="bodyStrong">{account?.name ?? 'Unknown account'} · {item.kind}</AppText>
          <AppText>{item.date} · {account ? formatAmount(item.amount, account.currency) + ' ' + account.currency : 'Unavailable'}</AppText>
          {item.note ? <AppText color="textSecondary">{item.note}</AppText> : null}
        </Card>;
      })}
  </Screen>;
}
