
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { AppButton, AppText } from '@/components/ui';
import type { Asset, AssetEntry } from '@/features/finance/types/finance';
import { formatMoney, formatNumber } from '@/features/finance/utils/money';
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
    const parsedAmount = Number(amount);

    if (!amount.trim() || !Number.isFinite(parsedAmount)) {
      Alert.alert('Invalid amount', 'Enter a valid amount.');
      return;
    }

    if (parsedAmount < 0) {
      Alert.alert('Invalid amount', 'Amount cannot be negative.');
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

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete this entry?\n\n${message}`)) {
        remove();
        if (editingId === entry.id) cancelEditing();
      }
      return;
    }

    Alert.alert('Delete entry?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove();
          if (editingId === entry.id) cancelEditing();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
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
              <AppText variant="h3">Asset entries</AppText>
              <AppText color="textSecondary" numberOfLines={1}>
                {asset.name}
              </AppText>
            </View>

            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

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

                          <View style={styles.actions}>
                            <Pressable
                              onPress={() => startEditing(entry)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Edit entry"
                            >
                              <Ionicons
                                name="create-outline"
                                size={20}
                                color={moduleColors.finance}
                              />
                            </Pressable>

                            <Pressable
                              onPress={() => confirmDelete(entry)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Delete entry"
                            >
                              <Ionicons
                                name="trash-outline"
                                size={19}
                                color="#DC2626"
                              />
                            </Pressable>
                          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
