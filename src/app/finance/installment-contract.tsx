import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppInput, AppText, Card, Screen } from '@/components/ui';
import { CURRENCIES } from '@/features/finance/constants/currencies';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { validateStandaloneInstallmentDraft } from '@/features/finance/utils/installmentDraft';
import type { InstallmentCalculationInput, InstallmentScheduleItem } from '@/features/finance/types/installments';
import { moduleColors, useTheme } from '@/theme';

function parseISODate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : new Date();
}

function kindLabel(kind: string): string {
  return kind === 'down_payment' ? 'Down payment' : kind === 'regular' ? 'Regular installment' : 'Irregular installment';
}

type DraftRow = { key: number; originalId?: string; kind: InstallmentScheduleItem['kind']; dueDate: string; amount: string };
const initialRows: DraftRow[] = [{ key: 1, kind: 'regular', dueDate: '', amount: '' }];
const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: 'E£', OMR: 'ر.ع.', SAR: 'ر.س', AED: 'د.إ', USD: '\u0024',
  EUR: '€', GBP: '£', JOD: 'د.أ', QAR: 'ر.ق', KWD: 'د.ك',
};

export default function InstallmentContractScreen() {
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const isNew = id === undefined || id === 'new';
  const wantsEdit = mode === 'edit';
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  useEffect(() => { if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate(); }, []);
  const [draftOpen, setDraftOpen] = useState(isNew || wantsEdit);
  const [contractName, setContractName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('OMR');
  const [totalAmount, setTotalAmount] = useState('');
  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const [nextKey, setNextKey] = useState(2);
  const [selectedRowKey, setSelectedRowKey] = useState(1);
  const [datePickerRow, setDatePickerRow] = useState<number | null>(null);
  const [draftError, setDraftError] = useState('');
  const [draftSummary, setDraftSummary] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const saveInFlight = useRef(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [editing, setEditing] = useState<{ id: string; updatedAt: string; ownership: InstallmentCalculationInput['contract']['accountingOwnership'] } | null>(null);
  const resetDraft = () => {
    setEditing(null);
    setContractName('');
    setCurrencyCode('OMR');
    setTotalAmount('');
    setRows([{ key: 1, kind: 'regular', dueDate: '', amount: '' }]);
    setNextKey(2);
    setSelectedRowKey(1);
    setDatePickerRow(null);
    setDraftSummary(null);
    setDraftError('');
  };
  const startEdit = (record: (typeof saved.contracts)[number]) => {
    if (deleteInFlight.current || saveInFlight.current || saved.hydration !== 'ready' || saved.writeStatus !== 'idle') return;
    const existingRows = record.contract.schedule.map((item, index) => ({
      key: index + 1, originalId: item.id, kind: item.kind, dueDate: item.dueDate, amount: item.amount,
    }));
    setEditing({ id: record.contract.id, updatedAt: record.updatedAt, ownership: record.contract.accountingOwnership });
    setContractName(record.name);
    setCurrencyCode(record.contract.currencyCode);
    setTotalAmount(record.contract.totalAmount);
    setRows(existingRows);
    setNextKey(existingRows.length + 1);
    setSelectedRowKey(existingRows[0]?.key ?? 1);
    setDatePickerRow(null);
    setDraftSummary(null);
    setDraftError('');
    setSaveMessage('');
    setDraftOpen(true);
  };
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteInFlight = useRef(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const confirmDelete = (record: (typeof saved.contracts)[number]) => {
    if (deleteInFlight.current || saveInFlight.current || saved.hydration !== 'ready' || saved.writeStatus !== 'idle') return;
    Alert.alert('Delete contract?', 'Delete "' + record.name + '" and its installment schedule? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void performDelete(record.contract.id, record.updatedAt); } },
    ]);
  };
  const performDelete = async (id: string, revision: string) => {
    if (deleteInFlight.current || saveInFlight.current || installmentsStorage.getState().hydration !== 'ready' ||
        installmentsStorage.getState().writeStatus !== 'idle') return;
    deleteInFlight.current = true;
    setDeleteBusy(true);
    setDeleteMessage('');
    try {
      const outcome = await installmentsStorage.deleteContract(id, revision);
      if (!outcome.ok) {
        setDeleteMessage('Delete was not confirmed (' + outcome.error.code + '). Check saved contracts before retrying.');
        return;
      }
      if (editing?.id === id) resetDraft();
      setDeleteMessage('Contract deleted and storage verified. No balances were changed.');
      router.back();
    } catch {
      setDeleteMessage('Delete could not be confirmed. Check saved contracts before retrying.');
    } finally {
      deleteInFlight.current = false;
      setDeleteBusy(false);
    }
  };
  const changeRow = (key: number, patch: Partial<DraftRow>) => {
    setRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));
    setDraftSummary(null);
    setDraftError('');
  };
  const checkDraft = () => {
    try {
      const validated = validateStandaloneInstallmentDraft({
        id: editing?.id ?? 'preview-only-contract',
        name: contractName,
        currencyCode,
        totalAmount,
        rows: rows.map(row => ({ id: row.originalId ?? 'preview-row-' + row.key, kind: row.kind, dueDate: row.dueDate, amount: row.amount })),
      });
      setDraftSummary(validated.name + ' · ' + validated.contract.totalAmount + ' ' +
        validated.contract.currencyCode + ' · ' + validated.contract.schedule.length + ' installments');
      setDraftError('');
    } catch (error) {
      setDraftSummary(null);
      setDraftError(error instanceof Error ? error.message : 'Invalid contract draft');
    }
  };
  const saveContract = async () => {
    if (deleteInFlight.current || saveInFlight.current) return;
    setSaveMessage('');
    setDraftError('');
    if (saved.hydration !== 'ready' || saved.writeStatus !== 'idle') {
      setDraftError('Saved contracts are not ready for writing. Please retry after loading.');
      return;
    }
    // IDs are generated for persistence, never reused from the validation-only preview.
    const unique = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    const id = editing?.id ?? 'installment-' + unique();
    let validated: ReturnType<typeof validateStandaloneInstallmentDraft>;
    try {
      validated = validateStandaloneInstallmentDraft({
        id,
        name: contractName,
        currencyCode,
        totalAmount,
        rows: rows.map(row => ({
          id: row.originalId ?? id + '-row-' + unique(),
          kind: row.kind,
          dueDate: row.dueDate,
          amount: row.amount,
        })),
      });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : 'Invalid contract draft');
      return;
    }
    saveInFlight.current = true;
    setSaveBusy(true);
    try {
      const outcome = editing
        ? await installmentsStorage.updateContract({
            ...validated,
            contract: { ...validated.contract, accountingOwnership: editing.ownership },
          }, editing.updatedAt)
        : await installmentsStorage.createContract(validated);
      if (!outcome.ok) {
        setDraftError(outcome.error.code === 'conflict'
          ? 'This contract changed since editing began. Your edits are still here; reload the saved data before retrying.'
          : 'Contract was not confirmed saved (' + outcome.error.code + '). Check storage before retrying.');
        return;
      }
      const wasEditing = Boolean(editing);
      resetDraft();
      setSaveMessage(wasEditing
        ? 'Contract changes saved and verified. No balances were changed.'
        : 'Contract saved and verified in standalone storage. No balances were changed.');
      router.back();
    } catch (error) {
      setDraftError('Save could not be confirmed. Check saved contracts before retrying.');
    } finally {
      saveInFlight.current = false;
      setSaveBusy(false);
    }
  };
  const loadedId = useRef<string | null>(null);
  const record = saved.contracts.find(item => item.contract.id === id);
  useEffect(() => {
    if (!isNew && wantsEdit && record && loadedId.current !== id && saved.hydration === 'ready') {
      loadedId.current = id ?? null;
      startEdit(record);
    }
  }, [id, isNew, wantsEdit, record, saved.hydration]);


  const tone = colors.finance.account;
  const selectedRow = rows.find(row => row.key === selectedRowKey) ?? rows[0];
  const selectedIndex = rows.findIndex(row => row.key === selectedRow.key);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Installments" onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="h1">{isNew ? 'New Contract' : wantsEdit ? 'Edit Contract' : 'Contract Details'}</AppText>
          <AppText variant="caption" color="textSecondary">{record?.name ?? 'Standalone installments'}</AppText>
        </View>
      </View>
      <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
        Track saved contract schedules. Payments and balance posting are not available here.
      </AppText>
      {saved.hydration === 'blocked' ? (
        <Card variant="filled"><AppText color="danger">Saved contracts could not be loaded.</AppText>
          <AppButton title="Retry loading" onPress={() => { void installmentsStorage.hydrate(); }} /></Card>
      ) : saved.hydration !== 'ready' ? (
        <Card variant="filled"><AppText>Loading contract...</AppText></Card>
      ) : !isNew && !record ? (
        <Card variant="filled"><AppText color="danger">Contract not found. Return to Installments.</AppText></Card>
      ) : !isNew && !draftOpen && record ? (
        <Card variant="outlined" padded={false} style={[styles.contractCard, { backgroundColor: tone.surface, borderColor: tone.border }]}>
          <AppText variant="bodyStrong">{record.name}</AppText>
          <AppText>Contract total: {record.contract.totalAmount} {record.contract.currencyCode}</AppText>
          <AppText color="textSecondary">{record.contract.schedule.length} scheduled installments</AppText>
          <View style={[styles.details, { borderTopColor: tone.border }]}>
            {record.contract.schedule.map(row => (
              <View key={row.id} style={styles.detailRow}>
                <View style={styles.flex}>
                  <AppText>{kindLabel(row.kind)}</AppText>
                  <AppText variant="caption" color="textSecondary">Due {row.dueDate}</AppText>
                </View>
                <AppText>{row.amount} {record.contract.currencyCode}</AppText>
              </View>
            ))}
          </View>
          <FinanceActionButtons label={record.name} onEdit={() => startEdit(record)} onDelete={() => confirmDelete(record)} />
          {deleteMessage ? <AppText color="textSecondary">{deleteMessage}</AppText> : null}
        </Card>
      ) : null}
      {saved.hydration === 'ready' && (isNew || (record && draftOpen)) && (
      <Card variant="outlined" padded={false} style={[styles.contractCard, { borderColor: tone.border, marginTop: spacing.md }]}>
        <View style={styles.contractToggle}>
          <Ionicons name="document-text-outline" size={20} color={moduleColors.finance} />
          <AppText variant="bodyStrong" style={styles.flex}>{editing ? 'Edit Contract' : 'New Contract'}</AppText>
        </View>
        {draftOpen && (
          <View style={styles.draftList}>
            <AppText variant="caption" color="textSecondary">
              {editing ? 'Edit this standalone contract. Nothing is posted to balances.' : 'Validate a draft or save a new standalone contract. Nothing is posted to balances.'}
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
            <AppButton title={saveBusy ? 'Saving contract...' : editing ? 'Save Changes' : 'Save Contract'} accentColor={moduleColors.finance}
              disabled={saveBusy || saved.hydration !== 'ready' || saved.writeStatus !== 'idle'}
              onPress={() => { void saveContract(); }} />
             {editing && <AppButton title="Cancel Edit" variant="ghost" disabled={saveBusy}
               onPress={() => { resetDraft(); router.back(); }} />}
            {saveMessage ? <AppText color="textSecondary">{saveMessage}</AppText> : null}
            {draftError ? <AppText color="danger">{draftError}</AppText> : null}
            {draftSummary ? <View style={[styles.draftRow, { borderColor: tone.border }]}>
              <AppText variant="bodyStrong">Valid draft — not saved</AppText>
              <AppText>{draftSummary}</AppText>
            </View> : null}
          </View>
        )}
      </Card>
      )}
      {saveMessage ? <AppText color="textSecondary">{saveMessage}</AppText> : null}

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
