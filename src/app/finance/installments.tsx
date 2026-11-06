import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import type { InstallmentCalculationInput } from '@/features/finance/types/installments';
import { calculateInstallments } from '@/features/finance/utils/installments';
import { useTheme } from '@/theme';

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

export default function InstallmentsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [preview, setPreview] = useState(false);
  const result = useMemo(() => preview ? calculateInstallments({ ...DEMO, asOf: todayISO() }) : null, [preview]);

  return (
    <Screen scroll>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Finance" onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
        <AppText>Finance</AppText>
      </Pressable>
      <AppText variant="h1">Installments</AppText>
      <AppText color="textSecondary" style={{ marginTop: 8, marginBottom: 16 }}>Contracts and installment schedules. No payments can be made here.</AppText>
      <Card>
        <AppText style={{ fontWeight: '700' }}>No installment contracts yet</AppText>
        <AppText color="textSecondary" style={{ marginTop: 8 }}>Your existing loans, debts and cheques are unchanged. Contract creation is not available in this preview.</AppText>
      </Card>
      <Pressable accessibilityRole="button" accessibilityLabel={preview ? 'Hide demo preview' : 'Show demo preview'} onPress={() => setPreview(v => !v)} style={{ paddingVertical: 18 }}>
        <AppText style={{ color: colors.text, fontWeight: '700' }}>{preview ? 'Hide demo preview' : 'Show demo preview (fictional data)'}</AppText>
      </Pressable>
      {result && (
        <View style={{ gap: 12, paddingBottom: 20 }}>
          <AppText style={{ fontWeight: '700' }}>DEMO ONLY — Not your financial data</AppText>
          <Card>
            <AppText style={{ fontWeight: '700' }}>Example property contract · OMR</AppText>
            <AppText>Total scheduled: {result.totalScheduled} OMR</AppText>
            <AppText>Fictional confirmed paid: {result.confirmedPaid} OMR</AppText>
            <AppText>Remaining: {result.remaining} OMR</AppText>
            <AppText>Overdue: {result.overdue} OMR</AppText>
            <AppText>Next unpaid: {result.nextUnpaid?.dueDate ?? 'None'}</AppText>
          </Card>
          {result.installments.map(row => (
            <Card key={row.installment.id}>
              <AppText style={{ fontWeight: '700' }}>{row.installment.kind.replace('_', ' ')} · {row.installment.dueDate}</AppText>
              <AppText>Scheduled: {row.installment.amount} OMR</AppText>
              <AppText>Remaining: {row.remaining} OMR</AppText>
              <AppText>Payment: {row.paymentStatus} · Due date: {row.dueDateStatus}</AppText>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
