import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { CATEGORY_ICONS, type IconName } from '../constants/categoryIcons';
import { palette } from '../constants/financeUi';
import { KindToggle, type CategoryKind } from './KindToggle';

export type NewCategoryInput = {
  name: string;
  kind: CategoryKind;
  icon: string;
};

type Props = {
  visible: boolean;
  initialKind: CategoryKind;
  isNameTaken: (name: string, kind: CategoryKind) => boolean;
  onSubmit: (data: NewCategoryInput) => void;
  onClose: () => void;
};

export function AddCategoryModal({
  visible,
  initialKind,
  isNameTaken,
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>(initialKind);
  const [icon, setIcon] = useState<IconName>(CATEGORY_ICONS[0]);
  const [error, setError] = useState<string | null>(null);

  // تصفير الفورم كل ما المودال يتفتح
  useEffect(() => {
    if (visible) {
      setName('');
      setKind(initialKind);
      setIcon(CATEGORY_ICONS[0]);
      setError(null);
    }
  }, [visible, initialKind]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError('اكتب اسم الفئة');
    if (isNameTaken(trimmed, kind)) return setError('الفئة دي موجودة بالفعل');
    onSubmit({ name: trimmed, kind, icon });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>فئة جديدة</Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>النوع</Text>
            <KindToggle value={kind} onChange={setKind} />

            <Text style={styles.label}>الاسم</Text>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError(null);
              }}
              placeholder="مثلاً: مواصلات"
              placeholderTextColor={palette.muted}
              maxLength={30}
              style={styles.input}
            />
            {error && <Text style={styles.error}>{error}</Text>}

            <Text style={styles.label}>الأيقونة</Text>
            <View style={styles.iconGrid}>
              {CATEGORY_ICONS.map((iconName) => {
                const selected = iconName === icon;
                return (
                  <Pressable
                    key={iconName}
                    onPress={() => setIcon(iconName)}
                    style={[styles.iconCell, selected && styles.iconCellActive]}
                  >
                    <Ionicons
                      name={iconName}
                      size={24}
                      color={selected ? '#FFFFFF' : palette.text}
                    />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.cancel]} onPress={onClose}>
              <Text style={styles.cancelText}>إلغاء</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.save]} onPress={handleSave}>
              <Text style={styles.saveText}>حفظ</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  title: { fontSize: 20, fontWeight: '700', color: palette.text, marginBottom: 8 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.muted,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.text,
    textAlign: 'right',
  },
  error: { color: palette.expense, marginTop: 6, fontSize: 13 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconCell: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.key,
  },
  iconCellActive: { backgroundColor: palette.primary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancel: { backgroundColor: palette.key },
  save: { backgroundColor: palette.primary },
  cancelText: { color: palette.text, fontWeight: '600', fontSize: 16 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});