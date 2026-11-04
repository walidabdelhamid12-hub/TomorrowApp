import { AppText } from '@/components/ui';
import { getCurrencyFlag } from '@/features/finance/constants/currencies';
import type { AssetCategory } from '@/features/finance/types/finance';

export function AssetTypeIcon({ category, currencyCode }: { category: AssetCategory; currencyCode?: string }) {
  return <AppText accessible={false} testID={'asset-icon-' + category} style={{ fontSize: 18, flexShrink: 0 }}>
    {category === 'gold' ? '🥇' : category === 'silver' ? '🥈' : getCurrencyFlag(currencyCode ?? '') + ' ' + (currencyCode ?? '')}
  </AppText>;
}
