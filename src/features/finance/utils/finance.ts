import { evaluateAssetRatio } from '@/features/finance/utils/assetDecimal';
import type {
  Asset,
  AssetEntry,
  Cheque,
  Debt,
  DebtStatus,
  ISODate,
  Loan,
  LoanStatus,
} from '@/features/finance/types/finance';

/* ------------------------------ Basics ----------------------------------- */

export const MONEY_DECIMALS = 3;

/** Rounds to 3 decimals to avoid floating point drift (0.1 + 0.2). */
export function roundMoney(value: number, decimals = MONEY_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Collision-safe enough for local, single-device data. No extra dependency. */
export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Drops keys whose value is undefined so patches never erase existing data. */
export function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/* ------------------------------- Dates ----------------------------------- */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local-timezone "YYYY-MM-DD" (avoids the UTC off-by-one of toISOString). */
export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

/**
 * Adds months while clamping the day (Jan 31 + 1 month = Feb 28/29).
 * Always compute from the FIRST due date so the day never drifts downward.
 */
export function addMonthsISO(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const monthIndex = m - 1 + months;
  const year = y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, daysInMonth))}`;
}

/* --------------------------- Assets / Calendar --------------------------- */

/** Current balance (sum of all entries). */
export function getAssetBalance(asset: Asset): number {
  return roundMoney(asset.entries.reduce((sum, e) => sum + e.amount, 0));
}

/** Balance as of a given date (inclusive). */
export function getAssetBalanceOn(asset: Asset, date: ISODate): number {
  return roundMoney(
    asset.entries
      .filter((e) => e.date <= date)
      .reduce((sum, e) => sum + e.amount, 0)
  );
}

/** Everything recorded on one calendar day, grouped by asset. */
export function getAssetEntriesOnDate(
  assets: Asset[],
  date: ISODate
): { asset: Asset; entries: AssetEntry[] }[] {
  return assets
    .map((asset) => ({
      asset,
      entries: asset.entries.filter((e) => e.date === date),
    }))
    .filter((group) => group.entries.length > 0);
}

/** Sorted unique dates that have entries (for calendar dot markers). */
export function getAssetEntryDates(assets: Asset[]): ISODate[] {
  const dates = new Set<ISODate>();
  assets.forEach((a) => a.entries.forEach((e) => dates.add(e.date)));
  return Array.from(dates).sort();
}

/* -------------------------------- Debts ---------------------------------- */

export function getDebtPaid(debt: Debt): number {
  return roundMoney(debt.payments.reduce((sum, p) => sum + p.amount, 0));
}

export function getDebtRemaining(debt: Debt): number {
  return Math.max(roundMoney(debt.amount - getDebtPaid(debt)), 0);
}

export function getDebtStatus(debt: Debt): DebtStatus {
  if (getDebtRemaining(debt) <= 0) return 'settled';
  return debt.payments.length > 0 ? 'partial' : 'open';
}

export function isDebtOverdue(debt: Debt, today: ISODate = todayISO()): boolean {
  return (
    !!debt.dueDate && getDebtStatus(debt) !== 'settled' && debt.dueDate < today
  );
}

/* -------------------------------- Loans ---------------------------------- */

/** Contractual total; legacy loans fall back to installment × count. */
export function getLoanTotal(loan: Loan): number {
  const total =
    loan.totalRepaymentAmount ??
    loan.monthlyInstallment * loan.numberOfInstallments;
  return roundMoney(total);
}

/** Recorded contractual payments; late fees are intentionally excluded. */
export function getLoanPaidAmount(loan: Loan): number {
  return roundMoney(
    (loan.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0)
  );
}

/** Approved proportional allocation for simple payments; explicit legacy splits win.
 * Fees never reduce principal. Missing/invalid legacy allocation stays unknown.
 * Receipt confirmation supplies the actual original cash principal when present.
 */
export function getLoanRemainingPrincipal(loan: Loan): number | null {
  if (['settled', 'completed', 'closed'].includes(loan.status ?? '')) return 0;
  const principal = loan.receivedAmount ?? loan.principalAmount;
  const total = getLoanTotal(loan);
  if (principal === undefined || !Number.isFinite(principal) || principal < 0 || !Number.isFinite(total) || total <= 0 || principal > total) return null;
  let reduction = 0;
  for (const payment of loan.payments ?? []) {
    if (!Number.isFinite(payment.amount) || payment.amount < 0) return null;
    if (payment.paymentMode === 'split' || payment.principalAmount !== undefined || payment.interestAmount !== undefined) {
      if (payment.principalAmount === undefined || !Number.isFinite(payment.principalAmount) || payment.principalAmount < 0 || payment.principalAmount > payment.amount) return null;
      if (payment.interestAmount !== undefined && (!Number.isFinite(payment.interestAmount) || payment.interestAmount < 0 || roundMoney(payment.principalAmount + payment.interestAmount) !== roundMoney(payment.amount))) return null;
      reduction += payment.principalAmount;
    } else {
      reduction += evaluateAssetRatio([payment.amount, principal], [total]) ?? NaN;
    }
  }
  return Number.isFinite(reduction) ? Math.max(0, principal - reduction) : null;
}

/** Remaining contractual balance, never below zero. */
export function getLoanRemainingAmount(loan: Loan): number {
  if (
    loan.status === 'settled' ||
    loan.status === 'completed' ||
    loan.status === 'closed'
  ) {
    return 0;
  }

  return Math.max(roundMoney(getLoanTotal(loan) - getLoanPaidAmount(loan)), 0);
}

export function getLoanRemainingInstallments(loan: Loan): number {
  const remaining = getLoanRemainingAmount(loan);
  return remaining === 0 ? 0 : loan.monthlyInstallment > 0 ? Math.ceil(remaining / loan.monthlyInstallment) : loan.numberOfInstallments;
}

export function getLoanStatus(loan: Loan): LoanStatus {
  if (loan.status === 'settled' || loan.status === 'closed' || loan.status === 'completed') return loan.status;
  return getLoanRemainingAmount(loan) === 0 ? 'completed' : 'active';
}

/** Due date of the next unpaid installment, or null when fully paid. */
export function getLoanNextDueDate(loan: Loan): ISODate | null {
  if (getLoanRemainingAmount(loan) === 0) return null;
  const paidInstallments = loan.monthlyInstallment > 0 ? Math.floor(getLoanPaidAmount(loan) / loan.monthlyInstallment) : 0;
  return addMonthsISO(loan.firstDueDate, paidInstallments);
}

export function isLoanOverdue(loan: Loan, today: ISODate = todayISO()): boolean {
  const next = getLoanNextDueDate(loan);
  return next !== null && next < today;
}

/* ------------------------------- Cheques --------------------------------- */

export function isChequeOverdue(
  cheque: Cheque,
  today: ISODate = todayISO()
): boolean {
  return cheque.status === 'pending' && cheque.dueDate < today;
}// ضع هنا كود الـ Utils
