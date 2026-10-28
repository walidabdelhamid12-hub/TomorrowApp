import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { AccountsSection } from '@/features/finance/components/AccountsSection';
import { AddAccountModal } from '@/features/finance/components/AddAccountModal';
import { AddAssetModal } from '@/features/finance/components/AddAssetModal';
import { AddTransactionModal } from '@/features/finance/components/AddTransactionModal';
import { AssetRow } from '@/features/finance/components/AssetRow';
import { RatesModal } from '@/features/finance/components/RatesModal';
import { TotalCard } from '@/features/finance/components/TotalCard';
import { TransactionsSection } from '@/features/finance/components/TransactionsSection';
import { useAutoRefreshRates } from '@/features/finance/hooks/useAutoRefreshRates';
import { useFinanceSummary } from '@/features/finance/hooks/useFinanceSummary';
import { useCurrencyHydrated } from '@/features/finance/store/useCurrencyStore';
import {
  useFinanceHydrated,
  useFinanceStore,
} from '@/features/finance/store/useFinanceStore';
import { useLedgerHydrated } from '@/features/finance/store/useLedgerStore';
import type { Account, Transaction } from '@/features/finance/types/ledger';
import { moduleColors, useTheme } from '@/theme';

export default function FinanceRoute() {
  const { colors, spacing } = useTheme();
  const accent = moduleColors.finance;

  const ledgerReady = useLedgerHydrated();
  const currencyReady = useCurrencyHydrated();
  const financeReady = useFinanceHydrated();
  const ready = ledgerReady && currencyReady && financeReady;

  useAutoRefreshRates(ready);

  const summary = useFinanceSummary();
  const assets = useFinanceStore((s) => s.assets);
  const deleteAsset = useFinanceStore((s) => s.deleteAsset);

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);

  const monthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const openTransaction = (tx: Transaction | null) => {
    setEditingTx(tx);
    setTxOpen(true);
  };

  const openAccount = (account: Account | null) => {
    setEditingAccount(account);
    setAccountOpen(true);
  };

  const confirmDeleteAsset = (id: string, name: string) => {
    Alert.alert(`Delete "${name}"?`, 'All of its dated entries will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAsset(id) },
    ]);
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppText variant="h1">Finance</AppText>
      <AppText color="textSecondary" style={{ marginTop: spacing.xs }}>
        {monthLabel}
      </AppText>

      <TotalCard
        baseCurrency={summary.baseCurrency}
        total={summary.total}
        accountsTotal={summary.accountsTotal}
        assetsTotal={summary.assetsTotal}
        missing={summary.missing}
        income={summary.income}
        expense={summary.expense}
      />

      <View style={{ marginTop: spacing.lg }}>
        <AppButton
          title="Add transaction"
          accentColor={accent}
          leftIcon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
          onPress={() => openTransaction(null)}
        />
      </View>
      <View style={[styles.row, { marginTop: spacing.sm }]}>
        <View style={[styles.flex, { marginEnd: spacing.sm }]}>
          <AppButton
            title="Account"
            variant="outline"
            accentColor={accent}
            onPress={() => openAccount(null)}
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

      <AccountsSection
        accounts={summary.activeAccounts}
        baseCurrency={summary.baseCurrency}
        rates={summary.rates}
        onEdit={openAccount}
      />

      <AppText
        variant="h3"
        style={{ marginTop: spacing.xl, marginBottom: spacing.md }}
      >
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
              baseCurrency={summary.baseCurrency}
              rates={summary.rates}
              gold24PerGram={summary.gold24PerGram}
              first={index === 0}
              onDelete={() => confirmDeleteAsset(asset.id, asset.name)}
            />
          ))}
        </Card>
      )}

      <TransactionsSection onEdit={openTransaction} />

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

      <AddAssetModal 
        visible={assetOpen} 
        onClose={() => setAssetOpen(false)} 
      />

      <RatesModal visible={ratesOpen} onClose={() => setRatesOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});