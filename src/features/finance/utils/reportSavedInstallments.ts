import { convertAmountUnrounded } from './money';
import type { StoredInstallmentContract } from '../store/installmentsStorage';
import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
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


export interface SavedInstallmentCurrencySummary {
  currencyCode: string;
  totalScheduled: string;
  dueInPeriod: string;
  contractCount: number;
  dueCount: number;
}

/** Currency-isolated totals: never sum unlike currencies or infer payment status. */
export function summarizeSavedInstallmentsByCurrency(
  rows: readonly SavedInstallmentReportRow[],
): SavedInstallmentCurrencySummary[] {
  const totals = new Map<string, { total: bigint; due: bigint; contracts: number; dueCount: number }>();
  for (const row of rows) {
    const decimals = getCurrencyDecimals(row.currencyCode);
    const current = totals.get(row.currencyCode) ?? { total: 0n, due: 0n, contracts: 0, dueCount: 0 };
    current.total += units(row.totalScheduled, decimals);
    current.due += units(row.dueInPeriod, decimals);
    current.contracts += 1;
    current.dueCount += row.dueCount;
    totals.set(row.currencyCode, current);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, values]) => {
    const decimals = getCurrencyDecimals(currencyCode);
    return {
      currencyCode,
      totalScheduled: money(values.total, decimals),
      dueInPeriod: money(values.due, decimals),
      contractCount: values.contracts,
      dueCount: values.dueCount,
    };
  });
}

/** Dashboard projection only: saved schedules contain no verified payment ledger. */
export function monthlyScheduledInstallmentTotal(
  records: readonly StoredInstallmentContract[], month: string, baseCurrency: string,
  rates: Record<string, number>, verifiedCurrencies: readonly string[],
): number | null {
  try {
    if (!isSupportedCurrency(baseCurrency) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    const [year, monthNumber] = month.split('-').map(Number);
    if (year < 100) return null;
    const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const rows = summarizeSavedInstallmentsByCurrency(aggregateSavedInstallmentsReport(records, month + '-01', month + '-' + last));
    let total = 0;
    for (const row of rows) {
      const decimals = getCurrencyDecimals(row.currencyCode);
      const exact = units(row.dueInPeriod, decimals);
      if (exact === 0n) continue;
      if (exact > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      const converted = convertAmountUnrounded(Number(row.dueInPeriod), row.currencyCode, baseCurrency, rates, verifiedCurrencies);
      if (converted === null || !Number.isFinite(converted) || converted < 0) return null;
      total += converted;
      if (!Number.isSafeInteger(Math.round(total * 10 ** getCurrencyDecimals(baseCurrency)))) return null;
    }
    return total;
  } catch { return null; }
}
