import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddCategoryModal, type NewCategoryInput } from '../components/AddCategoryModal';
import { KindToggle, type CategoryKind } from '../components/KindToggle';
import type { IconName } from '../constants/categoryIcons';
import { CATEGORY_COLORS, palette } from '../constants/financeUi';
import { useLedgerStore } from '../store/useLedgerStore';

export default function CategoriesScreen() {
  // selectors منفصلة (متوافقة مع zustand v5)
  const categories = useLedgerStore((s) => s.categories);
  const addCategory = useLedgerStore((s) => s.addCategory);

  const [kind, setKind] = useState<CategoryKind>('expense');
  const [modalVisible, setModalVisible] = useState(false);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind]
  );

  const isNameTaken = useCallback(
    (name: string, k: CategoryKind) =>
      categories.some(
        (c) => c.kind === k && c.name.trim().toLowerCase() === name.toLowerCase()
      ),
    [categories]
  );

  const handleSubmit = (data: NewCategoryInput) => {
    addCategory({
      ...data,
      color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
    });
    setKind(data.kind); // يعرض الفئة الجديدة فورًا
    setModalVisible(false);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <View style={styles.toggleWrap}>
        <KindToggle value={kind} onChange={setKind} />
      </View>

      <FlatList
        data={visibleCategories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>مفيش فئات هنا لسه</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.iconCircle, { backgroundColor: item.color + '22' }]}>
              <Ionicons name={item.icon as IconName} size={22} color={item.color} />
            </View>
            <Text style={styles.name}>{item.name}</Text>
            {item.isDefault && <Text style={styles.badge}>افتراضية</Text>}
          </View>
        )}
      />

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addText}>إضافة فئة</Text>
        </Pressable>
      </View>

      <AddCategoryModal
        visible={modalVisible}
        initialKind={kind}
        isNameTaken={isNameTaken}
        onSubmit={handleSubmit}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  toggleWrap: { padding: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: palette.text },
  badge: {
    fontSize: 12,
    color: palette.muted,
    backgroundColor: palette.key,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  footer: { padding: 16 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: palette.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});