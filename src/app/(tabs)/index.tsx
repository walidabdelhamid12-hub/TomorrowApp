import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { AddAccountModal } from '@/features/finance/components/AddAccountModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AddTransactionModal } from '@/features/finance/components/AddTransactionModal';
import { AssetRow } from '@/features/finance/components/AssetRow';
import { RatesModal } from '@/features/finance/components/RatesModal';
import { getCurrencyLabel } from '@/features/finance/constants/currencies';
import { useAutoRefreshRates } from '@/features/finance/hooks/useAutoRefreshRates';
import {
  useCurrencyHydrated,
  useCurrencyStore,
} from '@/features/finance/store/useCurrencyStore';
import {
  useFinanceHydrated,
  useFinanceStore,
} from '@/features/finance/store/useFinanceStore';
import {
  useLedgerHydrated,
  useLedgerStore,
} from '@/features/finance/store/useLedgerStore';
import type {
  Account,
  Category,
  Transaction,
} from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import {
  filterByMonth,
  getAccountBalance,
  getMonthKey,
  sortTransactionsDesc,
} from '@/features/finance/utils/ledger';
import { convertAmount, formatMoney } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';
import { moduleColors, useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const RECENT_LIMIT = 8;

export default function FinanceRoute() {
  const { colors, spacing, radius } = useTheme();
  const accent = moduleColors.finance;

  const ledgerReady = useLedgerHydrated();
  const currencyReady = useCurrencyHydrated();
  const financeReady = useFinanceHydrated();
  const ready = ledgerReady && currencyReady && financeReady;

  useAutoRefreshRates(ready);

  // Raw slices only (Zustand v5). Everything derived goes through useMemo.
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const gold24PerGram = useCurrencyStore((s) => s.metals.gold24PerGram);
  const ratesUpdatedAt = useCurrencyStore((s) => s.updatedAt);
  const ratesSource = useCurrencyStore((s) => s.source);
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const transactions = useLedgerStore((s) => s.transactions);
  const removeTransaction = useLedgerStore((s) => s.removeTransaction);
  const assets = useFinanceStore((s) => s.assets);
  const deleteAsset = useFinanceStore((s) => s.deleteAsset);

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const monthKey = getMonthKey(todayISO());
  const monthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts]
  );

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  /** Totals in the base currency. Items without a rate are counted, not guessed. */
  const summary = useMemo(() => {
    let accountsTotal = 0;
    let assetsTotal = 0;
    let missing = 0;

    for (const account of activeAccounts) {
      const converted = convertAmount(
        getAccountBalance(account, transactions),
        account.currencyCode,
        baseCurrency,
        rates
      );
      if (converted === null) missing += 1;
      else accountsTotal += converted;
    }

    for (const asset of assets) {
      const value = getAssetValueInBase(
        asset,
        baseCurrency,
        rates,
        gold24PerGram
      );
      if (value === null) missing += 1;
      else assetsTotal += value;
    }

    return {
      accountsTotal,
      assetsTotal,
      total: accountsTotal + assetsTotal,
      missing,
    };
  }, [activeAccounts, assets, transactions, baseCurrency, rates, gold24PerGram]);

  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filterByMonth(transactions, monthKey)) {
      const converted = convertAmount(
        tx.amount,
        tx.currencyCode,
        baseCurrency,
        rates
      );
      if (converted === null) continue;
      if (tx.type === 'income') income += converted;
      else expense += converted;
    }
    return { income, expense };
  }, [transactions, monthKey, baseCurrency, rates]);

  const sortedTransactions = useMemo(
    () => sortTransactionsDesc(transactions),
    [transactions]
  );
  const visibleTransactions = showAll
    ? sortedTransactions
    : sortedTransactions.slice(0, RECENT_LIMIT);

  /* ------------------------------- Actions -------------------------------- */

  const openNewTransaction = () => {
    setEditingTx(null);
    setTxOpen(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setTxOpen(true);
  };

  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountOpen(true);
  };

  const openEditAccount = (account: Account) => {
    setEditingAccount(account);
    setAccountOpen(true);
  };

  const confirmRemoveTransaction = (id: string) => {
    Alert.alert('Delete transaction?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeTransaction(id),
      },
    ]);
  };

  const confirmDeleteAsset = (id: string, name: string) => {
    Alert.alert(`Delete "${name}"?`, 'All of its dated entries will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAsset(id) },
    ]);
  };

  /* -------------------------------- Loading ------------------------------- */

  if (!ready) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      </Screen>
    );
  }

  /* --------------------------------- UI ----------------------------------- */

  const sectionTitleStyle = {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  };

  const totalTitle = `TOTAL (${getCurrencyLabel(baseCurrency)})`;
  const ratesStatus =
    ratesSource === 'default' || !ratesUpdatedAt
      ? 'Using default rates. Open Rates to update them.'
      : `Rates (${ratesSource}) · ${ratesUpdatedAt.slice(0, 10)}`;

  return (
    <Screen scroll>
      <AppText variant="h1">Finance</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        {monthLabel}
      </AppText>

      {/* Total */}
      <Card style={{ marginTop: spacing.xl }}>
        <AppText variant="label" color="textSecondary">
          {totalTitle}
        </AppText>
        <AppText
          variant="display"
          color={summary.total < 0 ? 'expense' : accent}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ marginTop: spacing.xs }}
        >
          {formatMoney(summary.total, baseCurrency)} {baseCurrency}
        </AppText>

        <AppText
          variant="caption"
          color="textSecondary"
          style={{ marginTop: spacing.xs }}
        >
          Accounts {formatMoney(summary.accountsTotal, baseCurrency)} · Assets{' '}
          {formatMoney(summary.assetsTotal, baseCurrency)}
        </AppText>

        {summary.missing > 0 ? (
          <AppText
            variant="caption"
            color="warning"
            style={{ marginTop: spacing.xs }}
          >
            {summary.missing} item(s) have no exchange rate or gold price and
            are not counted.
          </AppText>
        ) : null}

        <AppText
          variant="caption"
          color="textSecondary"
          style={{ marginTop: spacing.xs }}
        >
          {ratesStatus}
        </AppText>

        <View style={[styles.row, { marginTop: spacing.lg }]}>
          <View style={styles.flex}>
            <AppText variant="label" color="textSecondary">
              INCOME THIS MONTH
            </AppText>
            <AppText variant="bodyStrong" color="income">
              +{formatMoney(monthTotals.income, baseCurrency)}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="label" color="textSecondary">
              EXPENSES THIS MONTH
            </AppText>
            <AppText variant="bodyStrong" color="expense">
              -{formatMoney(monthTotals.expense, baseCurrency)}
            </AppText>
          </View>
        </View>
      </Card>

      {/* Actions */}
      <View style={{ marginTop: spacing.lg }}>
        <AppButton
          title="Add transaction"
          accentColor={accent}
          leftIcon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
          onPress={openNewTransaction}
        />
      </View>
      <View style={[styles.row, { marginTop: spacing.sm }]}>
        <View style={[styles.flex, { marginEnd: spacing.sm }]}>
          <AppButton
            title="Account"
            variant="outline"
            accentColor={accent}
            onPress={openNewAccount}
          />
        </View>
        <View style={[styles.flex, { marginHorizontal: spacing.xs }]}>
          <AppButton
            title="Asset"
            variant="outline"
            accentColor={accent}
            onPress={() => setAssetOpen(true)}
          />
        </View>
        <View style={[styles.flex, { marginStart: spacing.sm }]}>
          <AppButton
            title="Rates"
            variant="outline"
            accentColor={accent}
            onPress={() => setRatesOpen(true)}
          />
        </View>
      </View>

      {/* Accounts */}
      <AppText variant="h3" style={sectionTitleStyle}>
        Accounts
      </AppText>
      {activeAccounts.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No accounts yet. Tap "Account" to add one.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {activeAccounts.map((account, index) => {
            const balance = getAccountBalance(account, transactions);
            const foreign = account.currencyCode !== baseCurrency;
            const converted = foreign
              ? convertAmount(balance, account.currencyCode, baseCurrency, rates)
              : null;

            return (
              <Pressable
                key={account.id}
                onPress={() => openEditAccount(account)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${account.name}`}
                style={({ pressed }) => [
                  styles.row,
                  {
                    padding: spacing.lg,
                    opacity: pressed ? 0.7 : 1,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: account.color ?? accent,
                      marginEnd: spacing.md,
                    },
                  ]}
                />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{account.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {account.type.replace('_', ' ')}
                  </AppText>
                </View>
                <View style={styles.end}>
                  <AppText
                    variant="bodyStrong"
                    color={balance < 0 ? 'expense' : 'text'}
                  >
                    {formatMoney(balance, account.currencyCode)}{' '}
                    {getCurrencyLabel(account.currencyCode)}
                  </AppText>
                  {foreign ? (
                    <AppText variant="caption" color="textSecondary">
                      {converted === null
                        ? 'no rate'
                        : `≈ ${formatMoney(converted, baseCurrency)} ${baseCurrency}`}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* Assets */}
      <AppText variant="h3" style={sectionTitleStyle}>
        Assets
      </AppText>
      {assets.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No assets yet. Tap "Asset" to add currency or gold.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {assets.map((asset, index) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              baseCurrency={baseCurrency}
              rates={rates}
              gold24PerGram={gold24PerGram}
              first={index === 0}
              onDelete={() => confirmDeleteAsset(asset.id, asset.name)}
            />
          ))}
        </Card>
      )}

      {/* Transactions */}
      <AppText variant="h3" style={sectionTitleStyle}>
        Transactions
      </AppText>
      {sortedTransactions.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No transactions yet.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {visibleTransactions.map((tx, index) => {
            const category = categoryById.get(tx.categoryId);
            const account = accountById.get(tx.accountId);
            const isIncome = tx.type === 'income';
            const tint =
              category?.color ?? (isIncome ? colors.income : colors.expense);
            const icon = (category?.icon ??
              (isIncome ? 'arrow-down' : 'arrow-up')) as IconName;

            return (
              <Pressable
                key={tx.id}
                onPress={() => openEditTransaction(tx)}
                accessibilityRole="button"
                accessibilityLabel="Edit transaction"
                style={({ pressed }) => [
                  styles.row,
                  {
                    padding: spacing.lg,
                    opacity: pressed ? 0.7 : 1,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.txIcon,
                    {
                      backgroundColor: tint + '22',
                      borderRadius: radius.full,
                      marginEnd: spacing.md,
                    },
                  ]}
                >
                  <Ionicons name={icon} size={18} color={tint} />
                </View>

                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {category?.name ?? 'Uncategorized'}
                  </AppText>
                  <AppText
                    variant="caption"
                    color="textSecondary"
                    numberOfLines={1}
                  >
                    {tx.date}
                    {account ? ` · ${account.name}` : ''}
                    {tx.note ? ` · ${tx.note}` : ''}
                  </AppText>
                </View>

                <AppText
                  variant="bodyStrong"
                  color={isIncome ? 'income' : 'expense'}
                >
                  {isIncome ? '+' : '-'}
                  {formatMoney(tx.amount, tx.currencyCode)}{' '}
                  {getCurrencyLabel(tx.currencyCode)}
                </AppText>

                <Pressable
                  onPress={() => confirmRemoveTransaction(tx.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete transaction"
                  style={{ marginStart: spacing.md }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </Pressable>
            );
          })}
        </Card>
      )}

      {sortedTransactions.length > RECENT_LIMIT ? (
        <AppButton
          title={
            showAll ? 'Show fewer' : `Show all (${sortedTransactions.length})`
          }
          variant="ghost"
          accentColor={accent}
          onPress={() => setShowAll((v) => !v)}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}

      {/* Forms */}
      <AddTransactionModal
        visible={txOpen}
        transaction={editingTx}
        onClose={() => setTxOpen(false)}
      />
      <AddAccountModal
        visible={accountOpen}
        account={editingAccount}
        onClose={() => setAccountOpen(false)}
      />
      <AddAssetModal visible={assetOpen} onClose={() => setAssetOpen(false)} />
      <RatesModal visible={ratesOpen} onClose={() => setRatesOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  end: {
    alignItems: 'flex-end',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  txIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});