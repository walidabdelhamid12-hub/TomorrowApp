import { useEffect, useMemo, useState } from 'react';

import {
    AppButton,
    AppInput,
    AppText,
    ChipOption,
    ChipSelect,
    DateField,
} from '@/components/ui';
import { FormModal } from '@/features/finance/components/FormModal';
import {
    CURRENCIES,
    getCurrencyLabel,
} from '@/features/finance/constants/currencies';
import { GOLD_COLORS } from '@/features/finance/constants/metals';
import { useCurrencyStore } from '@/features/finance/store/useCurrencyStore';
import { useFinanceStore } from '@/features/finance/store/useFinanceStore';
import type {
    AssetCategory,
    GoldKarat,
} from '@/features/finance/types/finance';
import { todayISO } from '@/features/finance/utils/finance';
import { parseAmount } from '@/features/finance/utils/money';
import { moduleColors } from '@/theme';
import { isValidISODate } from '@/utils/input';

const KARATS: GoldKarat[] = [24, 22, 21, 18, 14];

type Direction = 'add' | 'withdraw';

interface AddAssetModalProps {
  visible: boolean;
  onClose: () => void;
}

/** Creates a new asset, or records a dated amount on an existing one. */
export function AddAssetModal({ visible, onClose }: AddAssetModalProps) {
  const baseCurrency = useCurrencyStore((s) => s.baseCurrency);
  const assets = useFinanceStore((s) => s.assets);
  const addAsset = useFinanceStore((s) => s.addAsset);
  const addAssetEntry = useFinanceStore((s) => s.addAssetEntry);

  const foreignCurrencies = useMemo(
    () => CURRENCIES.filter((c) => c.code !== baseCurrency),
    [baseCurrency]
  );

  const kindOptions: ChipOption<AssetCategory>[] = [
    {
      value: 'local_currency',
      label: `Local ${getCurrencyLabel(baseCurrency)}`,
    },
    { value: 'foreign_currency', label: 'Foreign currency' },
    { value: 'gold', label: 'Gold', color: GOLD_COLORS.main },
  ];

  const [target, setTarget] = useState('new');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetCategory>('local_currency');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [karat, setKarat] = useState<GoldKarat>(21);
  const [direction, setDirection] = useState<Direction>('add');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setError(undefined);
    setTarget('new');
    setName('');
    setKind('local_currency');
    setCurrencyCode(
      foreignCurrencies.find((c) => c.code === 'USD')?.code ??
        foreignCurrencies[0]?.code ??
        'USD'
    );
    setKarat(21);
    setDirection('add');
    setAmount('');
    setDate(todayISO());
  }, [visible, foreignCurrencies]);

  const existing = assets.find((a) => a.id === target);
  const isNew = !existing;

  const unit = existing
    ? existing.category === 'gold'
      ? 'g'
      : existing.currencyCode
    : kind === 'gold'
      ? 'g'
      : kind === 'local_currency'
        ? baseCurrency
        : currencyCode;
  const unitLabel = unit === 'g' ? 'g' : getCurrencyLabel(unit);

  const isGoldTarget = existing ? existing.category === 'gold' : kind === 'gold';
  const tint = isGoldTarget ? GOLD_COLORS.main : moduleColors.finance;

  const submit = () => {
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!isValidISODate(date)) {
      setError('Date must be a real date in the format YYYY-MM-DD.');
      return;
    }

    if (existing) {
      const id = addAssetEntry(existing.id, {
        date,
        amount: direction === 'withdraw' ? -value : value,
      });
      if (id === null) {
        setError('Could not record the amount.');
        return;
      }
      onClose();
      return;
    }

    if (!name.trim()) {
      setError('Enter an asset name.');
      return;
    }

    let assetId: string;
    if (kind === 'gold') {
      assetId = addAsset({ name: name.trim(), category: 'gold', karat });
    } else if (kind === 'local_currency') {
      assetId = addAsset({
        name: name.trim(),
        category: 'local_currency',
        currencyCode: baseCurrency,
      });
    } else {
      assetId = addAsset({
        name: name.trim(),
        category: 'foreign_currency',
        currencyCode,
      });
    }
    addAssetEntry(assetId, { date, amount: value });
    onClose();
  };

  return (
    <FormModal visible={visible} title="Assets" onClose={onClose}>
      <ChipSelect<string>
        label="ADD TO"
        options={[
          { value: 'new', label: '+ New asset', color: moduleColors.finance },
          ...assets.map((a) => ({
            value: a.id,
            label: a.name,
            color: a.category === 'gold' ? GOLD_COLORS.main : moduleColors.finance,
          })),
        ]}
        value={existing ? existing.id : 'new'}
        onChange={setTarget}
      />

      {isNew ? (
        <>
          <AppInput
            label="Asset name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Dollar savings, Gold bars"
          />

          <ChipSelect<AssetCategory>
            label="TYPE"
            options={kindOptions}
            value={kind}
            onChange={setKind}
          />

          {kind === 'foreign_currency' ? (
            <ChipSelect<string>
              label="CURRENCY"
              options={foreignCurrencies.map((c) => ({
                value: c.code,
                label: getCurrencyLabel(c.code),
                color: moduleColors.finance,
              }))}
              value={currencyCode}
              onChange={setCurrencyCode}
            />
          ) : null}

          {kind === 'gold' ? (
            <ChipSelect<string>
              label="KARAT"
              options={KARATS.map((k) => ({
                value: String(k),
                label: `${k}K`,
                color: GOLD_COLORS.main,
              }))}
              value={String(karat)}
              onChange={(v) => {
                const found = KARATS.find((k) => String(k) === v);
                if (found) setKarat(found);
              }}
            />
          ) : null}
        </>
      ) : (
        <ChipSelect<Direction>
          label="ACTION"
          options={[
            { value: 'add', label: 'Add', color: tint },
            { value: 'withdraw', label: 'Withdraw', color: '#DC2626' },
          ]}
          value={direction}
          onChange={setDirection}
        />
      )}

      <AppInput
        label={unit === 'g' ? 'Weight (grams)' : 'Amount'}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0"
        leftElement={<AppText color="textSecondary">{unitLabel}</AppText>}
      />

      <DateField value={date} onChange={setDate} />

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <AppButton
        title={isNew ? 'Create asset' : 'Save'}
        accentColor={tint}
        onPress={submit}
      />
    </FormModal>
  );
}