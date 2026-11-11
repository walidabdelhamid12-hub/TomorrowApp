import type { Debt, DebtDirection } from '../types/finance';

export interface DebtReportPeriod { from: string; to: string }
export type DebtReportStatus = 'available' | 'historical_data_unavailable';
export interface DebtReportRow {
  debtId: string;
  personName: string;
  direction: DebtDirection;
  currencyCode: string;
  status: DebtReportStatus;
  /** Original nominal debt, not a period flow. */
  totalAmount: number | null;
  /** Actual payments dated within the requested period. */
  periodPaid: number | null;
  /** Balance at the end of the requested period, if historical evidence is complete. */
  remainingAtPeriodEnd: number | null;
  /** Balance as of the latest recorded history, not as of the report period. */
  currentRemaining: number | null;
  reason?: string;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 100 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function toUnits(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const scaled = value * 1000;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) <= 1e-8 ? rounded : null;
}

/**
 * Read-only debt report. The debt's creation date is treated as its earliest
 * known recognition date; later edits have no historical revision log.
 * Accordingly, historical closing balances are unavailable when the debt
 * has been edited after the period. No ledger posting or FX conversion.
 */
export function aggregateDebtsReport(
  debts: readonly Debt[],
  period: DebtReportPeriod,
  direction?: DebtDirection,
): DebtReportRow[] {
  if (!period || !validDate(period.from) || !validDate(period.to) || period.from > period.to) {
    throw new Error('Invalid debt report period');
  }
  if (direction !== undefined && direction !== 'receivable' && direction !== 'payable') {
    throw new Error('Invalid debt direction');
  }
  if (!Array.isArray(debts)) throw new Error('Invalid debts collection');
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const debt of debts) {
    if (seen.has(debt.id)) duplicate.add(debt.id);
    seen.add(debt.id);
  }
  return debts.filter(d => direction === undefined || d.direction === direction).map(debt => {
    const base = { debtId: debt.id, personName: debt.personName,
      direction: debt.direction, currencyCode: debt.currencyCode };
    const unavailable = (reason: string): DebtReportRow => ({
      ...base, status: 'historical_data_unavailable', totalAmount: null,
      periodPaid: null, remainingAtPeriodEnd: null, currentRemaining: null, reason,
    });
    if (!debt.id || duplicate.has(debt.id)) return unavailable('Invalid or duplicate debt identity');
    if (debt.direction !== 'receivable' && debt.direction !== 'payable') return unavailable('Invalid direction');
    if (!validDate(debt.date) || !Array.isArray(debt.payments)) return unavailable('Invalid debt date or payments');
    if (typeof debt.currencyCode !== 'string' || !debt.currencyCode.trim()) return unavailable('Missing currency');
    const total = toUnits(debt.amount);
    if (total === null) return unavailable('Invalid debt amount');
    const ids = new Set<string>();
    let paid = 0;
    let paidAtEnd = 0;
    let periodPaid = 0;
    for (const payment of debt.payments) {
      if (typeof payment.id !== 'string' || !payment.id || ids.has(payment.id)) return unavailable('Duplicate or invalid payment identity');
      ids.add(payment.id);
      if (!validDate(payment.date) || payment.date < debt.date) return unavailable('Invalid payment date');
      const units = toUnits(payment.amount);
      if (units === null || units === 0) return unavailable('Invalid payment amount');
      paid += units;
      if (payment.date <= period.to) paidAtEnd += units;
      if (payment.date >= period.from && payment.date <= period.to) periodPaid += units;
      if (![paid, paidAtEnd, periodPaid].every(Number.isSafeInteger) || paid > total) {
        return unavailable('Unsafe or excessive payments');
      }
    }
    if (debt.date > period.to) {
      // The debt did not exist in the selected period; current balance is separate.
      return { ...base, status: 'available', totalAmount: total / 1000,
        periodPaid: 0, remainingAtPeriodEnd: 0, currentRemaining: (total - paid) / 1000 };
    }
    // The current debt amount may have been edited; without a revision history,
    // a past nominal balance cannot be reconstructed after an update.
    if (typeof debt.updatedAt !== 'string' || !Number.isFinite(Date.parse(debt.updatedAt))) {
      return unavailable('Unverified debt revision history');
    }
    if (debt.updatedAt.slice(0, 10) > period.to) {
      return { ...base, status: 'historical_data_unavailable',
        totalAmount: total / 1000, periodPaid: periodPaid / 1000,
        remainingAtPeriodEnd: null, currentRemaining: (total - paid) / 1000,
        reason: 'Debt may have changed after period; historical amount unverified' };
    }
    return { ...base, status: 'available', totalAmount: total / 1000,
      periodPaid: periodPaid / 1000, remainingAtPeriodEnd: (total - paidAtEnd) / 1000,
      currentRemaining: (total - paid) / 1000 };
  });
}
