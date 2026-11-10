import { isSupportedCurrency } from '../constants/currencies';
import type { DirectHistoricalFxSnapshot } from '../types/ledger';
import { isValidISODate } from './input';

export function isValidDirectHistoricalFx(
  snapshot: DirectHistoricalFxSnapshot | undefined,
  accountCurrencyCode: string,
  transactionCurrencyCode: string,
  transactionDate: string,
): boolean {
  if (!snapshot ||
      !isSupportedCurrency(accountCurrencyCode) ||
      !isSupportedCurrency(transactionCurrencyCode) ||
      accountCurrencyCode === transactionCurrencyCode ||
      !isValidISODate(transactionDate)) {
    return false;
  }

  return snapshot.accountCurrencyCode === accountCurrencyCode &&
    snapshot.transactionCurrencyCode === transactionCurrencyCode &&
    snapshot.rateDate === transactionDate &&
    Number.isFinite(snapshot.rate) &&
    snapshot.rate > 0 &&
    (snapshot.source === 'manual' ||
      snapshot.source === 'historical_api_derived');
}