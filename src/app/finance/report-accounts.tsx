import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useLedgerHydrated, useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { aggregateAccountsReport, type AccountReportRow } from '@/features/finance/utils/reportAccounts';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

function monthPeriod(month: string) {
  const [year, number] = month.split('-').map(Number);
  return { from: `${month}-01`,
    to: `${month}-${new Date(year, number, 0).getDate()}`,
    label: new Date(year, number - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  if (date.getFullYear() < 100 || date.getFullYear() > 9999) return month;
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function AccountSummary({ row }: { row: AccountReportRow }) {
  const { colors, spacing } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const available = row.status === 'available' && row.reconciled && row.movements !== null
    && [row.openingBalance, row.closingBalance, row.change, ...Object.values(row.movements)].every(
      value => value !== null && Number.isFinite(value));
  const amount = (value: number | null) => available && value !== null
    ? `${formatAmount(value, row.currencyCode)} ${row.currencyCode}` : 'Unavailable';
  return (
    <View testID={`account-report-${row.accountId}`} style={{ padding: spacing.md, marginBottom: spacing.sm,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12 }}>
      <AppText variant="bodyStrong">{row.accountName}</AppText>
      <AppText variant="caption" color="textSecondary">{row.currencyCode}{row.archived ? ' · Archived' : ''}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
        {([['Opening Balance', row.openingBalance], ['Closing Balance', row.closingBalance],
          ['Net Change', row.change]] as const).map(([label, value]) => (
          <View key={label} style={{ flexGrow: 1, flexBasis: 100, minWidth: 0 }}>
            <AppText variant="caption" color="textSecondary">{label}</AppText>
            <AppText variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{amount(value)}</AppText>
          </View>
        ))}
      </View>
      {!available ? (
        <View accessibilityRole="alert" style={{ marginTop: spacing.sm }}>
          <AppText variant="bodyStrong">Incomplete history</AppText>
          <AppText color="textSecondary">{row.reason ?? 'Account movements could not be reconciled.'}</AppText>
          {row.diagnostics.filter(item => item.kind !== 'account').map((item, index) => (
            <AppText key={index} variant="caption" color="textSecondary">{item.kind}: {item.id}</AppText>
          ))}
          <AppText variant="caption" color="textSecondary">Balances and movements are unavailable, not zero.</AppText>
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Movements for ${row.accountName}`}
            accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText>{expanded ? 'Hide movements' : 'Show movements'}</AppText>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
          </Pressable>
          {expanded && row.movements && (
            <View>
              {([['Income', row.movements.income], ['Expenses', row.movements.expenses],
                ['Refunds', row.movements.refunds], ['Transfers in', row.movements.transfersIn],
                ['Transfers out', row.movements.transfersOut],
                ['Credit-card repayments in (included above)', row.movements.creditCardRepaymentsIn],
                ['Credit-card repayments out (included above)', row.movements.creditCardRepaymentsOut]] as const)
                .map(([label, value]) => (
                  <View key={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingVertical: spacing.xs }}>
                    <AppText color="textSecondary" style={{ flexGrow: 1, flexBasis: 150 }}>{label}</AppText>
                    <AppText style={{ fontVariant: ['tabular-nums'] }}>{amount(value)}</AppText>
                  </View>
                ))}
              <AppText variant="caption" color="textSecondary">
                Net Change = Income − Expenses + Refunds + Transfers in − Transfers out. Repayments are included in transfers once.
              </AppText>
              <AppText variant="caption" color="textSecondary">Includes financing cash movements. Negative credit-card balances represent debt.</AppText>
            </View>
          )}
        </>
      )}
    </View>
  );
}

/** Read-only presentation; uses only explicitly verified account history bases. */
export default function AccountsReportScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const ready = useLedgerHydrated();
  const accounts = useLedgerStore(state => state.accounts);
  const categories = useLedgerStore(state => state.categories);
  const transactions = useLedgerStore(state => state.transactions);
  const transfers = useLedgerStore(state => state.transfers);
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const period = useMemo(() => monthPeriod(month), [month]);
  const rows = useMemo(() => ready ? aggregateAccountsReport(
    { accounts, categories, transactions, transfers }, { from: period.from, to: period.to },
    // Only explicit, stored verification dates qualify as historical bases.
    accounts.filter(account => typeof account.openingBalanceDate === 'string')
      .map(account => ({ accountId: account.id, openingBalanceDate: account.openingBalanceDate! })),
  ) : null, [ready, accounts, categories, transactions, transfers, period]);
  // Filter AFTER aggregation so refund originals and both transfer legs stay available.
  const selectedRows = rows?.filter(row => accountId === null || row.accountId === accountId);
  const validSelection = accountId === null || selectedRows?.length === 1;
  const selectedAccount = accounts.filter(account => account.id === accountId);
  const selectionLabel = accountId === null ? 'All accounts' : selectedAccount.length === 1
    ? `${selectedAccount[0].name} (${selectedAccount[0].currencyCode})${selectedAccount[0].archived ? ' · Archived' : ''}`
    : 'Unavailable account';
  return (
    <Screen scroll>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Reports" onPress={() => router.back()}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
        <Ionicons name="arrow-back" size={23} color={colors.text} />
        <AppText style={{ marginLeft: spacing.sm }}>Reports</AppText>
      </Pressable>
      <AppText variant="h1">Accounts Report</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={month === '0100-01'}
          onPress={() => setMonth(value => shiftMonth(value, -1))}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <AppText variant="bodyStrong" style={{ flexShrink: 1 }}>{period.label}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={month === '9999-12'}
          onPress={() => setMonth(value => shiftMonth(value, 1))}
          style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </Pressable>
      </View>
      <AppText variant="caption" color="textSecondary">{period.from} to {period.to}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Account: ${selectionLabel}`}
        accessibilityState={{ expanded: pickerOpen }} onPress={() => setPickerOpen(value => !value)}
        style={{ minHeight: 44, paddingVertical: spacing.sm, marginVertical: spacing.sm,
          flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText style={{ flex: 1 }}>{selectionLabel}</AppText>
        <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
      </Pressable>
      {pickerOpen && [{ id: null, label: 'All accounts' }, ...accounts.map(account => ({
        id: account.id, label: `${account.name} (${account.currencyCode})${account.archived ? ' · Archived' : ''}`,
      }))].map((option, index) => (
        <Pressable key={index} accessibilityRole="button" accessibilityLabel={option.label}
          accessibilityState={{ selected: accountId === option.id }}
          onPress={() => { setAccountId(option.id); setPickerOpen(false); }}
          style={{ minHeight: 44, padding: spacing.sm, borderBottomWidth: 1, borderColor: colors.border }}>
          <AppText>{option.label}</AppText>
        </Pressable>
      ))}
      {ready && rows && validSelection && <Pressable accessibilityRole="button" accessibilityLabel="View Accounts Statement"
        onPress={() => router.push({ pathname: '/finance/statement-accounts',
          params: { month, ...(accountId ? { accountId } : {}) } })}
        style={{ minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm }}>
        <AppText color="primary">View Statement · {month}</AppText>
      </Pressable>}
      {!ready || !rows ? <ActivityIndicator accessibilityLabel="Loading accounts report" color={moduleColors.finance} /> : (
        <>
          <AppText variant="caption" color="textSecondary" style={{ marginBottom: spacing.sm }}>
            Each account stays in its own currency. Balances require a verified opening-balance date and complete movements; verified dates are not yet available in this app.
          </AppText>
          {!validSelection ? <AppText accessibilityRole="alert">Selected account is missing or ambiguous. Select another account.</AppText>
            : selectedRows?.length === 0 ? <AppText>No accounts for this selection.</AppText>
              : selectedRows?.map((row, index) => <AccountSummary key={`${row.accountId}-${index}`} row={row} />)}
        </>
      )}
    </Screen>
  );
}
