import { useAppLanguage } from '@/localization/LanguageProvider';
import { SixReportDetails } from './reporting/SixReportPresentation';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateDebtsReport } from '@/features/finance/utils/reportDebts';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportSummaryCards, ReportKeyValues } from './reporting/ReportUnifiedSix';
import { currencyLabel, ReportTransactionRows } from './reporting/ReportPrimitives';
import { ReportTableActions } from './reporting/ReportTableActions';
import { ReportChart } from './reporting/ReportUnifiedSix';

type Direction = 'receivable' | 'payable';
export function DebtReportScreen({ direction }: { direction: Direction }) {
  const router = useRouter();
  const { t } = useAppLanguage();
  const hydrated = useFinanceHydrated();
  const debts = useFinanceStore(state => state.debts);
  const [period, setPeriod] = useReportPeriod();
  const [currency, setCurrency] = useState('');
  const month = period.from.slice(0, 7);
  const rows = useMemo(() => {
    if (!hydrated) return null;
    try { return aggregateDebtsReport(debts, period, direction); } catch { return null; }
  }, [hydrated, debts, period, direction]);
  const summaries = useMemo(() => {
    if (!rows) return [];
    const byCurrency = new Map<string, { total: number; periodPaid: number; remaining: number; count: number; unavailable: boolean }>();
    for (const row of rows) {
      const previous = byCurrency.get(row.currencyCode) ?? { total: 0, periodPaid: 0, remaining: 0, count: 0, unavailable: false };
      previous.count++;
      if (row.totalAmount === null || row.periodPaid === null || row.currentRemaining === null) {
        previous.unavailable = true;
      } else {
        const scale = 10 ** getCurrencyDecimals(row.currencyCode);
        const next = [previous.total + Math.round(row.totalAmount * scale),
          previous.periodPaid + Math.round(row.periodPaid * scale),
          previous.remaining + Math.round(row.currentRemaining * scale)];
        if (!next.every(Number.isSafeInteger)) previous.unavailable = true;
        else [previous.total, previous.periodPaid, previous.remaining] = next;
      }
      byCurrency.set(row.currencyCode, previous);
    }
    return [...byCurrency].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const activeCurrency = summaries.some(([code]) => code === currency) ? currency : summaries[0]?.[0] ?? '';
  const summary = summaries.find(([code]) => code === activeCurrency)?.[1];
  const selected = rows?.filter(row => row.currencyCode === activeCurrency) ?? [];
  const safeHistory = selected.every(row => row.status === 'available' && row.periodPaid !== null);
  const payments = safeHistory ? debts.filter(debt => debt.direction === direction && debt.currencyCode === activeCurrency).flatMap(debt => debt.payments.filter(payment => payment.date >= period.from && payment.date <= period.to).map(payment => ({ id: debt.id + ':' + payment.id, date: payment.date, category: debt.personName, description: [payment.note, payment.accountId ? t('Account:', 'الحساب:') + ' ' + payment.accountId : undefined].filter(Boolean).join(' · '), amount: payment.amount, currency: debt.currencyCode }))) : [];
  const money = (value: number | null, code: string) => value === null ? t('Unavailable', 'غير متاح') : formatAmount(value, code) + ' ' + code;
  const title = direction === 'receivable' ? t('Debts Receivable', 'الديون المستحقة لنا') : t('Debts Payable', 'الديون المستحقة علينا');
  const openStatement = () => router.push({ pathname: '/finance/statement-debts', params: { direction, month, from: period.from, to: period.to, currencyCode: activeCurrency } });
  const exportTable = { title, period, notice: t('Recorded collections and payments do not prove bank posting. Current remaining is not the period-end balance. Selected currency:', 'التحصيلات والمدفوعات المسجلة لا تثبت القيد البنكي. المتبقي الحالي ليس رصيد نهاية الفترة. العملة المختارة:') + ' ' + activeCurrency, verified: safeHistory, columns: [t('Person', 'الشخص'), t('Currency', 'العملة'), t('Total debt', 'إجمالي الدين'), direction === 'receivable' ? t('Collected in period', 'المحصّل خلال الفترة') : t('Paid in period', 'المدفوع خلال الفترة'), t('Current remaining', 'المتبقي حاليًا'), t('Remaining at period end', 'المتبقي بنهاية الفترة')], rows: selected.map(row => [row.personName, row.currencyCode, row.totalAmount, row.periodPaid, row.currentRemaining, row.remainingAtPeriodEnd]) };
  return <Screen padded={false}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}>
    <ReportTitle active={direction} title={title + ' ' + t('Report', 'تقرير')} />
    <ReportDates period={period} onChange={setPeriod} />
    {!hydrated ? <ActivityIndicator accessibilityLabel={t("Loading debt report", "جارٍ تحميل تقرير الديون")} color={moduleColors.finance} /> : rows === null ? <ReportStatus warning>{t("Debt report could not be validated.", "تعذر التحقق من تقرير الديون.")}</ReportStatus> : rows.length === 0 ? <ReportStatus>{t("No matching debts saved.", "لا توجد ديون محفوظة مطابقة.")}</ReportStatus> : <>
      {summary && !summary.unavailable ? <ReportSummaryCards currency={activeCurrency} cards={[
        { label: direction === 'receivable' ? t('Total receivable', 'إجمالي المستحق لنا') : t('Total payable', 'إجمالي المستحق علينا'), value: summary.total / 10 ** getCurrencyDecimals(activeCurrency) },
        { label: direction === 'receivable' ? t('Collected in period', 'المحصّل خلال الفترة') : t('Paid in period', 'المدفوع خلال الفترة'), value: summary.periodPaid / 10 ** getCurrencyDecimals(activeCurrency) },
        { label: direction === 'receivable' ? t('Current receivable', 'المستحق لنا حاليًا') : t('Current payable', 'المستحق علينا حاليًا'), value: summary.remaining / 10 ** getCurrencyDecimals(activeCurrency) },
      ]} /> : <AppText variant="caption" color="textSecondary">{t("Summary unavailable: incomplete debt evidence.", "الملخص غير متاح لعدم اكتمال بيانات الديون.")}</AppText>}
      {!safeHistory && <AppText variant="caption" color="textSecondary">{t("Period-end balances unavailable: incomplete history.", "أرصدة نهاية الفترة غير متاحة لعدم اكتمال السجل.")}</AppText>}
      <ReportChart currencies={summaries.map(([code]) => code)} onCurrencySelect={setCurrency} currency={activeCurrency} title={direction === 'receivable' ? t('Receivable Analysis', 'تحليل المستحقات لنا') : t('Payable Analysis', 'تحليل المستحقات علينا')} description={t("Current remaining amounts.", "المبالغ المتبقية حاليًا.")} empty={t("No positive verified remaining amounts.", "لا توجد مبالغ متبقية موجبة تم التحقق منها.")} data={selected.filter(row => row.status === 'available' && row.currentRemaining !== null).map(row => ({ id: row.debtId, label: row.personName, amount: row.currentRemaining! }))} />
      <AppText variant="bodyStrong" style={{ marginTop: 10 }}>{direction === 'receivable' ? t('Receivable details', 'تفاصيل المستحقات لنا') : t('Payable details', 'تفاصيل المستحقات علينا')} ({selected.length})</AppText>
      {selected.map(row => <SixReportDetails key={row.debtId} title={row.personName} subtitle={t('Remaining:', 'المتبقي:') + ' ' + money(row.currentRemaining, row.currencyCode)}>
        <ReportKeyValues items={[{ label: t("Total debt", "إجمالي الدين"), value: money(row.totalAmount, row.currencyCode) }, { label: direction === 'receivable' ? t('Collected in period', 'المحصّل خلال الفترة') : t('Paid in period', 'المدفوع خلال الفترة'), value: money(row.periodPaid, row.currencyCode) }, { label: t("Current remaining", "المتبقي حاليًا"), value: money(row.currentRemaining, row.currencyCode) }, { label: t("Remaining at period end", "المتبقي بنهاية الفترة"), value: money(row.remainingAtPeriodEnd, row.currencyCode) }]} />
        {row.reason ? <AppText variant="caption" accessibilityRole="alert">{row.reason}</AppText> : null}
        {safeHistory ? <ReportTransactionRows rows={payments.filter(payment => payment.id.startsWith(row.debtId + ":"))} /> : <AppText variant="caption" accessibilityRole="alert">{t("Unverified history; payment details are withheld.", "السجل غير متحقق منه؛ تفاصيل المدفوعات مخفية.")}</AppText>}
      </SixReportDetails>)}
    </>}
    </ScrollView>
    {hydrated && rows !== null && rows.length > 0 && <View style={{ paddingHorizontal: 8, paddingBottom: 8, backgroundColor: '#FFFFFF' }}><ReportTableActions presentation="obligations" table={exportTable} statement={openStatement} /></View>}
  </Screen>;
}
