import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import { isValidHistoricalFx } from './historicalFx';
import { isValidDirectHistoricalFx } from './directHistoricalFx';
import { roundMoney } from './finance';
import type { Transaction } from '../types/ledger';

type Metadata = Pick<Transaction,
  'amount' | 'currencyCode' | 'date' | 'originalAmount' |
  'originalCurrencyCode' | 'accountFxRate' | 'accountFxSnapshot' |
  'historicalFx' | 'directHistoricalFx'
>;

export function isValidCrossCurrencyMetadata(input: Metadata): boolean {
  const fields = [
    input.originalAmount,
    input.originalCurrencyCode,
    input.accountFxRate,
    input.accountFxSnapshot,
  ];

  const direct = input.directHistoricalFx;

  if (direct !== undefined) {
    // Direct manual evidence must not be mixed with historical EGP anchors.
    if (direct.source !== 'manual' ||
        input.accountFxSnapshot !== undefined ||
        input.historicalFx !== undefined ||
        input.originalAmount === undefined ||
        input.originalCurrencyCode === undefined ||
        input.accountFxRate === undefined) {
      return false;
    }

    const originalAmount = input.originalAmount;
    const originalCurrency = input.originalCurrencyCode;
    const accountCurrency = input.currencyCode;

    if (!isValidDirectHistoricalFx(
          direct,
          accountCurrency,
          originalCurrency,
          input.date,
        ) ||
        !Number.isFinite(originalAmount) ||
        originalAmount <= 0 ||
        !Number.isFinite(input.amount) ||
        input.amount <= 0 ||
        roundMoney(
          originalAmount,
          getCurrencyDecimals(originalCurrency),
        ) !== originalAmount ||
        roundMoney(
          input.amount,
          getCurrencyDecimals(accountCurrency),
        ) !== input.amount ||
        !Number.isFinite(input.accountFxRate) ||
        input.accountFxRate <= 0) {
      return false;
    }

    const effectiveRate = input.amount / originalAmount;

    return Number.isFinite(effectiveRate) &&
      Math.abs(effectiveRate - input.accountFxRate) <=
        1e-9 * Math.max(1, effectiveRate);
  }

  if (fields.every(value => value === undefined)) return true;
  if (fields.some(value => value === undefined)) return false;

  const originalAmount = input.originalAmount!;
  const originalCurrency = input.originalCurrencyCode!;
  const rate = input.accountFxRate!;
  const originalFx = input.accountFxSnapshot!;

  if (!isSupportedCurrency(originalCurrency) ||
      !isSupportedCurrency(input.currencyCode) ||
      originalCurrency === input.currencyCode ||
      !Number.isFinite(originalAmount) || originalAmount <= 0 ||
      !Number.isFinite(rate) || rate <= 0 ||
      !Number.isFinite(input.amount) || input.amount <= 0 ||
      roundMoney(originalAmount, getCurrencyDecimals(originalCurrency)) !== originalAmount ||
      roundMoney(input.amount, getCurrencyDecimals(input.currencyCode)) !== input.amount ||
      !isValidHistoricalFx(originalFx, originalCurrency, input.date) ||
      !input.historicalFx ||
      !isValidHistoricalFx(input.historicalFx, input.currencyCode, input.date)) return false;

  const expectedRate = originalFx.rate / input.historicalFx.rate;
  const effectiveRate = input.amount / originalAmount;

  return Number.isFinite(expectedRate) &&
    expectedRate > 0 &&
    Math.abs(effectiveRate - rate) <= 1e-9 * Math.max(1, effectiveRate);
}