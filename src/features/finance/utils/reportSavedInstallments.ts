import type { StoredInstallmentContract } from '../store/installmentsStorage';
import { getCurrencyDecimals } from '../constants/currencies';
import { validateInstallmentContract } from './installments';

export interface SavedInstallmentReportRow {
  id: string; name: string; currencyCode: string; totalScheduled: string;
  dueInPeriod: string; dueCount: number; scheduledCount: number;
  ownership: 'standalone' | 'linked_loan' | 'linked_debt';
}
function units(value: string, decimals: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}
function money(value: bigint, decimals: number): string {
  const digits = value.toString().padStart(decimals + 1, '0');
  return decimals ? digits.slice(0, -decimals) + '.' + digits.slice(-decimals) : digits;
}
/** Read-only schedule projection. Does not infer paid amounts or change balances. */
export function aggregateSavedInstallmentsReport(
  records: readonly StoredInstallmentContract[], from: string, to: string,
): SavedInstallmentReportRow[] {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 100 || month < 1 || month > 12) return false;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day >= 1 && day <= lastDay;
  };
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Invalid period');
  const ids = new Set<string>();
  return records.map(record => {
    const contract = record.contract;
    validateInstallmentContract(contract);
    if (ids.has(contract.id)) throw new Error('Duplicate contract');
    ids.add(contract.id);
    const decimals = getCurrencyDecimals(contract.currencyCode);
    const due = contract.schedule.filter(item => item.dueDate >= from && item.dueDate <= to);
    return {
      id: contract.id, name: record.name, currencyCode: contract.currencyCode,
      totalScheduled: contract.totalAmount,
      dueInPeriod: money(due.reduce((sum, item) => sum + units(item.amount, decimals), 0n), decimals),
      dueCount: due.length, scheduledCount: contract.schedule.length,
      ownership: contract.accountingOwnership.kind,
    };
  });
}
