import { getCurrencyDecimals, isSupportedCurrency } from '@/features/finance/constants/currencies';
import type {
  InstallmentCalculationInput,
  InstallmentCalculationResult,
  InstallmentContract,
  InstallmentDueDateStatus,
  InstallmentMoney,
  InstallmentPaymentStatus,
} from '@/features/finance/types/installments';
import { isValidISODate } from '@/features/finance/utils/input';

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identifier(value: string, field: string): void {
  requireValid(typeof value === 'string' && value.length > 0 && value === value.trim(), 'Invalid ' + field);
}

function date(value: string, field: string): void {
  requireValid(typeof value === 'string' && isValidISODate(value), 'Invalid ' + field);
}

function currency(code: string): number {
  requireValid(typeof code === 'string' && code === code.trim().toUpperCase() && isSupportedCurrency(code), 'Unsupported or noncanonical currency');
  return getCurrencyDecimals(code);
}

/** Reject excess precision rather than silently changing the contractual obligation. */
function units(amount: InstallmentMoney, decimals: number): bigint {
  requireValid(typeof amount === 'string' && /^\d+(?:\.\d+)?$/.test(amount), 'Invalid decimal amount');
  const [whole, fraction = ''] = amount.split('.');
  requireValid(fraction.length <= decimals, 'Amount exceeds currency precision');
  const result = BigInt(whole + fraction.padEnd(decimals, '0'));
  requireValid(result > 0n, 'Amount must be positive');
  return result;
}

function money(value: bigint, decimals: number): InstallmentMoney {
  const digits = value.toString().padStart(decimals + 1, '0');
  return decimals ? digits.slice(0, -decimals) + '.' + digits.slice(-decimals) : digits;
}

/** Throws on invalid contracts; no input is normalized, reordered or changed. */
export function validateInstallmentContract(contract: InstallmentContract): void {
  requireValid(contract && typeof contract === 'object', 'Invalid contract');
  identifier(contract.id, 'contract ID');
  const decimals = currency(contract.currencyCode);
  const total = units(contract.totalAmount, decimals);
  const owner = contract.accountingOwnership;
  requireValid(owner && typeof owner === 'object', 'Accounting ownership is required');
  if (owner.kind === 'standalone') {
    requireValid(owner.liabilityOwner === 'installment_contract' && !('loanId' in owner) && !('debtId' in owner), 'Invalid standalone ownership');
  } else if (owner.kind === 'linked_loan') {
    requireValid(owner.liabilityOwner === 'loan' && !('debtId' in owner), 'Invalid linked loan ownership');
    identifier(owner.loanId, 'loan ID');
  } else if (owner.kind === 'linked_debt') {
    requireValid(owner.liabilityOwner === 'debt' && !('loanId' in owner), 'Invalid linked debt ownership');
    identifier(owner.debtId, 'debt ID');
  } else throw new Error('Invalid accounting ownership');

  requireValid(Array.isArray(contract.schedule) && contract.schedule.length > 0, 'Schedule must not be empty');
  const ids = new Set<string>();
  let scheduled = 0n;
  let downPayments = 0;
  for (const item of contract.schedule) {
    requireValid(item && typeof item === 'object', 'Invalid schedule item');
    identifier(item.id, 'installment ID');
    requireValid(!ids.has(item.id), 'Duplicate installment ID');
    ids.add(item.id);
    requireValid(item.contractId === contract.id, 'Installment contract mismatch');
    requireValid(['regular', 'irregular', 'down_payment'].includes(item.kind), 'Invalid installment kind');
    if (item.kind === 'down_payment') downPayments++;
    date(item.dueDate, 'due date');
    scheduled += units(item.amount, decimals);
  }
  requireValid(downPayments <= 1, 'Duplicate down payment');
  requireValid(scheduled === total, 'Scheduled amount does not match contract total');
}

/** Date status deliberately does not accept or inspect payment status. */
export function getInstallmentDueDateStatus(dueDate: string, asOf: string): InstallmentDueDateStatus {
  date(dueDate, 'due date');
  date(asOf, 'as-of date');
  return dueDate < asOf ? 'overdue' : dueDate === asOf ? 'due_today' : 'upcoming';
}

/**
 * Pure, single-currency snapshot. All amounts are exact fixed-precision strings.
 * Rejects malformed/unmatched evidence and lifetime overpayments, even after asOf.
 * Only matched trusted confirmations dated on/before asOf affect this snapshot.
 */
export function calculateInstallments(input: InstallmentCalculationInput): InstallmentCalculationResult {
  validateInstallmentContract(input.contract);
  date(input.asOf, 'as-of date');
  requireValid(Array.isArray(input.payments) && Array.isArray(input.trustedConfirmations), 'Payments and trusted confirmations must be arrays');
  const { contract } = input;
  const decimals = currency(contract.currencyCode);
  const schedule = new Map(contract.schedule.map(item => [item.id, item]));
  const payments = new Map<string, InstallmentCalculationInput['payments'][number]>();
  const references = new Set<string>();
  for (const payment of input.payments) {
    requireValid(payment && typeof payment === 'object', 'Invalid payment');
    identifier(payment.id, 'payment ID');
    identifier(payment.paymentReference, 'payment reference');
    requireValid(!payments.has(payment.id), 'Duplicate payment ID');
    requireValid(!references.has(payment.paymentReference), 'Duplicate payment reference');
    requireValid(payment.contractId === contract.id && schedule.has(payment.installmentId), 'Payment contract or installment mismatch');
    requireValid(payment.currencyCode === contract.currencyCode, 'Payment currency mismatch');
    date(payment.paidOn, 'payment date');
    const amount = units(payment.amount, decimals);
    requireValid(amount <= units(schedule.get(payment.installmentId)!.amount, decimals), 'Installment overpayment');
    payments.set(payment.id, payment);
    references.add(payment.paymentReference);
  }

  const evidenceIds = new Set<string>();
  const confirmedIds = new Set<string>();
  const lifetimePaid = new Map<string, bigint>();
  const paidAsOf = new Map<string, bigint>();
  for (const evidence of input.trustedConfirmations) {
    requireValid(evidence && typeof evidence === 'object' && evidence.kind === 'trusted_confirmation', 'Invalid trusted confirmation');
    identifier(evidence.evidenceId, 'evidence ID');
    requireValid(!evidenceIds.has(evidence.evidenceId), 'Duplicate evidence ID');
    requireValid(!confirmedIds.has(evidence.paymentId), 'Duplicate payment confirmation');
    const payment = payments.get(evidence.paymentId);
    requireValid(payment, 'Confirmation has no matching payment');
    requireValid(evidence.contractId === payment.contractId && evidence.installmentId === payment.installmentId &&
      evidence.paymentReference === payment.paymentReference && evidence.currencyCode === payment.currencyCode &&
      evidence.paidOn === payment.paidOn && units(evidence.amount, decimals) === units(payment.amount, decimals), 'Confirmation does not match payment');
    const amount = units(payment.amount, decimals);
    const lifetime = (lifetimePaid.get(payment.installmentId) ?? 0n) + amount;
    requireValid(lifetime <= units(schedule.get(payment.installmentId)!.amount, decimals), 'Installment overpayment');
    lifetimePaid.set(payment.installmentId, lifetime);
    if (payment.paidOn <= input.asOf) paidAsOf.set(payment.installmentId, (paidAsOf.get(payment.installmentId) ?? 0n) + amount);
    evidenceIds.add(evidence.evidenceId);
    confirmedIds.add(evidence.paymentId);
  }

  let confirmedPaid = 0n;
  let overdue = 0n;
  const installments = contract.schedule.map(item => {
    const paid = paidAsOf.get(item.id) ?? 0n;
    const amount = units(item.amount, decimals);
    const remaining = amount - paid;
    confirmedPaid += paid;
    const dueDateStatus = getInstallmentDueDateStatus(item.dueDate, input.asOf);
    if (dueDateStatus === 'overdue') overdue += remaining;
    const paymentStatus: InstallmentPaymentStatus = paid === 0n ? 'unpaid' : remaining === 0n ? 'paid' : 'partial';
    return { installment: { ...item }, confirmedPaid: money(paid, decimals), remaining: money(remaining, decimals), paymentStatus, dueDateStatus };
  });
  const unpaid = installments.filter(item => item.paymentStatus !== 'paid').map(item => item.installment);
  // Explicit ID tie-breaker makes the answer independent of supplied row ordering.
  unpaid.sort((a, b) => a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const total = units(contract.totalAmount, decimals);
  return {
    currencyCode: contract.currencyCode,
    totalScheduled: money(total, decimals),
    confirmedPaid: money(confirmedPaid, decimals),
    remaining: money(total - confirmedPaid, decimals),
    overdue: money(overdue, decimals),
    nextUnpaid: unpaid[0] ?? null,
    installments,
  };
}

export function getTotalScheduledAmount(contract: InstallmentContract): InstallmentMoney {
  validateInstallmentContract(contract);
  return money(units(contract.totalAmount, currency(contract.currencyCode)), currency(contract.currencyCode));
}

export function getConfirmedPaidAmount(input: InstallmentCalculationInput): InstallmentMoney {
  return calculateInstallments(input).confirmedPaid;
}

export function getRemainingContractBalance(input: InstallmentCalculationInput): InstallmentMoney {
  return calculateInstallments(input).remaining;
}

export function getOverdueInstallmentAmount(input: InstallmentCalculationInput): InstallmentMoney {
  return calculateInstallments(input).overdue;
}

export function getNextUnpaidInstallment(input: InstallmentCalculationInput) {
  return calculateInstallments(input).nextUnpaid;
}

function installmentBalance(input: InstallmentCalculationInput, installmentId: string) {
  const balance = calculateInstallments(input).installments.find(item => item.installment.id === installmentId);
  requireValid(balance, 'Unknown installment ID');
  return balance;
}

export function getRemainingInstallmentAmount(input: InstallmentCalculationInput, installmentId: string): InstallmentMoney {
  return installmentBalance(input, installmentId).remaining;
}

export function getInstallmentPaymentStatus(input: InstallmentCalculationInput, installmentId: string): InstallmentPaymentStatus {
  return installmentBalance(input, installmentId).paymentStatus;
}
