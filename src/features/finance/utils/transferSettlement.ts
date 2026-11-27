import type { Account, Category, LedgerData, NewTransferInput, Transaction, Transfer } from '../types/ledger';
import { getCurrencyDecimals, isSupportedCurrency } from '../constants/currencies';
import { evaluateExactAmountExpression, exactAmountToNumber } from './exactAmountArithmetic';
import { isValidISODate } from './input';

type Ledger = Pick<LedgerData, 'accounts' | 'categories' | 'transactions' | 'transfers'>;
type SettlementInput = Pick<NewTransferInput, 'fromAmount' | 'toAmount' | 'fromCurrencyCode' | 'toCurrencyCode' | 'exchangeRate' | 'feeAmount' | 'feeCategoryId' | 'actualReceivedConfirmed'>;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !/[\s\u0000-\u001f\u007f]/u.test(v);

export const TRANSFER_FEES_CATEGORY: Category = { id: 'cat_transfer_fees', name: 'Transfer Fees', kind: 'expense', icon: 'swap-horizontal-outline', color: '#B59A5E', isDefault: true };

/** Create the default only as part of the explicitly confirmed transfer's atomic ledger update. */
export function categoriesForTransferFee(input: NewTransferInput, ledger: Ledger): Category[] {
  if (!(input.feeAmount && input.feeAmount > 0) || input.feeCategoryId !== TRANSFER_FEES_CATEGORY.id || ledger.categories.some(c => c.id === TRANSFER_FEES_CATEGORY.id)) return ledger.categories;
  if ([...ledger.accounts, ...ledger.transactions, ...ledger.transfers].some(row => row.id === TRANSFER_FEES_CATEGORY.id)) return ledger.categories;
  return [...ledger.categories, { ...TRANSFER_FEES_CATEGORY }];
}

/** No rounding, exponent bypass or unsafe numeric coercion. */
export function settlementMinor(value: unknown, currency: string): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !isSupportedCurrency(currency)) return null;
  if (value === 0) return 0n;
  const exact = evaluateExactAmountExpression(String(value));
  const decimals = getCurrencyDecimals(currency);
  if (!exact || exactAmountToNumber(exact, decimals) !== value) return null;
  const scaled = exact.numerator * 10n ** BigInt(decimals);
  return scaled % exact.denominator === 0n ? scaled / exact.denominator : null;
}

export function isEnhancedSettlement(input: SettlementInput): boolean {
  return input.actualReceivedConfirmed === true || (input.feeAmount ?? 0) > 0;
}

/** Existing quote-only flows keep their original behavior. Enhanced flows use exact confirmed legs. */
export function validSettlementOptions(input: SettlementInput, source: Account, destination: Account): boolean {
  if (input.actualReceivedConfirmed !== undefined && input.actualReceivedConfirmed !== true) return false;
  if (input.feeAmount !== undefined && settlementMinor(input.feeAmount, source.currencyCode) === null) return false;
  const fee = input.feeAmount ?? 0;
  if ((fee > 0 && !id(input.feeCategoryId)) || (fee === 0 && input.feeCategoryId !== undefined)) return false;
  if (!isEnhancedSettlement(input)) return true;
  if (input.fromCurrencyCode !== source.currencyCode || input.toCurrencyCode !== destination.currencyCode || !positive(input.exchangeRate)) return false;
  const from = settlementMinor(input.fromAmount, source.currencyCode);
  const to = settlementMinor(input.toAmount, destination.currencyCode);
  const feeMinor = settlementMinor(fee, source.currencyCode);
  if (from === null || from <= 0n || to === null || to <= 0n || feeMinor === null) return false;
  const total = from + feeMinor;
  const factor = 10n ** BigInt(getCurrencyDecimals(source.currencyCode));
  if (exactAmountToNumber({ numerator: total, denominator: factor }, getCurrencyDecimals(source.currencyCode)) === null) return false;
  if (source.currencyCode === destination.currencyCode) return from === to && input.exchangeRate === 1;
  return input.actualReceivedConfirmed === true && positive(input.toAmount / input.fromAmount);
}

export function canFundEnhancedSettlement(input: SettlementInput, source: Account, transactions: Transaction[], transfers: Transfer[]): boolean {
  const minor = (v: number) => settlementMinor(v, source.currencyCode);
  if (!Number.isFinite(source.initialBalance)) return false;
  const opening = minor(Math.abs(source.initialBalance));
  if (opening === null) return false;
  let balance = source.initialBalance < 0 ? -opening : opening;
  for (const tx of transactions) {
    if (tx.accountId !== source.id) continue;
    const amount = minor(tx.amount);
    if (amount === null || tx.currencyCode !== source.currencyCode || !['income', 'expense'].includes(tx.type)) return false;
    balance += tx.entryType === 'refund' || tx.type === 'income' ? amount : -amount;
  }
  for (const transfer of transfers) {
    const outgoing = transfer.fromAccountId === source.id;
    const incoming = transfer.toAccountId === source.id;
    if (!outgoing && !incoming) continue;
    if (outgoing && incoming) return false;
    const amount = minor(outgoing ? transfer.fromAmount ?? transfer.amount : transfer.toAmount ?? transfer.amount);
    const currency = outgoing ? transfer.fromCurrencyCode ?? transfer.currencyCode : transfer.toCurrencyCode ?? transfer.currencyCode;
    if (amount === null || currency !== source.currencyCode) return false;
    balance += outgoing ? -amount : amount;
  }
  const principal = minor(input.fromAmount);
  const fee = minor(input.feeAmount ?? 0);
  return principal !== null && fee !== null && balance >= principal + fee;
}

export function isTransferFeeClaim(tx: Transaction, ledger: Pick<LedgerData, 'transfers'>): boolean {
  return tx.purpose === 'transfer_fee' || tx.linkedEntityType === 'transfer' || ledger.transfers.some(t => t.feeTransactionId === tx.id);
}

/** Validate only new settlement metadata. Do not reinterpret existing legacy transfers. */
export function transferSettlementProblem(ledger: Ledger, transfer: Transfer): string | null {
  const enhanced = transfer.actualReceivedConfirmed !== undefined || transfer.quotedExchangeRate !== undefined || transfer.feeAmount !== undefined || transfer.feeTransactionId !== undefined;
  const claims = ledger.transactions.filter(tx => tx.linkedEntityType === 'transfer' && tx.linkedEntityId === transfer.id);
  if (!enhanced && claims.length === 0) return null;
  const src = ledger.accounts.filter(a => a.id === transfer.fromAccountId);
  const dst = ledger.accounts.filter(a => a.id === transfer.toAccountId);
  if (!id(transfer.id) || ledger.transfers.filter(t => t.id === transfer.id).length !== 1 ||
      src.length !== 1 || dst.length !== 1 || src[0].id === dst[0].id ||
      !isValidISODate(transfer.date) || transfer.amount !== transfer.fromAmount || transfer.currencyCode !== src[0].currencyCode ||
      transfer.fromCurrencyCode !== src[0].currencyCode || transfer.toCurrencyCode !== dst[0].currencyCode ||
      transfer.fromAmount === undefined || transfer.toAmount === undefined ||
      !['internal', 'credit_card_payment'].includes(transfer.type)) return 'Invalid enhanced transfer identity or cash legs';
  if (transfer.type === 'credit_card_payment' ? src[0].type === 'credit_card' || dst[0].type !== 'credit_card' || src[0].currencyCode !== dst[0].currencyCode : src[0].type === 'credit_card' || dst[0].type === 'credit_card') return 'Invalid enhanced transfer account types';
  if (transfer.actualReceivedConfirmed !== undefined && transfer.actualReceivedConfirmed !== true) return 'Invalid actual-credit confirmation';
  if (transfer.actualReceivedConfirmed === true) {
    if (!positive(transfer.quotedExchangeRate) || transfer.exchangeRate !== transfer.toAmount / transfer.fromAmount) return 'Invalid quoted/effective FX evidence';
  } else if (transfer.quotedExchangeRate !== undefined || src[0].currencyCode !== dst[0].currencyCode) return 'Actual received evidence required';
  const fee = transfer.feeAmount;
  const feeId = transfer.feeTransactionId;
  const hasFee = fee !== undefined || feeId !== undefined || claims.length !== 0;
  let categoryId: string | undefined;
  if (hasFee) {
    const matches = ledger.transactions.filter(tx => tx.id === feeId);
    if (!positive(fee) || !id(feeId) || matches.length !== 1 || claims.length !== 1 || claims[0] !== matches[0] ||
        ledger.transfers.filter(t => t.feeTransactionId === feeId).length !== 1 ||
        [...ledger.accounts, ...ledger.categories, ...ledger.transfers].some(row => row.id === feeId)) return 'Missing or conflicting transfer fee ownership';
    const tx = matches[0];
    const categories = ledger.categories.filter(c => c.id === tx.categoryId);
    if (tx.purpose !== 'transfer_fee' || tx.linkedEntityType !== 'transfer' || tx.linkedEntityId !== transfer.id ||
        tx.type !== 'expense' || tx.entryType !== 'normal' || tx.amount !== fee || tx.currencyCode !== src[0].currencyCode ||
        tx.accountId !== src[0].id || tx.date !== transfer.date || tx.linkedPaymentId !== undefined || tx.relatedTransactionId !== undefined ||
        tx.originalAmount !== undefined || tx.originalCurrencyCode !== undefined || tx.accountFxRate !== undefined ||
        tx.historicalFx !== undefined || tx.accountFxSnapshot !== undefined || tx.directHistoricalFx !== undefined ||
        categories.length !== 1 || categories[0].kind !== 'expense' ||
        ledger.transactions.some(row => row.relatedTransactionId === feeId)) return 'Invalid linked transfer fee expense';
    categoryId = tx.categoryId;
  } else if (transfer.actualReceivedConfirmed !== true) return 'Unrecognized settlement metadata';
  if (!validSettlementOptions({ fromAmount: transfer.fromAmount, toAmount: transfer.toAmount, fromCurrencyCode: src[0].currencyCode, toCurrencyCode: dst[0].currencyCode,
    exchangeRate: transfer.actualReceivedConfirmed ? transfer.quotedExchangeRate! : transfer.exchangeRate!, actualReceivedConfirmed: transfer.actualReceivedConfirmed, feeAmount: fee, feeCategoryId: categoryId }, src[0], dst[0])) return 'Invalid transfer precision, currency or fee';
  return null;
}

export function verifiedFeeOwner(tx: Transaction, ledger: Ledger): Transfer | null {
  if (!isTransferFeeClaim(tx, ledger)) return null;
  const owners = ledger.transfers.filter(t => t.feeTransactionId === tx.id);
  return owners.length === 1 && ledger.transactions.filter(t => t.id === tx.id).length === 1 &&
    ledger.transactions.find(t => t.id === tx.id) === tx && !transferSettlementProblem(ledger, owners[0]) ? owners[0] : null;
}

/** Use during hydration/readback; malformed pairs retain original evidence and block further writes. */
export function assertTransferSettlementEvidence(ledger: Ledger): void {
  for (const transfer of ledger.transfers) {
    const problem = transferSettlementProblem(ledger, transfer);
    if (problem) throw new Error(`Transfer ${transfer.id}: ${problem}`);
  }
  for (const tx of ledger.transactions) if (isTransferFeeClaim(tx, ledger) && !verifiedFeeOwner(tx, ledger)) {
    throw new Error(`Unverified transfer fee ${tx.id}`);
  }
}

/** Both records are prepared before a single ledger set. No mutation or posting in this helper. */
export function attachTransferSettlement(base: Transfer, input: NewTransferInput, ledger: Ledger, timestamp: string, previousFee?: Transaction): { transfer: Transfer; fee: Transaction | null } | null {
  const feeAmount = input.feeAmount ?? 0;
  const transfer: Transfer = input.actualReceivedConfirmed === true ? { ...base, actualReceivedConfirmed: true, quotedExchangeRate: input.exchangeRate, exchangeRate: input.toAmount / input.fromAmount } : { ...base };
  if (!feeAmount) return { transfer, fee: null };
  const categories = ledger.categories.filter(c => c.id === input.feeCategoryId && c.kind === 'expense');
  if (categories.length !== 1 || (categories[0].archived && previousFee?.categoryId !== categories[0].id)) return null;
  const feeId = previousFee?.id ?? `transfer-fee:${transfer.id}`;
  if ([...ledger.accounts, ...ledger.categories, ...ledger.transfers].some(row => row.id === feeId) ||
      ledger.transactions.some(tx => tx.id === feeId && tx !== previousFee)) return null;
  const fee: Transaction = { id: feeId, type: 'expense', entryType: 'normal', purpose: 'transfer_fee', linkedEntityType: 'transfer', linkedEntityId: transfer.id,
    amount: feeAmount, currencyCode: input.fromCurrencyCode, accountId: input.fromAccountId, categoryId: categories[0].id, date: input.date,
    note: 'Transfer fee', createdAt: previousFee?.createdAt ?? timestamp, updatedAt: timestamp };
  return { transfer: { ...transfer, feeAmount, feeTransactionId: feeId }, fee };
}
