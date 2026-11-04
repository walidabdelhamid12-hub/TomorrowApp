import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { GOLD_COLORS } from '@/features/finance/constants/metals';
import type { AssetCategory } from '@/features/finance/types/finance';
import { useTheme } from '@/theme';

/** Bullion-bar vector glyph already shipped by @expo/vector-icons; no new dependency. */
export function AssetTypeIcon({ category }: { category: AssetCategory }) {
  const { colors, isDark } = useTheme();
  if (category === 'gold' || category === 'silver') {
    return <MaterialCommunityIcons name="gold" size={24} accessible={false}
      testID={'asset-icon-' + category}
      color={category === 'gold' ? isDark ? GOLD_COLORS.light : GOLD_COLORS.dark : colors.textSecondary} />;
  }
  return <Ionicons name="cash-outline" size={24} color={colors.info} accessible={false} />;
}
