
import { useMemo } from 'react';

import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import { getDebtRemaining, getLoanRemainingAmount, getLoanRemainingPrincipal, roundMoney, todayISO } from '@/features/finance/utils/finance';
import {
  filterByMonth,
  getAccountBalance,
  getMonthKey,
} from '@/features/finance/utils/ledger';
import { convertAmount } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';

/** All totals for the Finance screen, in the selected base currency. */
export function useFinanceSummary() {
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const rates = useCurrencyStore((s) => s.rates);
  const verifiedCurrencies = useCurrencyStore(
    (s) => s.verifiedCurrencies
  );

  const gold24PerGram = useCurrencyStore(
    (s) => s.metals.gold24PerGram
  );
  const silverPerGram = useCurrencyStore(
    (s) => s.metals.silverPerGram
  );

  const accounts = useLedgerStore((s) => s.accounts);
  const transactions = useLedgerStore((s) => s.transactions);
  const transfers = useLedgerStore((s) => s.transfers);

  const assets = useFinanceStore((s) => s.assets);
  const loans = useFinanceStore((s) => s.loans);
  const debts = useFinanceStore((s) => s.debts);
  const cheques = useFinanceStore((s) => s.cheques);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts]
  );

  const totals = useMemo(() => {
    let accountsTotal = 0;
    let assetsTotal = 0;
    let loansRemainingTotal = 0;
    let loansInstallmentsRemainingTotal = 0;
    let receivablesTotal = 0;
    let payablesTotal = 0;
    let chequesTotal = 0;
    let missing = 0;

    for (const account of activeAccounts) {
      const balance = getAccountBalance(
        account,
        transactions,
        transfers
      );

      const converted = convertAmount(
        balance,
        account.currencyCode,
        baseCurrency,
        rates,
        verifiedCurrencies
      );

      if (converted === null) {
        missing += 1;
      } else {
        accountsTotal += converted;
      }
    }

    for (const asset of assets) {
      const value = getAssetValueInBase(
        asset,
        baseCurrency,
        rates,
        gold24PerGram,
        silverPerGram,
        verifiedCurrencies
      );

      if (value === null) {
        missing += 1;
      } else {
        assetsTotal += value;
      }
    }

    for (const loan of loans) {
      // A loan is a liability only after its proceeds are confirmed as received.
      // Closing without payment is an explicit write-off/closure action in this app.
      if (
        (!loan.receivedAt && !loan.receiptTransactionId) ||
        loan.status === 'closed'
      ) {
        continue;
      }

      // Net Worth deducts principal only; contractual obligations are separate.
      const remainingContract = getLoanRemainingAmount(loan);
      const remainingPrincipal = getLoanRemainingPrincipal(loan);

      if (!Number.isFinite(remainingContract)) {
        missing += 1;
        continue;
      }
      const principalConverted = convertAmount(
        remainingPrincipal ?? NaN,
        loan.currencyCode,
        baseCurrency,
        rates,
        verifiedCurrencies
      );

      if (principalConverted === null) {
        missing += 1;
      } else {
        loansRemainingTotal += principalConverted;
      }
      const contractualConverted = convertAmount(remainingContract, loan.currencyCode, baseCurrency, rates, verifiedCurrencies);
      if (contractualConverted === null) missing += 1;
      else loansInstallmentsRemainingTotal += contractualConverted;
    }

    for (const debt of debts) {
      if (
        typeof debt.amount !== 'number' ||
        !Number.isFinite(debt.amount)
      ) {
        missing += 1;
        continue;
      }

      const remainingAmount = getDebtRemaining(debt);

      const converted = convertAmount(
        remainingAmount,
        debt.currencyCode,
        baseCurrency,
        rates,
        verifiedCurrencies
      );

      if (converted === null) {
        missing += 1;
        continue;
      }

      if (debt.direction === 'receivable') {
        receivablesTotal += converted;
      } else if (debt.direction === 'payable') {
        payablesTotal += converted;
      }
    }

    // Only outstanding cheques are included in this separate total.
    // Paid, bounced, and cancelled cheques are excluded.
    for (const cheque of cheques) {
      if (cheque.status !== 'pending') {
        continue;
      }

      if (
        typeof cheque.amount !== 'number' ||
        !Number.isFinite(cheque.amount)
      ) {
        missing += 1;
        continue;
      }

      const converted = convertAmount(
        cheque.amount,
        cheque.currencyCode,
        baseCurrency,
        rates,
        verifiedCurrencies
      );

      if (converted === null) {
        missing += 1;
      } else {
        chequesTotal += converted;
      }
    }

    return {
      accountsTotal: roundMoney(accountsTotal),
      // Asset values stay unquantized until monetary display, including their subtotal.
      assetsTotal,
      loansRemainingTotal: roundMoney(loansRemainingTotal),
      loansInstallmentsRemainingTotal: roundMoney(loansInstallmentsRemainingTotal),
      receivablesTotal: roundMoney(receivablesTotal),
      payablesTotal: roundMoney(payablesTotal),
      chequesTotal: roundMoney(chequesTotal),
      missing,
    };
  }, [
    activeAccounts,
    assets,
    loans,
    debts,
    cheques,
    transactions,
    transfers,
    baseCurrency,
    rates,
    verifiedCurrencies,
    gold24PerGram,
    silverPerGram,
  ]);

  // Credit-card debt is already represented by the negative
  // account balance, so it must not be subtracted a second time.
  const netWorth = (
    totals.accountsTotal +
      totals.assetsTotal +
      totals.receivablesTotal -
      totals.payablesTotal -
      totals.loansRemainingTotal
  );

  const month = useMemo(() => {
    let income = 0;
    let expense = 0;
    let missing = 0;

    const key = getMonthKey(todayISO());

    for (const transaction of filterByMonth(transactions, key)) {
      const converted = convertAmount(
        transaction.amount,
        transaction.currencyCode,
        baseCurrency,
        rates,
        verifiedCurrencies
      );

      if (converted === null) {
        missing += 1;
        continue;
      }

      if (transaction.entryType === 'refund') {
        expense -= converted;
      } else if (transaction.type === 'income') {
        income += converted;
      } else {
        expense += converted;
      }
    }

    return {
      income: roundMoney(income),
      expense: roundMoney(Math.max(expense, 0)),
      missing,
    };
  }, [
    transactions,
    baseCurrency,
    rates,
    verifiedCurrencies,
  ]);

  const missing = totals.missing + month.missing;

  return {
    baseCurrency,
    rates,
    gold24PerGram,
    activeAccounts,
    accountsTotal: totals.accountsTotal,
    assetsTotal: totals.assetsTotal,
    loansRemainingTotal: totals.loansRemainingTotal,
    loansInstallmentsRemainingTotal:
      totals.loansInstallmentsRemainingTotal,
    receivablesTotal: totals.receivablesTotal,
    payablesTotal: totals.payablesTotal,
    chequesTotal: totals.chequesTotal,
    total: netWorth,
    netWorth,
    missing,
    isComplete: missing === 0,
    income: month.income,
    expense: month.expense,
    monthlyMissing: month.missing,
  };
}
