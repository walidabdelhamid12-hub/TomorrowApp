import type { LedgerData, Transaction } from '../types/ledger';
import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import { reportAmountToUnits } from './reportAggregation';

export interface AccountReportPeriod {
  from: string;
  to: string;
}

/** initialBalance is verified at the START of this date, before its movements. */
export interface AccountReportBasis {
  accountId: string;
  openingBalanceDate: string;
}

/** Positive cash amounts; repayments are subsets of transfers, never added twice. */
export interface AccountReportMovements {
  income: number;
  expenses: number;
  refunds: number;
  transfersIn: number;
  transfersOut: number;
  creditCardRepaymentsIn: number;
  creditCardRepaymentsOut: number;
}

export interface AccountReportDiagnostic {
  kind: 'account' | 'transaction' | 'transfer' | 'reconciliation';
  id: string;
  reason: string;
}

export interface AccountReportRow {
  accountId: string;
  accountName: string;
  currencyCode: string;
  archived: boolean;
  status: 'available' | 'historical_data_unavailable';
  openingBalance: number | null;
  closingBalance: number | null;
  change: number | null;
  movements: AccountReportMovements | null;
  movementCount: number | null;
  reconciled: boolean;
  diagnostics: AccountReportDiagnostic[];
  /** Exact account-currency minor units, for reconciliation without float scaling. */
  readonly minorUnits: Readonly<AccountReportMovements & {
    openingBalance: number; closingBalance: number; change: number;
  }> | null;
  reason?: string;
}

function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function validId(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !/[\s\u0000-\u001f\u007f]/u.test(value);
}

/**
 * Pure account cash report over a supplied ledger and explicit historical bases.
 * Includes financing cash flows regardless of P&L ownership; never posts, repairs,
 * converts currencies, uses credit limits, or infers history from createdAt.
 * All records claiming an account are validated, including future-dated records.
 * Invalid/unplaceable account references conservatively invalidate every row.
 */
export function aggregateAccountsReport(
  ledger: LedgerData,
  period: AccountReportPeriod,
  bases: readonly AccountReportBasis[] = [],
): AccountReportRow[] {
  if (!validDate(period.from) || !validDate(period.to) || period.from > period.to) {
    throw new Error('Invalid report period');
  }

  const accountsFor = (id: string) => ledger.accounts.filter(account => account.id === id);
  const transactionProblem = (tx: Transaction): string | null => {
    const accounts = accountsFor(tx.accountId);
    if (!validId(tx.id) || ledger.transactions.filter(item => item.id === tx.id).length !== 1
      || accounts.length !== 1 || tx.currencyCode !== accounts[0].currencyCode
      || !validDate(tx.date) || tx.amount <= 0
      || reportAmountToUnits(tx.amount, tx.currencyCode) === null
      || (tx.type !== 'income' && tx.type !== 'expense')
      || (tx.entryType !== undefined && tx.entryType !== 'normal' && tx.entryType !== 'refund')
      || (tx.entryType === 'refund' && tx.type !== 'expense')
      || (tx.entryType !== 'refund' && tx.relatedTransactionId !== undefined)) {
      return 'Invalid or inconsistent transaction';
    }
    return null;
  };

  const orphanTransaction = ledger.transactions.find(tx => !validId(tx.accountId)
    || accountsFor(tx.accountId).length === 0);
  const orphanTransfer = ledger.transfers.find(transfer =>
    accountsFor(transfer.fromAccountId).length === 0
    && accountsFor(transfer.toAccountId).length === 0);

  return ledger.accounts.map(account => {
    const identity = {
      accountId: account.id, accountName: account.name,
      currencyCode: account.currencyCode, archived: account.archived,
    };
    const unavailable = (
      reason: string,
      kind: AccountReportDiagnostic['kind'] = 'account',
      id: string = account.id,
    ): AccountReportRow => ({
      ...identity, status: 'historical_data_unavailable',
      openingBalance: null, closingBalance: null, change: null,
      movements: null, movementCount: null, minorUnits: null, reconciled: false,
      reason, diagnostics: [{ kind, id, reason }],
    });
    if (!validId(account.id) || accountsFor(account.id).length !== 1) {
      return unavailable('Invalid or duplicate account identity');
    }
    if (!isSupportedCurrency(account.currencyCode)) return unavailable('Unsupported account currency');
    if (orphanTransaction) return unavailable('Unresolved transaction account', 'transaction', orphanTransaction.id);
    if (orphanTransfer) return unavailable('Unresolved transfer accounts', 'transfer', orphanTransfer.id);
    const selectedBases = bases.filter(basis => basis.accountId === account.id);
    if (selectedBases.length > 1) return unavailable('Duplicate opening balance dates');
    const baseline = selectedBases[0]?.openingBalanceDate;
    if (!baseline || !validDate(baseline)) return unavailable('Opening balance date not verified');
    if (period.from < baseline) return unavailable('Report begins before opening balance date');
    const initial = reportAmountToUnits(account.initialBalance, account.currencyCode);
    if (initial === null) return unavailable('Invalid or unsafe opening balance');
    const factor = 10 ** getCurrencyDecimals(account.currencyCode);
    type Metric = keyof AccountReportMovements;
    const totals: AccountReportMovements = {
      income: 0, expenses: 0, refunds: 0, transfersIn: 0, transfersOut: 0,
      creditCardRepaymentsIn: 0, creditCardRepaymentsOut: 0,
    };
    const movements: { date: string; units: number; metric: Metric; repayment?: Metric; id: string }[] = [];
    for (const tx of ledger.transactions.filter(item => item.accountId === account.id)) {
      const problem = transactionProblem(tx);
      if (problem) return unavailable(problem, 'transaction', tx.id);
      if (tx.date < baseline) return unavailable('Movements predate opening balance', 'transaction', tx.id);
      if (tx.entryType === 'refund') {
        const originals = ledger.transactions.filter(item => item.id === tx.relatedTransactionId);
        const original = originals[0];
        if (originals.length !== 1 || original.id === tx.id || original.type !== 'expense'
          || original.entryType === 'refund' || transactionProblem(original)
          || original.date > tx.date) {
          return unavailable('Refund original missing, invalid or incompatible', 'transaction', tx.id);
        }
      }
      const units = reportAmountToUnits(tx.amount, account.currencyCode)!;
      const metric = tx.entryType === 'refund' ? 'refunds' : tx.type === 'income' ? 'income' : 'expenses';
      movements.push({ date: tx.date, units: metric === 'expenses' ? -units : units, metric, id: tx.id });
    }
    for (const transfer of ledger.transfers.filter(item =>
      item.fromAccountId === account.id || item.toAccountId === account.id)) {
      const badTransfer = (reason: string) => unavailable(reason, 'transfer', transfer.id);
      const sources = accountsFor(transfer.fromAccountId);
      const destinations = accountsFor(transfer.toAccountId);
      if (!validId(transfer.id) || sources.length !== 1 || destinations.length !== 1
        || transfer.fromAccountId === transfer.toAccountId
        || ledger.transfers.filter(item => item.id === transfer.id).length !== 1) {
        return badTransfer('Invalid or ambiguous transfer accounts');
      }
      if (!validDate(transfer.date)) return badTransfer('Invalid transaction or transfer date');
      if (transfer.date < baseline) return badTransfer('Movements predate opening balance');
      const source = sources[0], destination = destinations[0];
      const sameCurrency = source.currencyCode === destination.currencyCode;
      const type = transfer.type === undefined ? 'internal' : transfer.type; // Older internal transfers omit type.
      if ((type !== 'internal' && type !== 'credit_card_payment')
        || (type === 'credit_card_payment' && (source.type === 'credit_card'
          || destination.type !== 'credit_card' || !sameCurrency))
        || (type === 'internal' && (source.type === 'credit_card' || destination.type === 'credit_card'))) {
        return badTransfer('Invalid transfer type or credit-card repayment accounts');
      }
      // Archived accounts retain their historical cash movements.
      const sourceAmount = transfer.fromAmount ?? transfer.amount;
      const destinationAmount = transfer.toAmount ?? transfer.amount;
      if (transfer.fromAmount === null || transfer.toAmount === null
        || (!sameCurrency && (transfer.fromAmount === undefined || transfer.toAmount === undefined))
        || (transfer.fromCurrencyCode !== undefined && transfer.fromCurrencyCode !== source.currencyCode)
        || (transfer.toCurrencyCode !== undefined && transfer.toCurrencyCode !== destination.currencyCode)
        || ((transfer.fromAmount === undefined || transfer.toAmount === undefined)
          && transfer.currencyCode !== source.currencyCode)) {
        return badTransfer('Transfer account-currency amount not verified');
      }
      const sourceUnits = reportAmountToUnits(sourceAmount, source.currencyCode);
      const destinationUnits = reportAmountToUnits(destinationAmount, destination.currencyCode);
      if (sourceUnits === null || destinationUnits === null || sourceAmount <= 0 || destinationAmount <= 0
        || (sameCurrency && sourceUnits !== destinationUnits)
        || (transfer.exchangeRate !== undefined && (!Number.isFinite(transfer.exchangeRate)
          || transfer.exchangeRate <= 0 || (sameCurrency && Math.abs(transfer.exchangeRate - 1) > 0.000001)))) {
        return badTransfer('Invalid or unsafe transfer amount or rate');
      }
      // Actual posted legs are authoritative; never recompute them from exchangeRate.
      const outgoing = transfer.fromAccountId === account.id;
      movements.push({ date: transfer.date, units: outgoing ? -sourceUnits : destinationUnits,
        metric: outgoing ? 'transfersOut' : 'transfersIn', id: transfer.id,
        ...(type === 'credit_card_payment'
          ? { repayment: outgoing ? 'creditCardRepaymentsOut' as const : 'creditCardRepaymentsIn' as const } : {}),
      });
    }
    let opening = initial, closing = initial, periodDelta = 0, count = 0;
    // Stable order within a date; check intermediates even if later entries cancel.
    for (const movement of movements.sort((a, b) => a.date.localeCompare(b.date))) {
      if (movement.date < period.from) opening += movement.units;
      if (movement.date <= period.to) closing += movement.units;
      if (!Number.isSafeInteger(opening) || !Number.isSafeInteger(closing)) {
        return unavailable('Unsafe calculated balance', 'reconciliation', movement.id);
      }
      if (movement.date < period.from || movement.date > period.to) continue;
      const magnitude = Math.abs(movement.units);
      totals[movement.metric] += magnitude;
      if (movement.repayment) totals[movement.repayment] += magnitude;
      periodDelta += movement.units;
      count++;
      if (!Number.isSafeInteger(periodDelta) || !Object.values(totals).every(Number.isSafeInteger)) {
        return unavailable('Unsafe accumulated account movements', 'reconciliation', movement.id);
      }
    }
    const change = closing - opening;
    // BigInt independently reconciles movement components without unsafe intermediates.
    const componentDelta = BigInt(totals.income) - BigInt(totals.expenses) + BigInt(totals.refunds)
      + BigInt(totals.transfersIn) - BigInt(totals.transfersOut);
    if (!Number.isSafeInteger(change) || BigInt(change) !== componentDelta || change !== periodDelta) {
      return unavailable('Account movements do not safely reconcile', 'reconciliation');
    }
    const exact = { ...totals, openingBalance: opening, closingBalance: closing, change };
    // Safe integer arithmetic alone cannot guarantee that dividing back to a
    // number preserves cents/fils at large magnitudes. Reject ambiguous output.
    if (Object.values(exact).some(units =>
      reportAmountToUnits(units / factor, account.currencyCode) !== units)) {
      return unavailable('Calculated monetary values cannot preserve currency precision', 'reconciliation');
    }
    const amounts: AccountReportMovements = {
      income: totals.income / factor, expenses: totals.expenses / factor, refunds: totals.refunds / factor,
      transfersIn: totals.transfersIn / factor, transfersOut: totals.transfersOut / factor,
      creditCardRepaymentsIn: totals.creditCardRepaymentsIn / factor,
      creditCardRepaymentsOut: totals.creditCardRepaymentsOut / factor,
    };
    return { ...identity, status: 'available', openingBalance: opening / factor,
      closingBalance: closing / factor, change: change / factor, movements: amounts,
      movementCount: count, reconciled: true, diagnostics: [],
      minorUnits: Object.freeze(exact),
    };
  });
}
