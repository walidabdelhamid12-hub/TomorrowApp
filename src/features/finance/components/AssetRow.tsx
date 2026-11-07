import { View } from 'react-native';

import { AssetCard } from '@/features/finance/components/AssetCard';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance } from '@/features/finance/utils/finance';
import { formatMoney, formatNumber, type RateMap } from '@/features/finance/utils/money';
import { getAssetValueInBase } from '@/features/finance/utils/valuation';

interface AssetRowProps {
  asset: Asset;
  baseCurrency: string;
  rates: RateMap;
  gold24PerGram: number | null;
  silverPerGram: number | null;
  verifiedCurrencies?: readonly string[];
  first: boolean;
  amountsVisible: boolean;
  onEdit: () => void;
  onViewEntries: () => void;
  onDelete: () => void;
}

/** Shared compact card presentation also used by the active Assets screen. */
export function AssetRow({ asset, baseCurrency, rates, gold24PerGram, silverPerGram,
  verifiedCurrencies = ['EGP'], first, amountsVisible, onEdit, onViewEntries, onDelete }: AssetRowProps) {
  const balance = getAssetBalance(asset);
  const metal = asset.category === 'gold' || asset.category === 'silver';
  const currency = 'currencyCode' in asset ? asset.currencyCode : undefined;
  const balanceText = metal ? formatNumber(balance, 3) + ' g'
    : formatMoney(balance, currency!) + ' ' + getCurrencyFlag(currency!) + ' ' + currency;
  const category = asset.category === 'gold' ? 'Gold ' + asset.karat + 'K'
    : asset.category === 'silver' ? 'Silver'
      : asset.category === 'local_currency' ? 'Local currency · ' + currency : 'Foreign currency · ' + currency;
  const lastDate = asset.entries.reduce((latest, entry) => entry.date > latest ? entry.date : latest, '');
  const value = getAssetValueInBase(asset, baseCurrency, rates, gold24PerGram, silverPerGram, verifiedCurrencies);
  const showConverted = metal || currency !== baseCurrency;
  const valuation = value !== null ? '≈ ' + formatMoney(value, baseCurrency) + ' ' + baseCurrency
    : asset.category === 'gold' ? 'Set gold price in Rates'
      : asset.category === 'silver' ? 'Set silver price in Rates' : 'No rate available';
  return (
    <View style={{ marginTop: first ? 0 : 8 }}>
      <AssetCard asset={asset} baseCurrency={baseCurrency} categoryLabel={category + (lastDate ? ' · updated ' + lastDate : '')}
        balanceText={amountsVisible ? balanceText : '••••••'}
        valuationText={showConverted ? amountsVisible ? valuation : '••••••' : undefined}
        onViewEntries={onViewEntries} onEdit={onEdit} onDelete={onDelete} />
    </View>
  );
}
