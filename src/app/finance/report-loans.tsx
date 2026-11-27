import { useAppLanguage } from '@/localization/LanguageProvider';
import { SixReportDetails } from '@/features/finance/components/reporting/SixReportPresentation';
import { useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Screen } from '@/components/ui';
import { useFinanceHydrated, useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { aggregateLoansReport } from '@/features/finance/utils/reportLoans';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { moduleColors } from '@/theme';
import { ReportTitle, ReportStatus, ReportDates, useReportPeriod, ReportSummaryCards, ReportKeyValues } from '@/features/finance/components/reporting/ReportUnifiedSix';
import { ReportPicker, ReportTransactionRows, currencyLabel } from '@/features/finance/components/reporting/ReportPrimitives';
import { ReportTableActions } from '@/features/finance/components/reporting/ReportTableActions';
import { ReportChart } from '@/features/finance/components/reporting/ReportUnifiedSix';

export default function LoansReportScreen() {
  const router = useRouter();
  const { t } = useAppLanguage();
  const hydrated = useFinanceHydrated();
  const loans = useFinanceStore(state => state.loans);
  const [dates, setPeriod] = useReportPeriod();
  const [loanId, setLoanId] = useState('');
  const month = dates.from.slice(0, 7);
  const rows = useMemo(() => {
    if (!hydrated) return null;
    try { return aggregateLoansReport(loans, dates); } catch { return null; }
  }, [hydrated, loans, dates]);
  const activeId = loanId || rows?.[0]?.loanId || '';
  const matches = rows?.filter(row => row.loanId === activeId) ?? [];
  const row = matches.length === 1 ? matches[0] : null;
  const safe = row?.status === 'available';
  const money = (value: number | null, code: string) => value === null ? 'Unavailable' : formatAmount(value, code) + ' ' + code;
  const payments = row && safe ? loans.filter(loan => loan.id === row.loanId).flatMap(loan => loan.payments.filter(payment => payment.date >= dates.from && payment.date <= dates.to).map(payment => ({ id: loan.id + ':' + payment.id, date: payment.date, category: loan.name, description: [payment.note, payment.paymentMethodLabel, payment.accountId ? 'Account: ' + payment.accountId : undefined, payment.latePaymentFee ? 'Late fee: ' + payment.latePaymentFee + ' ' + loan.currencyCode : undefined].filter(Boolean).join(' · '), amount: payment.amount, currency: loan.currencyCode }))) : [];
  return <Screen scroll>
    <ReportTitle active="loans" title={t("Loans Report", "تقرير القروض")} />
    <ReportDates period={dates} onChange={setPeriod} />
    {rows !== null && rows.length > 0 && <ReportPicker label={t("Loan", "القرض")} value={activeId} onSelect={setLoanId} options={rows.map(item => ({ id: item.loanId, label: item.loanName + ' ' + currencyLabel(item.currencyCode) }))} />}
    {!hydrated ? <ActivityIndicator accessibilityLabel={t("Loading loans report", "جارٍ تحميل تقرير القروض")} color={moduleColors.finance} /> : rows === null ? <ReportStatus warning>{t("Loan report could not be validated.", "تعذر التحقق من تقرير القروض.")}</ReportStatus> : rows.length === 0 ? <ReportStatus>{t("No loans saved yet.", "لا توجد قروض محفوظة بعد.")}</ReportStatus> : !row ? <ReportStatus warning>{t("Selected loan is missing or ambiguous.", "القرض المحدد غير موجود أو غير واضح.")}</ReportStatus> : <>
      <ReportSummaryCards currency={row.currencyCode} cards={[{ label: t("Remaining Loan Balance", "الرصيد المتبقي للقرض"), value: safe ? row.currentContractualRemaining : null }]} />
      {!safe && <ReportStatus warning>{t("Historical figures unavailable — incomplete contract history.", "الأرقام التاريخية غير متاحة بسبب عدم اكتمال سجل العقد.")}</ReportStatus>}
      <ReportChart currency={row.currencyCode} title={t("Contractual analysis", "التحليل التعاقدي")} description={t("Current contractual remaining.", "المتبقي التعاقدي الحالي.")} empty={t("No positive verified contractual amounts.", "لا توجد مبالغ تعاقدية موجبة تم التحقق منها.")} data={safe && row.currentContractualRemaining !== null ? [{ id: row.loanId, label: row.loanName, amount: row.currentContractualRemaining }] : []} />
      <SixReportDetails title={row.loanName} subtitle={money(safe ? row.currentContractualRemaining : null, row.currencyCode)}>
        <AppText variant="caption" color="textSecondary">{t("Contractual remaining and principal remaining are separate. Only remaining principal is deducted for net-worth accounting.", "المتبقي التعاقدي منفصل عن أصل القرض المتبقي. يُخصم أصل القرض المتبقي فقط عند حساب صافي الثروة.")}</AppText>
        <ReportKeyValues items={[
          { label: t("Original principal", "أصل القرض الأصلي"), value: money(row.originalPrincipal, row.currencyCode) },
          { label: t("Contractual total", "الإجمالي التعاقدي"), value: money(row.contractualTotal, row.currencyCode) },
          { label: t("Current contractual remaining", "المتبقي التعاقدي الحالي"), value: money(safe ? row.currentContractualRemaining : null, row.currencyCode) },
          { label: t("Current principal remaining", "أصل القرض المتبقي حاليًا"), value: money(safe ? row.currentPrincipalRemaining : null, row.currencyCode) },
          { label: t("Total recorded payments", "إجمالي الدفعات المسجلة"), value: money(row.totalPaid, row.currencyCode) },
          { label: t("Recorded payments in period", "الدفعات المسجلة خلال الفترة"), value: money(row.periodPaid, row.currencyCode) },
          { label: 'Late fees in period', value: money(row.periodLateFees, row.currencyCode) },
          { label: t("Remaining at period end", "المتبقي بنهاية الفترة"), value: money(row.remainingAtPeriodEnd, row.currencyCode) },
        ]} />
        {row.reason ? <AppText variant="caption" accessibilityRole="alert">{row.reason}</AppText> : null}
        {safe ? <>
          <AppText variant="bodyStrong">{t("Recorded payments in period", "الدفعات المسجلة خلال الفترة")}</AppText>
          {payments.length > 0 ? <ReportTransactionRows rows={payments} /> : <AppText variant="caption">{t("No recorded payments in this period.", "لا توجد دفعات مسجلة في هذه الفترة.")}</AppText>}
        </> : <AppText variant="caption" accessibilityRole="alert">{t("Unverified history; payment details are withheld.", "السجل غير متحقق منه؛ تفاصيل الدفعات مخفية.")}</AppText>}
      </SixReportDetails>
      <ReportTableActions presentation="obligations" pdfLandscape table={{ title: 'Loans Report', period: dates, notice: 'Recorded payments do not prove ledger posting. Current balances differ from period-end balances. Late fees do not reduce principal. Selected loan: ' + row.loanName, verified: safe, columns: ['Loan', 'Currency', 'Original principal', 'Contractual total', 'Payments in period', 'Late fees in period', 'Current contractual remaining', 'Current principal remaining', 'Remaining at period end'], rows: [[row.loanName, row.currencyCode, row.originalPrincipal, row.contractualTotal, row.periodPaid, row.periodLateFees, row.currentContractualRemaining, row.currentPrincipalRemaining, row.remainingAtPeriodEnd]] }} statement={() => router.push({ pathname: '/finance/statement-loans', params: { month, from: dates.from, to: dates.to, loanId: row.loanId } })} />
    </>}
  </Screen>;
}
