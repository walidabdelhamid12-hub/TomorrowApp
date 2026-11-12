import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { aggregateAccountsReport, type AccountReportRow } from '@/features/finance/utils/reportAccounts';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { moduleColors, useTheme } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportDetails, ReportCurrencyAnalysis, ReportNotice, ReportKeyValues, ReportStatementLink } from '@/features/finance/components/reporting/ReportLayout';
import { ReportPicker, ReportSummaryCards, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportChart';

function verified(row: AccountReportRow) {
  return row.status === 'available' && row.reconciled && row.movements !== null && row.minorUnits !== null;
}

/** Read-only presentation; explicit stored opening dates remain the only history bases. */
export default function AccountsReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const ready = useLedgerHydrated();
  const accounts = useLedgerStore(state => state.accounts);
  const categories = useLedgerStore(state => state.categories);
  const transactions = useLedgerStore(state => state.transactions);
  const transfers = useLedgerStore(state => state.transfers);
  const [period, setPeriod] = useReportPeriod();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('');
  const month = period.from.slice(0, 7);
  const rows = useMemo(() => ready ? aggregateAccountsReport(
    { accounts, categories, transactions, transfers }, { from: period.from, to: period.to },
    accounts.filter(account => typeof account.openingBalanceDate === 'string')
      .map(account => ({ accountId: account.id, openingBalanceDate: account.openingBalanceDate! })),
  ) : null, [ready, accounts, categories, transactions, transfers, period]);
  // Filter AFTER aggregation so refund originals and both transfer legs stay available.
  const selectedRows = rows?.filter(row => accountId === null || row.accountId === accountId) ?? [];
  const validSelection = accountId === null || selectedRows.length === 1;
  const currencies = [...new Set(selectedRows.map(row => row.currencyCode))];
  const activeCurrency = currencies.includes(currency) ? currency : currencies[0] ?? '';
  const visible = selectedRows.filter(row => row.currencyCode === activeCurrency);
  const historical = visible.length > 0 && visible.every(verified);
  const sum = (field: 'openingBalance' | 'closingBalance' | 'change') => {
    if (!historical) return null;
    let units = 0;
    for (const row of visible) { units += row.minorUnits![field]; if (!Number.isSafeInteger(units)) return null; }
    return units / 10 ** getCurrencyDecimals(activeCurrency);
  };
  const money = (value: number | null, code: string) => value === null ? 'Unavailable' : formatAmount(value, code) + ' ' + code;
  return <Screen scroll>
    <ReportTitle active="accounts" title="Accounts Report" />
    <ReportDates period={period} onChange={setPeriod} />
    <ReportPicker label="Acc." value={accountId ?? ''} onSelect={value => setAccountId(value || null)} options={[{ id: '', label: 'All accounts' }, ...accounts.map(account => ({ id: account.id, label: account.name + ' ' + currencyLabel(account.currencyCode) + (account.archived ? ' · Archived' : '') }))]} />
    {!ready || !rows ? <ActivityIndicator accessibilityLabel="Loading accounts report" color={moduleColors.finance} /> : !validSelection ? <ReportStatus warning>Selected account is missing or ambiguous. Select another account.</ReportStatus> : selectedRows.length === 0 ? <ReportStatus>No accounts for this selection.</ReportStatus> : <>
      <ReportCurrencyAnalysis currencies={currencies} value={activeCurrency} onSelect={setCurrency} />
      {historical ? <ReportSummaryCards currency={activeCurrency} cards={[{ label: 'Opening Balance', value: sum('openingBalance') }, { label: 'Closing Balance', value: sum('closingBalance') }, { label: 'Net Change', value: sum('change') }]} /> : <ReportStatus warning>Historical balances unavailable — incomplete account history.</ReportStatus>}
      {historical && <ReportChart currency={activeCurrency} title="Account analysis" description="Positive verified closing balances; negative balances remain in details." empty="No positive verified balances to chart." data={visible.map(row => ({ id: row.accountId, label: row.accountName, amount: row.closingBalance! }))} />}
      <AppText variant="bodyStrong" style={{ marginTop: 6 }}>Accounts ({visible.length})</AppText>
      {visible.map((row, index) => <View key={row.accountId + ':' + index} testID={'account-report-' + row.accountId} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 3 }}>
        <ReportDetails title={row.accountName} actionLabel="Details">
          {verified(row) ? <>
            <ReportKeyValues items={[{ label: 'Opening Balance', value: money(row.openingBalance, row.currencyCode) }, { label: 'Closing Balance', value: money(row.closingBalance, row.currencyCode) }, { label: 'Net Change', value: money(row.change, row.currencyCode) }]} />
            <ReportDetails title={'Movements for ' + row.accountName} actionLabel="Details"><ReportKeyValues items={([
              ['Income', row.movements!.income], ['Expenses', row.movements!.expenses], ['Refunds', row.movements!.refunds], ['Transfers in', row.movements!.transfersIn], ['Transfers out', row.movements!.transfersOut], ['Credit-card repayments in (included above)', row.movements!.creditCardRepaymentsIn], ['Credit-card repayments out (included above)', row.movements!.creditCardRepaymentsOut],
            ] as const).map(([label, value]) => ({ label, value: money(value, row.currencyCode) }))} /></ReportDetails>
          </> : <AppText variant="caption">{row.reason ?? 'Account movements could not be reconciled.'}</AppText>}
          {row.diagnostics.filter(item => item.kind !== 'account').map((item, i) => <AppText key={i} variant="caption">{item.kind}: {item.id} · {item.reason}</AppText>)}
        </ReportDetails>
        <AppText variant="caption" color="textSecondary">Current account · {currencyLabel(row.currencyCode)}{row.archived ? ' · Archived' : ''}</AppText>
      </View>)}
      <ReportNotice summary={historical ? 'Verified account history. Each currency stays separate.' : 'Current account information is shown separately.'}>Balances require a verified opening-balance date and complete movements. Balances and movements are unavailable, not zero, when history cannot be reconciled. Current account identity and currency above do not imply verified historical balances. Net Change = Income − Expenses + Refunds + Transfers in − Transfers out. Repayments are included in transfers once. Includes financing cash movements. Negative credit-card balances represent debt.</ReportNotice>
      <ReportStatementLink accessibilityLabel="View Accounts Statement" period={period} onPress={() => router.push({ pathname: '/finance/statement-accounts', params: { month, from: period.from, to: period.to, ...(accountId ? { accountId } : {}), currencyCode: activeCurrency } })} />
      <ReportTableActions table={{ title: 'Accounts Report', period, notice: 'Verified account history only. Each currency is separate. Repayments are included in transfers once. Historical balances relate to the selected period, not current bank balances.', verified: historical, columns: ['Account', 'Currency', 'Opening balance', 'Closing balance', 'Net change'], rows: visible.map(row => [row.accountName, row.currencyCode, row.openingBalance, row.closingBalance, row.change]) }} />
    </>}
  </Screen>;
}
