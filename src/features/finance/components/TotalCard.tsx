import type { FinanceTone } from '@/theme/colors';

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AppText, Card } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type FinanceNetworkKey =
  | 'debts'
  | 'accounts'
  | 'assets'
  | 'receivable'
  | 'payable'
  | 'income'
  | 'expenses'
  | 'loans'
  | 'cheques'
  | 'categories'
  | 'transfers';

interface TotalCardProps {
  baseCurrency: string;
  accountsTotal: number;
  assetsTotal: number;
  loansRemainingTotal: number;
  netWorth?: number;
  loansInstallmentsRemainingTotal?: number;
  receivablesTotal: number;
  payablesTotal: number;
  missing?: unknown;
  income: number;
  expense: number;
  amountsVisible: boolean;
  onToggleAmounts: () => void;
  onNetworkPress: (key: FinanceNetworkKey) => void;
  chequesTotal?: number;
  transfersTotal?: number;
}

interface NetworkItem {
  key: FinanceNetworkKey;
  label: string;
  description: string;
  icon: IconName;
  amount?: number;
  sign?: '+' | '-';
}

const NETWORK_ITEMS: NetworkItem[] = [
  {
    key: 'accounts',
    label: 'Accounts',
    description: 'Manage your accounts',
    icon: 'wallet-outline',
    amount: 0,
  },
  {
    key: 'assets',
    label: 'Assets',
    description: 'Track your assets',
    icon: 'diamond-outline',
    amount: 0,
  },
  { key: 'debts', label: 'Debts', description: 'Receivables and payables', icon: 'people-outline' },
  {
    key: 'income',
    label: 'Income',
    description: 'Record your income',
    icon: 'trending-up-outline',
    amount: 0,
    sign: '+',
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'Track your expenses',
    icon: 'trending-down-outline',
    amount: 0,
    sign: '-',
  },
  {
    key: 'loans',
    label: 'Loans',
    description: 'Manage your loans',
    icon: 'cash-outline',
    amount: 0,
    sign: '-',
  },
  {
    key: 'cheques',
    label: 'Installments',
    description: 'Manage your cheques',
    icon: 'document-text-outline',
  },
  {
    key: 'categories',
    label: 'Categories',
    description: 'Manage your categories',
    icon: 'grid-outline',
  },
  {
    key: 'transfers',
    label: 'Transfers',
    description: 'Move money between accounts',
    icon: 'swap-horizontal-outline',
  },
];

const NETWORK_TONES: Partial<Record<FinanceNetworkKey, FinanceTone>> = {
  expenses: 'expense', income: 'income', accounts: 'account', assets: 'asset',
  cheques: 'transfer', loans: 'liability', debts: 'liability', transfers: 'transfer',
};

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') return value;
  return value ? 1 : 0;
}

function NetworkCard({
  item,
  currency,
  visible,
  onPress,
}: {
  item: NetworkItem;
  currency: string;
  visible: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const tone = colors.finance[NETWORK_TONES[item.key] ?? 'neutral'];
  const hasAmount = typeof item.amount === 'number';

  const formattedAmount = hasAmount
    ? `${item.sign ?? ''}${formatAmount(item.amount ?? 0, currency)} ${currency}`
    : null;

  return (
    <View
      style={[
        styles.networkCard,
        item.key === 'categories' && { width: '100%' },
        {
          backgroundColor: tone.surface,
          borderColor: tone.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.label}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.networkCardBody,
          {
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <View style={styles.networkMain}>
          <View style={styles.networkInfo}>
            <View style={styles.networkTitleRow}>
              <View style={[styles.networkIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name={item.icon} size={18} color={tone.accent} />
              </View>
              <AppText style={[styles.networkLabel, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.label}</AppText>
            </View>
            <AppText style={[styles.networkAmount, { color: tone.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {item.key === 'cheques' ? 'Coming soon' : visible ? (formattedAmount ?? (item.key === 'categories' ? 'Manage categories' : 'Open to view')) : '••••••'}
            </AppText>
          </View>
        </View>

        <Ionicons
          name="chevron-forward"
          size={17}
          color={colors.textSecondary}
        />
      </Pressable>

    </View>
  );
}

export function TotalCard({
  baseCurrency,
  accountsTotal,
  assetsTotal,
  loansRemainingTotal,
  netWorth,
  loansInstallmentsRemainingTotal,
  receivablesTotal,
  payablesTotal,
  missing,
  income,
  expense,
  amountsVisible,
  onToggleAmounts,
  onNetworkPress,
  transfersTotal,
}: TotalCardProps) {
  const { spacing, colors } = useTheme();

  const setBaseCurrency = useCurrencyStore(
    (state) => state.setBaseCurrency,
  );

  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const [explanationOpen, setExplanationOpen] = useState(false);

  const missingCount = countOf(missing);

  const selectedCurrency = CURRENCIES.find(
    (currency) => currency.code === baseCurrency,
  );

  const currencyFlag = selectedCurrency?.flag ?? '🌐';
  const hiddenValue = '••••••';

  const order: FinanceNetworkKey[] = ['expenses', 'income', 'accounts', 'assets', 'cheques', 'loans', 'debts', 'transfers', 'categories'];
  const networkItems = NETWORK_ITEMS.filter(item => item.key !== 'categories').sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map((item) => {
    switch (item.key) {
      case 'accounts':
        return { ...item, amount: accountsTotal };

      case 'assets':
        return { ...item, amount: assetsTotal };

      case 'receivable':
        return { ...item, amount: receivablesTotal };

      case 'payable':
        return { ...item, amount: payablesTotal };

      case 'income':
        return { ...item, amount: income };

      case 'expenses':
        return { ...item, amount: Math.abs(expense) };

      case 'loans':
        return { ...item, amount: loansRemainingTotal };

      case 'debts':
        return { ...item, amount: receivablesTotal - payablesTotal };

      case 'cheques':
        return item;

      case 'transfers':
        return { ...item, amount: transfersTotal };

      default:
        return item;
    }
  });

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Card variant="outlined" style={{ backgroundColor: colors.finance.balance.surface, borderColor: colors.finance.balance.border, borderRadius: 14 }}>
        <View style={styles.headingRow}>
          <View style={styles.netWorthHeading}>
            <View style={[styles.netWorthIcon, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons
                name="wallet"
                size={19}
                color={colors.primary}
              />
            </View>

            <AppText style={styles.netWorthLabel}>
              TOTAL BALANCE
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={amountsVisible ? 'Hide Finance amounts' : 'Show Finance amounts'}
            accessibilityState={{ selected: amountsVisible }} onPress={onToggleAmounts}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={amountsVisible ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.balanceRow, { marginTop: spacing.xs }]}>

          <View style={styles.balanceAmount}>
            <AppText
              variant="h1"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.35}
              style={styles.netWorthAmount}
            >
              {amountsVisible ? formatAmount(accountsTotal + assetsTotal, baseCurrency) : hiddenValue}
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Base currency ${baseCurrency}. Change currency`}
            accessibilityHint="Opens the base currency list"
            style={[
              styles.currencyButton,
              { borderColor: colors.border },
            ]}
            onPress={() => setCurrencyPickerOpen(true)}
          >
            <AppText style={styles.currencyFlag}>
              {currencyFlag}
            </AppText>

            <AppText style={styles.currencyCode}>
              {baseCurrency}
            </AppText>

            <Ionicons
              name="chevron-down"
              size={16}
              color={colors.text}
            />
          </Pressable>
        </View>

        <View style={[styles.worthRow, { borderColor: colors.border }]}>
          <Ionicons name="analytics-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption">Net Worth</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Explain Net Worth" accessibilityState={{ expanded: explanationOpen }}
            onPress={() => setExplanationOpen(value => !value)} style={styles.visibilityButton}>
            <Ionicons name="information-circle-outline" size={19} color={colors.textSecondary} />
          </Pressable>
          <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ flex: 1, textAlign: 'right' }}>
            {amountsVisible ? formatAmount(netWorth ?? accountsTotal + assetsTotal + receivablesTotal - payablesTotal - loansRemainingTotal, baseCurrency) + ' ' + baseCurrency : hiddenValue}
          </AppText>
        </View>
        {explanationOpen && <AppText variant="caption" color="textSecondary">
          Account balances + assets + receivables − payables − remaining received loan principal. Credit-card balances are already included in accounts. Future contractual installments include financing costs and are not subtracted again. Totals use underlying precision; adding rounded displays can differ by 0.01.
        </AppText>}
        {loansInstallmentsRemainingTotal !== undefined && <AppText variant="caption" color="textSecondary">
          {'Loan future contractual payments: ' + (amountsVisible ? formatAmount(loansInstallmentsRemainingTotal, baseCurrency) + ' ' + baseCurrency : hiddenValue)}
        </AppText>}
        <View style={[styles.networkDivider, { backgroundColor: colors.border }]} />

        <View style={styles.shortcutsHeading}>
          <AppText style={styles.sectionTitle}>
            Finance Shortcuts
          </AppText>

          <AppText style={[styles.shortcutsCount, { color: colors.finance.neutral.accent }]}>
            {networkItems.length} sections
          </AppText>
        </View>

        <View style={styles.networkGrid}>
          {networkItems.map((item) => (
            <NetworkCard
              key={item.key}
              item={item}
              currency={baseCurrency}
              visible={amountsVisible}
              onPress={() => onNetworkPress(item.key)}
            />
          ))}
        </View>

        {missingCount > 0 ? (
          <AppText
            variant="caption"
            color="danger"
            style={{ marginTop: spacing.md }}
          >
            {`${missingCount} item(s) have unavailable valuation or principal allocation in ${baseCurrency}. Check Rates and loan details.`}
          </AppText>
        ) : null}
      </Card>

      <Modal
        visible={currencyPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyPickerOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.currencyModal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <AppText variant="h3">
                Choose base currency
              </AppText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close currency picker"
                onPress={() => setCurrencyPickerOpen(false)}
                hitSlop={10}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.text}
                />
              </Pressable>
            </View>

            <AppText
              color="textSecondary"
              style={styles.modalDescription}
            >
              Totals will be displayed in the selected currency.
            </AppText>

            <ScrollView style={styles.currencyList}>
              {CURRENCIES.map((currency) => {
                const selected = currency.code === baseCurrency;

                return (
                  <Pressable
                    key={currency.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.currencyOption,
                      { borderBottomColor: colors.border },
                      selected && { backgroundColor: colors.surfaceAlt, borderRadius: 8 },
                    ]}
                    onPress={() => {
                      setBaseCurrency(currency.code);
                      setCurrencyPickerOpen(false);
                    }}
                  >
                    <View style={styles.currencyOptionInfo}>
                      <AppText style={styles.optionFlag}>
                        {currency.flag}
                      </AppText>

                      <AppText>
                        {currency.name} ({currency.code})
                      </AppText>
                    </View>

                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={colors.primary}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  worthRow: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  netWorthHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  netWorthIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EAF1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  netWorthLabel: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  netWorthAmount: {
    fontSize: 28,
    fontWeight: '700',
  },
  visibilityButton: {
    minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  balanceAmount: {
    flex: 1,
    minWidth: 0,
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    minHeight: 48,
    paddingVertical: 6,
  },
  currencyFlag: {
    fontSize: 18,
  },
  currencyCode: {
    fontWeight: '700',
  },
  networkDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginTop: 20,
  },
  shortcutsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  shortcutsCount: {
    fontSize: 11,
    color: '#8A91A2',
    fontWeight: '600',
  },
  networkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  networkCard: {
    width: '48.5%',
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
  },
  networkCardBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  networkMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 5,
  },
  networkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  networkIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  networkLabel: {
    fontSize: 13,
    fontWeight: '800',
  },

  networkAmount: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },
  networkEye: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  currencyModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalDescription: {
    marginBottom: 12,
  },
  currencyList: {
    flexGrow: 0,
  },
  currencyOption: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDDDDD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  currencyOptionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionFlag: {
    fontSize: 18,
  },
  selectedCurrencyOption: {
    backgroundColor: '#F0F5FF',
    borderRadius: 8,
  },
});
