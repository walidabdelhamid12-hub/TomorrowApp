import type { Transaction } from '../types/ledger';
import type { DebtPayment, FinanceData } from '../types/finance';
import type { LedgerData } from '../types/ledger';
import { settlementMinor } from './transferSettlement';
import { isValidCrossCurrencyMetadata } from './crossCurrencyMetadata';
import { isValidISODate } from './input';

export interface DebtPaymentFx { actualAmount: number; quotedRate: number }
export type DebtFxFields = Pick<Transaction, 'amount' | 'originalAmount' | 'originalCurrencyCode' | 'accountFxRate' | 'directHistoricalFx'>;

/** Separate cash amount and obligation amount; never derive a debit from a quote. */
export function buildDebtPaymentFx(amount: number, debtCurrency: string, accountCurrency: string, date: string, fx: DebtPaymentFx): DebtFxFields | null {
  if (!fx || typeof fx !== 'object' || debtCurrency === accountCurrency || !isValidISODate(date)) return null;
  const original = settlementMinor(amount, debtCurrency), actual = settlementMinor(fx.actualAmount, accountCurrency);
  if (original === null || original <= 0n || actual === null || actual <= 0n || typeof fx.quotedRate !== 'number' || !Number.isFinite(fx.quotedRate) || fx.quotedRate <= 0) return null;
  const result: DebtFxFields = { amount: fx.actualAmount, originalAmount: amount, originalCurrencyCode: debtCurrency,
    accountFxRate: fx.actualAmount / amount, directHistoricalFx: { source: 'manual', accountCurrencyCode: accountCurrency,
      transactionCurrencyCode: debtCurrency, rate: fx.quotedRate, rateDate: date } };
  return isValidCrossCurrencyMetadata({ ...result, date, currencyCode: accountCurrency }) ? result : null;
}

export function verifiedDebtPaymentFx(payment: DebtPayment, debtCurrency: string, tx: Transaction, accountCurrency: string): boolean {
  if (tx.currencyCode !== accountCurrency || tx.accountId !== payment.accountId || tx.date !== payment.date || tx.directHistoricalFx?.source !== 'manual') return false;
  const expected = buildDebtPaymentFx(payment.amount, debtCurrency, accountCurrency, payment.date, { actualAmount: tx.amount, quotedRate: tx.directHistoricalFx.rate });
  return !!expected && tx.originalAmount === expected.originalAmount && tx.originalCurrencyCode === expected.originalCurrencyCode
    && tx.accountFxRate === expected.accountFxRate && isValidCrossCurrencyMetadata(tx);
}

/** Managed/dormant journal generations retain their existing exact same-currency protocol. */
export function allowsLegacyDebtFx(finance: FinanceData, ledger: LedgerData): boolean {
  return finance.paymentJournal === undefined && ledger.paymentJournal === undefined
    && finance.paymentAccounting === undefined && ledger.paymentAccounting === undefined && finance.creationProvenance === undefined;
}
