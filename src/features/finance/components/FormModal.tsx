import { FinanceModalHeader } from './FinanceModalHeader';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/localization/LanguageProvider';
import { useTheme } from '@/theme';
import { financeLayoutTokens, getFinanceDesignTokens } from '@/features/finance/constants/financeDesignTokens';

interface FormModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  onBack?: () => void;
  compactTitle?: boolean;
}

/** Bottom-sheet style modal shared by all finance forms. */
export function FormModal({ visible, title, onClose, children, onBack, compactTitle }: FormModalProps) {
  const { colors, spacing, scheme } = useTheme();
  const { t } = useAppLanguage();
  const finance = getFinanceDesignTokens(scheme);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent={false}
    >
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 0) }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityLabel={t('Close', 'إغلاق')}
        />

        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: finance.background,
              borderTopLeftRadius: financeLayoutTokens.modalRadius,
              borderTopRightRadius: financeLayoutTokens.modalRadius,
            },
          ]}
        >
          <FinanceModalHeader title={title} onClose={onClose} onBack={onBack} compactTitle={compactTitle} />

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: spacing.lg,
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + spacing.xxl,
              paddingLeft: Math.max(spacing.lg, insets.left),
              paddingRight: Math.max(spacing.lg, insets.right),
              gap: spacing.lg,
            }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    minHeight: 0,
    flexShrink: 1,
    width: '100%',
  },
  scroll: {
    minHeight: 0,
    flexShrink: 1,
    flexGrow: 0,
  },
});
