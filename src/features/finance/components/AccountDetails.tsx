import { AppText } from '@/components/ui';
import { FinanceDisclosure } from './FinanceDisclosure';
import { ACCOUNT_TYPE_LABELS } from './AccountCard';
import { FinanceDetailsModal } from '@/features/finance/components/FinanceDetailsModal';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { getAccountBalance } from '@/features/finance/utils/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';

export function AccountDetails({ accountId, onClose, amountsVisible = true }: { accountId: string | null; onClose: () => void; amountsVisible?: boolean }) {
  const accounts = useLedgerStore(s => s.accounts);
  const transactions = useLedgerStore(s => s.transactions);
  const transfers = useLedgerStore(s => s.transfers);
  const matches = accounts.filter(a => a.id === accountId);
  const account = matches.length === 1 ? matches[0] : undefined;
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
