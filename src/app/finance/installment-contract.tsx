import { FinanceDateField } from '@/features/finance/components/FinanceDateField';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { FinanceInput as AppInput } from '@/features/finance/components/FinanceInput';
import { FinanceButton as AppButton } from '@/features/finance/components/FinanceButton';
import { FinanceChoiceDropdown, FINANCE_CURRENCY_CHOICES } from '@/features/finance/components/FinanceChoiceDropdown';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { shouldStackFinanceFields } from '@/features/finance/utils/formLayout';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';

import { AppText, Card, Screen } from '@/components/ui';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { validateStandaloneInstallmentDraft } from '@/features/finance/utils/installmentDraft';
import type { InstallmentCalculationInput, InstallmentScheduleItem } from '@/features/finance/types/installments';
import { moduleColors, useTheme } from '@/theme';

function kindLabel(kind: string): string {
  return kind === 'down_payment' ? 'Down payment' : kind === 'regular' ? 'Regular installment' : 'Irregular installment';
}

type DraftRow = { key: number; originalId?: string; kind: InstallmentScheduleItem['kind']; dueDate: string; amount: string };
const initialRows: DraftRow[] = [{ key: 1, kind: 'regular', dueDate: '', amount: '' }];

export default function InstallmentContractScreen() {
  const { id, mode } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const isNew = id === undefined || id === 'new';
  const wantsEdit = mode === 'edit';
  const router = useRouter();
  const { t } = useAppLanguage();
  const { colors, spacing } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackFields = shouldStackFinanceFields(width, fontScale);
  const { confirm, confirmation } = useFinanceConfirmation();
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  useEffect(() => { if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate(); }, []);
  const [draftOpen, setDraftOpen] = useState(isNew || wantsEdit);
  const [contractName, setContractName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('OMR');
  const [totalAmount, setTotalAmount] = useState('');
  const [rows, setRows] = useState<DraftRow[]>(initialRows);
  const nextKey = useRef(2);
  const [selectedRowKey, setSelectedRowKey] = useState(1);
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
    nextKey.current = 2;
    setSelectedRowKey(1);
   
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
    nextKey.current = existingRows.length + 1;
    setSelectedRowKey(existingRows[0]?.key ?? 1);
   
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
    confirm(t('Delete contract?', 'حذف العقد؟'), t('Delete', 'حذف') + ' "' + record.name + '" ' + t('and its installment schedule? This cannot be undone.', 'وجدول أقساطه؟ لا يمكن التراجع عن هذا الإجراء.'),
      () => performDelete(record.contract.id, record.updatedAt), t('Delete', 'حذف'));
  };
  const performDelete = async (id: string, revision: string) => {
    if (deleteInFlight.current || saveInFlight.current || installmentsStorage.getState().hydration !== 'ready' ||
        installmentsStorage.getState().writeStatus !== 'idle') return false;
    deleteInFlight.current = true;
    setDeleteBusy(true);
    setDeleteMessage('');
    try {
      const outcome = await installmentsStorage.deleteContract(id, revision);
      if (!outcome.ok) {
        setDeleteMessage('Delete was not confirmed (' + outcome.error.code + '). Check saved contracts before retrying.');
        return false;
      }
      if (editing?.id === id) resetDraft();
      setDeleteMessage('Contract deleted and storage verified. No balances were changed.');
      router.back();
      return true;
    } catch {
      setDeleteMessage('Delete could not be confirmed. Check saved contracts before retrying.');
      return false;
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
  const appendRow = () => {
    if (saveBusy || saveInFlight.current) return;
    const key = nextKey.current++;
    setRows(previous => [...previous, {key,kind:'regular',dueDate:'',amount:''}]);
    setSelectedRowKey(key); setDraftSummary(null); setDraftError('');
  };
  const removeSelectedRow = () => {
    if (saveBusy || saveInFlight.current || rows.length <= 1) return;
    const remove = () => {
      if (saveInFlight.current) return false;
      const remaining = rows.filter(row => row.key !== selectedRow.key);
      if (!remaining.length) return false;
      setRows(remaining); setSelectedRowKey(remaining[Math.min(selectedIndex, remaining.length - 1)].key);
      setDraftSummary(null); setDraftError('');
      return true;
    };
    if (selectedRow.originalId || selectedRow.amount || selectedRow.dueDate) {
      confirm(t('Remove installment from draft?', 'حذف القسط من المسودة؟'), t('The saved contract will not change until you save.', 'لن يتغير العقد المحفوظ حتى تضغط حفظ.'), remove, t('Remove', 'حذف'));
    } else remove();
  };


  return (
    <Screen scroll edges={['top','bottom']}>
      <View style={financeChrome.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("Back to Installments", "العودة إلى الأقساط")} onPress={() => router.back()}
          style={financeChrome.back}>
          <Ionicons name="arrow-back" size={20} color="#D6B777" />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="caption" style={{ color: '#CBD5E1' }}>{record?.name ?? t('Standalone installments', 'أقساط مستقلة')}</AppText>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{isNew ? t('New Contract', 'عقد جديد') : wantsEdit ? t('Edit Contract', 'تعديل العقد') : t('Contract Details', 'تفاصيل العقد')}</AppText>
        </View>
      </View>
      <AppText color="textSecondary" style={{ marginBottom: spacing.md }}>
        {t("Track saved contract schedules. Payments and balance posting are not available here.", "متابعة جداول العقود المحفوظة. الدفع وترحيل الأرصدة غير متاحين هنا.")}
      </AppText>
      {saved.hydration === 'blocked' ? (
        <Card variant="filled"><AppText color="danger">{t("Saved contracts could not be loaded.", "تعذر تحميل العقود المحفوظة.")}</AppText>
          <AppButton title={t("Retry loading", "إعادة المحاولة")} onPress={() => { void installmentsStorage.hydrate(); }} /></Card>
      ) : saved.hydration !== 'ready' ? (
        <Card variant="filled"><AppText>{t("Loading contract...", "جارٍ تحميل العقد...")}</AppText></Card>
      ) : !isNew && !record ? (
        <Card variant="filled"><AppText color="danger">{t("Contract not found. Return to Installments.", "العقد غير موجود. ارجع إلى الأقساط.")}</AppText></Card>
      ) : !isNew && !draftOpen && record ? (
        <Card variant="outlined" padded={false} style={[styles.contractCard, { backgroundColor: tone.surface, borderColor: tone.border }]}>
          <AppText variant="bodyStrong">{record.name}</AppText>
          <AppText><AppText style={{ fontWeight: '700' }}>{t('Contract total', 'إجمالي العقد')}: </AppText>{record.contract.totalAmount} {record.contract.currencyCode}</AppText>
          <AppText color="textSecondary">{record.contract.schedule.length} {t('scheduled installments', 'أقساط مجدولة')}</AppText>
          <View style={[styles.details, { borderTopColor: tone.border }]}>
            {record.contract.schedule.map(row => (
              <View key={row.id} style={styles.detailRow}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{kindLabel(row.kind)}</AppText>
                  <AppText variant="caption" color="textSecondary">{t('Due', 'تاريخ الاستحقاق')} {row.dueDate}</AppText>
                </View>
                <AppText variant="bodyStrong">{row.amount} {record.contract.currencyCode}</AppText>
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
          <Ionicons name="document-text-outline" size={20} color="#1E293B" />
          <AppText variant="bodyStrong" style={[styles.flex, { fontWeight: '800' }]}>{editing ? t('Edit Contract', 'تعديل العقد') : t('New Contract', 'عقد جديد')}</AppText>
        </View>
        {draftOpen && (
          <View style={styles.draftList}>
            <AppText variant="caption" color="textSecondary">
              {editing ? t('Edit this standalone contract. Nothing is posted to balances.', 'عدّل هذا العقد المستقل. لن يتم ترحيل أي مبالغ إلى الأرصدة.') : t('Validate a draft or save a new standalone contract. Nothing is posted to balances.', 'تحقق من المسودة أو احفظ عقدًا مستقلًا جديدًا. لن يتم ترحيل أي مبالغ إلى الأرصدة.')}
            </AppText>
            <AppInput label={t("Contract Name", "اسم العقد")} placeholder={t("Office plan", "خطة المكتب")}
              value={contractName} onChangeText={value => { setContractName(value); setDraftSummary(null); }} />
            <View style={[styles.twoColumns, stackFields && {flexDirection:'column',alignItems:'stretch'}]}>
              <View style={[styles.column, stackFields && {flex:0}]}>
                <AppInput label={t("Total Amount", "المبلغ الإجمالي")} placeholder="1200.000" keyboardType="decimal-pad"
                  value={totalAmount} onChangeText={value => { setTotalAmount(value); setDraftSummary(null); }} />
              </View>
              <View style={[styles.column, stackFields && {flex:0}]}>
                <FinanceChoiceDropdown label={t("Currency", "العملة")} value={currencyCode} options={FINANCE_CURRENCY_CHOICES}
                  onChange={value => { setCurrencyCode(value); setDraftSummary(null); }} />
              </View>
            </View>
            <View style={[styles.twoColumns, stackFields && {flexDirection:'column',alignItems:'stretch'}]}>
              <View style={[styles.column, stackFields && {flex:0}]}>
                <AppInput label={t("Installment Amount", "مبلغ القسط")} placeholder="300.000" keyboardType="decimal-pad"
                  value={selectedRow.amount} onChangeText={value => changeRow(selectedRow.key, { amount: value })} />
              </View>
              <View style={[styles.column, stackFields && {flex:0}]}>
                <AppText variant="label" style={{fontWeight:'700'}}>{t('Installment Count','عدد الأقساط')}</AppText>
                <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'#D6B777',borderRadius:10,minHeight:52}}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('Remove selected installment','حذف القسط المحدد')} disabled={rows.length<=1 || saveBusy}
                    onPress={removeSelectedRow} style={{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center',opacity:rows.length<=1?0.4:1}}><Ionicons name="remove" size={20} color="#B88C39" /></Pressable>
                  <AppText variant="bodyStrong">{rows.length}</AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('Add installment','إضافة قسط')} disabled={saveBusy} onPress={appendRow}
                    style={{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center'}}><Ionicons name="add" size={20} color="#B88C39" /></Pressable>
                </View>
              </View>
            </View>
            <FinanceDateField key={selectedRow.key} label={t("Due Date", "تاريخ الاستحقاق")}
              value={selectedRow.dueDate} onChange={value => changeRow(selectedRow.key, { dueDate: value })} pickerOnly />
            <FinanceChoiceDropdown label={t("Installment Type", "نوع القسط")} value={selectedRow.kind}
              options={[{ value: 'regular', label: 'Regular' }, { value: 'irregular', label: 'Irregular' },
                { value: 'down_payment', label: 'Down Payment' }]}
              onChange={value => changeRow(selectedRow.key, { kind: value as InstallmentScheduleItem['kind'] })} />
            <View style={styles.installmentSelector}>
              <AppText variant="bodyStrong" color="#936B1E">{t("Installment", "القسط")}</AppText>
              <View style={styles.installmentPicker}>
                {rows.map((row, index) => (
                  <Pressable key={row.key} accessibilityRole="button"
                    accessibilityLabel={t('Edit installment ', 'تعديل القسط ') + (index + 1)}
                    accessibilityState={{ selected: selectedRow.key === row.key }}
                    onPress={() => { setSelectedRowKey(row.key); }}
                    style={[styles.installmentNumber, { borderColor: selectedRow.key === row.key ? moduleColors.finance : colors.border,
                      backgroundColor: selectedRow.key === row.key ? tone.surface : colors.surface }]}>
                    <AppText variant="caption" color="#936B1E" style={{ fontWeight: '800' }}>{index + 1}</AppText>
                  </Pressable>
                ))}
              </View>
            </View>
            <AppButton style={{ minHeight:44,paddingVertical:8 }} title={t("Validate draft (no save)", "التحقق من المسودة (دون حفظ)")} accentColor="#1E293B" onPress={checkDraft} />
            <AppButton style={{ minHeight: 44, paddingVertical: 8 }} title={saveBusy ? t('Saving contract...', 'جارٍ حفظ العقد...') : editing ? t('Save Changes', 'حفظ التغييرات') : t('Save Contract', 'حفظ العقد')} accentColor="#1E293B"
              disabled={saveBusy || saved.hydration !== 'ready' || saved.writeStatus !== 'idle'}
              onPress={() => { void saveContract(); }} />
             {editing && <AppButton title={t("Cancel Edit", "إلغاء التعديل")} variant="ghost" disabled={saveBusy}
               onPress={() => { resetDraft(); router.back(); }} />}
            {saveMessage ? <AppText color="textSecondary">{saveMessage}</AppText> : null}
            {draftError ? <AppText color="danger">{draftError}</AppText> : null}
            {draftSummary ? <View style={[styles.draftRow, { borderColor: tone.border }]}>
              <AppText variant="bodyStrong">{t("Valid draft — not saved", "مسودة صالحة — لم تُحفظ")}</AppText>
              <AppText>{draftSummary}</AppText>
            </View> : null}
          </View>
        )}
      </Card>
      )}
      {saveMessage ? <AppText color="textSecondary">{saveMessage}</AppText> : null}

      {confirmation}
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
  contractCard: { padding: 8, borderRadius: 14 },
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
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' },
  choiceColumns: { gap: 10, alignItems: 'stretch' },
  choiceColumn: { width: '100%', minWidth: 0 },
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
