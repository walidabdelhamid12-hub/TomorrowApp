import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import type { InstallmentCalculationInput } from '@/features/finance/types/installments';
import { calculateInstallments } from '@/features/finance/utils/installments';
import { moduleColors, useTheme } from '@/theme';

// Fictional preview only. Never read from or write to any store or ledger.
const DEMO: Omit<InstallmentCalculationInput, 'asOf'> = {
  contract: {
    id: 'demo-contract', currencyCode: 'OMR', totalAmount: '1200.000',
    accountingOwnership: { kind: 'standalone', liabilityOwner: 'installment_contract' },
    schedule: [
      { id: 'demo-down', contractId: 'demo-contract', kind: 'down_payment', dueDate: '2026-01-10', amount: '200.000' },
      { id: 'demo-regular', contractId: 'demo-contract', kind: 'regular', dueDate: '2026-02-10', amount: '300.000' },
      { id: 'demo-irregular', contractId: 'demo-contract', kind: 'irregular', dueDate: '2027-03-10', amount: '700.000' },
    ],
  },
  payments: [{ id: 'demo-payment', contractId: 'demo-contract', installmentId: 'demo-regular', paymentReference: 'demo-reference', amount: '100.000', currencyCode: 'OMR', paidOn: '2026-02-11' }],
  // Fictional matching evidence solely for illustrating the calculation API.
  trustedConfirmations: [{ kind: 'trusted_confirmation', evidenceId: 'demo-evidence', paymentId: 'demo-payment', contractId: 'demo-contract', installmentId: 'demo-regular', paymentReference: 'demo-reference', amount: '100.000', currencyCode: 'OMR', paidOn: '2026-02-11' }],
};

function todayISO(): string {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function kindLabel(kind: string): string {
  return kind === 'down_payment' ? 'Down payment' : kind === 'regular' ? 'Regular installment' : 'Irregular installment';
}

export default function InstallmentsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [preview, setPreview] = useState(false);
  const result = useMemo(() => preview ? calculateInstallments({ ...DEMO, asOf: todayISO() }) : null, [preview]);

  const tone = colors.finance.account;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Finance" onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="h1">Installments</AppText>
          <AppText variant="caption" color="textSecondary">Installment contracts</AppText>
        </View>
      </View>
      <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
        Track contract schedules and upcoming installments. Payments and contract creation are not available here yet.
      </AppText>
      <Card variant="filled">
        <View style={styles.emptyContent}>
          <Ionicons name="calendar-outline" size={28} color={moduleColors.finance} />
          <AppText variant="bodyStrong">No installment contracts yet</AppText>
          <AppText color="textSecondary" align="center">
            Your existing loans, debts and cheques are unchanged. This screen does not affect balances.
          </AppText>
        </View>
      </Card>
      <Pressable accessibilityRole="button" accessibilityLabel={preview ? 'Hide demo preview' : 'Show demo preview'}
        onPress={() => setPreview(value => !value)}
        style={[styles.previewToggle, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons name="eye-outline" size={20} color={moduleColors.finance} />
        <AppText variant="bodyStrong" style={styles.flex}>
          {preview ? 'Hide demo preview' : 'Show demo preview (fictional data)'}
        </AppText>
        <Ionicons name={preview ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </Pressable>
      {result && (
        <View style={[styles.list, { marginTop: spacing.md, paddingBottom: spacing.lg }]}>
          <AppText color="textSecondary" variant="caption">
            DEMO ONLY — Fictional contract and fictional confirmations. Not your financial data.
          </AppText>
          <Card variant="outlined" padded={false} style={[styles.contractCard, { backgroundColor: tone.surface, borderColor: tone.border }]}>
            <View style={styles.cardHeading}>
              <View style={[styles.icon, { backgroundColor: colors.surface }]}>
                <Ionicons name="document-text-outline" size={20} color={tone.accent} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Example property contract</AppText>
                <AppText variant="caption" color="textSecondary">Standalone · OMR · Fictional</AppText>
              </View>
              <AppText variant="bodyStrong" color={tone.accent}>{result.remaining} OMR</AppText>
            </View>
            <View style={[styles.details, { borderTopColor: tone.border }]}>
              <View style={styles.detailRow}><AppText color="textSecondary">Total scheduled</AppText><AppText>{result.totalScheduled} OMR</AppText></View>
              <View style={styles.detailRow}><AppText color="textSecondary">Demo paid</AppText><AppText>{result.confirmedPaid} OMR</AppText></View>
              <View style={styles.detailRow}><AppText color="textSecondary">Overdue</AppText><AppText>{result.overdue} OMR</AppText></View>
              <View style={styles.detailRow}><AppText color="textSecondary">Next unpaid due</AppText><AppText>{result.nextUnpaid?.dueDate ?? 'None'}</AppText></View>
            </View>
          </Card>
          <AppText variant="bodyStrong">Installment schedule</AppText>
          {result.installments.map(row => (
            <Card key={row.installment.id} variant="outlined" padded={false}
              style={[styles.installmentCard, { backgroundColor: tone.surface, borderColor: tone.border }]}>
              <View style={styles.cardHeading}>
                <View style={[styles.icon, { backgroundColor: colors.surface }]}>
                  <Ionicons name="calendar-outline" size={20} color={tone.accent} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{kindLabel(row.installment.kind)}</AppText>
                  <AppText variant="caption" color="textSecondary">Due {row.installment.dueDate}</AppText>
                </View>
                <View style={styles.amountBlock}>
                  <AppText variant="bodyStrong" color={tone.accent}>{row.remaining} OMR</AppText>
                  <AppText variant="caption" color="textSecondary">Remaining</AppText>
                </View>
              </View>
              <View style={[styles.details, { borderTopColor: tone.border }]}>
                <View style={styles.detailRow}><AppText color="textSecondary">Scheduled</AppText><AppText>{row.installment.amount} OMR</AppText></View>
                <View style={styles.detailRow}><AppText color="textSecondary">Payment status</AppText><AppText>{row.paymentStatus.replace(/_/g, ' ')}</AppText></View>
                <View style={styles.detailRow}><AppText color="textSecondary">Due status</AppText><AppText>{row.dueDateStatus.replace(/_/g, ' ')}</AppText></View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  emptyContent: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  previewToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, marginTop: 14 },
  list: { gap: 12 },
  contractCard: { padding: 10, borderRadius: 14 },
  installmentCard: { padding: 10, borderRadius: 14 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  amountBlock: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '45%' },
  details: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
});
