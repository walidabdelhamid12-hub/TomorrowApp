import { acknowledgedFinanceHandler } from './acknowledgedFinanceHandler';
import { useFinanceConfirmation } from '@/features/finance/components/useFinanceConfirmation';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { FormModal } from './FormModal';
import { FinanceButton } from './FinanceButton';
import { financeChrome } from '@/features/finance/components/financeChrome';
import { FinanceActionButtons } from '@/features/finance/components/FinanceActionButtons';

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
    Alert,
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
  const { colors, radius } = useTheme();
  const { t } = useAppLanguage();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);

  const editorContext = visible ? category ?? 'new' : null;
  const [loadedEditorContext, setLoadedEditorContext] = useState<typeof editorContext>(null);
  if (loadedEditorContext !== editorContext) {
    setLoadedEditorContext(editorContext);
    if (visible) {
      setName(category?.name ?? '');
      setIcon(category?.icon ?? ICON_OPTIONS[0]);
      setColor(category?.color ?? COLOR_OPTIONS[0]);
    }
  }

  const handleSave = () => {
    const cleanName = name.trim();

    if (!cleanName) {
      Alert.alert(t('Missing name', 'الاسم مطلوب'), t('Please enter a category name.', 'يرجى إدخال اسم التصنيف.'));
      return;
    }

    onSave(cleanName, icon, color);
  };

  return (
    <FormModal visible={visible} title={category ? t('Edit category', 'تعديل التصنيف') : t('Add category', 'إضافة تصنيف')} onClose={onClose}>
          <AppText color="textSecondary" style={styles.fieldLabel}>
            {t("Category name", "اسم التصنيف")}
          </AppText>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("Enter category name", "أدخل اسم التصنيف")}
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
            {t("Choose an icon", "اختر أيقونة")}
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
            {t("Choose a color", "اختر لونًا")}
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

          <View style={{ gap: 12 }}>
            <FinanceButton title={t("Save category", "حفظ التصنيف")} onPress={handleSave} />
            <FinanceButton title={t("Cancel", "إلغاء")} variant="outline" onPress={onClose} />
          </View>
    </FormModal>
  );
}

export function CategoryManagementScreen({
  onBack,
}: CategoryManagementScreenProps) {
  const { colors, spacing, radius } = useTheme();
  const { confirm, confirmation } = useFinanceConfirmation();
  const { t } = useAppLanguage();

  const categories = useLedgerStore((state) => state.categories);
  const addCategory = useLedgerStore((state) => state.addCategory);
  const updateCategory = useLedgerStore((state) => state.updateCategory);
  const archiveCategory = useLedgerStore((state) => state.archiveCategory);
  const transactions = useLedgerStore((state) => state.transactions);
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
    const targetId = editingCategory?.id;
    const patch: CategoryPatch = { name, icon, color };
    const input: NewCategoryInput = { name, kind: activeKind, icon, color };
    const payload = targetId
      ? { operation: 'updateCategory', targetId, patch }
      : { operation: 'addCategory', input };
    return acknowledgedFinanceHandler(
      'src/features/finance/components/CategoryManagementScreen.tsx:228',
      () => undefined,
      {
        payload,
        mutate: () => {
          if (targetId) {
            const before = useLedgerStore.getState().categories.filter(item => item.id === targetId);
            if (before.length !== 1) return false;
            updateCategory(targetId, patch);
            const after = useLedgerStore.getState().categories.find(item => item.id === targetId);
            return !!after && after.name === name && after.icon === icon && after.color === color;
          }
          return !!addCategory(input);
        },
        onCommitted: result => {
          if (result === true) closeEditor();
          else Alert.alert(t('Could not save category.', 'تعذر حفظ التصنيف.'));
        },
      },
    )();
  };

  const setCategoryArchived = (targetId: string, archived: boolean) => {
    return acknowledgedFinanceHandler(
      'finance.category-management.archive.v1',
      () => undefined,
      {
        payload: { operation: 'archiveCategory', targetId, archived },
        mutate: () => archiveCategory(targetId, archived),
        onCommitted: result => {
          if (result !== true) Alert.alert(t('Could not change category archive status.', 'تعذر تغيير حالة أرشفة التصنيف.'));
        },
      },
    )();
  };

  const handleDelete = (category: Category) => {
    if (transactions.some(transaction => transaction.categoryId === category.id)) {
      Alert.alert(t('Archive category?', 'أرشفة التصنيف؟'),
        t('Existing transactions will keep this category.', 'ستحتفظ المعاملات السابقة بهذا التصنيف.'), [
          { text: t('Cancel', 'إلغاء'), style: 'cancel' },
          { text: t('Archive', 'أرشفة'), onPress: () => { void setCategoryArchived(category.id, true); } },
        ]);
      return;
    }

    if (category.isDefault) {
      Alert.alert(
        'Default category',
        'Default categories cannot be deleted. You can still edit their name, icon, and color.',
      );
      return;
    }

    confirm(
      t('Delete category', 'حذف التصنيف'),
      t(`Are you sure you want to delete "${category.name}"?`, `هل تريد حذف "${category.name}"؟`),
      () => acknowledgedFinanceHandler(
        'src/features/finance/components/CategoryManagementScreen.tsx:271',
        () => undefined,
        {
          payload: { operation: 'deleteCategory', targetId: category.id },
          mutate: () => deleteCategory(category.id),
          onCommitted: result => {
            if (result !== true) Alert.alert('Cannot delete category', 'This category is already used by a transaction.');
          },
        },
      )(),
      t('Delete', 'حذف'),
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: '#F1F5F9' },
      ]}
    >
      <View style={[financeChrome.header, { marginHorizontal: 0, marginTop: 0, flexWrap: 'wrap' }]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t("Go back", "رجوع")}
            hitSlop={10}
            style={financeChrome.back}
          >
            <Ionicons name="arrow-back" size={23} color="#D6B777" />
          </Pressable>
        ) : null}

        <View style={styles.headerText}>
          <AppText variant="h2" style={{ color: '#FFFFFF', fontSize: 20 }}>{t("Categories", "التصنيفات")}</AppText>
          <AppText style={{ color: '#CBD5E1' }} variant="caption">
            {t("Manage your income and expense categories", "إدارة تصنيفات الدخل والمصروفات")}
          </AppText>
        </View>

        <Pressable
          onPress={openAddEditor}
          accessibilityRole="button"
          accessibilityLabel={t("Add category", "إضافة تصنيف")}
          style={[
            styles.addButton,
            { backgroundColor: '#D6B777' },
          ]}
        >
          <Ionicons name="add" size={21} color="#1E293B" />
          <AppText style={{ color: '#1E293B' }} variant="label">
            {t("Add", "إضافة")}
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
                {t("No categories yet. Add your first category.", "لا توجد تصنيفات بعد. أضف أول تصنيف.")}
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
                      {category.archived ? t('Archived', 'مؤرشف') : category.isDefault
                        ? 'Default category'
                        : 'Custom category'}
                    </AppText>
                  </View>

                  <FinanceActionButtons label={category.name} onEdit={() => openEditEditor(category)}
                    onDelete={category.isDefault || category.archived ? undefined : () => handleDelete(category)} />
                  {category.archived && (
                    <Pressable accessibilityRole="button" onPress={() => { void setCategoryArchived(category.id, false); }}>
                      <AppText>{t('Restore', 'استعادة')}</AppText>
                    </Pressable>
                  )}
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
      {confirmation}
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
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 16,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    gap: 10,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#D6B777',
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 120,
    gap: 3,
  },
  addButton: {
    minHeight: 44,
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
