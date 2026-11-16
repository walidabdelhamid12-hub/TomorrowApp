import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { SixReportDetails, SixReportInfo } from '@/features/finance/components/reporting/SixReportPresentation';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { aggregateAccountsReport, type AccountReportRow } from '@/features/finance/utils/reportAccounts';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { CURRENCIES, getCurrencyLabel } from '@/features/finance/constants/currencies';
import { useCurrencyHydrated, useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { reportVerifiedConversion } from '@/features/finance/utils/reportVerifiedConversion';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { moduleColors, useTheme } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportCurrencyAnalysis, ReportCurrencyTiles, ReportSummaryCards, ReportKeyValues } from '@/features/finance/components/reporting/ReportUnifiedSix';
import { ReportPicker, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { BalanceCurrencyPicker } from '@/features/finance/components/reporting/BalanceCurrencyPicker';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportUnifiedSix';

function verified(row: AccountReportRow) {
  return row.status === 'available' && row.reconciled && row.movements !== null && row.minorUnits !== null;
}

/** Read-only presentation; explicit stored opening dates remain the only history bases. */
export default function AccountsReportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const ready = useLedgerHydrated();
  const currencyReady = useCurrencyHydrated();
  const baseCurrency = useCurrencyStore(state => state.baseCurrency);
  const rates = useCurrencyStore(state => state.rates);
  const verifiedCurrencies = useCurrencyStore(state => state.verifiedCurrencies);
  const [displayCurrency, setDisplayCurrency] = useState('');
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
  const activeCurrency = currencies.includes(currency) ? currency : '';
  const visible = selectedRows.filter(row => !activeCurrency || row.currencyCode === activeCurrency);
  const historical = !!activeCurrency && visible.length > 0 && visible.every(verified);
  const chartCurrency = activeCurrency || currencies.find(code => selectedRows.some(row => row.currencyCode === code && verified(row))) || currencies[0] || '';
  const chartRows = selectedRows.filter(row => row.currencyCode === chartCurrency && verified(row));
  const sum = (field: 'openingBalance' | 'closingBalance' | 'change') => {
    if (!historical) return null;
    let units = 0;
    for (const row of visible) { units += row.minorUnits![field]; if (!Number.isSafeInteger(units)) return null; }
    return units / 10 ** getCurrencyDecimals(activeCurrency);
  };
  const balanceCurrency = displayCurrency || baseCurrency;
  // This card values VERIFIED period-end balances; it does not claim current bank balances.
  const convertedClosing = currencyReady && selectedRows.length > 0 && selectedRows.every(verified)
    ? selectedRows.map(row => reportVerifiedConversion(row.closingBalance!, row.currencyCode, balanceCurrency, rates, verifiedCurrencies)) : [];
  const totalClosing = convertedClosing.length === selectedRows.length && convertedClosing.every(value => value !== null)
    ? convertedClosing.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const money = (value: number | null, code: string) => value === null ? 'Unavailable' : formatAmount(value, code) + ' ' + code;
  return <Screen scroll style={{ backgroundColor: '#F4F7FA' }}>
    <View style={{
  backgroundColor: '#1E293B',
  borderBottomLeftRadius: 24,
  borderBottomRightRadius: 24,
  marginBottom: 10,
  overflow: 'hidden',
  paddingTop: 12,
  paddingBottom: 14,
  paddingHorizontal: 10,
}}>
  <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => router.back()}
      style={{ width: 44, minHeight: 44, justifyContent: 'center' }}
    >
      <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
    </Pressable>
    <AppText variant="bodyStrong" style={{
      color: '#FFFFFF', flex: 1, textAlign: 'center', fontSize: 17,
    }}>
      Tomorrow Finance Report
    </AppText>
    <View style={{ width: 44 }} />
  </View>
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
    <Ionicons name="document-text-outline" size={20} color="#CBD5E1" />
    <AppText variant="bodyStrong" style={{ color: '#CBD5E1', fontSize: 16, fontWeight: '700' }}>
      Accounts Report
    </AppText>
  </View>
</View>
    <ReportDates period={period} onChange={setPeriod} />
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
      <View style={{ flex: 1 }}><ReportPicker label="Account" value={accountId ?? ''} onSelect={value => setAccountId(value || null)} options={[{ id: '', label: 'All accounts' }, ...accounts.map(account => ({ id: account.id, label: account.name + ' ' + currencyLabel(account.currencyCode) + (account.archived ? ' · Archived' : '') }))]} /></View>
      <View style={{ flex: 1 }}><ReportPicker label="Currency" value={activeCurrency} onSelect={setCurrency} options={[{ id: '', label: 'All currencies' }, ...currencies.map(code => ({ id: code, label: currencyLabel(code) }))]} /></View>
    </View>
    {!ready || !rows ? <ActivityIndicator accessibilityLabel="Loading accounts report" color={moduleColors.finance} /> : !validSelection ? <ReportStatus warning>Selected account is missing or ambiguous. Select another account.</ReportStatus> : selectedRows.length === 0 ? <ReportStatus>No accounts for this selection.</ReportStatus> : <>
      {historical ? <ReportSummaryCards currency={activeCurrency} cards={[{ label: 'Opening Balance', value: sum('openingBalance') }, { label: 'Closing Balance', value: sum('closingBalance') }, { label: 'Net Change', value: sum('change') }]} /> : null}
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginVertical: 8, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><AppText variant="bodyStrong" style={{ fontSize: 16, fontWeight: '800' }}>Total Accounts Balance</AppText></View>
          <View style={{ flexShrink: 0 }}><BalanceCurrencyPicker value={balanceCurrency} onSelect={setDisplayCurrency} /></View>
        </View>
        <AppText variant="bodyStrong" style={{ fontSize: 25, fontWeight: '800', marginTop: 8, fontVariant: ['tabular-nums'] }}>{totalClosing !== null && Number.isFinite(totalClosing) ? formatAmount(totalClosing, balanceCurrency) : 'Balance unavailable'}</AppText>
      </View>
      {<ReportChart currencies={currencies} onCurrencySelect={setCurrency} currency={chartCurrency} title="Account analysis" description="Positive verified closing balances; negative balances remain in details." empty="No positive verified balances to chart." data={chartRows.map(row => ({ id: row.accountId, label: row.accountName, amount: row.closingBalance! }))} />}
      <AppText variant="bodyStrong" style={{ marginTop: 6 }}>Accounts ({visible.length})</AppText>
      {visible.map((row, index) => <View key={row.accountId + ':' + index} testID={'account-report-' + row.accountId} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 3 }}>
        <SixReportDetails title={row.accountName} leadingIcon={currencyLabel(row.currencyCode).split(" ")[0]} subtitle={verified(row) ? money(row.closingBalance, row.currencyCode) : 'History unavailable'}>
          {verified(row) ? <>
            <ReportKeyValues items={[{ label: 'Opening Balance', value: money(row.openingBalance, row.currencyCode) }, { label: 'Closing Balance', value: money(row.closingBalance, row.currencyCode) }, { label: 'Net Change', value: money(row.change, row.currencyCode) }]} />
            <SixReportDetails title={'Movements for ' + row.accountName}><ReportKeyValues items={([
              ['Income', row.movements!.income], ['Expenses', row.movements!.expenses], ['Refunds', row.movements!.refunds], ['Transfers in', row.movements!.transfersIn], ['Transfers out', row.movements!.transfersOut], ['Credit-card repayments in (included above)', row.movements!.creditCardRepaymentsIn], ['Credit-card repayments out (included above)', row.movements!.creditCardRepaymentsOut],
            ] as const).map(([label, value]) => ({ label, value: money(value, row.currencyCode) }))} /></SixReportDetails>
          </> : <AppText variant="caption">{row.reason ?? 'Account movements could not be reconciled.'}</AppText>}
          {row.diagnostics.filter(item => item.kind !== 'account').map((item, i) => <AppText key={i} variant="caption">{item.kind}: {item.id} · {item.reason}</AppText>)}
        </SixReportDetails>
      </View>)}
      <ReportTableActions table={{ title: 'Accounts Report', period, notice: 'Verified account history only. Each currency is separate. Repayments are included in transfers once. Historical balances relate to the selected period, not current bank balances.', verified: historical, columns: ['Account', 'Currency', 'Opening balance', 'Closing balance', 'Net change'], rows: visible.map(row => [row.accountName, row.currencyCode, row.openingBalance, row.closingBalance, row.change]) }} statement={() => router.push({ pathname: '/finance/statement-accounts', params: { month, from: period.from, to: period.to, ...(accountId ? { accountId } : {}), currencyCode: activeCurrency } })} />
    </>}
  </Screen>;
}
