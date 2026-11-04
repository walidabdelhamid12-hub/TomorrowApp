import { FinanceRecordCard } from './FinanceRecordCard';
import { AssetTypeIcon } from './AssetTypeIcon';
import type { Asset } from '@/features/finance/types/finance';

interface AssetCardProps {
  asset: Asset;
  categoryLabel: string;
  balanceText: string;
  valuationText?: string;
  baseCurrency: string;
  onViewEntries: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AssetCard({ asset, categoryLabel, balanceText, valuationText, onViewEntries, onEdit, onDelete }: AssetCardProps) {
  const kind = asset.category === 'gold' ? 'Gold · ' + asset.karat + 'K' : asset.category === 'silver' ? 'Silver' : asset.currencyCode;
  return <FinanceRecordCard icon={<AssetTypeIcon category={asset.category} currencyCode={'currencyCode' in asset ? asset.currencyCode : undefined} />}
    kind={kind} quantity={balanceText} name={asset.name} value={valuationText ?? balanceText}
    accessibilityLabel={'Movements for ' + asset.name + ', ' + categoryLabel + ', ' + balanceText + (valuationText ? ', ' + valuationText : '')}
    onPress={onViewEntries} onEdit={onEdit} onDelete={onDelete} />;
}
