import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppInput, AppText, Card, Screen } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { validateStandaloneInstallmentDraft } from '@/features/finance/utils/installmentDraft';
import type { InstallmentCalculationInput, InstallmentScheduleItem } from '@/features/finance/types/installments';
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

function parseISODate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : new Date();
}

function kindLabel(kind: string): string {
  return kind === 'down_payment' ? 'Down payment' : kind === 'regular' ? 'Regular installment' : 'Irregular installment';
}

type DraftRow = { key: number; kind: InstallmentScheduleItem['kind']; dueDate: string; amount: string };
const initialRows: DraftRow[] = [{ key: 1, kind: 'regular', dueDate: '', amount: '' }];
const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: 'E£', OMR: 'ر.ع.', SAR: 'ر.س', AED: 'د.إ', USD: '\u0024',
  EUR: '€', GBP: '£', JOD: 'د.أ', QAR: 'ر.ق', KWD: 'د.ك',
};

export default function InstallmentsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [preview, setPreview] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [contractName, setContractName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('OMR');
  const [totalAmount, setTotalAmount] = useState('');
  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const [nextKey, setNextKey] = useState(2);
  const [selectedRowKey, setSelectedRowKey] = useState(1);
  const [datePickerRow, setDatePickerRow] = useState<number | null>(null);
  const [draftError, setDraftError] = useState('');
  const [draftSummary, setDraftSummary] = useState<string | null>(null);
  const changeRow = (key: number, patch: Partial<DraftRow>) => {
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
    setDraftSummary(null);
    setDraftError('');
  };
  const checkDraft = () => {
    try {
      const validated = validateStandaloneInstallmentDraft({
        id: 'preview-only-contract',
        name: contractName,
        currencyCode,
        totalAmount,
        rows: rows.map(row => ({ id: 'preview-row-' + row.key, kind: row.kind, dueDate: row.dueDate, amount: row.amount })),
      });
      setDraftSummary(validated.name + ' · ' + validated.contract.totalAmount + ' ' +
        validated.contract.currencyCode + ' · ' + validated.contract.schedule.length + ' installments');
      setDraftError('');
    } catch (error) {
      setDraftSummary(null);
      setDraftError(error instanceof Error ? error.message : 'Invalid contract draft');
    }
  };
  const result = useMemo(() => preview ? calculateInstallments({ ...DEMO, asOf: todayISO() }) : null, [preview]);

  const tone = colors.finance.account;
  const selectedRow = rows.find(row => row.key === selectedRowKey) ?? rows[0];
  const selectedIndex = rows.findIndex(row => row.key === selectedRow.key);

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
      <Card variant="outlined" padded={false} style={[styles.contractCard, { borderColor: tone.border, marginTop: spacing.md }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={draftOpen ? 'Collapse new contract' : 'Expand new contract'}
          accessibilityState={{ expanded: draftOpen }}
          onPress={() => setDraftOpen(value => !value)}
          style={styles.contractToggle}>
          <Ionicons name="document-text-outline" size={20} color={moduleColors.finance} />
          <AppText variant="bodyStrong" style={styles.flex}>New Contract</AppText>
          <Ionicons name={draftOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </Pressable>
        {draftOpen && (
          <View style={styles.draftList}>
            <AppText variant="caption" color="textSecondary">
              Validation preview only. Nothing is saved or posted to balances.
            </AppText>
            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <AppInput label="Contract Name" placeholder="Office plan"
                  value={contractName} onChangeText={value => { setContractName(value); setDraftSummary(null); }} />
              </View>
              <View style={styles.column}>
                <AppInput label="Total Amount" placeholder="1200.000" keyboardType="decimal-pad"
                  value={totalAmount} onChangeText={value => { setTotalAmount(value); setDraftSummary(null); }} />
              </View>
            </View>
            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <AppInput label="Due Date" placeholder="YYYY-MM-DD"
                  value={selectedRow.dueDate} onChangeText={value => changeRow(selectedRow.key, { dueDate: value })}
                  rightElement={
                    <Pressable accessibilityRole="button" accessibilityLabel={'Choose due date for installment ' + (selectedIndex + 1)}
                      hitSlop={10} onPress={() => setDatePickerRow(selectedRow.key)}>
                      <Ionicons name="calendar-outline" size={20} color={moduleColors.finance} />
                    </Pressable>
                  } />
              </View>
              <View style={styles.column}>
                <AppInput label="Amount" placeholder="300.000" keyboardType="decimal-pad"
                  value={selectedRow.amount} onChangeText={value => changeRow(selectedRow.key, { amount: value })} />
              </View>
            </View>
            {datePickerRow === selectedRow.key && (
              <DateTimePicker value={parseISODate(selectedRow.dueDate)} mode="date" display="default"
                onChange={(event: DateTimePickerEvent, selected?: Date) => {
                  setDatePickerRow(null);
                  if (event.type === 'set' && selected) {
                    const iso = [selected.getFullYear(), String(selected.getMonth() + 1).padStart(2, '0'),
                      String(selected.getDate()).padStart(2, '0')].join('-');
                    changeRow(selectedRow.key, { dueDate: iso });
                  }
                }} />
            )}
            <AppText variant="label" color="textSecondary">Currency</AppText>
            <View style={styles.currencyOptions}>
              {CURRENCIES.map(item => (
                <Pressable key={item.code} accessibilityRole="button"
                  accessibilityState={{ selected: currencyCode === item.code }}
                  onPress={() => { setCurrencyCode(item.code); setDraftSummary(null); }}
                  style={[styles.currencyCard, currencyCode === item.code && styles.currencyCardActive]}>
                  <Text style={styles.currencyFlag}>{item.flag}</Text>
                  <Text style={[styles.currencyCode, currencyCode === item.code && styles.currencyCodeActive]}>{item.code}</Text>
                  <Text style={[styles.currencySymbol, currencyCode === item.code && styles.currencySymbolActive]}>
                    {CURRENCY_SYMBOLS[item.code] ?? item.code}
                  </Text>
                </Pressable>
              ))}
            </View>
            <AppText variant="label" color="textSecondary">Type</AppText>
            <View style={styles.typeOptions}>
              {(['regular', 'irregular', 'down_payment'] as const).map(kind => (
                <Pressable key={kind} accessibilityRole="button"
                  accessibilityState={{ selected: selectedRow.kind === kind }}
                  onPress={() => changeRow(selectedRow.key, { kind })}
                  style={[styles.typeOption, { borderColor: selectedRow.kind === kind ? moduleColors.finance : colors.border, backgroundColor: selectedRow.kind === kind ? tone.surface : colors.surface }]}>
                  <AppText variant="caption" align="center">{kind === 'down_payment' ? 'Down Payment' : kind === 'regular' ? 'Regular' : 'Irregular'}</AppText>
                </Pressable>
              ))}
            </View>
            <View style={styles.installmentSelector}>
              <AppText variant="bodyStrong">Installment</AppText>
              <View style={styles.installmentPicker}>
                {rows.map((row, index) => (
                  <Pressable key={row.key} accessibilityRole="button"
                    accessibilityLabel={'Edit installment ' + (index + 1)}
                    accessibilityState={{ selected: selectedRow.key === row.key }}
                    onPress={() => { setSelectedRowKey(row.key); setDatePickerRow(null); }}
                    style={[styles.installmentNumber, { borderColor: selectedRow.key === row.key ? moduleColors.finance : colors.border,
                      backgroundColor: selectedRow.key === row.key ? tone.surface : colors.surface }]}>
                    <AppText variant="caption">{index + 1}</AppText>
                  </Pressable>
                ))}
              </View>
              {rows.length > 1 && (
                <AppButton title="Remove" variant="ghost" fullWidth={false}
                  onPress={() => {
                    const remaining = rows.filter(row => row.key !== selectedRow.key);
                    setRows(remaining);
                    setSelectedRowKey(remaining[Math.min(selectedIndex, remaining.length - 1)].key);
                    setDatePickerRow(null);
                    setDraftSummary(null);
                    setDraftError('');
                  }} />
              )}
            </View>
            <AppButton title="Add installment" accentColor={moduleColors.finance}
              leftIcon={<Ionicons name="add-circle-outline" size={20} color={colors.onPrimary} />} onPress={() => {
                setRows(previous => [...previous, { key: nextKey, kind: 'regular', dueDate: '', amount: '' }]);
                setSelectedRowKey(nextKey);
                setNextKey(value => value + 1);
                setDatePickerRow(null);
                setDraftSummary(null);
                setDraftError('');
              }} />
            <AppButton title="Validate draft (no save)" accentColor={moduleColors.finance} onPress={checkDraft} />
            {draftError ? <AppText color="danger">{draftError}</AppText> : null}
            {draftSummary ? <View style={[styles.draftRow, { borderColor: tone.border }]}>
              <AppText variant="bodyStrong">Valid draft — not saved</AppText>
              <AppText>{draftSummary}</AppText>
            </View> : null}
          </View>
        )}
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
  draftRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 8, gap: 6 },
  draftList: { gap: 8, paddingTop: 8 },
  contractToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  installmentSelector: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  installmentPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  installmentNumber: { minWidth: 32, paddingHorizontal: 8, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  twoColumns: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0 },
  currencyOptions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7, columnGap: 5 },
  currencyCard: { width: '18.5%', minHeight: 70, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fafafa', gap: 2 },
  currencyCardActive: { borderColor: '#059669', backgroundColor: '#ecfdf5' },
  currencyFlag: { fontSize: 14 },
  currencyCode: { fontSize: 10, fontWeight: '700', color: '#334155' },
  currencyCodeActive: { color: '#047857' },
  currencySymbol: { fontSize: 9, color: '#64748b', textAlign: 'center' },
  currencySymbolActive: { color: '#047857' },
  typeOptions: { flexDirection: 'row', gap: 6 },
  typeOption: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 8, paddingHorizontal: 3, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
});
