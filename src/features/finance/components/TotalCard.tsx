
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

interface TotalCardProps {
  baseCurrency: string;
  total: number;
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
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') return value;
  return value ? 1 : 0;
}

interface StatProps {
  label: string;
  value: string;
  icon: IconName;
  color: string;
  background: string;
  fullWidth?: boolean;
}

function Stat({
  label,
  value,
  icon,
  color,
  background,
  fullWidth = false,
}: StatProps) {
  return (
    <View style={[styles.stat, fullWidth && styles.fullWidthStat]}>
      <View style={[styles.statIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>

      <View style={styles.statContent}>
        <AppText style={styles.statLabel} numberOfLines={1}>
          {label}
        </AppText>

        <AppText
          style={styles.statValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value}
        </AppText>
      </View>
    </View>
  );
}

export function TotalCard({
  baseCurrency,
  total,
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
}: TotalCardProps) {
  const { spacing, colors } = useTheme();

  const setBaseCurrency = useCurrencyStore(
    (state) => state.setBaseCurrency,
  );

  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const missingCount = countOf(missing);

  const selectedCurrency = CURRENCIES.find(
    (currency) => currency.code === baseCurrency,
  );

  const currencyFlag = selectedCurrency?.flag ?? '🌐';
  const hiddenValue = '••••••';

  const money = (amount: number) =>
    amountsVisible
      ? `${formatAmount(amount)} ${baseCurrency}`
      : hiddenValue;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Card>
        {/* Net Worth heading */}
        <View style={styles.headingRow}>
          <View style={styles.netWorthHeading}>
            <View style={styles.netWorthIcon}>
              <Ionicons
                name="wallet"
                size={18}
                color={colors.primary}
              />
            </View>

            <AppText style={styles.netWorthLabel}>
              NET WORTH
            </AppText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              amountsVisible ? 'Hide amounts' : 'Show amounts'
            }
            accessibilityState={{ expanded: amountsVisible }}
            onPress={onToggleAmounts}
            hitSlop={10}
            style={styles.visibilityButton}
          >
            <Ionicons
              name={amountsVisible ? 'eye-outline' : 'eye-off-outline'}
              size={21}
              color={colors.text}
            />
          </Pressable>
        </View>

        {/* Main balance */}
        <View style={[styles.balanceRow, { marginTop: spacing.xs }]}>
          <View style={styles.balanceAmount}>
            <AppText
              variant="h1"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={styles.netWorthAmount}
            >
              {amountsVisible ? formatAmount(total) : hiddenValue}
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

        {/* Accounts and Assets */}
        <View style={[styles.row, { marginTop: spacing.lg }]}>
          <Stat
            label="Accounts"
            value={money(accountsTotal)}
            icon="wallet"
            color="#2878D0"
            background="#EAF3FC"
          />

          <Stat
            label="Assets"
            value={money(assetsTotal)}
            icon="diamond"
            color="#7556B8"
            background="#F0EBFA"
          />
        </View>

        {/* Receivables and Payables */}
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat
            label="Receivables"
            value={
              amountsVisible
                ? `+${money(receivablesTotal)}`
                : hiddenValue
            }
            icon="arrow-down-circle"
            color="#209B70"
            background="#E7F5EF"
          />

          <Stat
            label="Payables"
            value={
              amountsVisible
                ? `-${money(payablesTotal)}`
                : hiddenValue
            }
            icon="arrow-up-circle"
            color="#D65353"
            background="#FBECEC"
          />
        </View>

        {/* Income and Expense */}
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat
            label="Income"
            value={
              amountsVisible
                ? `+${money(income)}`
                : hiddenValue
            }
            icon="trending-up"
            color="#209B70"
            background="#E7F5EF"
          />

          <Stat
            label="Expense"
            value={
              amountsVisible
                ? `-${money(Math.abs(expense))}`
                : hiddenValue
            }
            icon="trending-down"
            color="#D65353"
            background="#FBECEC"
          />
        </View>

        {/* Loans Remaining - full width at the bottom */}
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat
            label="Loans Remaining"
            value={
              amountsVisible
                ? `-${money(loansRemainingTotal)}`
                : hiddenValue
            }
            icon="card"
            color="#B98218"
            background="#FBF3E2"
            fullWidth
          />
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

      {/* Base currency picker */}
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
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#EAF1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  netWorthLabel: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  netWorthAmount: {
    fontSize: 28.5,
    fontWeight: '700',
  },
  visibilityButton: {
    padding: 5,
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
    paddingVertical: 8,
  },
  currencyFlag: {
    fontSize: 18,
  },
  currencyCode: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    minHeight: 70,
    borderRadius: 12,
    backgroundColor: '#F7F8FC',
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullWidthStat: {
    flex: 1,
    width: '100%',
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    fontWeight: '800',
    fontSize: 14,
  },
  statValue: {
    fontWeight: '700',
    fontSize: 15,
    marginTop: 5,
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
