import { StyleSheet } from 'react-native';
import { financeBrand } from '../constants/financeDesignTokens';

/** Shared geometry; headers grow with system text size rather than clipping it. */
export const financeChrome = StyleSheet.create({
  header: {
    backgroundColor: financeBrand.navy,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 76, paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: -16, marginTop: -16, marginBottom: 16,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  back: {
    width: 44, height: 44, flexShrink: 0, borderRadius: 22,
    borderWidth: 1, borderColor: financeBrand.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  modalHeader: {
    backgroundColor: financeBrand.navy,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 68, paddingHorizontal: 16, paddingVertical: 12, flexShrink: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
  },
  title: { flex: 1, minWidth: 0, color: financeBrand.white, fontSize: 20, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
