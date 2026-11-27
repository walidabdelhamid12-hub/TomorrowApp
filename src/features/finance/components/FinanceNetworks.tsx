import { useAppLanguage } from '@/localization/LanguageProvider';

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type FinanceNetworkKey =
  | 'debts'
  | 'accounts'
  | 'assets'
  | 'receivable'
  | 'payable'
  | 'income'
  | 'expenses'
  | 'loans'
  | 'cheques'
  | 'categories';

interface NetworkItem {
  key: FinanceNetworkKey;
  title: string;
  icon: IconName;
  color: string;
  background: string;
}

interface FinanceNetworksProps {
  onPress: (key: FinanceNetworkKey) => void;
}

const NETWORKS: NetworkItem[] = [
  {
    key: 'accounts',
    title: 'Accounts',
    icon: 'wallet-outline',
    color: '#34D399',
    background: '#064E3B',
  },
  {
    key: 'assets',
    title: 'Assets',
    icon: 'diamond-outline',
    color: '#A78BFA',
    background: '#3B246B',
  },
  { key: 'debts', title: 'Debts', icon: 'people-outline', color: '#60A5FA', background: '#1E3A5F' },
  {
    key: 'income',
    title: 'Income',
    icon: 'trending-up-outline',
    color: '#34D399',
    background: '#064E3B',
  },
  {
    key: 'expenses',
    title: 'Expenses',
    icon: 'trending-down-outline',
    color: '#FB923C',
    background: '#7C2D12',
  },
  {
    key: 'loans',
    title: 'Loans',
    icon: 'calendar-outline',
    color: '#FBBF24',
    background: '#78350F',
  },
  {
    key: 'cheques',
    title: 'Cheques',
    icon: 'document-text-outline',
    color: '#38BDF8',
    background: '#164E63',
  },
  {
    key: 'categories',
    title: 'Categories',
    icon: 'grid-outline',
    color: '#C084FC',
    background: '#581C87',
  },
];

export function FinanceNetworks({ onPress }: FinanceNetworksProps) {
  const { t } = useAppLanguage();
  const { colors, spacing } = useTheme();

  return (
    <View style={{ marginTop: spacing.xl }}>
      <View style={styles.heading}>
        <View>
          <AppText variant="h3">{t("Networks", "الأقسام")}</AppText>
          <AppText variant="caption" color="textSecondary">
            {t("Your financial sections", "أقسامك المالية")}
          </AppText>
        </View>

        <Ionicons
          name="apps-outline"
          size={22}
          color={colors.textSecondary}
        />
      </View>

      <Card padded={false}>
        <View style={styles.grid}>
          {NETWORKS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={t(`Open ${item.title}`, `فتح ${({'Accounts': 'الحسابات', 'Assets': 'الأصول', 'Debts': 'الديون', 'Income': 'الدخل', 'Expenses': 'المصروفات', 'Loans': 'القروض', 'Cheques': 'الشيكات', 'Categories': 'التصنيفات'} as Record<string, string>)[item.title] ?? item.title}`)}
              onPress={() => onPress(item.key)}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: pressed
                    ? colors.surface
                    : 'transparent',
                  borderColor: colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: item.background },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={24}
                  color={item.color}
                />
              </View>

              <AppText style={styles.label}>
                {t(item.title, ({'Accounts': 'الحسابات', 'Assets': 'الأصول', 'Debts': 'الديون', 'Income': 'الدخل', 'Expenses': 'المصروفات', 'Loans': 'القروض', 'Cheques': 'الشيكات', 'Categories': 'التصنيفات'} as Record<string, string>)[item.title] ?? item.title)}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  item: {
    width: '33.333%',
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
