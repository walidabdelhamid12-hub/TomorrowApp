import { FinanceDateField } from '@/features/finance/components/FinanceDateField';
import { formPayload, submitFinanceForm } from '@/features/finance/components/explicitFinanceForm';
import { roundMoney } from '@/features/finance/utils/finance';
import { acknowledgedFinanceHandler, afterFinanceSave } from '@/features/finance/components/acknowledgedFinanceHandler';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { AssetTypeIcon } from '@/features/finance/components/AssetTypeIcon';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import type { Asset, AssetEntry } from '@/features/finance/types/finance';
import { formatMoney, formatNumber, parseAmount } from '@/features/finance/utils/money';
import { hasValidCurrencyPrecision } from '@/features/finance/utils/amountPrecision';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { moduleColors, useTheme } from '@/theme';

interface AssetEntriesModalProps {
  visible: boolean;
  asset: Asset | null;
  onClose: () => void;
  onSave: (
    assetId: string,
    entryId: string,
    patch: Partial<Pick<AssetEntry, 'date' | 'amount' | 'note'>>,
  ) => void;
  onDelete: (assetId: string, entryId: string) => void;
}

export function AssetEntriesModal({
  visible,
  asset,
  onClose,
  onSave,
  onDelete,
}: AssetEntriesModalProps) {
  const { colors } = useTheme();
  const { t } = useAppLanguage();
  const { confirm, confirmation } = useFinanceConfirmation();
  const metals = useCurrencyStore(s => s.metals);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const entriesContext = visible ? asset?.id ?? null : null;
  const [loadedEntriesContext, setLoadedEntriesContext] = useState<string | null>(null);
  if (loadedEntriesContext !== entriesContext) {
    setLoadedEntriesContext(entriesContext);
    setEditingId(null);
    setAmount('');
    setDate('');
    setNote('');
  }

  if (!asset) return null;

  const isMetal =
    asset.category === 'gold' || asset.category === 'silver';

  const unit = isMetal ? t('grams', 'جرام') : asset.currencyCode;

  const sortedEntries = [...asset.entries].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const startEditing = (entry: AssetEntry) => {
    setEditingId(entry.id);
    setAmount(String(entry.amount));
    setDate(entry.date);
    setNote(entry.note ?? '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setAmount('');
    setDate('');
    setNote('');
  };

  const saveEditing = (entryId: string) => {
    const parsedAmount = parseAmount(amount);

    if (!amount.trim() || parsedAmount === null) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount', 'مبلغ غير صالح'), t('Enter a valid amount.', 'أدخل مبلغًا صحيحًا.')));
      return;
    }

    if (parsedAmount < 0) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount', 'مبلغ غير صالح'), t('Amount cannot be negative.', 'لا يمكن أن يكون المبلغ سالبًا.')));
      return;
    }

    if (!isMetal && !hasValidCurrencyPrecision(amount, asset.currencyCode)) {
      afterFinanceSave(() => Alert.alert(t('Invalid amount precision', 'دقة المبلغ غير صالحة'), `${asset.currencyCode} ${t('allows up to', 'يسمح بحد أقصى')} ${getCurrencyDecimals(asset.currencyCode)} ${t('decimal places. Please correct the amount before saving.', 'منازل عشرية. صحح المبلغ قبل الحفظ.')}`));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      afterFinanceSave(() => Alert.alert(t('Invalid date', 'تاريخ غير صالح'), t('Use YYYY-MM-DD format.', 'استخدم تنسيق YYYY-MM-DD.')));
      return;
    }

    const [year, month, day] = date.split('-').map(Number);
    const checkDate = new Date(year, month - 1, day);

    if (
      checkDate.getFullYear() !== year ||
      checkDate.getMonth() !== month - 1 ||
      checkDate.getDate() !== day
    ) {
      afterFinanceSave(() => Alert.alert(t('Invalid date', 'تاريخ غير صالح'), t('Enter a real calendar date.', 'أدخل تاريخًا صحيحًا.')));
      return;
    }

    const patch = { amount: roundMoney(parsedAmount), date: date.trim(), note: note.trim() };
    if (!Number.isSafeInteger(Math.round(parsedAmount * 1000))) { Alert.alert(t('Invalid amount', 'مبلغ غير صالح')); return; }
    const expectedUpdatedAt = asset.updatedAt;
    return submitFinanceForm("src/features/finance/components/AssetEntriesModal.tsx:84",
      formPayload('asset.entry.edit', asset.id, patch, { entryId, expectedUpdatedAt }), () => {
        const current = useFinanceStore.getState().assets.filter(item => item.id === asset.id);
        if (current.length !== 1 || current[0].updatedAt !== expectedUpdatedAt || current[0].entries.filter(item => item.id === entryId).length !== 1) return false;
        onSave(asset.id, entryId, patch);
        const after = useFinanceStore.getState().assets.filter(item => item.id === asset.id);
        const saved = after.length === 1 ? after[0].entries.filter(item => item.id === entryId) : [];
        if (saved.length !== 1 || saved[0].amount !== patch.amount || saved[0].date !== patch.date || saved[0].note !== patch.note) throw new Error('Asset movement was not fully saved.');
        return true;
      }, cancelEditing, () => Alert.alert(t('Cannot save entry', 'تعذر حفظ الحركة')));
  };

  const confirmDelete = (entry: AssetEntry) => {
    const message = t('This dated movement will be permanently removed.', 'سيتم حذف هذه الحركة المؤرخة نهائيًا.');

    const assetId = asset.id;
    const entryId = entry.id;
    const remove = () => acknowledgedFinanceHandler("src/features/finance/components/AssetEntriesModal.tsx:130", () => undefined, {
      payload: { operation: 'deleteAssetEntry', assetId, entryId },
      mutate: () => {
        const before = useFinanceStore.getState().assets.filter(item => item.id === assetId);
        if (before.length !== 1 || before[0].entries.filter(item => item.id === entryId).length !== 1) return false;
        onDelete(assetId, entryId); // parent callback is a raw synchronous store action
        const after = useFinanceStore.getState().assets.filter(item => item.id === assetId);
        return after.length === 1 && !after[0].entries.some(item => item.id === entryId);
      },
      onCommitted: result => {
        if (result === true) {
          if (editingId === entryId) cancelEditing();
        } else Alert.alert(t('Cannot delete entry', 'تعذر حذف الحركة'));
      },
    })();
    confirm(t('Delete entry?', 'حذف الحركة؟'), message, remove, t('Delete', 'حذف'));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {confirmation}
      <View style={styles.backdrop}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.flex}>
              <AssetTypeIcon category={asset.category} currencyCode={'currencyCode' in asset ? asset.currencyCode : undefined} /><AppText variant="h3">{t("Asset movements", "حركات الأصل")}</AppText>
              <AppText color="textSecondary">
                {asset.name}
              </AppText>
            </View>

            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {(asset.category === 'gold' || asset.category === 'silver') && <AppText variant="caption" color="textSecondary">
            {asset.category === 'gold' ? t('Gold reference: 24K', 'مرجع الذهب: عيار 24') + ' · ' + (metals.gold24PerGram ?? t('Not set', 'غير محدد')) : t('Silver reference (purity unspecified)', 'مرجع الفضة (النقاوة غير محددة)') + ': ' + (metals.silverPerGram ?? t('Not set', 'غير محدد'))} {t('EGP per 1 gram. Valuation uses full source precision.', 'جنيه مصري لكل جرام. يُستخدم كامل مستوى الدقة للمصدر في التقييم.')}
          </AppText>}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
          >
            {sortedEntries.length === 0 ? (
              <AppText color="textSecondary" align="center">
                {t("No entries for this asset yet.", "لا توجد حركات لهذا الأصل بعد.")}
              </AppText>
            ) : (
              sortedEntries.map((entry) => {
                const editing = editingId === entry.id;

                return (
                  <View
                    key={entry.id}
                    style={[
                      styles.entry,
                      { borderColor: colors.border },
                    ]}
                  >
                    {editing ? (
                      <>
                        <AppText variant="bodyStrong">
                          {t("Edit entry", "تعديل الحركة")}
                        </AppText>

                        <AppText color="textSecondary">
                          {t('Amount', 'المبلغ')} ({unit})
                        </AppText>

                        <TextInput
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                          placeholder={t('Amount', 'المبلغ')}
                          placeholderTextColor={colors.textSecondary}
                          style={[
                            styles.input,
                            {
                              color: colors.text,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                        />

                        <FinanceDateField label={t('Date', 'التاريخ')} value={date} onChange={setDate} pickerOnly />

                        <AppText color="textSecondary">{t("Note", "ملاحظة")}</AppText>

                        <TextInput
                          value={note}
                          onChangeText={setNote}
                          placeholder={t('Optional note', 'ملاحظة اختيارية')}
                          placeholderTextColor={colors.textSecondary}
                          style={[
                            styles.input,
                            {
                              color: colors.text,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                        />

                        <View style={styles.editActions}>
                          <View style={styles.flex}>
                            <AppButton
                              title={t('Save', 'حفظ')}
                              accentColor={moduleColors.finance}
                              onPress={() => saveEditing(entry.id)}
                            />
                          </View>
                          <View style={styles.flex}>
                            <AppButton
                              title={t('Cancel', 'إلغاء')}
                              variant="secondary"
                              onPress={cancelEditing}
                            />
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.entryHeader}>
                          <View style={styles.flex}>
                            <AppText variant="bodyStrong">
                              {isMetal
                                ? `${formatNumber(entry.amount, 3)} g`
                                : `${formatMoney(entry.amount, asset.currencyCode)} ${asset.currencyCode}`}
                            </AppText>
                            <AppText color="textSecondary">
                              {entry.date}
                            </AppText>
                            {entry.note ? (
                              <AppText color="textSecondary">
                                {entry.note}
                              </AppText>
                            ) : null}
                          </View>

                          <FinanceActionButtons label={t('Entry dated ', 'حركة بتاريخ ') + entry.date} onEdit={() => startEditing(entry)} onDelete={() => confirmDelete(entry)} />
                        </View>
                      </>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <AppButton title={t('Close', 'إغلاق')} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 14,
  },
  container: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: 12,
    paddingBottom: 16,
  },
  entry: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 9,
  },
  entryHeader: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
});
