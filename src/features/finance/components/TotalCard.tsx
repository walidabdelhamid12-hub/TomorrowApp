
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
  color: string;
  background: string;
  amount?: number;
  sign?: '+' | '-';
}

const NETWORK_ITEMS: NetworkItem[] = [
  {
    key: 'accounts',
    label: 'Accounts',
    description: 'Manage your accounts',
    icon: 'wallet-outline',
    color: '#2878D0',
    background: '#EAF3FC',
    amount: 0,
  },
  {
    key: 'assets',
    label: 'Assets',
    description: 'Track your assets',
    icon: 'diamond-outline',
    color: '#7556B8',
    background: '#F0EBFA',
    amount: 0,
  },
  {
    key: 'receivable',
    label: 'Receivable',
    description: 'Manage what others owe you',
    icon: 'arrow-down-circle-outline',
    color: '#209B70',
    background: '#E7F5EF',
    amount: 0,
    sign: '+',
  },
  {
    key: 'payable',
    label: 'Payable',
    description: 'Manage what you owe',
    icon: 'arrow-up-circle-outline',
    color: '#D65353',
    background: '#FBECEC',
    amount: 0,
    sign: '-',
  },
  {
    key: 'income',
    label: 'Income',
    description: 'Record your income',
    icon: 'trending-up-outline',
    color: '#209B70',
    background: '#E7F5EF',
    amount: 0,
    sign: '+',
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'Track your expenses',
    icon: 'trending-down-outline',
    color: '#D65353',
    background: '#FBECEC',
    amount: 0,
    sign: '-',
  },
  {
    key: 'loans',
    label: 'Loans',
    description: 'Manage your loans',
    icon: 'cash-outline',
    color: '#B98218',
    background: '#FBF3E2',
    amount: 0,
    sign: '-',
  },
  {
    key: 'cheques',
    label: 'Cheques',
    description: 'Manage your cheques',
    icon: 'document-text-outline',
    color: '#159BB5',
    background: '#E6F7FA',
  },
  {
    key: 'categories',
    label: 'Categories',
    description: 'Manage your categories',
    icon: 'grid-outline',
    color: '#7556B8',
    background: '#F0EBFA',
  },
  {
    key: 'transfers',
    label: 'Transfers',
    description: 'Move money between accounts',
    icon: 'swap-horizontal-outline',
    color: '#2878D0',
    background: '#EAF3FC',
  },
];

type VisibilityState = Record<FinanceNetworkKey, boolean>;

const INITIAL_VISIBILITY: VisibilityState = {
  accounts: true,
  assets: true,
  receivable: true,
  payable: true,
  income: true,
  expenses: true,
  loans: true,
  cheques: true,
  categories: true,
  transfers: true,
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
  onToggleVisibility,
  onPress,
}: {
  item: NetworkItem;
  currency: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onPress: () => void;
}) {
  const hasAmount = typeof item.amount === 'number';

  const formattedAmount = hasAmount
    ? `${item.sign ?? ''}${formatAmount(item.amount ?? 0)} ${currency}`
    : null;

  return (
    <View
      style={[
        styles.networkCard,
        {
          backgroundColor: item.background,
          borderColor: `${item.color}35`,
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
              <View style={[styles.networkIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={21} color={item.color} />
              </View>
              <AppText style={styles.networkLabel} numberOfLines={1}>{item.label}</AppText>
            </View>
            <AppText style={[styles.networkAmount, { color: item.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {visible ? (formattedAmount ?? 'Open to view') : '••••••'}
            </AppText>
          </View>
        </View>

        <Ionicons
          name="chevron-forward"
          size={17}
          color="#667085"
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          visible
            ? `Hide ${item.label} amount`
            : `Show ${item.label} amount`
        }
        accessibilityState={{ expanded: visible }}
        onPress={onToggleVisibility}
        hitSlop={8}
        style={({ pressed }) => [
          styles.networkEye,
          {
            opacity: pressed ? 0.55 : 1,
          },
        ]}
      >
        <Ionicons
          name={visible ? 'eye-outline' : 'eye-off-outline'}
          size={21}
          color="#25304A"
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
  receivablesTotal,
  payablesTotal,
  missing,
  income,
  expense,
  amountsVisible,
  onToggleAmounts,
  onNetworkPress,
  chequesTotal,
  transfersTotal,
}: TotalCardProps) {
  const { spacing, colors } = useTheme();

  const setBaseCurrency = useCurrencyStore(
    (state) => state.setBaseCurrency,
  );

  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const [networkVisibility, setNetworkVisibility] =
    useState<VisibilityState>(INITIAL_VISIBILITY);

  const missingCount = countOf(missing);

  const selectedCurrency = CURRENCIES.find(
    (currency) => currency.code === baseCurrency,
  );

  const currencyFlag = selectedCurrency?.flag ?? '🌐';
  const hiddenValue = '••••••';

  const networkItems = NETWORK_ITEMS.map((item) => {
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

      case 'cheques':
        return { ...item, amount: chequesTotal };

      case 'transfers':
        return { ...item, amount: transfersTotal };

      default:
        return item;
    }
  });

  const toggleNetworkVisibility = (key: FinanceNetworkKey) => {
    setNetworkVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Card>
        <View style={styles.headingRow}>
          <View style={styles.netWorthHeading}>
            <View style={styles.netWorthIcon}>
              <Ionicons
                name="wallet"
                size={19}
                color={colors.primary}
              />
            </View>

            <AppText style={styles.netWorthLabel}>
              TOTAL LIQUIDITY
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              amountsVisible ? 'Hide total liquidity' : 'Show total liquidity'
            }
            accessibilityState={{ expanded: amountsVisible }}
            onPress={onToggleAmounts}
            hitSlop={10}
            style={styles.visibilityButton}
          >
            <Ionicons
              name={amountsVisible ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.text}
            />
          </Pressable>
        </View>

        <View style={[styles.balanceRow, { marginTop: spacing.sm }]}>
          <View style={styles.balanceAmount}>
            <AppText
              variant="h1"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={styles.netWorthAmount}
            >
              {amountsVisible ? formatAmount(accountsTotal) : hiddenValue}
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

        <View style={styles.networkDivider} />

        <View style={styles.shortcutsHeading}>
          <AppText style={styles.sectionTitle}>
            Finance Shortcuts
          </AppText>

          <AppText style={styles.shortcutsCount}>
            10 sections
          </AppText>
        </View>

        <View style={styles.networkGrid}>
          {networkItems.map((item) => (
            <NetworkCard
              key={item.key}
              item={item}
              currency={baseCurrency}
              visible={networkVisibility[item.key]}
              onToggleVisibility={() =>
                toggleNetworkVisibility(item.key)
              }
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
            {`${missingCount} item(s) could not be converted to ${baseCurrency}. Check Rates.`}
          </AppText>
        ) : null}
      </Card>

      <Modal
        visible={currencyPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.currencyModal}>
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
                  color="#333333"
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
                      selected && styles.selectedCurrencyOption,
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
    padding: 6,
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
    minHeight: 70,
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
    width: 38,
    height: 38,
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
