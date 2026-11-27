import type { ReactNode } from 'react';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import { useAppLanguage } from '@/localization/LanguageProvider';
import { AppText } from '@/components/ui';
import type { Loan } from '@/features/finance/types/finance';
import { loanDetailLines } from '@/features/finance/utils/detailLines';
import { getLoanPaidAmount } from '@/features/finance/utils/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { FinanceDetailsModal } from './FinanceDetailsModal';

export function LoanDetails({ loanId, loan, onClose, children }: { loanId: string | null; loan?: Loan; onClose: () => void; children?: ReactNode }) {
  const { t } = useAppLanguage();
  const lines = loan ? loanDetailLines(loan) : [];
  const labels = ['Original principal', 'Contractual total', 'Remaining contractual payments', 'Installment amount', 'Remaining principal'];
  const financial = labels.flatMap(label => lines.filter(line => line.startsWith(label + ': ')));
  const fields = financial.map(line => { const index = line.indexOf(': '); return { label: line.slice(0, index), value: loan && line.endsWith(' ' + loan.currencyCode) ? line.slice(index + 2, -loan.currencyCode.length) + getCurrencyFlag(loan.currencyCode) + ' ' + loan.currencyCode : line.slice(index + 2) }; });
  const historyIndex = lines.indexOf('Payment history');
  const metadata = lines.slice(0, historyIndex < 0 ? lines.length : historyIndex).filter(line => line && !financial.includes(line));
  return <FinanceDetailsModal title={loanId === null ? undefined : loan?.name ?? t('Loan unavailable', 'القرض غير متاح')} onClose={onClose} compact
    metrics={loan ? [...fields, { label: t('Total paid', 'إجمالي المدفوع'), value: formatAmount(getLoanPaidAmount(loan), loan.currencyCode) + ' ' + getCurrencyFlag(loan.currencyCode) + ' ' + loan.currencyCode }] : []}
    lines={loan ? [] : [t('No unique loan is available.', 'لا يوجد قرض محدد بشكل واضح.')]}>
    {loan && <>
      <AppText variant="caption" color="textSecondary"><AppText style={{ fontWeight: '700' }}>{t('Lender', 'المقرض')}: </AppText>{loan.lenderName}{' · '}<AppText style={{ fontWeight: '700' }}>{t('Status', 'الحالة')}: </AppText>{loan.status === 'settled' ? t('Settled', 'تمت التسوية') : loan.status === 'completed' ? t('Completed', 'مكتمل') : loan.status === 'closed' ? t('Closed', 'مغلق') : t('Active', 'نشط')}{' · ' + getCurrencyFlag(loan.currencyCode) + ' ' + loan.currencyCode}</AppText>
      
        {metadata.filter(line => /^(First due|Received|Remaining installment count|Original installment count):/.test(line)).map((line, index) => {
          const split = line.indexOf(': ');
          return <AppText key={index} variant="caption" style={{ paddingVertical: 2 }}>{split > 0 ? <><AppText style={{ fontWeight: '700' }}>{line.slice(0, split + 1)}</AppText>{' ' + line.slice(split + 2)}</> : line}</AppText>;
        })}
      {children}
        {metadata.filter(line => !/^(Lender|Status|First due|Received|Remaining installment count|Original installment count):/.test(line)).map((line, index) => <AppText key={index} variant="caption">{line}</AppText>)}

    </>}
  </FinanceDetailsModal>;
}
