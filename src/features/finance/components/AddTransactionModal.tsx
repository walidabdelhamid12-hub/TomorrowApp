
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppInput,
  AppText,
  ChipSelect,
  DateField,
} from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import { ScanDocumentButton } from '@/features/finance/components/ScanDocumentButton';
import { getCurrencyLabel } from '@/features/finance/constants/currencies';
import type { ScanResult } from '@/features/finance/scanner/types';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type {
  Category,
  NewCategoryInput,
  Transaction,
  TransactionType,
} from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { moduleColors, useTheme } from '@/theme';
import { isValidISODate } from '@/utils/input';

type EntryMode = 'normal' | 'refund';

const ICON_OPTIONS = [
  'cash-outline',
  'briefcase-outline',
  'laptop-outline',
  'gift-outline',
  'add-circle-outline',
  'restaurant-outline',
  'cart-outline',
  'car-outline',
  'receipt-outline',
  'medkit-outline',
  'school-outline',
  'bag-outline',
  'heart-outline',
  'home-outline',
  'airplane-outline',
  'fitness-outline',
  'paw-outline',
  'ellipsis-horizontal-circle-outline',
] as const;

const COLOR_OPTIONS = [
  '#10B981',
  '#14B8A6',
  '#F59E0B',
  '#64748B',
  '#F97316',
  '#84CC16',
  '#3B82F6',
  '#EF4444',
  '#F43F5E',
  '#6366F1',
  '#EC4899',
  '#8B5CF6',
  '#0EA5E9',
  '#A855F7',
];

export function AddTransactionModal({
  visible,
  onClose,
  transaction,
}: AddTransactionModalProps) {
  const { colors, spacing, radius } = useTheme();

  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const transactions = useLedgerStore((s) => s.transactions);
  const addTransaction = useLedgerStore((s) => s.addTransaction);
  const updateTransaction = useLedgerStore((s) => s.updateTransaction);
  const addCategory = useLedgerStore((s) => s.addCategory);
  const updateCategory = useLedgerStore((s) => s.updateCategory);
  const deleteCategory = useLedgerStore((s) => s.deleteCategory);

  const [type, setType] = useState<TransactionType>('expense');
  const [entryMode, setEntryMode] = useState<EntryMode>('normal');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [originalTransactionId, setOriginalTransactionId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [categoryFormVisible, setCategoryFormVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [pendingDeleteCategory, setPendingDeleteCategory] =
    useState<Category | null>(null);
  const [replacementCategoryId, setReplacementCategoryId] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>(
    ICON_OPTIONS[0],
  );
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0]);

  const isEditingRefund = transaction?.entryType === 'refund';

  useEffect(() => {
    if (!visible) return;

    setError(undefined);
    setCategoryManagerVisible(false);
    setCategoryFormVisible(false);
    setEditingCategory(null);
    setPendingDeleteCategory(null);
    setReplacementCategoryId('');

    if (transaction) {
      setType(transaction.type);
      setEntryMode(transaction.entryType === 'refund' ? 'refund' : 'normal');
      setAmount(String(transaction.amount));
      setAccountId(transaction.accountId);
      setCategoryId(transaction.categoryId);
      setOriginalTransactionId(transaction.relatedTransactionId ?? '');
      setDate(transaction.date);
      setNote(transaction.note ?? '');
    } else {
      setType('expense');
      setEntryMode('normal');
      setAmount('');
      setAccountId('');
      setCategoryId('');
      setOriginalTransactionId('');
      setDate(todayISO());
      setNote('');
    }
  }, [visible, transaction]);

  const selectableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => !account.archived || account.id === transaction?.accountId,
      ),
    [accounts, transaction],
  );

  const kindCategories = useMemo(
    () => categories.filter((category) => category.kind === type),
    [categories, type],
  );

  const refundableTransactions = useMemo(() => {
    return transactions
      .filter(
        (item) =>
          item.type === 'expense' &&
          item.entryType !== 'refund' &&
          item.id !== transaction?.id,
      )
      .map((item) => {
        const refundedAmount = transactions
          .filter(
            (refund) =>
              refund.entryType === 'refund' &&
              refund.relatedTransactionId === item.id,
          )
          .reduce((total, refund) => total + refund.amount, 0);

        const remainingAmount = Math.max(0, item.amount - refundedAmount);

        return {
          transaction: item,
          refundedAmount,
          remainingAmount,
        };
      })
      .filter((item) => item.remainingAmount > 0)
      .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
  }, [transactions, transaction]);

  const selectedOriginal = refundableTransactions.find(
    (item) => item.transaction.id === originalTransactionId,
  );

  const originalAccount = selectedOriginal
    ? accounts.find(
        (account) => account.id === selectedOriginal.transaction.accountId,
      )
    : undefined;

  const originalCategory = selectedOriginal
    ? categories.find(
        (category) => category.id === selectedOriginal.transaction.categoryId,
      )
    : undefined;

  const activeAccountId =
    entryMode === 'refund'
      ? (originalAccount?.id ?? '')
      : selectableAccounts.some((account) => account.id === accountId)
        ? accountId
        : (selectableAccounts[0]?.id ?? '');

  const activeCategoryId =
    entryMode === 'refund'
      ? (originalCategory?.id ?? '')
      : kindCategories.some((category) => category.id === categoryId)
        ? categoryId
        : (kindCategories[0]?.id ?? '');

  const activeAccount =
    entryMode === 'refund'
      ? originalAccount
      : selectableAccounts.find((account) => account.id === activeAccountId);

  const replacementCategories = useMemo(
    () =>
      pendingDeleteCategory
        ? categories.filter(
            (category) =>
              category.kind === pendingDeleteCategory.kind &&
              category.id !== pendingDeleteCategory.id,
          )
        : [],
    [categories, pendingDeleteCategory],
  );

  const openCategoryManager = () => {
    setCategoryManagerVisible(true);
  };

  const openNewCategoryForm = () => {
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryIcon(ICON_OPTIONS[0]);
    setNewCategoryColor(
      type === 'income' ? COLOR_OPTIONS[0] : COLOR_OPTIONS[4],
    );
    setCategoryFormVisible(true);
  };

  const openEditCategoryForm = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryIcon(category.icon);
    setNewCategoryColor(category.color);
    setCategoryFormVisible(true);
  };

  const closeCategoryForm = () => {
    setCategoryFormVisible(false);
    setEditingCategory(null);
  };

  const saveCategory = () => {
    const cleanName = newCategoryName.trim();

    if (!cleanName) {
      Alert.alert('Missing name', 'Please enter a category name.');
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.kind === type &&
        category.id !== editingCategory?.id &&
        category.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    if (duplicate) {
      Alert.alert(
        'Category already exists',
        'A category with this name already exists.',
      );
      return;
    }

    if (editingCategory) {
      updateCategory(editingCategory.id, {
        name: cleanName,
        icon: newCategoryIcon,
        color: newCategoryColor,
      });
    } else {
      const input: NewCategoryInput = {
        name: cleanName,
        kind: type,
        icon: newCategoryIcon,
        color: newCategoryColor,
      };

      const id = addCategory(input);
      setCategoryId(id);
    }

    closeCategoryForm();
    setError(undefined);
  };

  const requestDeleteCategory = (category: Category) => {
    const isUsed = transactions.some(
      (item) => item.categoryId === category.id,
    );

    if (isUsed) {
      setPendingDeleteCategory(category);
      setReplacementCategoryId('');
      return;
    }

    Alert.alert(
      'Delete category?',
      `Are you sure you want to delete "${category.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const deleted = deleteCategory(category.id);

            if (!deleted) {
              Alert.alert(
                'Could not delete category',
                'Please try again.',
              );
              return;
            }

            if (categoryId === category.id) {
              setCategoryId('');
            }
          },
        },
      ],
    );
  };

  const confirmDeleteWithReplacement = () => {
    if (!pendingDeleteCategory || !replacementCategoryId) {
      return;
    }

    const deleted = deleteCategory(
      pendingDeleteCategory.id,
      replacementCategoryId,
    );

    if (!deleted) {
      Alert.alert(
        'Could not delete category',
        'The replacement category is invalid. Please try again.',
      );
      return;
    }

    if (categoryId === pendingDeleteCategory.id) {
      setCategoryId(replacementCategoryId);
    }

    setPendingDeleteCategory(null);
    setReplacementCategoryId('');
  };

  const handleEntryModeChange = (value: string) => {
    setError(undefined);

    if (value === 'refund') {
      setEntryMode('refund');
      setType('expense');
      setOriginalTransactionId('');
      setAmount('');
      setAccountId('');
      setCategoryId('');
      return;
    }

    setEntryMode('normal');
    setOriginalTransactionId('');
    setAmount('');
    setType(value as TransactionType);
  };

  const applyScan = (result: ScanResult) => {
    if (result.amount !== undefined) setAmount(String(result.amount));
    if (result.date && isValidISODate(result.date)) setDate(result.date);
    if (result.merchant && !note.trim()) setNote(result.merchant);

    if (result.currencyCode) {
      const match = selectableAccounts.find(
        (account) => account.currencyCode === result.currencyCode,
      );
      if (match) setAccountId(match.id);
    }

    setError(undefined);
  };

  const submit = () => {
    const value = parseAmount(amount);

    if (value === null || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    if (!isValidISODate(date)) {
      setError('Date must be a real date in the format YYYY-MM-DD.');
      return;
    }

    if (entryMode === 'refund') {
      if (!selectedOriginal || !originalAccount || !originalCategory) {
        setError('Choose an original purchase to refund.');
        return;
      }

      if (value > selectedOriginal.remainingAmount) {
        setError(
          `The remaining refundable amount is ${selectedOriginal.remainingAmount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`,
        );
        return;
      }

      const id = addTransaction({
        type: 'expense',
        entryType: 'refund',
        relatedTransactionId: selectedOriginal.transaction.id,
        amount: value,
        accountId: selectedOriginal.transaction.accountId,
        categoryId: selectedOriginal.transaction.categoryId,
        date,
        note: note.trim() || undefined,
      });

      if (id === null) {
        setError('Could not add the refund. Please check the refundable amount.');
        return;
      }

      onClose();
      return;
    }

    if (!activeAccount) {
      setError('Create an account first.');
      return;
    }

    if (!activeCategoryId) {
      setError('Choose a category.');
      return;
    }

    if (transaction) {
      const ok = updateTransaction(transaction.id, {
        type,
        amount: value,
        accountId: activeAccount.id,
        categoryId: activeCategoryId,
        date,
        note: note.trim(),
      });

      if (!ok) {
        setError('Could not save the changes.');
        return;
      }
    } else {
      const id = addTransaction({
        type,
        amount: value,
        accountId: activeAccount.id,
        categoryId: activeCategoryId,
        date,
        note: note.trim() || undefined,
      });

      if (id === null) {
        setError('Could not add the transaction.');
        return;
      }
    }

    onClose();
  };

  return (
    <>
      <FormModal
        visible={visible}
        title={
          isEditingRefund
            ? 'Refund details'
            : transaction
              ? 'Edit transaction'
              : 'Add transaction'
        }
        onClose={onClose}
      >
        {isEditingRefund ? (
          <AppText color="textSecondary">
            Refund records cannot be edited here. Remove the refund and add it
            again with the correct details.
          </AppText>
        ) : entryMode === 'normal' && selectableAccounts.length === 0 ? (
          <AppText color="textSecondary">
            You need at least one account before adding a transaction. Close this
            and tap "Account" first.
          </AppText>
        ) : (
          <>
            {entryMode === 'normal' ? (
              <ScanDocumentButton onResult={applyScan} />
            ) : null}

            {!transaction ? (
              <ChipSelect<string>
                options={[
                  { value: 'expense', label: 'Expense', color: colors.expense },
                  { value: 'income', label: 'Income', color: colors.income },
                  { value: 'refund', label: 'Refund', color: moduleColors.finance },
                ]}
                value={entryMode === 'refund' ? 'refund' : type}
                onChange={handleEntryModeChange}
              />
            ) : null}

            {entryMode === 'refund' ? (
              <>
                <AppText variant="caption" color="textSecondary">
                  Select the original purchase. The refund will return to the
                  same account and category automatically.
                </AppText>

                {refundableTransactions.length === 0 ? (
                  <AppText color="textSecondary">
                    There are no purchases with a refundable balance.
                  </AppText>
                ) : (
                  <ChipSelect<string>
                    label="ORIGINAL PURCHASE"
                    options={refundableTransactions.map((item) => ({
                      value: item.transaction.id,
                      label: `${item.transaction.date} · ${item.transaction.note?.trim() || 'Purchase'} · ${item.remainingAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} ${getCurrencyLabel(item.transaction.currencyCode)}`,
                      color: moduleColors.finance,
                    }))}
                    value={originalTransactionId}
                    onChange={(value) => {
                      setOriginalTransactionId(value);
                      setAmount('');
                      setError(undefined);
                    }}
                  />
                )}

                {selectedOriginal ? (
                  <AppText variant="caption" color="textSecondary">
                    Original amount:{' '}
                    {selectedOriginal.transaction.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {' · '}Already refunded:{' '}
                    {selectedOriginal.refundedAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    {' · '}Remaining:{' '}
                    {selectedOriginal.remainingAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </AppText>
                ) : null}

                {selectedOriginal && originalAccount ? (
                  <AppText color="textSecondary">
                    Account: {originalAccount.name} ·{' '}
                    {getCurrencyLabel(originalAccount.currencyCode)}
                    {originalCategory ? ` · Category: ${originalCategory.name}` : ''}
                  </AppText>
                ) : null}
              </>
            ) : (
              <>
                <ChipSelect<string>
                  label="ACCOUNT"
                  options={selectableAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.name} · ${getCurrencyLabel(account.currencyCode)}`,
                    color: moduleColors.finance,
                  }))}
                  value={activeAccountId}
                  onChange={setAccountId}
                />

                <View style={styles.categoryHeader}>
                  <AppText variant="label" color="textSecondary">
                    CATEGORY
                  </AppText>

                  <Pressable
                    accessibilityRole="button"
                    onPress={openCategoryManager}
                    style={[
                      styles.addCategoryButton,
                      { borderColor: colors.primary },
                    ]}
                  >
                    <Ionicons
                      name="create-outline"
                      size={17}
                      color={colors.primary}
                    />
                    <AppText variant="label" color={colors.primary}>
                      Edit Categories
                    </AppText>
                  </Pressable>
                </View>

                <ChipSelect<string>
                  options={kindCategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                    color: category.color,
                  }))}
                  value={activeCategoryId}
                  onChange={setCategoryId}
                />
              </>
            )}

            <AppInput
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              leftElement={
                <AppText color="textSecondary">
                  {activeAccount
                    ? getCurrencyLabel(activeAccount.currencyCode)
                    : ''}
                </AppText>
              }
            />

            <DateField value={date} onChange={setDate} />

            <AppInput
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Fuel"
            />

            {error ? (
              <AppText variant="caption" color="danger">
                {error}
              </AppText>
            ) : null}

            <AppButton
              title={
                entryMode === 'refund'
                  ? 'Add refund'
                  : transaction
                    ? 'Save changes'
                    : 'Add transaction'
              }
              accentColor={moduleColors.finance}
              onPress={submit}
              style={{ marginTop: spacing.xs }}
            />
          </>
        )}
      </FormModal>

      {/* Category manager */}
      <Modal
        visible={visible && categoryManagerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryManagerVisible(false)}
      >
        <View style={styles.categoryModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCategoryManagerVisible(false)}
          />

          <View
            style={[
              styles.categoryModalContent,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
            ]}
          >
            <View style={styles.categoryModalHeader}>
              <View>
                <AppText variant="h2">Edit Categories</AppText>
                <AppText color="textSecondary" variant="caption">
                  {type === 'expense' ? 'Expense categories' : 'Income categories'}
                </AppText>
              </View>

              <Pressable
                onPress={() => setCategoryManagerVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categoryManagerList}
            >
              {kindCategories.length === 0 ? (
                <AppText color="textSecondary">
                  No categories yet. Add your first category below.
                </AppText>
              ) : (
                kindCategories.map((category) => {
                  const isUsed = transactions.some(
                    (item) => item.categoryId === category.id,
                  );

                  return (
                    <View
                      key={category.id}
                      style={[
                        styles.categoryManagerRow,
                        { borderColor: colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.categoryManagerIcon,
                          { backgroundColor: category.color },
                        ]}
                      >
                        <Ionicons
                          name={category.icon as keyof typeof Ionicons.glyphMap}
                          size={20}
                          color="#FFFFFF"
                        />
                      </View>

                      <View style={styles.categoryManagerInfo}>
                        <AppText>{category.name}</AppText>
                        <AppText variant="caption" color="textSecondary">
                          {isUsed ? 'Used in transactions' : 'Custom category'}
                        </AppText>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${category.name}`}
                        onPress={() => openEditCategoryForm(category)}
                        style={styles.categoryRowAction}
                      >
                        <Ionicons
                          name="create-outline"
                          size={21}
                          color={colors.primary}
                        />
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${category.name}`}
                        onPress={() => requestDeleteCategory(category)}
                        style={styles.categoryRowAction}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={colors.danger}
                        />
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.categoryManagerActions}>
              <Pressable
                onPress={openNewCategoryForm}
                style={[
                  styles.categoryActionButton,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Ionicons name="add" size={19} color={colors.onPrimary} />
                <AppText color="onPrimary" variant="label">
                  Add Category
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => setCategoryManagerVisible(false)}
                style={[
                  styles.categoryActionButton,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <AppText>Done</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add / edit category form */}
      <Modal
        visible={visible && categoryFormVisible}
        transparent
        animationType="slide"
        onRequestClose={closeCategoryForm}
      >
        <View style={styles.categoryModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeCategoryForm}
          />

          <View
            style={[
              styles.categoryModalContent,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
              },
            ]}
          >
            <View style={styles.categoryModalHeader}>
              <AppText variant="h2">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </AppText>

              <Pressable onPress={closeCategoryForm} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.categoryModalScroll}
            >
              <AppText color="textSecondary" variant="label">
                Category name
              </AppText>

              <TextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="Enter category name"
                placeholderTextColor={colors.textDisabled}
                maxLength={40}
                style={[
                  styles.categoryNameInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                  },
                ]}
              />

              <AppText color="textSecondary" variant="label">
                Choose an icon
              </AppText>

              <View style={styles.categoryIconGrid}>
                {ICON_OPTIONS.map((icon) => {
                  const selected = newCategoryIcon === icon;

                  return (
                    <Pressable
                      key={icon}
                      onPress={() => setNewCategoryIcon(icon)}
                      style={[
                        styles.categoryIconOption,
                        {
                          backgroundColor: selected
                            ? newCategoryColor
                            : colors.surfaceAlt,
                          borderColor: selected
                            ? newCategoryColor
                            : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={icon as keyof typeof Ionicons.glyphMap}
                        size={22}
                        color={selected ? '#FFFFFF' : colors.text}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <AppText color="textSecondary" variant="label">
                Choose a color
              </AppText>

              <View style={styles.categoryColorGrid}>
                {COLOR_OPTIONS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setNewCategoryColor(color)}
                    style={[
                      styles.categoryColorOption,
                      { backgroundColor: color },
                      newCategoryColor === color &&
                        styles.categorySelectedColor,
                    ]}
                  >
                    {newCategoryColor === color ? (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View style={styles.categoryModalActions}>
                <Pressable
                  onPress={closeCategoryForm}
                  style={[
                    styles.categoryActionButton,
                    { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <AppText>Cancel</AppText>
                </Pressable>

                <Pressable
                  onPress={saveCategory}
                  style={[
                    styles.categoryActionButton,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <AppText color="onPrimary" variant="label">
                    {editingCategory ? 'Save Changes' : 'Save Category'}
                  </AppText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Replacement category picker */}
      <Modal
        visible={visible && !!pendingDeleteCategory}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPendingDeleteCategory(null);
          setReplacementCategoryId('');
        }}
      >
        <View style={styles.replacementBackdrop}>
          <View
            style={[
              styles.replacementCard,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.xl,
              },
            ]}
          >
            <AppText variant="h2">Choose replacement</AppText>

            <AppText color="textSecondary">
              The category "{pendingDeleteCategory?.name}" is used by existing
              transactions. Choose another category of the same type to move
              those transactions before deleting it.
            </AppText>

            {replacementCategories.length === 0 ? (
              <AppText color="danger">
                There is no other category of this type. Add one first, then
                try deleting this category again.
              </AppText>
            ) : (
              <ScrollView
                style={styles.replacementList}
                keyboardShouldPersistTaps="handled"
              >
                {replacementCategories.map((category) => {
                  const selected = replacementCategoryId === category.id;

                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setReplacementCategoryId(category.id)}
                      style={[
                        styles.replacementRow,
                        {
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                          backgroundColor: selected
                            ? colors.surfaceAlt
                            : colors.surface,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.categoryManagerIcon,
                          { backgroundColor: category.color },
                        ]}
                      >
                        <Ionicons
                          name={category.icon as keyof typeof Ionicons.glyphMap}
                          size={20}
                          color="#FFFFFF"
                        />
                      </View>

                      <AppText style={{ flex: 1 }}>{category.name}</AppText>

                      {selected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={colors.primary}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.categoryModalActions}>
              <Pressable
                onPress={() => {
                  setPendingDeleteCategory(null);
                  setReplacementCategoryId('');
                }}
                style={[
                  styles.categoryActionButton,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <AppText>Cancel</AppText>
              </Pressable>

              <Pressable
                disabled={
                  !replacementCategoryId || replacementCategories.length === 0
                }
                onPress={confirmDeleteWithReplacement}
                style={[
                  styles.categoryActionButton,
                  {
                    backgroundColor: replacementCategoryId
                      ? colors.danger
                      : colors.surfaceAlt,
                    opacity: replacementCategoryId ? 1 : 0.5,
                  },
                ]}
              >
                <AppText
                  color={replacementCategoryId ? 'onPrimary' : 'textSecondary'}
                  variant="label"
                >
                  Move & Delete
                </AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pass a transaction to edit it, or null/undefined to add a new one. */
  transaction?: Transaction | null;
}

const styles = StyleSheet.create({
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  addCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  categoryModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  categoryModalContent: {
    maxHeight: '90%',
    padding: 20,
    gap: 14,
  },
  categoryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryModalScroll: {
    gap: 13,
    paddingBottom: 12,
  },
  categoryManagerList: {
    gap: 9,
    paddingBottom: 8,
  },
  categoryManagerRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    gap: 9,
  },
  categoryManagerIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryManagerInfo: {
    flex: 1,
    gap: 3,
  },
  categoryRowAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  categoryNameInput: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  categoryIconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  categoryIconOption: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  categoryColorOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySelectedColor: {
    borderWidth: 3,
    borderColor: '#1F2937',
  },
  categoryModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  categoryManagerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  categoryActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  replacementBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  replacementCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    padding: 20,
    gap: 14,
  },
  replacementList: {
    flexGrow: 0,
    maxHeight: 280,
  },
  replacementRow: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 11,
    padding: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
