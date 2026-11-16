import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

const OTHER_REPORTS = [
  'Accounts', 'Assets', 'Installments', 'Loans', 'Debts Receivable', 'Debts Payable',
] as const;

const REPORT_ROUTES: Record<string, Href> = {
  Expenses: '/finance/report-expenses',
  Income: '/finance/report-income',
  Accounts: '/finance/report-accounts',
  Assets: '/finance/report-assets',
  Installments: '/finance/report-installments',
  Loans: '/finance/report-loans',
  'Debts Receivable': '/finance/report-receivable',
  'Debts Payable': '/finance/report-payable',
};

/** Finance Reports navigation and comparison entry. */
export default function FinanceReportsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const navy = '#0B315C';
  const sky = '#8EC9E8';
  const silver = '#B8C4D0';
  const beige = '#E8D9C5';
  const background = '#F3F7FA';
  const bankIcon = (size: number) => <Ionicons name="business" size={size} color={navy} />;
  const wave = (color: string, width: `${number}%`, bottom: number) => (
    <View pointerEvents="none" style={{ position: 'absolute', width, height: 38, bottom,
      right: -12, borderTopLeftRadius: 110, borderTopWidth: 2, borderColor: color, opacity: 0.65 }} />
  );

  return (
    <Screen scroll>
      <View testID="reports-bc-visual-trial" style={{ backgroundColor: background, marginHorizontal: -spacing.md, marginTop: -spacing.sm, paddingBottom: spacing.xl }}>
        <View style={{ backgroundColor: navy, paddingHorizontal: spacing.md, paddingTop: spacing.md,
          paddingBottom: 42, overflow: 'hidden', borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Finance"
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: spacing.sm }}>
            <Ionicons name="arrow-back" size={23} color="#FFFFFF" />
            <AppText style={{ marginLeft: spacing.sm, color: '#FFFFFF', fontWeight: '700' }}>TomorrowApp  ·  Finance</AppText>
          </Pressable>
          <View pointerEvents="none" style={{ position: 'absolute', right: 22, top: 75, flexDirection: 'row', alignItems: 'flex-end', gap: 6, opacity: 0.28 }}>
            {[20, 32, 44, 56].map((h) => <View key={h} style={{ width: 12, height: h, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: sky }} />)}
          </View>
          <AppText variant="h1" style={{ color: '#FFFFFF', textAlign: 'center', fontSize: 33 }}>Reports</AppText>
          <AppText style={{ color: '#FFFFFF', textAlign: 'center', marginTop: spacing.sm, fontSize: 13 }}>
            Choose a report to explore your finances.
          </AppText>
          {wave(sky, '105%', -12)}
          {wave(silver, '94%', -20)}
          {wave(beige, '78%', -28)}
        </View>

        <View style={{ paddingHorizontal: spacing.md, paddingTop: 28 }}>
          <View testID="reports-comparison-pair" style={{ marginBottom: spacing.lg, position: 'relative' }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {(['Expenses', 'Income'] as const).map((name) => (
                <Pressable key={name} testID={`reports-${name.toLowerCase()}`}
                  accessibilityRole="button" accessibilityLabel={`Open ${name} report`}
                  onPress={() => router.push(REPORT_ROUTES[name])}
                  style={{ flex: 1, minWidth: 0, minHeight: 135, borderRadius: 22,
                    borderWidth: 1, borderColor: name === 'Expenses' ? sky : beige,
                    backgroundColor: name === 'Expenses' ? '#F0F7FD' : '#FCF8F4',
                    justifyContent: 'center', alignItems: 'center', paddingVertical: 12, gap: 9,
                    elevation: 2, shadowColor: navy, shadowOpacity: 0.09, shadowRadius: 6,
                    shadowOffset: { width: 0, height: 3 }, overflow: 'hidden' }}>
                  {wave(name === 'Expenses' ? sky : beige, '95%', 1)}
                  {bankIcon(43)}
                  <AppText variant="bodyStrong" style={{ color: navy, fontSize: 16 }}>{name}</AppText>
                </Pressable>
              ))}
            </View>
            <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%',
              width: 94, height: 94, marginTop: -47, marginLeft: -47, borderRadius: 47,
              backgroundColor: background }} />
            <Pressable testID="reports-compare" accessibilityRole="button"
              accessibilityLabel="Compare Income and Expenses"
              accessibilityHint="Opens the Income vs Expenses comparison report"
              onPress={() => router.push('/finance/report-comparison')}
              style={{ position: 'absolute', top: '50%', left: '50%', width: 88, height: 88,
                marginTop: -44, marginLeft: -44, borderRadius: 44, backgroundColor: navy,
                borderWidth: 3, borderColor: sky, alignItems: 'center', justifyContent: 'center',
                elevation: 4, shadowColor: navy, shadowOpacity: 0.18, shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 } }}>
          {/* A drawn two-pan balance, not the platform-dependent weighing-scale glyph. */}
          <View pointerEvents="none" style={{ width: 55, height: 51, alignItems: 'center' }}>
            <View style={{ position: 'absolute', top: 6, width: 49, height: 3, borderRadius: 2, backgroundColor: 'white' }} />
            <View style={{ position: 'absolute', top: 3, width: 5, height: 43, borderRadius: 2, backgroundColor: 'white' }} />
            <View style={{ position: 'absolute', top: 43, width: 27, height: 3, borderRadius: 2, backgroundColor: 'white' }} />
            {[-19, 19].map(offset => <View key={offset} style={{ position: 'absolute', top: 8, left: 27.5 + offset - 12, width: 24, height: 28, alignItems: 'center' }}>
              <View style={{ width: 2, height: 17, backgroundColor: 'white' }} />
              <View style={{ width: 24, height: 10, borderBottomLeftRadius: 13, borderBottomRightRadius: 13,
                borderBottomWidth: 3, borderLeftWidth: 2, borderRightWidth: 2, borderColor: 'white' }} />
            </View>)}
          </View>

            </Pressable>
          </View>

          <View testID="reports-grid" style={{ flexDirection: 'row', flexWrap: 'wrap',
            justifyContent: 'space-between', rowGap: spacing.md }}>
            {OTHER_REPORTS.map((name, index) => (
              <Pressable key={name} accessibilityRole="button"
                accessibilityLabel={`Open ${name} report`}
                onPress={() => router.push(REPORT_ROUTES[name])}
                style={{ width: '48%', minHeight: 102, paddingHorizontal: 9, paddingVertical: 12,
                  borderRadius: 18, borderWidth: 1, borderColor: index % 2 === 0 ? '#C9DDEB' : '#D9D7D5',
                  backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 7, overflow: 'hidden', elevation: 2,
                  shadowColor: navy, shadowOpacity: 0.07, shadowRadius: 5,
                  shadowOffset: { width: 0, height: 2 } }}>
                {wave(index % 2 === 0 ? sky : beige, '90%', -9)}
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>{bankIcon(33)}</View>
                <View style={{ width: 1, height: 33, backgroundColor: silver }} />
                <AppText variant="bodyStrong" style={{ color: navy, fontSize: 12, flexShrink: 1, textAlign: 'left' }}>
                  {name}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View pointerEvents="none" style={{ height: 40, marginTop: 20, overflow: 'hidden' }}>
            {wave(sky, '100%', 0)}
            {wave(silver, '85%', -10)}
            {wave(beige, '65%', -18)}
          </View>
        </View>
      </View>
    </Screen>
  );
}
