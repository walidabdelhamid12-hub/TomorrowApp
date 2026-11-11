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
    return { valid: false, reason: 'Invalid opening balance date' };
  }
}
