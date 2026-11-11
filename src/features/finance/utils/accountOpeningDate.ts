import type { LedgerData } from '../types/ledger';
import { aggregateAccountsReport } from './reportAccounts';

/**
 * Verify a user-supplied historical basis against the complete ledger.
 * This is read-only. It does not establish that omitted/imported history exists.
 */
export function validateAccountOpeningDate(
  ledger: LedgerData,
  accountId: string,
  date: string,
): { valid: true } | { valid: false; reason: string } {
  if (typeof accountId !== 'string' || !accountId
    || typeof date !== 'string') {
    return { valid: false, reason: 'Invalid account or date' };
  }
  if (ledger.accounts.filter(account => account.id === accountId).length !== 1) {
    return { valid: false, reason: 'Account is missing or ambiguous' };
  }
  // Match the report engine's strict ISO calendar validation before calling it.
  // This keeps user input errors distinct from unexpected report failures.
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(date);
  if (!match) return { valid: false, reason: 'Enter the opening date as YYYY-MM-DD' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) {
    return { valid: false, reason: 'Opening balance date is not a valid calendar date (YYYY-MM-DD)' };
  }
  try {
    const rows = aggregateAccountsReport(
      ledger,
      { from: date, to: date },
      [{ accountId, openingBalanceDate: date }],
    );
    const row = rows.find(item => item.accountId === accountId);
    if (!row || row.status !== 'available' || !row.reconciled) {
      return { valid: false, reason: row?.reason ?? 'Unverified account history' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Unable to verify account history. Please retry or review the account data.' };
  }
}
