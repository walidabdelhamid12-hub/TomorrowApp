import { useEffect, useMemo, useState } from 'react';

import {
    AppButton,
    AppInput,
    AppText,
    ChipSelect,
    DateField,
} from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import { ScanDocumentButton } from '@/features/finance/components/ScanDocumentButton';
import { getCurrencyLabel } from '@/features/finance/constants/currencies';
import type { ScanResult } from '@/features/finance/scanner/types';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type {
    Transaction,
    TransactionType,
} from '@/features/finance/types/ledger';
import { todayISO } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { moduleColors, useTheme } from '@/theme';
import { isValidISODate } from '@/utils/input';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pass a transaction to edit it, or null/undefined to add a new one. */
  transaction?: Transaction | null;
}

export function AddTransactionModal({
  visible,
  onClose,
  transaction,
}: AddTransactionModalProps) {
  const { colors, spacing } = useTheme();

  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const addTransaction = useLedgerStore((s) => s.addTransaction);
  const updateTransaction = useLedgerStore((s) => s.updateTransaction);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  // Fill (edit) or reset (add) every time the modal opens.
  useEffect(() => {
    if (!visible) return;
    setError(undefined);
    if (transaction) {
      setType(transaction.type);
      setAmount(String(transaction.amount));
      setAccountId(transaction.accountId);
      setCategoryId(transaction.categoryId);
      setDate(transaction.date);
      setNote(transaction.note ?? '');
    } else {
      setType('expense');
      setAmount('');
      setAccountId('');
      setCategoryId('');
      setDate(todayISO());
      setNote('');
    }
  }, [visible, transaction]);

  const selectableAccounts = useMemo(
    () =>
      accounts.filter((a) => !a.archived || a.id === transaction?.accountId),
    [accounts, transaction]
  );

  const kindCategories = useMemo(
    () => categories.filter((c) => c.kind === type),
    [categories, type]
  );

  // Fall back to the first valid option when the saved choice no longer fits.
  const activeAccountId = selectableAccounts.some((a) => a.id === accountId)
    ? accountId
    : (selectableAccounts[0]?.id ?? '');
  const activeCategoryId = kindCategories.some((c) => c.id === categoryId)
    ? categoryId
    : (kindCategories[0]?.id ?? '');

  const activeAccount = selectableAccounts.find((a) => a.id === activeAccountId);

  /** Pre-fills the form from a scanned cheque / receipt. The user still reviews it. */
  const applyScan = (result: ScanResult) => {
    if (result.amount !== undefined) setAmount(String(result.amount));
    if (result.date && isValidISODate(result.date)) setDate(result.date);
    if (result.merchant && !note.trim()) setNote(result.merchant);
    if (result.currencyCode) {
      const match = selectableAccounts.find(
        (a) => a.currencyCode === result.currencyCode
      );
      if (match) setAccountId(match.id);
    }
    setError(undefined);
  };

  const submit = () => {
    const value = parseAmount(amount);

    if (!activeAccount) {
      setError('Create an account first.');
      return;
    }
    if (value === null || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!isValidISODate(date)) {
      setError('Date must be a real date in the format YYYY-MM-DD.');
      return;
    }
    if (!activeCategoryId) {
      setError('Choose a category.');
      return;
    }

    if (transaction) {
      const ok = updateTransaction(transaction.id, {
        type,
        amount: value,
        accountId: activeAccount.id,
        categoryId: activeCategoryId,
        date,
        note: note.trim(),
      });
      if (!ok) {
        setError('Could not save the changes.');
        return;
      }
    } else {
      const id = addTransaction({
        type,
        amount: value,
        accountId: activeAccount.id,
        categoryId: activeCategoryId,
        date,
        note: note.trim() || undefined,
      });
      if (id === null) {
        setError('Could not add the transaction.');
        return;
      }
    }
    onClose();
  };

  return (
    <FormModal
      visible={visible}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      onClose={onClose}
    >
      {selectableAccounts.length === 0 ? (
        <AppText color="textSecondary">
          You need at least one account before adding a transaction. Close this
          and tap "Account" first.
        </AppText>
      ) : (
        <>
          <ScanDocumentButton onResult={applyScan} />

          <ChipSelect<TransactionType>
            options={[
              { value: 'expense', label: 'Expense', color: colors.expense },
              { value: 'income', label: 'Income', color: colors.income },
            ]}
            value={type}
            onChange={setType}
          />

          <AppInput
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            leftElement={
              <AppText color="textSecondary">
                {activeAccount ? getCurrencyLabel(activeAccount.currencyCode) : ''}
              </AppText>
            }
          />

          <ChipSelect<string>
            label="ACCOUNT"
            options={selectableAccounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${getCurrencyLabel(a.currencyCode)}`,
              color: moduleColors.finance,
            }))}
            value={activeAccountId}
            onChange={setAccountId}
          />

          <ChipSelect<string>
            label="CATEGORY"
            options={kindCategories.map((c) => ({
              value: c.id,
              label: c.name,
              color: c.color,
            }))}
            value={activeCategoryId}
            onChange={setCategoryId}
          />

          <DateField value={date} onChange={setDate} />

          <AppInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Fuel"
          />

          {error ? (
            <AppText variant="caption" color="danger">
              {error}
            </AppText>
          ) : null}

          <AppButton
            title={transaction ? 'Save changes' : 'Add transaction'}
            accentColor={moduleColors.finance}
            onPress={submit}
            style={{ marginTop: spacing.xs }}
          />
        </>
      )}
    </FormModal>
  );
}