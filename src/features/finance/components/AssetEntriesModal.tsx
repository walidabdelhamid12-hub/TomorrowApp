import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { AssetTypeIcon } from '@/features/finance/components/AssetTypeIcon';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
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
  const { colors, spacing } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const metals = useCurrencyStore(s => s.metals);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setEditingId(null);
  }, [asset?.id, visible]);

  if (!asset) return null;

  const isMetal =
    asset.category === 'gold' || asset.category === 'silver';

  const unit = isMetal ? 'grams' : asset.currencyCode;

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
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    if (parsedAmount < 0) {
      Alert.alert('Invalid amount', 'Amount cannot be negative.');
      return;
    }

    if (!isMetal && !hasValidCurrencyPrecision(amount, asset.currencyCode)) {
      Alert.alert('Invalid amount precision', `${asset.currencyCode} allows up to ${getCurrencyDecimals(asset.currencyCode)} decimal places. Please correct the amount before saving.`);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format.');
      return;
    }

    const [year, month, day] = date.split('-').map(Number);
    const checkDate = new Date(year, month - 1, day);

    if (
      checkDate.getFullYear() !== year ||
      checkDate.getMonth() !== month - 1 ||
      checkDate.getDate() !== day
    ) {
      Alert.alert('Invalid date', 'Enter a real calendar date.');
      return;
    }

    onSave(asset.id, entryId, {
      amount: parsedAmount,
      date: date.trim(),
      note: note.trim() || undefined,
    });

    cancelEditing();
  };

  const confirmDelete = (entry: AssetEntry) => {
    const message = 'This dated movement will be permanently removed.';

    const remove = () => onDelete(asset.id, entry.id);

    confirm('Delete entry?', message, () => {
          remove();
          if (editingId === entry.id) cancelEditing();
        }, 'Delete');
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
              <AssetTypeIcon category={asset.category} currencyCode={'currencyCode' in asset ? asset.currencyCode : undefined} /><AppText variant="h3">Asset movements</AppText>
              <AppText color="textSecondary">
                {asset.name}
              </AppText>
            </View>

            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {(asset.category === 'gold' || asset.category === 'silver') && <AppText variant="caption" color="textSecondary">
            {asset.category === 'gold' ? 'Gold reference: 24K · ' + (metals.gold24PerGram ?? 'Not set') : 'Silver reference (purity unspecified): ' + (metals.silverPerGram ?? 'Not set')} EGP per 1 gram. Valuation uses full source precision.
          </AppText>}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
          >
            {sortedEntries.length === 0 ? (
              <AppText color="textSecondary" align="center">
                No entries for this asset yet.
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
                          Edit entry
                        </AppText>

                        <AppText color="textSecondary">
                          Amount ({unit})
                        </AppText>

                        <TextInput
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                          placeholder="Amount"
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

                        <AppText color="textSecondary">
                          Date (YYYY-MM-DD)
                        </AppText>

                        <TextInput
                          value={date}
                          onChangeText={setDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textSecondary}
                          autoCapitalize="none"
                          style={[
                            styles.input,
                            {
                              color: colors.text,
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                        />

                        <AppText color="textSecondary">Note</AppText>

                        <TextInput
                          value={note}
                          onChangeText={setNote}
                          placeholder="Optional note"
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
                              title="Save"
                              accentColor={moduleColors.finance}
                              onPress={() => saveEditing(entry.id)}
                            />
                          </View>
                          <View style={styles.flex}>
                            <AppButton
                              title="Cancel"
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

                          <FinanceActionButtons label={'entry dated ' + entry.date} onEdit={() => startEditing(entry)} onDelete={() => confirmDelete(entry)} />
                        </View>
                      </>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <AppButton title="Close" variant="secondary" onPress={onClose} />
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
