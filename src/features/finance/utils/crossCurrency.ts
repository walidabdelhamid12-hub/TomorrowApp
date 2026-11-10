import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import { roundMoney } from './finance';
import { isValidHistoricalFx } from './historicalFx';
import type { HistoricalFxSnapshot } from '../types/ledger';

export interface CrossCurrencyInput {
  originalAmount: number;
  originalCurrencyCode: string;
  accountCurrencyCode: string;
  transactionDate: string;
  originalFx: HistoricalFxSnapshot;
  accountFx: HistoricalFxSnapshot;
  actualAccountAmount?: number;
}

export interface CrossCurrencyResult {
  estimatedAccountAmount: number;
  accountAmount: number;
  historicalCrossRate: number;
  effectiveAccountRate: number;
  usedActualAmount: boolean;
}

export function calculateCrossCurrency(
  input: CrossCurrencyInput,
): CrossCurrencyResult | null {
  const {
    originalAmount, originalCurrencyCode, accountCurrencyCode,
    transactionDate, originalFx, accountFx, actualAccountAmount,
  } = input;

  if (
    !isSupportedCurrency(originalCurrencyCode) ||
    !isSupportedCurrency(accountCurrencyCode) ||
    !Number.isFinite(originalAmount) ||
    originalAmount <= 0 ||
    !isValidHistoricalFx(originalFx, originalCurrencyCode, transactionDate) ||
    !isValidHistoricalFx(accountFx, accountCurrencyCode, transactionDate)
  ) return null;

  const originalDecimals = getCurrencyDecimals(originalCurrencyCode);
  const accountDecimals = getCurrencyDecimals(accountCurrencyCode);
  if (roundMoney(originalAmount, originalDecimals) !== originalAmount) return null;

  if (actualAccountAmount !== undefined && (
    !Number.isFinite(actualAccountAmount) ||
    actualAccountAmount <= 0 ||
    roundMoney(actualAccountAmount, accountDecimals) !== actualAccountAmount
  )) return null;

  const historicalCrossRate = originalFx.rate / accountFx.rate;
  const estimatedAccountAmount = roundMoney(
    originalAmount * historicalCrossRate,
    accountDecimals,
  );
  const accountAmount = actualAccountAmount ?? estimatedAccountAmount;

  if (
    !Number.isFinite(historicalCrossRate) ||
    historicalCrossRate <= 0 ||
    !Number.isFinite(estimatedAccountAmount) ||
    estimatedAccountAmount <= 0 ||
    !Number.isFinite(accountAmount) ||
    accountAmount <= 0
  ) return null;

  return {
    estimatedAccountAmount,
    accountAmount,
    historicalCrossRate,
    effectiveAccountRate: accountAmount / originalAmount,
    usedActualAmount: actualAccountAmount !== undefined,
  };
}
/**
 * Display rate: transaction-currency units per one account-currency unit.
 * Both inputs are historical EGP-anchor snapshots for the same date.
 * This is a derived display value, not independent API evidence.
 */
export function calculateDirectHistoricalRate(
  originalFx: HistoricalFxSnapshot,
  accountFx: HistoricalFxSnapshot,
  originalCurrencyCode: string,
  accountCurrencyCode: string,
  transactionDate: string,
): number | null {
  if (
    !isValidHistoricalFx(originalFx, originalCurrencyCode, transactionDate) ||
    !isValidHistoricalFx(accountFx, accountCurrencyCode, transactionDate)
  ) {
    return null;
  }

  const rate = accountFx.rate / originalFx.rate;

  return Number.isFinite(rate) && rate > 0 ? rate : null;
}