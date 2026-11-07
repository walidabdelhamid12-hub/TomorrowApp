import { AppText } from '@/components/ui';
import type { Loan } from '@/features/finance/types/finance';
import { loanDetailLines } from '@/features/finance/utils/detailLines';
import { getLoanPaidAmount } from '@/features/finance/utils/finance';
import { formatAmount } from '@/features/finance/utils/amountFormat';
import { FinanceDetailsModal } from './FinanceDetailsModal';
import { FinanceDisclosure } from './FinanceDisclosure';

export function LoanDetails({ loanId, loan, onClose }: { loanId: string | null; loan?: Loan; onClose: () => void }) {
  const lines = loan ? loanDetailLines(loan) : [];
  const labels = ['Original principal', 'Contractual total', 'Remaining contractual payments', 'Installment amount', 'Remaining principal'];
  const financial = labels.flatMap(label => lines.filter(line => line.startsWith(label + ': ')));
  const fields = financial.map(line => { const index = line.indexOf(': '); return { label: line.slice(0, index), value: line.slice(index + 2) }; });
  const historyIndex = lines.indexOf('Payment history');
  const metadata = lines.slice(0, historyIndex).filter(line => line && !financial.includes(line));
  return <FinanceDetailsModal title={loanId === null ? undefined : loan?.name ?? 'Loan unavailable'} onClose={onClose}
    metrics={loan ? [...fields, { label: 'Total paid', value: formatAmount(getLoanPaidAmount(loan), loan.currencyCode) + ' ' + loan.currencyCode }] : []}
    lines={loan ? [] : ['No unique loan is available.']}>
    {loan && <>
      <AppText variant="caption" color="textSecondary">{loan.lenderName + ' · ' + (loan.status ?? 'active') + ' · ' + loan.currencyCode}</AppText>
      <FinanceDisclosure title="Loan information">
        {metadata.map((line, index) => <AppText key={index} variant="caption" style={{ paddingVertical: 3 }}>{line}</AppText>)}
      </FinanceDisclosure>
      <FinanceDisclosure title="Payment history" count={loan.payments.length}>
        {lines.slice(historyIndex + 1).map((line, index) => <AppText key={index} variant="caption" style={{ paddingVertical: 4 }}>{line}</AppText>)}
      </FinanceDisclosure>
    </>}
  </FinanceDetailsModal>;
}
