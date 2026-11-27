import React, { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme';
import { useAppLanguage } from '@/localization/LanguageProvider';

// Visual-only Reports trial. All routes are preserved from the approved BC checkpoint.
const ROUTES: Record<string, Href> = {
  Expenses: '/finance/report-expenses', Income: '/finance/report-income',
  Accounts: '/finance/report-accounts', Assets: '/finance/report-assets',
  Installments: '/finance/report-installments', Loans: '/finance/report-loans',
  'Debts Receivable': '/finance/report-receivable',
  'Debts Payable': '/finance/report-payable',
};
const NAVY = '#1E293B';
const INK = '#365575';
const ICON_LIGHT = '#5C83A3';
const GOLD = '#F2C879';
const OUT_BG = '#F1F5F9';
const IN_BG = '#F0F7FF';
const BORDER = '#CBD5E1';
const PAGE = '#F8FAFC';
const REPORT_LABEL_COLORS: Record<string, string> = {
  Accounts: '#475569',
  Assets: '#B45309',
  Income: '#22C55E',
  Expenses: '#EF4444',
  Loans: '#7C3AED',
  Installments: '#2563EB',
  'Debts Receivable': '#15803D',
  'Debts Payable': '#DC2626',
};
const ITEMS = [
  [{ label: 'Installments', icon: 'calendar-clock-outline' }, { label: 'Accounts', icon: 'wallet-outline' }],
  [{ label: 'Loans', icon: 'bank-outline' }, { label: 'Assets', icon: 'diamond-stone' }],
  [{ label: 'Debts Payable', icon: 'account-multiple' }, { label: 'Debts Receivable', icon: 'account-multiple' }],
] as const;

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
function ReportIcon({ name, size = 30, badge }: { name: MciName; size?: number; badge?: 'plus' | 'minus' }) {
  return <View style={{ width: Math.ceil(size * 1.1) + 7, height: Math.ceil(size * 1.15) + 7, alignItems: 'center', justifyContent: 'center' }}>
    <MaterialCommunityIcons name={name} size={size} color={INK} style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.15 }] }} />
    {badge && <View style={{ position: 'absolute', right: -2, bottom: -2, width: 19, height: 19,
      borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={badge} size={17} color={INK} />
    </View>}
  </View>;
}

// These are real concave SVG silhouettes, not circles masking rectangular cards.
function NotchedShape({ side, width, height }: { side: 'left' | 'right'; width: number; height: number }) {
  const r = 49;
  const mid = height / 2;
  const d = side === 'left'
    ? `M 14 1 H ${width - 1} V ${mid - r} A ${r} ${r} 0 0 0 ${width - 1} ${mid + r} V ${height - 14} Q ${width - 1} ${height - 1} ${width - 14} ${height - 1} H 14 Q 1 ${height - 1} 1 ${height - 14} V 14 Q 1 1 14 1 Z`
    : `M 14 1 H ${width - 14} Q ${width - 1} 1 ${width - 1} 14 V ${height - 14} Q ${width - 1} ${height - 1} ${width - 14} ${height - 1} H 14 Q 1 ${height - 1} 1 ${height - 14} V ${mid + r} A ${r} ${r} 0 0 0 1 ${mid - r} V 14 Q 1 1 14 1 Z`;
  return <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
    <Path d={d} fill={side === 'left' ? '#FFFDF9' : '#FFFFFF'} stroke={BORDER} strokeWidth={1.4} />
  </Svg>;
}

export default function FinanceReportsScreen() {
  const router = useRouter();
  const { t, isRTL } = useAppLanguage();
  const labels: Record<string, string> = {
    Accounts: 'الحسابات', Assets: 'الأصول', Income: 'الإيرادات', Expenses: 'المصروفات',
    Installments: 'الأقساط', Loans: 'القروض', 'Debts Receivable': 'الديون المستحقة لنا',
    'Debts Payable': 'الديون المستحقة علينا',
  };
  const reportLabel = (label: string) => t(label, labels[label] ?? label);
  const goBackToFinance = () => router.replace('/');
  const { spacing } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [pairWidth, setPairWidth] = useState(0);
  const narrow = windowWidth < 360;
  const compact = windowHeight < 740;
  const cardHeight = compact ? 93 : 106;
  const comparisonHeight = compact ? 112 : 122;
  const gutter = 10;
  const columnWidth = Math.max(0, (pairWidth - gutter) / 2);
  const innerCardWidth = Math.max(0, columnWidth - 16);
  const navigate = (label: string) => router.push(ROUTES[label]);

  return <Screen scroll>
    <View testID="reports-final-visual-trial" style={{ backgroundColor: PAGE, marginHorizontal: -spacing.md, marginTop: -spacing.sm, paddingBottom: spacing.md }}>
      <View style={{ backgroundColor: NAVY, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
        paddingHorizontal: 13, paddingTop: 15, paddingBottom: 15, alignItems: 'center' }}>
        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', minHeight: 45 }}>
          <Pressable testID="reports-back-finance" accessibilityRole="button"
            accessibilityLabel={t('Back to Finance Home', 'العودة إلى الرئيسية المالية')}
            onPress={goBackToFinance}
            style={{ width: 45, height: 45, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="arrow-left" size={27} color="#FFFFFF" />
          </Pressable>
          <AppText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: '#FFFFFF', textAlign: 'center', fontSize: narrow ? 15 : 18, flex: 1, fontWeight: '700' }}>
            Tomorrow Finance Report
          </AppText>
          <View style={{ width: 45, alignItems: 'center' }}>
            <MaterialCommunityIcons name="file-chart-outline" size={25} color="#CBD5E1" />
          </View>
        </View>
        <AppText style={{ color: '#CBD5E1', textAlign: 'center', fontSize: 12, marginTop: 5 }}>
          {t('Choose a report to explore your finances.', 'اختر تقريرًا لاستعراض بياناتك المالية.')}
        </AppText>
        <View style={{ width: '100%', marginTop: 10, paddingVertical: 7, paddingHorizontal: 8,
          backgroundColor: '#334155', borderRadius: 11, borderWidth: 1, borderColor: '#64748B',
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <MaterialCommunityIcons name="shield-check-outline" size={18} color={GOLD} />
          <AppText style={{ color: '#E2E8F0', textAlign: 'center', fontSize: narrow ? 9 : 10, lineHeight: 15, flexShrink: 1 }}>
            {t('Transactions ', 'تحتاج المعاملات إلى ')}<AppText style={{ color: GOLD, fontWeight: '700', fontSize: narrow ? 9 : 10 }}>{t('require manual review', 'مراجعة يدوية')}</AppText>{t(' before approval.', ' قبل الاعتماد.')}
          </AppText>
        </View>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 13 }}>
        <View testID="reports-comparison-pair" onLayout={e => setPairWidth(e.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', gap: gutter, position: 'relative' }}>
          {(['Outflows & Obligations', 'Inflows & Ownership'] as const).map((heading, col) => {
            const last = col === 0
              ? { label: 'Expenses', icon: 'cash-minus', side: 'left' as const }
              : { label: 'Income', icon: 'cash-plus', side: 'right' as const };
            return <View key={t(heading, col === 0 ? 'المصروفات والالتزامات' : 'الإيرادات والممتلكات')} style={{ flex: 1, minWidth: 0,
              backgroundColor: PAGE,
              borderColor: '#D6B777', borderWidth: 1, borderRadius: 15, padding: 7 }}>
              <View style={{ backgroundColor: col === 0 ? '#475569' : '#315D83', borderRadius: 9,
                paddingVertical: 9, paddingHorizontal: 3, minHeight: 39, justifyContent: 'center' }}>
                <AppText style={{ color: 'white', fontSize: narrow ? 10 : 11, fontWeight: '700', textAlign: 'center' }}>
                  {t(heading, col === 0 ? 'المصروفات والالتزامات' : 'الإيرادات والممتلكات')}
                </AppText>
              </View>
              {ITEMS.map((row) => {
                const item = row[col];
                return <Pressable key={reportLabel(item.label)} testID={`reports-${item.label.toLowerCase().replace(/ /g, '-')}`}
                  accessibilityRole="button" accessibilityLabel={t(`Open ${item.label} report`, `فتح تقرير ${reportLabel(item.label)}`)}
                  onPress={() => navigate(item.label)}
                  style={{ backgroundColor: '#FFFFFF', borderWidth: 1.3, borderColor: '#B68C42', borderRadius: 14,
                    height: cardHeight, marginTop: 9, paddingHorizontal: 5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <ReportIcon name={item.icon} size={compact ? 42 : 47}
                    badge={item.label === 'Debts Payable' ? 'minus' : item.label === 'Debts Receivable' ? 'plus' : undefined} />
                  <AppText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: NAVY, fontSize: item.label.startsWith('Debts') ? 12 : 15, lineHeight: item.label.startsWith('Debts') ? 16 : 20, fontWeight: '700', textAlign: 'center' }}>
                    {reportLabel(item.label)}
                  </AppText>
                </Pressable>;
              })}
              <Pressable testID={`reports-${last.label.toLowerCase()}`}
                accessibilityRole="button" accessibilityLabel={t(`Open ${last.label} report`, `فتح تقرير ${reportLabel(last.label)}`)}
                onPress={() => navigate(last.label)}
                style={{ marginTop: 9, height: comparisonHeight, position: 'relative',
                  alignItems: 'center', justifyContent: 'center', gap: 5,
                  paddingLeft: col === 1 ? 28 : 2, paddingRight: col === 0 ? 28 : 2 }}>
                {innerCardWidth > 0 && <NotchedShape side={last.side} width={innerCardWidth} height={comparisonHeight} />}
                <MaterialCommunityIcons name={last.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={compact ? 48 : 55} style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.15 }] }} color={col === 0 ? INK : ICON_LIGHT} />
                <AppText style={{ color: NAVY, fontSize: 15, fontWeight: '700' }}>{reportLabel(last.label)}</AppText>
              </Pressable>
            </View>;
          })}
          <Pressable testID="reports-compare" accessibilityRole="button"
            accessibilityLabel={t('Compare Income and Expenses', 'مقارنة الإيرادات والمصروفات')}
            onPress={() => router.push('/finance/report-comparison')}
            style={{ position: 'absolute', left: '50%', bottom: (comparisonHeight - 106) / 2 + 8,
              marginLeft: -53, width: 106, height: 106, borderRadius: 53,
              borderWidth: 2, borderColor: '#B8C4D0', backgroundColor: NAVY,
              alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            <MaterialCommunityIcons name="scale-balance" size={60} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  </Screen>;
}
