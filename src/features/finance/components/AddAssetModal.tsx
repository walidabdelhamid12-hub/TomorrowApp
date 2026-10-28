import { useEffect, useState } from 'react';

import {
  AppButton,
  AppInput,
  AppText,
  ChipOption,
  ChipSelect,
} from '@/components/ui';
import { AmountInput } from '@/features/finance/components/AmountInput';
import { CurrencyChips } from '@/features/finance/components/CurrencyChips';
import { FormModal } from '@/features/finance/components/FormModal';
import {
  CURRENCIES,
  getCurrencyLabel,
} from '@/features/finance/constants/currencies';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import type {
  AssetCategory,
  GoldKarat,
  NewAssetInput,
} from '@/features/finance/types/finance';
import { todayISO } from '@/features/finance/utils/finance';
import { moduleColors } from '@/theme';

const KARATS: GoldKarat[] = [24, 22, 21, 18, 14];
const KARAT_OPTIONS: ChipOption<string>[] = KARATS.map((karat) => ({
  value: String(karat),
  label: `${karat}K`,
}));

interface AddAssetModalProps {
  visible: boolean;
  onClose: () => void;
  onSave?: (data: any) => void; // تم إضافتها لتتوافق مع استدعاء الشاشة الرئيسية
}

/** A foreign-currency default that is never the user's own base currency. */
const defaultForeign = (base: string): string => (base === 'USD' ? 'EUR' : 'USD');

export function AddAssetModal({ visible, onClose, onSave }: AddAssetModalProps) {
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const addAsset = useFinanceStore((s) => s.addAsset);
  const addAssetEntry = useFinanceStore((s) => s.addAssetEntry);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('local_currency');
  const [foreignCode, setForeignCode] = useState(defaultForeign(baseCurrency));
  const [karat, setKarat] = useState('24');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setName('');
    setCategory('local_currency');
    setForeignCode(defaultForeign(baseCurrency));
    setKarat('24');
    setAmount('');
    setError(undefined);
  }, [visible, baseCurrency]);

  const categoryOptions: ChipOption<AssetCategory>[] = [
    { value: 'local_currency', label: `Local · ${baseCurrency}` },
    { value: 'foreign_currency', label: 'Foreign currency' },
    { value: 'gold', label: 'Gold' },
  ];

  const isGold = category === 'gold';
  const unitLabel = isGold
    ? 'g'
    : getCurrencyLabel(category === 'local_currency' ? baseCurrency : foreignCode);

  const submit = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Enter an asset name.');
      return;
    }
    const quantity = amount.trim() === '' ? 0 : Number(amount);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('Amount is not a valid number.');
      return;
    }

    let input: NewAssetInput;
    if (category === 'gold') {
      input = { category: 'gold', name: cleanName, karat: Number(karat) as GoldKarat };
    } else {
      input = {
        category,
        name: cleanName,
        currencyCode: category === 'local_currency' ? baseCurrency : foreignCode,
      };
    }

    const id = addAsset(input);
    // The opening amount is saved as the asset's first dated entry.
    if (quantity > 0) {
      addAssetEntry(id, {
        date: todayISO(),
        amount: quantity,
        note: 'Opening balance',
      });
    }

    if (onSave) {
      onSave({ input, quantity });
    }

    onClose();
  };

  return (
    <FormModal visible={visible} title="Add asset" onClose={onClose}>
      <AppInput
        label="Asset name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Dollar savings, Gold ring"
      />

      <ChipSelect<AssetCategory>
        label="TYPE"
        options={categoryOptions}
        value={category}
        onChange={setCategory}
      />

      {category === 'foreign_currency' ? (
        <CurrencyChips
          label="CURRENCY"
          value={foreignCode}
          onChange={setForeignCode}
          options={CURRENCIES.filter((c) => c.code !== baseCurrency)}
        />
      ) : null}

      {isGold ? (
        <ChipSelect<string>
          label="KARAT"
          options={KARAT_OPTIONS}
          value={karat}
          onChange={setKarat}
        />
      ) : null}

      <AmountInput
        label={isGold ? 'Weight (grams)' : 'Amount'}
        value={amount}
        onChangeText={setAmount}
        hint="Optional. Saved as the opening balance; you can add more entries later."
        sheetTitle={isGold ? 'Weight in grams' : 'Amount'}
        leftElement={<AppText color="textSecondary">{unitLabel}</AppText>}
      />

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <AppButton
        title="Create asset"
        accentColor={moduleColors.finance}
        onPress={submit}
      />
    </FormModal>
  );
}