
import { RATE_ANCHOR } from '@/features/finance/constants/currencies';
import type { Asset } from '@/features/finance/types/finance';
import { getAssetBalance } from '@/features/finance/utils/finance';
import { evaluateAssetRatio } from '@/features/finance/utils/assetDecimal';
import type { RateMap } from '@/features/finance/utils/money';

function validMetalPrice(price: number | null): price is number {
  return price !== null && Number.isFinite(price) && price > 0;
}

/** Gold value in EGP from grams, karat and the 24K price per gram. */
export function getGoldValueEGP(
  grams: number,
  karat: number,
  gold24PerGram: number | null
): number | null {
  if (
    !Number.isFinite(grams) ||
    !Number.isFinite(karat) ||
    !validMetalPrice(gold24PerGram) ||
    karat <= 0
  ) {
    return null;
  }

  return evaluateAssetRatio([grams, karat, gold24PerGram], [24]);
}

/** Silver value in EGP from grams and the silver price per gram. */
export function getSilverValueEGP(
  grams: number,
  silverPerGram: number | null
): number | null {
  if (
    !Number.isFinite(grams) ||
    !validMetalPrice(silverPerGram)
  ) {
    return null;
  }

  return evaluateAssetRatio([grams, silverPerGram]);
}

/** Convert an asset's value to the selected base currency. */
export function getAssetValueInBase(
  asset: Asset,
  baseCurrency: string,
  rates: RateMap,
  gold24PerGram: number | null,
  silverPerGram: number | null = null,
  verifiedCurrencies: readonly string[] = ['EGP']
): number | null {
  const balance = getAssetBalance(asset);

  if (!Number.isFinite(balance)) {
    return null;
  }

  const numerators = [balance];
  const denominators: number[] = [];
  let from: string;
  if (asset.category === 'gold') {
    if (!Number.isFinite(asset.karat) || asset.karat <= 0 || !validMetalPrice(gold24PerGram)) return null;
    numerators.push(asset.karat, gold24PerGram); denominators.push(24);
    from = RATE_ANCHOR;
  } else if (asset.category === 'silver') {
    if (!validMetalPrice(silverPerGram)) return null;
    numerators.push(silverPerGram);
    from = RATE_ANCHOR;
  } else from = asset.currencyCode.trim().toUpperCase();

  const to = baseCurrency.trim().toUpperCase();
  if (!from || !to) return null;
  if (from !== to) {
    const verified = new Set(verifiedCurrencies.map(code => code.trim().toUpperCase()));
    if (!verified.has(from) || !verified.has(to)
      || !Number.isFinite(rates[from]) || rates[from] <= 0
      || !Number.isFinite(rates[to]) || rates[to] <= 0) return null;
    numerators.push(rates[from]); denominators.push(rates[to]);
  }
  return evaluateAssetRatio(numerators, denominators);
}
