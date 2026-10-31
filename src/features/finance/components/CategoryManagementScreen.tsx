
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type {
    Category,
    CategoryPatch,
    NewCategoryInput,
} from '@/features/finance/types/ledger';
import { useTheme } from '@/theme';

type CategoryKind = 'income' | 'expense';

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

interface CategoryManagementScreenProps {
  onBack?: () => void;
}

interface CategoryEditorProps {
  visible: boolean;
  category?: Category | null;
  onClose: () => void;
  onSave: (name: string, icon: string, color: string) => void;
}

function CategoryEditor({
  visible,
  category,
  onClose,
  onSave,
}: CategoryEditorProps) {
  const { colors, spacing, radius } = useTheme();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);

  React.useEffect(() => {
    if (visible) {
      setName(category?.name ?? '');
      setIcon(category?.icon ?? ICON_OPTIONS[0]);
      setColor(category?.color ?? COLOR_OPTIONS[0]);
    }
  }, [visible, category]);

  const handleSave = () => {
    const cleanName = name.trim();

    if (!cleanName) {
      Alert.alert('Missing name', 'Please enter a category name.');
      return;
    }

    onSave(cleanName, icon, color);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.lg,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <AppText variant="h2">
              {category ? 'Edit category' : 'Add category'}
            </AppText>

            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <AppText color="textSecondary" style={styles.fieldLabel}>
            Category name
          </AppText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter category name"
            placeholderTextColor={colors.textDisabled}
            style={[
              styles.nameInput,
              {
                color: colors.text,
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
                borderRadius: radius.md,
              },
            ]}
            maxLength={40}
          />

          <AppText color="textSecondary" style={styles.fieldLabel}>
            Choose an icon
          </AppText>

          <View style={styles.iconGrid}>
            {ICON_OPTIONS.map((item) => {
              const selected = icon === item;

              return (
                <Pressable
                  key={item}
                  onPress={() => setIcon(item)}
                  style={[
                    styles.iconOption,
                    {
                      backgroundColor: selected ? color : colors.surfaceAlt,
                      borderColor: selected ? color : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={item as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={selected ? '#FFFFFF' : colors.text}
                  />
                </Pressable>
              );
            })}
          </View>

          <AppText color="textSecondary" style={styles.fieldLabel}>
            Choose a color
          </AppText>

          <View style={styles.colorGrid}>
            {COLOR_OPTIONS.map((item) => (
              <Pressable
                key={item}
                onPress={() => setColor(item)}
                style={[
                  styles.colorOption,
                  { backgroundColor: item },
                  color === item && styles.selectedColor,
                ]}
              >
                {color === item ? (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                ) : null}
              </Pressable>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Pressable
              onPress={onClose}
              style={[
                styles.actionButton,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <AppText>Cancel</AppText>
            </Pressable>

            <Pressable
              onPress={handleSave}
              style={[
                styles.actionButton,
                { backgroundColor: colors.primary },
              ]}
            >
              <AppText color="onPrimary" variant="label">
                Save category
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function CategoryManagementScreen({
  onBack,
}: CategoryManagementScreenProps) {
  const { colors, spacing, radius } = useTheme();

  const categories = useLedgerStore((state) => state.categories);
  const addCategory = useLedgerStore((state) => state.addCategory);
  const updateCategory = useLedgerStore((state) => state.updateCategory);
  const deleteCategory = useLedgerStore((state) => state.deleteCategory);

  const [activeKind, setActiveKind] = useState<CategoryKind>('expense');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const visibleCategories = useMemo(
    () => categories.filter((item) => item.kind === activeKind),
    [categories, activeKind],
  );

  const openAddEditor = () => {
    setEditingCategory(null);
    setEditorVisible(true);
  };

  const openEditEditor = (category: Category) => {
    setEditingCategory(category);
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setEditingCategory(null);
  };

  const handleSave = (name: string, icon: string, color: string) => {
    if (editingCategory) {
      const patch: CategoryPatch = {
        name,
        icon,
        color,
      };

      updateCategory(editingCategory.id, patch);
    } else {
      const input: NewCategoryInput = {
        name,
        kind: activeKind,
        icon,
        color,
      };

      addCategory(input);
    }

    closeEditor();
  };

  const handleDelete = (category: Category) => {
    if (category.isDefault) {
      Alert.alert(
        'Default category',
        'Default categories cannot be deleted. You can still edit their name, icon, and color.',
      );
      return;
    }

    Alert.alert(
      'Delete category',
      `Are you sure you want to delete "${category.name}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const deleted = deleteCategory(category.id);

            if (!deleted) {
              Alert.alert(
                'Cannot delete category',
                'This category is already used by a transaction.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={23} color={colors.text} />
          </Pressable>
        ) : null}

        <View style={styles.headerText}>
          <AppText variant="h2">Categories</AppText>
          <AppText color="textSecondary" variant="caption">
            Manage your income and expense categories
          </AppText>
        </View>

        <Pressable
          onPress={openAddEditor}
          style={[
            styles.addButton,
            { backgroundColor: colors.primary },
          ]}
        >
          <Ionicons name="add" size={21} color="#FFFFFF" />
          <AppText color="onPrimary" variant="label">
            Add
          </AppText>
        </Pressable>
      </View>

      <View
        style={[
          styles.tabs,
          {
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.lg,
          },
        ]}
      >
        {(['expense', 'income'] as const).map((kind) => {
          const selected = activeKind === kind;
          const label = kind === 'expense' ? 'Expenses' : 'Income';

          return (
            <Pressable
              key={kind}
              onPress={() => setActiveKind(kind)}
              style={[
                styles.tab,
                selected && { backgroundColor: colors.surface },
              ]}
            >
              <AppText
                color={
                  selected
                    ? kind === 'expense'
                      ? colors.expense
                      : colors.income
                    : 'textSecondary'
                }
                variant="label"
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeading}>
          <AppText variant="h3">
            {activeKind === 'expense'
              ? 'Expense categories'
              : 'Income categories'}
          </AppText>

          <AppText color="textSecondary" variant="caption">
            {visibleCategories.length} categories
          </AppText>
        </View>

        {visibleCategories.length === 0 ? (
          <Card variant="outlined">
            <View style={styles.emptyState}>
              <Ionicons
                name="albums-outline"
                size={34}
                color={colors.textSecondary}
              />

              <AppText color="textSecondary">
                No categories yet. Add your first category.
              </AppText>
            </View>
          </Card>
        ) : (
          <View style={styles.categoryList}>
            {visibleCategories.map((category) => (
              <Card key={category.id} variant="elevated">
                <View style={styles.categoryRow}>
                  <View
                    style={[
                      styles.categoryIcon,
                      {
                        backgroundColor: `${category.color}20`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        category.icon as keyof typeof Ionicons.glyphMap
                      }
                      size={23}
                      color={category.color}
                    />
                  </View>

                  <View style={styles.categoryInfo}>
                    <AppText variant="label">
                      {category.name}
                    </AppText>

                    <AppText color="textSecondary" variant="caption">
                      {category.isDefault
                        ? 'Default category'
                        : 'Custom category'}
                    </AppText>
                  </View>

                  <Pressable
                    onPress={() => openEditEditor(category)}
                    hitSlop={10}
                    style={styles.iconButton}
                  >
                    <Ionicons
                      name="create-outline"
                      size={21}
                      color={colors.primary}
                    />
                  </Pressable>

                  {!category.isDefault ? (
                    <Pressable
                      onPress={() => handleDelete(category)}
                      hitSlop={10}
                      style={styles.iconButton}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={colors.danger}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <CategoryEditor
        visible={editorVisible}
        category={editingCategory}
        onClose={closeEditor}
        onSave={handleSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  addButton: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabs: {
    marginHorizontal: 18,
    marginBottom: 18,
    padding: 4,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    gap: 16,
  },
  sectionHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryList: {
    gap: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
    gap: 4,
  },
  iconButton: {
    width: 34,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalContent: {
    maxHeight: '90%',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fieldLabel: {
    marginTop: 4,
  },
  nameInput: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  iconOption: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  colorOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedColor: {
    borderWidth: 3,
    borderColor: '#1F2937',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
