
import { Ionicons } from '@expo/vector-icons';
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
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') return value;
  return value ? 1 : 0;
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <AppText style={styles.statValue}>{value}</AppText>
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
}: TotalCardProps) {
  const { spacing, colors } = useTheme();

  const setBaseCurrency = useCurrencyStore(
    (state) => state.setBaseCurrency
  );

  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const missingCount = countOf(missing);

  const selectedCurrency = CURRENCIES.find(
    (currency) => currency.code === baseCurrency
  );

  const currencyFlag = selectedCurrency?.flag ?? '🌐';

  const money = (n: number) => `${formatAmount(n)} ${baseCurrency}`;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Card>
        <AppText variant="caption" color="textSecondary">
          NET WORTH
        </AppText>

        <View style={[styles.balanceRow, { marginTop: spacing.xs }]}>
          <View style={styles.balanceAmount}>
            <AppText variant="h1">{formatAmount(total)}</AppText>
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
            <AppText style={styles.currencyFlag}>{currencyFlag}</AppText>
            <AppText style={styles.currencyCode}>{baseCurrency}</AppText>
            <Ionicons
              name="chevron-down"
              size={16}
              color={colors.text}
            />
          </Pressable>
        </View>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat label="Accounts" value={money(accountsTotal)} />
          <Stat label="Assets" value={money(assetsTotal)} />
        </View>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat
            label="Receivables"
            value={`+${money(receivablesTotal)}`}
          />
          <Stat
            label="Payables"
            value={`-${money(payablesTotal)}`}
          />
        </View>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat
            label="Loans Remaining"
            value={`-${money(loansRemainingTotal)}`}
          />
          <Stat label="" value="" />
        </View>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Stat label="Income" value={`+${money(income)}`} />
          <Stat label="Expense" value={`-${money(Math.abs(expense))}`} />
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
              <AppText variant="h3">Choose base currency</AppText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close currency picker"
                onPress={() => setCurrencyPickerOpen(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color="#333333" />
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
  row: { flexDirection: 'row' },
  stat: { flex: 1 },
  statValue: { fontWeight: '600', marginTop: 2 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  balanceAmount: {
    flex: 1,
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
