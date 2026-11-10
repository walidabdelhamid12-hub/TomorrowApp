import type { LedgerData } from '../types/ledger';
import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';

export interface AccountReportPeriod {
  from: string;
  to: string;
}

/**
 * The opening balance is valid at the START of this date.
 * It excludes transactions occurring on that date.
 *
 * No persisted account schema changes are required.
 */
export interface AccountReportBasis {
  accountId: string;
  openingBalanceDate: string;
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
  reason?: string;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

export function aggregateAccountsReport(
  ledger: LedgerData,
  period: AccountReportPeriod,
  bases: AccountReportBasis[] = [],
): AccountReportRow[] {
  if (!validDate(period.from) || !validDate(period.to)
    || period.from > period.to) {
    throw new Error('Invalid report period');
  }

  const basisByAccount = new Map<string, string>();
  const duplicateBases = new Set<string>();

  for (const basis of bases) {
    if (basisByAccount.has(basis.accountId)) {
      duplicateBases.add(basis.accountId);
    }
    basisByAccount.set(basis.accountId, basis.openingBalanceDate);
  }

  return ledger.accounts.map((account) => {
    const unavailable = (reason: string): AccountReportRow => ({
      accountId: account.id,
      accountName: account.name,
      currencyCode: account.currencyCode,
      archived: account.archived,
      status: 'historical_data_unavailable',
      openingBalance: null,
      closingBalance: null,
      change: null,
      reason,
    });

    if (!isSupportedCurrency(account.currencyCode)) {
      return unavailable('Unsupported account currency');
    }
    if (ledger.accounts.filter((a) => a.id === account.id).length !== 1) {
      return unavailable('Duplicate account identity');
    }
    if (duplicateBases.has(account.id)) {
      return unavailable('Duplicate opening balance dates');
    }

    const baseline = basisByAccount.get(account.id);

    if (!baseline || !validDate(baseline)) {
      return unavailable('Opening balance date not verified');
    }

    if (period.from < baseline) {
      return unavailable('Report begins before opening balance date');
    }

    const transactions = ledger.transactions.filter(
      (tx) => tx.accountId === account.id,
    );

    const transfers = ledger.transfers.filter(
      (transfer) => transfer.fromAccountId === account.id
        || transfer.toAccountId === account.id,
    );

    if (transactions.some((tx) => !validDate(tx.date))
      || transfers.some((transfer) => !validDate(transfer.date))) {
      return unavailable('Invalid transaction or transfer date');
    }

    if (transactions.some((tx) => tx.date < baseline)
      || transfers.some((transfer) => transfer.date < baseline)) {
      return unavailable('Movements predate opening balance');
    }

    const decimals = getCurrencyDecimals(account.currencyCode);
    const factor = 10 ** decimals;

    const toUnits = (amount: number): number | null => {
      const scaled = amount * factor;
      const units = Math.round(scaled);
      return Number.isFinite(amount) && Number.isSafeInteger(units)
        && Math.abs(scaled - units) <= 0.000000001 ? units : null;
    };
    const initial = toUnits(account.initialBalance);
    if (initial === null) return unavailable('Invalid or unsafe opening balance');
    const movements: { date: string; units: number }[] = [];
    for (const tx of transactions) {
      const units = toUnits(tx.amount);
      if (units === null || tx.amount <= 0
        || tx.currencyCode !== account.currencyCode
        || (tx.type !== 'income' && tx.type !== 'expense')
        || (tx.entryType !== undefined && tx.entryType !== 'normal' && tx.entryType !== 'refund')
        || (tx.entryType === 'refund' && tx.type !== 'expense')
        || ledger.transactions.filter((item) => item.id === tx.id).length !== 1) {
        return unavailable('Invalid or inconsistent transaction');
      }
      movements.push({ date: tx.date, units:
        tx.entryType === 'refund' || tx.type === 'income' ? units : -units });
    }
    for (const transfer of transfers) {
      const source = ledger.accounts.filter((a) => a.id === transfer.fromAccountId);
      const destination = ledger.accounts.filter((a) => a.id === transfer.toAccountId);
      if (source.length !== 1 || destination.length !== 1
        || transfer.fromAccountId === transfer.toAccountId
        || ledger.transfers.filter((item) => item.id === transfer.id).length !== 1) {
        return unavailable('Invalid or ambiguous transfer accounts');
      }
      const outgoing = transfer.fromAccountId === account.id;
      const explicitAmount = outgoing ? transfer.fromAmount : transfer.toAmount;
      const currency = outgoing ? transfer.fromCurrencyCode : transfer.toCurrencyCode;
      // Legacy fallback requires a verified common account currency.
      if ((currency !== undefined && currency !== account.currencyCode)
        || (explicitAmount === undefined
          && (source[0].currencyCode !== destination[0].currencyCode
            || transfer.currencyCode !== account.currencyCode))) {
        return unavailable('Transfer account-currency amount not verified');
      }
      const amount = explicitAmount ?? transfer.amount;
      const units = toUnits(amount);
      if (units === null || amount <= 0) return unavailable('Invalid or unsafe transfer amount');
      movements.push({ date: transfer.date, units: outgoing ? -units : units });
    }
    let openingUnits = initial;
    let closingUnits = initial;
    // Check intermediate sums even if subsequent movements cancel them.
    for (const movement of movements.sort((a, b) => a.date.localeCompare(b.date))) {
      if (movement.date < period.from) openingUnits += movement.units;
      if (movement.date <= period.to) closingUnits += movement.units;
      if (!Number.isSafeInteger(openingUnits) || !Number.isSafeInteger(closingUnits)) {
        return unavailable('Unsafe calculated balance');
      }
    }
    const changeUnits = closingUnits - openingUnits;
    if (!Number.isSafeInteger(changeUnits)) return unavailable('Unsafe calculated change');
    const openingBalance = openingUnits / factor;
    const closingBalance = closingUnits / factor;
    const change = changeUnits / factor;

    return {
      accountId: account.id,
      accountName: account.name,
      currencyCode: account.currencyCode,
      archived: account.archived,
      status: 'available',
      openingBalance,
      closingBalance,
      change,
    };
  });
}