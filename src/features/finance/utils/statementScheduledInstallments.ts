import type { StoredInstallmentContract } from '../store/installmentsStorage';
import { getCurrencyDecimals } from '../constants/currencies';
import { aggregateSavedInstallmentsReport } from './reportSavedInstallments';

export interface ScheduledStatementEntry {
  id: string;
  contractId: string;
  name: string;
  date: string;
  amount: string;
  currency: string;
}

/**
 * Read-only schedule register, reconciled against the report in exact currency
 * minor units. It does not claim that any scheduled installment was paid.
 */
export function buildScheduledInstallmentsStatement(
  records: readonly StoredInstallmentContract[], from: string, to: string,
): { entries: ScheduledStatementEntry[]; reconciled: boolean } {
  const rows = aggregateSavedInstallmentsReport(records, from, to);
  const entries = records.flatMap(record =>
    record.contract.schedule.filter(item => item.dueDate >= from && item.dueDate <= to)
      .map(item => ({
        id: record.contract.id + ':' + item.id, contractId: record.contract.id,
        name: record.name, date: item.dueDate, amount: item.amount,
        currency: record.contract.currencyCode,
      }))).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const toUnits = (amount: string, currency: string): bigint => {
    const decimals = getCurrencyDecimals(currency);
    const [whole, fraction = ''] = amount.split('.');
    return BigInt(whole + fraction.padEnd(decimals, '0'));
  };
  const reconciled = rows.every(row => {
    const relevant = entries.filter(item => item.contractId === row.id);
    const total = relevant.reduce((sum, item) => sum + toUnits(item.amount, row.currencyCode), 0n);
    return relevant.length === row.dueCount && total === toUnits(row.dueInPeriod, row.currencyCode);
  });
  return { entries, reconciled };
}
