import { useAppLanguage } from '@/localization/LanguageProvider';
import { StatementExportActions } from '@/features/finance/components/reporting/StatementExportActions';
import { StatementSixChrome, StatementSixRows } from '@/features/finance/components/reporting/StatementSixUI';
import { reportRoutePeriod, reportRouteCurrency } from '@/features/finance/utils/reportRoutePeriod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { AppText, Card, Screen } from '@/components/ui';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateDebtsReport } from '@/features/finance/utils/reportDebts';
import { useTheme } from '@/theme';

/** Detailed read-only payment register for the selected debt report and month. */
export default function DebtStatementScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const params = useLocalSearchParams<{ direction?: string; currencyCode?: string; from?: string; to?: string; month?: string }>();
  const { spacing } = useTheme();
  const hydrated = useFinanceHydrated();
  const debts = useFinanceStore(state => state.debts);
  const direction = params.direction === 'receivable' || params.direction === 'payable' ? params.direction : null;
  const month = typeof params.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const currencyCode = reportRouteCurrency(params.currencyCode);
  const period = useMemo(() => {
    if (currencyCode === null) return null;
    if (params.from !== undefined || params.to !== undefined) return reportRoutePeriod(params.from, params.to);
    if (!month) return null;
    const [year, number] = month.split('-').map(Number);
    if (year < 100) return null;
    return { from: month + '-01', to: month + '-' + String(new Date(year, number, 0).getDate()).padStart(2, '0') };
  }, [month, params.from, params.to, currencyCode]);
  const rows = useMemo(() => {
    if (!hydrated || !direction || !period) return null;
    try { return aggregateDebtsReport(debts, period, direction).filter(row => !currencyCode || row.currencyCode === currencyCode); } catch { return null; }
  }, [hydrated, direction, period, debts, currencyCode]);
  const entries = useMemo(() => {
    if (!rows || !period) return [];
    const valid = new Set(rows.filter(row => row.status === 'available' && row.totalAmount !== null && row.periodPaid !== null).map(row => row.debtId));
    return debts.filter(debt => valid.has(debt.id)).flatMap(debt =>
      debt.payments.filter(payment => payment.date >= period.from && payment.date <= period.to)
        .map(payment => ({ id: debt.id + ':' + payment.id, person: debt.personName,
          date: payment.date, amount: payment.amount, currency: debt.currencyCode, note: payment.note })))
      .sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [rows, period, debts]);
  return <Screen scroll>
    <Pressable accessibilityRole="button" accessibilityLabel={t("Back to debt report", "العودة إلى تقرير الديون")}
      onPress={() => router.back()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <AppText>‹ Debt Report</AppText>
    </Pressable>
    <StatementSixChrome kind={direction === 'receivable' ? 'Receivable' : 'Payable'} from={period?.from ?? "—"} to={period?.to ?? "—"} category={'Recorded payments'} currency={currencyCode || undefined} />
    {!direction || !period ? <Card><AppText>{t("Invalid statement filters.", "فلاتر كشف الحساب غير صالحة.")}</AppText></Card> :
      !hydrated ? <Card><AppText>{t("Loading finance data...", "جارٍ تحميل البيانات المالية...")}</AppText></Card> :
      rows === null ? <Card><AppText>{t("Statement data unavailable.", "بيانات كشف الحساب غير متاحة.")}</AppText></Card> :
      rows.some(row => row.status !== 'available') ? <Card><AppText color="textSecondary">Historical data is unverified for one or more records. Payment details are withheld to avoid misleading totals.</AppText></Card> :
      entries.length === 0 ? <Card><AppText>{t("No recorded payments in this period.", "لا توجد دفعات مسجلة في هذه الفترة.")}</AppText></Card> :
      <StatementSixRows secondColumnLabel="Person" rows={entries.map(item => ({ id: item.id, date: item.date, category: item.person, description: item.note || 'Recorded payment', amount: item.amount.toFixed(getCurrencyDecimals(item.currency)), currencyCode: item.currency }))} />
  }<StatementExportActions />
  </Screen>;
}
