import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card } from '@/components/ui';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Transaction } from '@/features/finance/types/ledger';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors, useTheme } from '@/theme';

const PREVIEW_COUNT = 10;

type GlyphName = keyof typeof Ionicons.glyphMap;
const isGlyph = (name: string): name is GlyphName =>
  name in Ionicons.glyphMap;

interface TransactionsSectionProps {
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function TransactionsSection({
  onEdit,
  onDelete,
}: TransactionsSectionProps) {
  const { colors, spacing } = useTheme();
  const transactions = useLedgerStore((s) => s.transactions);
  const categories = useLedgerStore((s) => s.categories);
  const accounts = useLedgerStore((s) => s.accounts);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [transactions],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_COUNT);

  return (
    <>
      <AppText
        variant="h3"
        style={{ marginTop: spacing.xl, marginBottom: spacing.md }}
      >
        Recent transactions
      </AppText>

      {sorted.length === 0 ? (
        <Card variant="filled">
          <AppText color="textSecondary" align="center">
            No transactions yet. Tap "Add transaction" to start.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((tx, index) => {
            const category = categoryById.get(tx.categoryId);
            const account = accountById.get(tx.accountId);
            const isExpense = tx.type === 'expense';
            const icon = category?.icon ?? '';
            const tint = category?.color ?? moduleColors.finance;

            return (
              <View
                key={tx.id}
                style={[
                  styles.row,
                  { padding: spacing.md },
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.iconCircle, { marginEnd: spacing.md }]}>
                  {isGlyph(icon) ? (
                    <Ionicons name={icon} size={20} color={tint} />
                  ) : (
                    <AppText>{icon || '•'}</AppText>
                  )}
                </View>

                <View style={styles.flex}>
                  <AppText style={styles.name}>
                    {category?.name ?? 'Uncategorized'}
                  </AppText>

                  <AppText variant="caption" color="textSecondary">
                    {`${tx.date} · ${account?.name ?? '—'}`}
                  </AppText>
                </View>

                <AppText
                  {...(isExpense ? ({ color: 'danger' } as const) : {})}
                  style={styles.amount}
                >
                  {`${isExpense ? '-' : '+'}${formatAmount(tx.amount)} ${tx.currencyCode}`}
                </AppText>

                <View style={[styles.actions, { marginStart: spacing.sm }]}>
                  <Pressable
                    onPress={() => onEdit(tx)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Edit transaction"
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="create-outline"
                      size={17}
                      color={moduleColors.finance}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => onDelete(tx)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete transaction"
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={15}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {sorted.length > PREVIEW_COUNT ? (
        <AppButton
          title={showAll ? 'Show less' : `Show all (${sorted.length})`}
          variant="ghost"
          onPress={() => setShowAll((v) => !v)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  name: {
    fontWeight: '600',
  },
  amount: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    padding: 2,
  },
});