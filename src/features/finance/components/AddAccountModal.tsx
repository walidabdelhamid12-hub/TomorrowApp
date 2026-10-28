import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
    AppButton,
    AppInput,
    AppText,
    ChipOption,
    ChipSelect,
} from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import {
    CURRENCIES,
    getCurrencyLabel,
} from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useLedgerStore } from '@/features/finance/store/useLedgerStore';
import type { Account, AccountType } from '@/features/finance/types/ledger';
import { parseAmount } from '@/features/finance/utils/money';
import { moduleColors } from '@/theme';
import { upperLatin } from '@/utils/input';

const TYPE_OPTIONS: ChipOption<AccountType>[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
];

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pass an account to edit it, or null/undefined to create one. */
  account?: Account | null;
}

export function AddAccountModal({
  visible,
  onClose,
  account,
}: AddAccountModalProps) {
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const addAccount = useLedgerStore((s) => s.addAccount);
  const updateAccount = useLedgerStore((s) => s.updateAccount);
  const deleteAccount = useLedgerStore((s) => s.deleteAccount);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [currencyCode, setCurrencyCode] = useState(baseCurrency);
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setError(undefined);
    if (account) {
      setName(account.name);
      setType(account.type);
      setCurrencyCode(account.currencyCode);
      setBalance(String(account.initialBalance));
    } else {
      setName('');
      setType('cash');
      setCurrencyCode(baseCurrency);
      setBalance('');
    }
  }, [visible, account, baseCurrency]);

  const submit = () => {
    const cleanName = upperLatin(name.trim());
    if (!cleanName) {
      setError('Enter an account name.');
      return;
    }
    const initialBalance = balance.trim() === '' ? 0 : parseAmount(balance);
    if (initialBalance === null) {
      setError('Starting balance is not a valid number.');
      return;
    }

    if (account) {
      updateAccount(account.id, {
        name: cleanName,
        type,
        currencyCode,
        initialBalance,
      });
    } else {
      addAccount({ name: cleanName, type, currencyCode, initialBalance });
    }
    onClose();
  };

  const confirmDelete = () => {
    if (!account) return;
    Alert.alert(
      'Delete account?',
      'This also deletes all of its transactions and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount(account.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <FormModal
      visible={visible}
      title={account ? 'Edit account' : 'Add account'}
      onClose={onClose}
    >
      <AppInput
        label="Name"
        value={name}
        onChangeText={(text) => setName(upperLatin(text))}
        autoCapitalize="characters"
        placeholder="e.g. CIB, CASH, فودافون كاش"
      />

      <ChipSelect<AccountType>
        label="TYPE"
        options={TYPE_OPTIONS}
        value={type}
        onChange={setType}
      />

      <ChipSelect<string>
        label="CURRENCY"
        options={CURRENCIES.map((c) => ({
          value: c.code,
          label: getCurrencyLabel(c.code),
          color: moduleColors.finance,
        }))}
        value={currencyCode}
        onChange={setCurrencyCode}
      />

      <AppInput
        label="Starting balance"
        value={balance}
        onChangeText={setBalance}
        keyboardType="numbers-and-punctuation"
        placeholder="0"
        hint="Money already in the account before you start tracking."
        leftElement={
          <AppText color="textSecondary">{getCurrencyLabel(currencyCode)}</AppText>
        }
      />

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <AppButton
        title={account ? 'Save changes' : 'Add account'}
        accentColor={moduleColors.finance}
        onPress={submit}
      />

      {account ? (
        <AppButton title="Delete account" variant="ghost" onPress={confirmDelete} />
      ) : null}
    </FormModal>
  );
}