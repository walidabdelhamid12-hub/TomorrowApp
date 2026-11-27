import { useAppLanguage } from '@/localization/LanguageProvider';
import { SixReportDetails } from '@/features/finance/components/reporting/SixReportPresentation';
import { ReportPicker } from '../../features/finance/components/reporting/ReportPrimitives';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { installmentsStorage } from '@/features/finance/store/installmentsStorage';
import { aggregateSavedInstallmentsReport, summarizeSavedInstallmentsByCurrency } from '@/features/finance/utils/reportSavedInstallments';
import { buildScheduledInstallmentsStatement } from '@/features/finance/utils/statementScheduledInstallments';
import { getCurrencyDecimals } from '@/features/finance/constants/currencies';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportValueCards, ReportKeyValues } from '@/features/finance/components/reporting/ReportUnifiedSix';
import { ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportUnifiedSix';

export default function InstallmentsReportScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const saved = useSyncExternalStore(installmentsStorage.subscribe, installmentsStorage.getState, installmentsStorage.getState);
  const [dates, setPeriod] = useReportPeriod();
  const [currency, setCurrency] = useState('');
  const month = dates.from.slice(0, 7);
  useEffect(() => { if (installmentsStorage.getState().hydration === 'idle') void installmentsStorage.hydrate(); }, []);
  const rows = useMemo(() => {
    if (saved.hydration !== 'ready') return null;
    try { return aggregateSavedInstallmentsReport(saved.contracts, dates.from, dates.to); } catch { return null; }
  }, [saved, dates]);
  const schedule = useMemo(() => { if (!rows) return null; try { return buildScheduledInstallmentsStatement(saved.contracts, dates.from, dates.to); } catch { return null; } }, [rows, saved.contracts, dates]);
  const summary = useMemo(() => rows === null ? [] : summarizeSavedInstallmentsByCurrency(rows), [rows]);
  const activeCurrency = summary.some(item => item.currencyCode === currency) ? currency : summary[0]?.currencyCode ?? '';
  const total = summary.find(item => item.currencyCode === activeCurrency);
  const selected = rows?.filter(row => row.currencyCode === activeCurrency) ?? [];
  const chartSafe = selected.every(row => Number.isSafeInteger(Number(row.dueInPeriod) * 10 ** getCurrencyDecimals(row.currencyCode)));
  const entries = schedule?.reconciled ? schedule.entries.filter(entry => entry.currency === activeCurrency) : [];
  const ownership = { standalone: 'Standalone contract', linked_loan: 'Linked loan', linked_debt: 'Linked debt' };
  return <Screen scroll>
    <ReportTitle active="installments" title={t("Installments Report", "تقرير الأقساط")} />
    <ReportDates period={dates} onChange={setPeriod} />
    {saved.hydration === 'blocked' ? <ReportStatus warning>{t("Saved installment data is unavailable.", "بيانات الأقساط المحفوظة غير متاحة.")}</ReportStatus> : saved.hydration !== 'ready' ? <ReportStatus>{t("Loading contracts...", "جارٍ تحميل العقود...")}</ReportStatus> : rows === null ? <ReportStatus warning>{t("Report data could not be validated.", "تعذر التحقق من بيانات التقرير.")}</ReportStatus> : rows.length === 0 ? <ReportStatus>{t("No installment contracts yet.", "لا توجد عقود أقساط بعد.")}</ReportStatus> : <>
      <ReportPicker label={t("Currency", "العملة")} value={activeCurrency} onSelect={setCurrency} options={summary.map(item => ({ id: item.currencyCode, label: currencyLabel(item.currencyCode) }))} />
      {total && <ReportValueCards cards={[{ label: t("All scheduled contracts", "إجمالي العقود المجدولة"), value: total.totalScheduled, unit: currencyLabel(activeCurrency) }, { label: t("Due in period", "المستحق خلال الفترة"), value: total.dueInPeriod, unit: currencyLabel(activeCurrency) }, { label: t("Due installments", "الأقساط المستحقة"), value: String(total.dueCount), unit: 'installments' }]} />}
      {chartSafe ? <ReportChart currencies={summary.map(item => item.currencyCode)} onCurrencySelect={setCurrency} currency={activeCurrency} title={t("Scheduled amounts", "المبالغ المجدولة")} description={t("Due in the selected period.", "المستحق خلال الفترة المحددة.")} empty={t("No amounts scheduled in this period.", "لا توجد مبالغ مجدولة خلال هذه الفترة.")} data={selected.map(row => ({ id: row.id, label: row.name, amount: Number(row.dueInPeriod) }))} /> : <ReportStatus>{t("Chart unavailable at this amount precision. Exact schedule values remain below.", "الرسم البياني غير متاح بسبب دقة المبالغ. القيم الدقيقة موجودة أدناه.")}</ReportStatus>}
      <AppText variant="bodyStrong" style={{ marginTop: 8 }}>{t('Contracts', 'العقود')} ({selected.length})</AppText>
        {selected.map(row => <SixReportDetails key={row.id} title={row.name} subtitle={row.totalScheduled + ' ' + row.currencyCode + ' · ' + row.scheduledCount + ' scheduled'}>
          <ReportKeyValues items={[{ label: t("Ownership", "الملكية"), value: ownership[row.ownership] }, { label: t("Contract total (all scheduled)", "إجمالي العقد (كل الأقساط المجدولة)"), value: row.totalScheduled + ' ' + row.currencyCode }, { label: t("Due in period", "المستحق خلال الفترة"), value: row.dueInPeriod + ' ' + row.currencyCode }, { label: t("Installments scheduled in period", "الأقساط المجدولة خلال الفترة"), value: row.dueCount + ' of ' + row.scheduledCount + ' total' }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={"Open installment contract " + row.name} onPress={() => router.push({ pathname: '/finance/installment-contract', params: { id: row.id, mode: 'details' } })} style={{ minHeight: 44, justifyContent: 'center' }}><AppText variant="caption" color="primary">{t("View contract details ›", "عرض تفاصيل العقد ›")}</AppText></Pressable>
        </SixReportDetails>)}
      {schedule?.reconciled ? <SixReportDetails title={t("Scheduled due dates", "تواريخ الاستحقاق المجدولة")}>{entries.length > 0 ? <ReportTransactionRows rows={entries.map(entry => ({ id: entry.id, date: entry.date, category: entry.name, description: 'Scheduled · confirmation required', amount: 0, formattedAmount: entry.amount, currency: entry.currency }))} /> : <AppText variant="caption">{t("No installments due in this period.", "لا توجد أقساط مستحقة في هذه الفترة.")}</AppText>}</SixReportDetails> : <ReportStatus warning>Schedule totals cannot be reconciled. Details and exports are unavailable.</ReportStatus>}
      <ReportTableActions presentation="obligations" table={{ title: 'Installments Schedule Report', period: dates, notice: 'Scheduled amounts only. Paid and outstanding balances are unavailable. Due dates never trigger deductions. Contract totals are all scheduled dates; due amounts are only the selected period.', verified: !!schedule?.reconciled, numericColumns: [3, 4, 5, 6], integerColumns: [5, 6], columns: ['Contract', 'Currency', 'Ownership', 'All scheduled', 'Due in period', 'Due count', 'Schedule count'], rows: selected.map(row => [row.name, row.currencyCode, ownership[row.ownership], row.totalScheduled, row.dueInPeriod, row.dueCount, row.scheduledCount]) }} statement={() => router.push({ pathname: '/finance/statement-installments', params: { month, from: dates.from, to: dates.to, currencyCode: activeCurrency } })} />
    </>}
  </Screen>;
}
