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
    lines={account ? [account.type + ' · ' + account.currencyCode, 'Initial balance: ' + money(account.initialBalance),
      'Current balance: ' + money(getAccountBalance(account, transactions, transfers)),
      ...(account.creditLimit !== undefined ? ['Credit limit: ' + money(account.creditLimit)] : []),
      account.archived ? 'Archived' : 'Active', 'Created: ' + account.createdAt, 'Updated: ' + account.updatedAt, account.notes ?? '', 'History', ...history.map(h => h.text)] : ['No unique account is available.']} />;
}
